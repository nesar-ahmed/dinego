import { createHash } from "node:crypto";
import { HttpStatus, Injectable, Logger, type HttpException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, type Repository } from "typeorm";
import type {
  CheckoutInput,
  CheckoutQuoteResponse,
  PaymentErrorCode,
  PaymentResponse,
  PaymentsQuery,
  PaymentsResponse,
} from "@dinego/shared";
import { CartService } from "../cart/cart.service.js";
import { runAtomically } from "../common/database/atomic.js";
import { apiError, isUniqueViolation } from "../common/errors/api-error.js";
import { NotificationPublisher } from "../notifications/notification-publisher.js";
import {
  checkoutNotifications,
  type NotificationDraft,
} from "../notifications/notifications.catalog.js";
import { DiningTable } from "../tables/entities/dining-table.entity.js";
import { isOrderable } from "../tables/tables.mapper.js";
import { UsersService } from "../users/users.service.js";
import { Payment } from "./entities/payment.entity.js";
import { toCustomerPayment, toQuote } from "./payments.mapper.js";
import { formatCents, priceCheckout, type PricedCheckout } from "./pricing.js";
import {
  PAYMENT_CURRENCY,
  PaymentProvider,
  PaymentProviderUnavailableError,
  type ChargeResult,
} from "./providers/payment-provider.js";

export const paymentError = (
  status: HttpStatus,
  code: PaymentErrorCode,
  message: string,
  extra?: Record<string, unknown>,
) => apiError(status, code, message, extra);

/** Failure codes that mean "not charged, try again" rather than a decline. */
const PROVIDER_ERROR_CODE = "provider_error";
const INTERRUPTED_CODE = "interrupted";

/** Result of starting a checkout: a new PENDING payment to charge, or an earlier attempt's payment. */
export type CheckoutStart =
  { kind: "new"; paymentId: number; priced: PricedCheckout } | { kind: "replay"; payment: Payment };

