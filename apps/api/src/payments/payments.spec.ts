import {
  CHECKOUT_MAX_TIP_CENTS,
  DUMMY_PAYMENT_TOKENS,
  checkoutQuoteQuerySchema,
  checkoutSchema,
  idempotencyKeySchema,
  paymentsQuerySchema,
} from "@dinego/shared";
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPublisher } from "../notifications/notification-publisher.js";
import { formatCents, lineTaxCents, priceCheckout } from "./pricing.js";
import { PaymentsModule } from "./payments.module.js";
import { PaymentsService } from "./payments.service.js";
import {
  PaymentProvider,
  PaymentProviderUnavailableError,
  type ChargeRequest,
  type ChargeResult,
} from "./providers/payment-provider.js";
import { SimulatedPaymentProvider } from "./providers/simulated-payment.provider.js";

const card = {
  method: "CARD",
  paymentToken: "tok_visa",
  expectedTotalCents: 1290,
} as const;

describe("checkout pricing", () => {
  it("rounds tax half-up per line with exact integer math", () => {
    expect(lineTaxCents(1290, 0)).toBe(0);
    expect(lineTaxCents(1290, 8.875)).toBe(114); // 114.4875
    expect(lineTaxCents(200, 0.25)).toBe(1); // exactly 0.5 rounds up
    expect(lineTaxCents(199, 0.25)).toBe(0); // 0.4975
    expect(lineTaxCents(1000, 10)).toBe(100);
    // 0.1 + 0.2 style drift must not leak in: 7.005% of $10.00 = 70.05 → 70
    expect(lineTaxCents(1000, 7.005)).toBe(70);
  });

  it("totals subtotal, per-line tax, and tip", () => {
    const priced = priceCheckout(
      [
        { menuItemId: 1, name: "Burger", quantity: 2, unitPriceCents: 1290, taxRate: 8.875 },
        { menuItemId: 2, name: "Lemonade", quantity: 1, unitPriceCents: 400, taxRate: 0 },
      ],
      300,
    );

    expect(priced).toMatchObject({
      itemCount: 3,
      subtotalCents: 2980,
      taxCents: 229, // 2580 × 8.875% = 228.975 → 229
      tipCents: 300,
      totalCents: 2980 + 229 + 300,
    });
    expect(priced.lines[0]).toMatchObject({ lineTotalCents: 2580, taxCents: 229, taxRate: 8.875 });
  });

  it("formats cents for messages", () => {
    expect(formatCents(3509)).toBe("$35.09");
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("checkout request schemas", () => {
  it("requires a table for dine-in and refuses one for takeaway", () => {
    expect(checkoutSchema.parse({ orderType: "DINE_IN", tableId: 4, ...card })).toEqual({
      orderType: "DINE_IN",
      tableId: 4,
      ...card,
      tipCents: 0,
    });
    expect(checkoutSchema.parse({ orderType: "TAKEAWAY", ...card })).toEqual({
      orderType: "TAKEAWAY",
      ...card,
      tipCents: 0,
    });

    expect(checkoutSchema.safeParse({ orderType: "DINE_IN", ...card }).success).toBe(false);
    expect(checkoutSchema.safeParse({ orderType: "TAKEAWAY", tableId: 4, ...card }).success).toBe(
      false,
    );
    expect(checkoutSchema.safeParse({ orderType: "DELIVERY", ...card }).success).toBe(false);
  });

  it("explains delivery-mode mistakes in plain words", () => {
    const messages = (input: unknown) => {
      const result = checkoutSchema.safeParse(input);
      return result.success ? [] : result.error.issues.map((issue) => issue.message);
    };

    expect(messages({ orderType: "DINE_IN", ...card })).toEqual(["Choose a table for dine-in"]);
    expect(messages({ orderType: "DINE_IN", tableId: "T4", ...card })).toEqual([
      "Must be a table id",
    ]);
    expect(messages({ orderType: "TAKEAWAY", tableId: 4, ...card })).toEqual([
      "Takeaway orders do not use a table; remove tableId",
    ]);
  });

  it("accepts only online methods and bounded tips, and rejects client-side amounts", () => {
    const takeaway = { orderType: "TAKEAWAY", ...card };

    expect(checkoutSchema.safeParse({ ...takeaway, method: "CASH" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...takeaway, method: "ONLINE" }).success).toBe(true);
    for (const tipCents of [-1, 1.5, CHECKOUT_MAX_TIP_CENTS + 1]) {
      expect(checkoutSchema.safeParse({ ...takeaway, tipCents }).success).toBe(false);
    }
    expect(checkoutSchema.safeParse({ ...takeaway, amountCents: 1 }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...takeaway, paymentToken: " " }).success).toBe(false);
    const { expectedTotalCents: _omitted, ...withoutTotal } = takeaway;
    expect(checkoutSchema.safeParse(withoutTotal).success).toBe(false);
  });

  it("validates the idempotency key", () => {
    expect(idempotencyKeySchema.parse("3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d")).toBeTruthy();
    for (const value of [undefined, "", "short", "has space in it", "x".repeat(101), "a/b/c/d/e"]) {
      expect(idempotencyKeySchema.safeParse(value).success).toBe(false);
    }
  });

  it("parses quote and list queries strictly", () => {
    expect(checkoutQuoteQuerySchema.parse({})).toEqual({ tipCents: 0 });
    expect(checkoutQuoteQuerySchema.parse({ tipCents: "250" })).toEqual({ tipCents: 250 });
    expect(checkoutQuoteQuerySchema.safeParse({ tipCents: "-5" }).success).toBe(false);
    expect(checkoutQuoteQuerySchema.safeParse({ tip: "5" }).success).toBe(false);
    expect(paymentsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paymentsQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});

describe("dummy payment provider", () => {
  const provider = new SimulatedPaymentProvider();
  const charge = (paymentToken: string) =>
    provider.charge({
      amountCents: 1000,
      currency: "usd",
      method: "CARD",
      paymentToken,
      idempotencyKey: "dinego-payment-1",
      description: "test",
      metadata: {},
    });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is the only payment provider the app binds", () => {
    const providers = Reflect.getMetadata("providers", PaymentsModule) as unknown[];
    const binding = providers.find(
      (entry) => (entry as { provide?: unknown }).provide === PaymentProvider,
    );

    expect(binding).toEqual({ provide: PaymentProvider, useClass: SimulatedPaymentProvider });
    expect(provider.name).toBe("simulated");
  });

  it("never makes a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    for (const token of [
      ...DUMMY_PAYMENT_TOKENS.approved,
      ...Object.keys(DUMMY_PAYMENT_TOKENS.declined),
      "anything-else",
    ]) {
      await charge(token);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("approves every approved test token with a dummy reference", async () => {
    for (const token of DUMMY_PAYMENT_TOKENS.approved) {
      const result = await charge(token);
      expect(result.status).toBe("SUCCEEDED");
      expect(result.providerRef).toMatch(/^sim_ch_/);
    }
  });

  it("declines decline tokens with their code, and any unknown token", async () => {
    for (const [token, code] of Object.entries(DUMMY_PAYMENT_TOKENS.declined)) {
      expect(await charge(token)).toMatchObject({ status: "FAILED", failureCode: code });
    }
    expect(await charge("4242424242424242")).toMatchObject({
      status: "FAILED",
      failureCode: "invalid_payment_token",
    });
  });

  it("throws to simulate an outage", async () => {
    await expect(charge(DUMMY_PAYMENT_TOKENS.outage)).rejects.toThrow(/outage/);
  });
});

describe("PaymentsService.charge when the provider fails", () => {
  class ThrowingProvider extends PaymentProvider {
    readonly name = "test-provider";
    constructor(private readonly failure: unknown) {
      super();
    }
    async charge(_request: ChargeRequest): Promise<ChargeResult> {
      throw this.failure;
    }
  }

  const notifications = { publish: vi.fn() };

  beforeEach(() => {
    notifications.publish.mockReset().mockResolvedValue(2);
  });

  const charge = (failure: unknown) => {
    // charge() only uses the provider; the other collaborators are not touched.
    const service = new PaymentsService(
      ...([null, null, null, null, null] as unknown as [never, never, never, never, never]),
      new ThrowingProvider(failure),
      notifications as unknown as NotificationPublisher,
    );
    return service.charge(
      41,
      {
        orderType: "TAKEAWAY",
        method: "CARD",
        paymentToken: "tok_x",
        tipCents: 0,
        expectedTotalCents: 1000,
      },
      { lines: [], itemCount: 1, subtotalCents: 1000, taxCents: 0, tipCents: 0, totalCents: 1000 },
    );
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records an outage as a failed, retryable charge and logs one line without a stack", async () => {
    const logged = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    await expect(charge(new PaymentProviderUnavailableError("gateway timeout"))).resolves.toEqual({
      status: "FAILED",
      providerRef: null,
      failureCode: "provider_error",
      failureMessage: "We could not reach the payment provider. Please try again.",
    });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toEqual([
      'Payment 41 not charged: payment provider "test-provider" is unavailable (gateway timeout). Recorded as FAILED; the customer can retry.',
    ]);
    expect(notifications.publish).toHaveBeenCalledTimes(1);
    expect(notifications.publish).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "PAYMENT_PROVIDER_OUTAGE",
        audience: { kind: "roles", roles: ["ADMIN", "MANAGER"] },
        data: { provider: "test-provider", reason: "unavailable", paymentId: 41 },
        dedupeKey: expect.stringMatching(/^payments:provider-outage:\d{4}-\d{2}-\d{2}T\d{2}$/),
      }),
    ]);
  });

  it("never lets an unexpected provider error escape, and keeps its stack for debugging", async () => {
    const logged = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const bug = new TypeError("Cannot read properties of undefined");

    await expect(charge(bug)).resolves.toMatchObject({
      status: "FAILED",
      failureCode: "provider_error",
    });
    expect(logged.mock.calls[0][0]).toMatch(
      /unexpected error from payment provider "test-provider"/,
    );
    expect(logged.mock.calls[0][1]).toBe(bug.stack);
    expect(notifications.publish).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "PAYMENT_PROVIDER_OUTAGE",
        data: expect.objectContaining({ reason: "error" }),
      }),
    ]);
  });
});