/**
 * Checkout payments, taken with the DUMMY payment provider (no real money moves).
 *
 * OrdersService drives checkout: `startCheckout` validates and reserves a PENDING payment,
 * `charge` calls the provider, and on success the order service marks the payment SUCCEEDED and
 * creates the order in ONE atomic transaction, so a paid payment always has its order.
 *
 * Safety:
 * - Amounts are computed on the server from the cart; the client only confirms the total it saw.
 * - `(customer, Idempotency-Key)` is unique: retries return the original result, never a new charge.
 * - At most one open checkout (PENDING, or SUCCEEDED without an order) per customer, enforced by
 *   a partial unique index, so a second tab or a double click cannot pay twice.
 * - The reservation is ONE atomic SQL statement (the driver shares one connection across requests).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(DiningTable) private readonly tables: Repository<DiningTable>,
    private readonly usersService: UsersService,
    private readonly cartService: CartService,
    private readonly provider: PaymentProvider,
    private readonly notifications: NotificationPublisher,
  ) {}

  /** What the customer would be charged for their cart right now. */
  async quote(customerId: number, tipCents: number): Promise<CheckoutQuoteResponse> {
    await this.usersService.assertActiveCustomer(customerId);
    return { quote: toQuote(await this.priceCart(customerId, tipCents)) };
  }

  /**
   * Validates the checkout and reserves a PENDING payment. Returns the earlier payment instead
   * when this Idempotency-Key was already used for the same request.
   */
  async startCheckout(
    customerId: number,
    idempotencyKey: string,
    input: CheckoutInput,
  ): Promise<CheckoutStart> {
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const previous = await this.findByKey(customerId, idempotencyKey);

    if (previous) {
      return this.replay(previous, requestHash);
    }

    await this.assertNoOpenCheckout(customerId);

    const priced = await this.priceCart(customerId, input.tipCents);

    if (priced.totalCents !== input.expectedTotalCents) {
      throw paymentError(
        HttpStatus.CONFLICT,
        "TOTAL_CHANGED",
        `Your total changed from ${formatCents(input.expectedTotalCents)} to ${formatCents(priced.totalCents)}. Please review your order and try again.`,
        { quote: toQuote(priced) },
      );
    }

    const tableId = input.orderType === "DINE_IN" ? input.tableId : null;

    if (tableId !== null) {
      await this.assertOrderableTable(tableId);
    }

    const paymentId = await this.reserve(customerId, idempotencyKey, requestHash, input, priced);

    if (paymentId === null) {
      // Lost a race: a concurrent retry with the same key, another open checkout, or the table
      // stopped being orderable between the check above and the insert.
      const concurrent = await this.findByKey(customerId, idempotencyKey);

      if (concurrent) {
        return this.replay(concurrent, requestHash);
      }

      await this.assertNoOpenCheckout(customerId);

      if (tableId !== null) {
        throw this.tableNotAvailable(tableId);
      }

      // The open checkout that blocked the insert finished in the meantime.
      throw this.inProgressError();
    }

    return { kind: "new", paymentId, priced };
  }

  /** Calls the dummy provider. An unreachable provider is reported as a failed charge. */
  async charge(
    paymentId: number,
    input: CheckoutInput,
    priced: PricedCheckout,
  ): Promise<ChargeResult> {
    try {
      return await this.provider.charge({
        amountCents: priced.totalCents,
        currency: PAYMENT_CURRENCY,
        method: input.method,
        paymentToken: input.paymentToken,
        idempotencyKey: `dinego-payment-${paymentId}`,
        description: `DineGo ${input.orderType === "DINE_IN" ? "dine-in" : "takeaway"} order`,
        metadata: { paymentId: String(paymentId), orderType: input.orderType },
      });
    } catch (error) {
      // Handled: the payment is recorded as FAILED, the customer gets 502 and can retry, and the
      // API keeps serving. An outage is an expected failure mode, so one line with context is
      // enough; anything else is a provider bug and keeps its stack trace.
      const unavailable = error instanceof PaymentProviderUnavailableError;

      if (unavailable) {
        this.logger.error(
          `Payment ${paymentId} not charged: payment provider "${this.provider.name}" is unavailable (${error.message}). Recorded as FAILED; the customer can retry.`,
        );
      } else {
        this.logger.error(
          `Payment ${paymentId} not charged: unexpected error from payment provider "${this.provider.name}". Recorded as FAILED.`,
          error instanceof Error ? error.stack : String(error),
        );
      }

      // Staff hear about it at most once an hour; publish() never throws.
      await this.notifications.publish(
        checkoutNotifications.providerOutage({
          provider: this.provider.name,
          paymentId,
          reason: unavailable ? "unavailable" : "error",
          at: new Date(),
        }),
      );

      return {
        status: "FAILED",
        providerRef: null,
        failureCode: PROVIDER_ERROR_CODE,
        failureMessage: "We could not reach the payment provider. Please try again.",
      };
    }
  }

  /** Records a declined or failed charge and returns the error to send to the customer. */
  async recordFailure(
    paymentId: number,
    result: Extract<ChargeResult, { status: "FAILED" }>,
  ): Promise<HttpException> {
    await this.dataSource.query(
      `UPDATE "payments"
       SET "status" = 'FAILED', "provider_ref" = ?, "failure_code" = ?, "failure_message" = ?,
           "updated_at" = datetime('now')
       WHERE "id" = ? AND "status" = 'PENDING'`,
      [result.providerRef, result.failureCode, result.failureMessage, paymentId],
    );

    return this.failureError(await this.payments.findOneByOrFail({ id: paymentId }));
  }

  /** Error for a FAILED payment: 402 for declines, 502 when the charge never completed. */
  failureError(payment: Payment): HttpException {
    if (payment.failureCode === PROVIDER_ERROR_CODE || payment.failureCode === INTERRUPTED_CODE) {
      return paymentError(
        HttpStatus.BAD_GATEWAY,
        "PAYMENT_PROVIDER_ERROR",
        payment.failureMessage ?? "The payment could not be processed",
        { paymentId: payment.id },
      );
    }

    return paymentError(
      HttpStatus.PAYMENT_REQUIRED,
      "PAYMENT_DECLINED",
      payment.failureMessage ?? "Your payment was declined",
      { paymentId: payment.id, failureCode: payment.failureCode },
    );
  }

  inProgressError(paymentId?: number): HttpException {
    return paymentError(
      HttpStatus.CONFLICT,
      "PAYMENT_IN_PROGRESS",
      "Your payment is still being processed; please try again in a moment",
      paymentId === undefined ? {} : { paymentId },
    );
  }

  /**
   * Startup recovery. The API is a single process, so a payment still PENDING at boot was
   * interrupted mid-charge by a restart. With the dummy provider nothing was charged, so it is
   * marked FAILED and the customer can check out again. Each customer is notified in the same
   * transaction, since they may have left the checkout page long ago.
   */
  async failInterruptedPayments(): Promise<number> {
    return runAtomically(this.dataSource, (db) => {
      const rows = db
        .prepare(
          `UPDATE "payments"
           SET "status" = 'FAILED', "failure_code" = ?, "failure_message" = ?,
               "updated_at" = datetime('now')
           WHERE "status" = 'PENDING'
           RETURNING "id", "customer_id", "order_type", "amount_cents"`,
        )
        .all(
          INTERRUPTED_CODE,
          "The payment was interrupted and not completed. Please try again.",
        ) as Array<{
        id: number;
        customer_id: number | null;
        order_type: "DINE_IN" | "TAKEAWAY";
        amount_cents: number;
      }>;

      const drafts: NotificationDraft[] = rows.flatMap((row) =>
        row.customer_id === null
          ? []
          : checkoutNotifications.checkoutInterrupted({
              paymentId: row.id,
              customerId: row.customer_id,
              orderType: row.order_type,
              amountCents: row.amount_cents,
            }),
      );
      this.notifications.writeAlongside(db, drafts);

      return rows.length;
    });
  }

  /** The customer's payments, newest first, including declined attempts. */
  async list(customerId: number, query: PaymentsQuery): Promise<PaymentsResponse> {
    await this.usersService.assertActiveCustomer(customerId);

    const { page, pageSize } = query;
    const [payments, total] = await this.payments.findAndCount({
      where: { customerId },
      relations: { table: true },
      order: { id: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      payments: payments.map(toCustomerPayment),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async get(customerId: number, paymentId: number): Promise<PaymentResponse> {
    await this.usersService.assertActiveCustomer(customerId);

    const payment = await this.payments.findOne({
      where: { id: paymentId, customerId },
      relations: { table: true },
    });

    if (!payment) {
      throw paymentError(HttpStatus.NOT_FOUND, "PAYMENT_NOT_FOUND", "Payment not found");
    }

    return { payment: toCustomerPayment(payment) };
  }

  /* -------------------------------- helpers ------------------------------- */

  /** Prices the purchasable cart. Refuses empty carts and carts with unavailable items. */
  private async priceCart(customerId: number, tipCents: number): Promise<PricedCheckout> {
    const lines = await this.cartService.getCheckoutLines(customerId);

    if (lines.length === 0) {
      throw paymentError(HttpStatus.CONFLICT, "CART_EMPTY", "Your cart is empty");
    }

    const unavailable = lines.filter((line) => !line.purchasable);

    if (unavailable.length > 0) {
      throw paymentError(
        HttpStatus.CONFLICT,
        "CART_HAS_UNAVAILABLE_ITEMS",
        `Remove unavailable items before checkout: ${unavailable.map((line) => line.name).join(", ")}`,
        { menuItemIds: unavailable.map((line) => line.menuItemId) },
      );
    }

    const priced = priceCheckout(lines, tipCents);

    if (priced.subtotalCents === 0) {
      throw paymentError(HttpStatus.CONFLICT, "CART_EMPTY", "Your cart has nothing to pay for");
    }

    return priced;
  }

  private async assertOrderableTable(tableId: number): Promise<void> {
    const table = await this.tables.findOne({ where: { id: tableId } });

    if (!table || !table.active) {
      throw paymentError(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND", "Table not found");
    }

    if (!isOrderable(table)) {
      throw this.tableNotAvailable(tableId, table.label);
    }
  }

  private tableNotAvailable(tableId: number, label?: string) {
    return paymentError(
      HttpStatus.CONFLICT,
      "TABLE_NOT_AVAILABLE",
      `Table ${label ?? tableId} is not available right now. Please choose another table or ask our staff.`,
      { tableId },
    );
  }

  /** Rejects a new checkout while another one is being charged or placed. */
  private async assertNoOpenCheckout(customerId: number): Promise<void> {
    const open: Array<{ id: number; status: string }> = await this.dataSource.query(
      `SELECT "id", "status" FROM "payments"
       WHERE "customer_id" = ? AND "order_id" IS NULL AND "status" IN ('PENDING', 'SUCCEEDED')
       LIMIT 1`,
      [customerId],
    );

    if (open.length === 0) {
      return;
    }

    const [{ id, status }] = open;

    throw status === "PENDING"
      ? this.inProgressError(id)
      : paymentError(
          HttpStatus.CONFLICT,
          "PAYMENT_AWAITING_ORDER",
          "You have already paid for this checkout; your order is being placed",
          { paymentId: id },
        );
  }

  /**
   * Records the PENDING payment in one atomic statement. Returns null, inserting nothing, when
   * the key was already used, another checkout is open, or the table is no longer orderable.
   */
  private async reserve(
    customerId: number,
    idempotencyKey: string,
    requestHash: string,
    input: CheckoutInput,
    priced: PricedCheckout,
  ): Promise<number | null> {
    const tableId = input.orderType === "DINE_IN" ? input.tableId : null;

    try {
      const rows: Array<{ id: number }> = await this.dataSource.query(
        `INSERT INTO "payments" (
           "customer_id", "order_type", "table_id", "method", "subtotal_cents", "tax_cents",
           "tip_cents", "amount_cents", "lines", "status", "provider", "idempotency_key",
           "request_hash"
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?
         WHERE NOT EXISTS (
             SELECT 1 FROM "payments"
             WHERE "customer_id" = ? AND "order_id" IS NULL AND "status" IN ('PENDING', 'SUCCEEDED')
           )
           AND (
             ? IS NULL OR EXISTS (
               SELECT 1 FROM "dining_tables"
               WHERE "id" = ? AND "active" = 1 AND "status" IN ('FREE', 'OCCUPIED')
             )
           )
         ON CONFLICT ("customer_id", "idempotency_key") DO NOTHING
         RETURNING "id"`,
        [
          customerId,
          input.orderType,
          tableId,
          input.method,
          priced.subtotalCents,
          priced.taxCents,
          priced.tipCents,
          priced.totalCents,
          JSON.stringify(priced.lines),
          this.provider.name,
          idempotencyKey,
          requestHash,
          customerId,
          tableId,
          tableId,
        ],
      );

      return rows[0]?.id ?? null;
    } catch (error) {
      // The partial unique index is the last line of defence against a second open checkout.
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  /** Same key and same request: the earlier payment. Same key, different request: refused. */
  private replay(payment: Payment, requestHash: string): CheckoutStart {
    if (payment.requestHash !== requestHash) {
      throw paymentError(
        HttpStatus.CONFLICT,
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was already used for a different checkout request; generate a new key",
        { paymentId: payment.id },
      );
    }

    return { kind: "replay", payment };
  }

  private findByKey(customerId: number, idempotencyKey: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { customerId, idempotencyKey } });
  }
}
