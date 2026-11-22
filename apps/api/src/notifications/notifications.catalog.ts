import type {
  NotificationCategory,
  NotificationEntityType,
  NotificationPriority,
  NotificationType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  UserRole,
} from "@dinego/shared";
import { formatCents } from "../payments/pricing.js";

/**
 * Who receives a notification.
 * - `user`: one account (the customer who registered, the account whose password changed).
 * - `roles`: every ACTIVE user with one of the roles, resolved when the event happens.
 *   `excludeUserId` skips the person who caused the event, so nobody is notified of their own action.
 */
export type NotificationAudience =
  | { kind: "user"; userId: number }
  | { kind: "roles"; roles: readonly UserRole[]; excludeUserId?: number };

/** One notification to write, before it is fanned out to its recipients. */
export interface NotificationDraft {
  audience: NotificationAudience;
  type: NotificationType;
  title: string;
  body: string;
  /** A path inside the web app, or null. */
  link: string | null;
  entity: { type: NotificationEntityType; id: number } | null;
  data: Record<string, unknown> | null;
  /** Unique per recipient: processing the same event twice notifies each person once. */
  dedupeKey: string | null;
}

/**
 * Category and priority of every notification type. A `Record` over the shared type list, so
 * adding a type to NOTIFICATION_TYPES without describing it here is a compile error.
 */
export const NOTIFICATION_TYPE_META: Readonly<
  Record<NotificationType, { category: NotificationCategory; priority: NotificationPriority }>
> = {
  CUSTOMER_WELCOME: { category: "ACCOUNT", priority: "NORMAL" },
  CUSTOMER_REGISTERED: { category: "ACCOUNT", priority: "LOW" },
  EMAIL_CHANGED: { category: "ACCOUNT", priority: "HIGH" },
  PASSWORD_CHANGED: { category: "ACCOUNT", priority: "HIGH" },
  ORDER_PLACED: { category: "ORDER", priority: "NORMAL" },
  ORDER_RECEIVED: { category: "ORDER", priority: "HIGH" },
  CHECKOUT_INTERRUPTED: { category: "PAYMENT", priority: "HIGH" },
  PAYMENT_PROVIDER_OUTAGE: { category: "PAYMENT", priority: "HIGH" },
  ORDER_ACCEPTED: { category: "ORDER", priority: "NORMAL" },
  ORDER_READY: { category: "ORDER", priority: "HIGH" },
  ORDER_COMPLETED: { category: "ORDER", priority: "LOW" },
  ORDER_CANCELLED: { category: "ORDER", priority: "HIGH" },
  ORDER_READY_FOR_SERVICE: { category: "ORDER", priority: "HIGH" },
  ORDER_STOPPED: { category: "ORDER", priority: "HIGH" },
  ORDER_ACCEPTANCE_OVERDUE: { category: "ORDER", priority: "HIGH" },
  TABLE_BILL_REQUESTED: { category: "FLOOR", priority: "HIGH" },
  TABLE_NEEDS_CLEANING: { category: "FLOOR", priority: "NORMAL" },
  TABLE_LAYOUT_CHANGED: { category: "FLOOR", priority: "LOW" },
};

/** Staff who are told about new customer accounts (the admin console's customer list). */
export const CUSTOMER_REGISTERED_RECIPIENTS: readonly UserRole[] = ["ADMIN", "MANAGER"];

/**
 * Staff who are told about a new customer order. The kitchen cooks every order; waiters serve
 * dine-in tables; cashiers hand over takeaway orders; admins and managers oversee both.
 */
export const ORDER_RECEIVED_RECIPIENTS: Readonly<Record<OrderType, readonly UserRole[]>> = {
  DINE_IN: ["ADMIN", "MANAGER", "WAITER", "KITCHEN"],
  TAKEAWAY: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"],
};

/** Staff who are told when the payment provider fails, at most once an hour each. */
export const PAYMENT_OUTAGE_RECIPIENTS: readonly UserRole[] = ["ADMIN", "MANAGER"];

/** Who hands a ready order over: waiters serve dine-in tables, cashiers hand over takeaway. */
export const ORDER_READY_RECIPIENTS: Readonly<Record<OrderType, readonly UserRole[]>> = {
  DINE_IN: ["WAITER"],
  TAKEAWAY: ["CASHIER"],
};

/** Who must stop working on a rejected or cancelled order. */
export const ORDER_STOPPED_RECIPIENTS: Readonly<Record<OrderType, readonly UserRole[]>> = {
  DINE_IN: ["ADMIN", "MANAGER", "KITCHEN", "WAITER"],
  TAKEAWAY: ["ADMIN", "MANAGER", "KITCHEN", "CASHIER"],
};

/** A takeaway order not accepted after this long alerts ADMIN and MANAGER (once). */
export const ORDER_ACCEPTANCE_OVERDUE_MINUTES = 10;
export const ORDER_OVERDUE_RECIPIENTS: readonly UserRole[] = ["ADMIN", "MANAGER"];

export const TABLE_BILL_RECIPIENTS: readonly UserRole[] = ["CASHIER", "WAITER"];
export const TABLE_CLEANING_RECIPIENTS: readonly UserRole[] = ["WAITER"];
export const TABLE_LAYOUT_RECIPIENTS: readonly UserRole[] = ["ADMIN", "MANAGER"];

const NOT_YOU = "If you didn't make this change, contact the restaurant right away.";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Account notifications. Each builder returns the drafts for one event. */
export const accountNotifications = {
  /** A customer registered: a welcome for them and a heads-up for ADMIN and MANAGER staff. */
  registration(customer: { id: number; name: string; email: string | null }): NotificationDraft[] {
    return [
      {
        audience: { kind: "user", userId: customer.id },
        type: "CUSTOMER_WELCOME",
        title: `Welcome to DineGo, ${firstName(customer.name)}!`,
        body: "Your account is ready. Browse the menu to order for dine-in or takeaway, and follow your orders from your account.",
        link: "/menu",
        entity: { type: "USER", id: customer.id },
        data: null,
        dedupeKey: `customer:${customer.id}:welcome`,
      },
      {
        audience: {
          kind: "roles",
          roles: CUSTOMER_REGISTERED_RECIPIENTS,
          excludeUserId: customer.id,
        },
        type: "CUSTOMER_REGISTERED",
        title: "New customer registered",
        body: customer.email
          ? `${customer.name} (${customer.email}) created a customer account.`
          : `${customer.name} created a customer account.`,
        link: "/admin/customers",
        entity: { type: "USER", id: customer.id },
        data: { customerId: customer.id },
        dedupeKey: `customer:${customer.id}:registered`,
      },
    ];
  },

  /** The sign-in email changed. Other sessions stay signed in, so they see this too. */
  emailChanged(change: {
    userId: number;
    previousEmail: string | null;
    newEmail: string;
  }): NotificationDraft[] {
    return [
      {
        audience: { kind: "user", userId: change.userId },
        type: "EMAIL_CHANGED",
        title: "Your email address was changed",
        body: change.previousEmail
          ? `You now sign in with ${change.newEmail} instead of ${change.previousEmail}. ${NOT_YOU}`
          : `You now sign in with ${change.newEmail}. ${NOT_YOU}`,
        link: "/account/profile#email",
        entity: { type: "USER", id: change.userId },
        data: null,
        // Every change is a separate event and the endpoint is never replayed: no dedupe key.
        dedupeKey: null,
      },
    ];
  },

  /**
   * The password changed and every other session was signed out. The new session version makes
   * the dedupe key unique per change.
   */
  passwordChanged(change: { userId: number; tokenVersion: number }): NotificationDraft[] {
    return [
      {
        audience: { kind: "user", userId: change.userId },
        type: "PASSWORD_CHANGED",
        title: "Your password was changed",
        body: `Your other devices and sessions were signed out. ${NOT_YOU}`,
        link: "/account/profile#password",
        entity: { type: "USER", id: change.userId },
        data: null,
        dedupeKey: `user:${change.userId}:password:v${change.tokenVersion}`,
      },
    ];
  },
};

/** What an order notification needs to know about a freshly placed order. */
export interface PlacedOrder {
  orderId: number;
  /** e.g. `DG-00042`. */
  orderNo: string;
  type: OrderType;
  customerId: number;
  /** Dine-in only. */
  tableLabel: string | null;
  /** True when placing the order seated a FREE table (it is now OCCUPIED). */
  tableSeated: boolean;
  /** Takeaway only. */
  pickupCode: string | null;
  itemCount: number;
  totalCents: number;
  method: PaymentMethod;
}

const PAID_WITH: Record<PaymentMethod, string> = {
  CARD: "paid by card",
  ONLINE: "paid online",
  CASH: "paid in cash",
};

function items(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/** Checkout and payment notifications. Each builder returns the drafts for one event. */
export const checkoutNotifications = {
  /**
   * A paid checkout became an order: a confirmation for the customer (with the table or pickup
   * code) and a new-order alert for the staff who prepare, serve, or hand it over.
   */
  orderPlaced(order: PlacedOrder): NotificationDraft[] {
    const entity = { type: "ORDER" as const, id: order.orderId };
    const summary = `${items(order.itemCount)} · ${formatCents(order.totalCents)}`;
    const data = {
      orderId: order.orderId,
      orderNo: order.orderNo,
      orderType: order.type,
      tableLabel: order.tableLabel,
      pickupCode: order.pickupCode,
      itemCount: order.itemCount,
      totalCents: order.totalCents,
    };
    const dineIn = order.type === "DINE_IN";

    return [
      {
        audience: { kind: "user", userId: order.customerId },
        type: "ORDER_PLACED",
        title: dineIn
          ? `Order ${order.orderNo} is with the kitchen`
          : `Order ${order.orderNo} is placed`,
        body: dineIn
          ? `Table ${order.tableLabel} · ${summary}, ${PAID_WITH[order.method]}. We'll bring it to your table.`
          : `${summary}, ${PAID_WITH[order.method]}. Your pickup code is ${order.pickupCode}: show it when you collect your order.`,
        link: `/account/orders/${order.orderId}`,
        entity,
        data,
        dedupeKey: `order:${order.orderId}:placed`,
      },
      {
        audience: {
          kind: "roles",
          roles: ORDER_RECEIVED_RECIPIENTS[order.type],
          excludeUserId: order.customerId,
        },
        type: "ORDER_RECEIVED",
        title: dineIn
          ? `New dine-in order ${order.orderNo}`
          : `New takeaway order ${order.orderNo}`,
        body: dineIn
          ? `Table ${order.tableLabel} · ${summary}. Sent to the kitchen${
              order.tableSeated ? "; the table is now occupied" : ""
            }.`
          : `${summary} · pickup code ${order.pickupCode}. Waiting to be accepted.`,
        // Staff order screens do not exist yet; the notification opens nothing for now.
        link: null,
        entity,
        data,
        dedupeKey: `order:${order.orderId}:received`,
      },
    ];
  },

  /**
   * A restart interrupted the checkout before the charge finished. Nothing was charged, no order
   * was placed, and the cart is unchanged, so the customer can simply check out again.
   */
  checkoutInterrupted(payment: {
    paymentId: number;
    customerId: number;
    orderType: OrderType;
    amountCents: number;
  }): NotificationDraft[] {
    return [
      {
        audience: { kind: "user", userId: payment.customerId },
        type: "CHECKOUT_INTERRUPTED",
        title: "Your checkout didn't finish",
        body: `Your ${payment.orderType === "DINE_IN" ? "dine-in" : "takeaway"} checkout of ${formatCents(payment.amountCents)} was interrupted. You were not charged and no order was placed. Your cart is unchanged, so you can check out again.`,
        link: "/checkout",
        entity: { type: "PAYMENT", id: payment.paymentId },
        data: {
          paymentId: payment.paymentId,
          orderType: payment.orderType,
          amountCents: payment.amountCents,
        },
        dedupeKey: `payment:${payment.paymentId}:interrupted`,
      },
    ];
  },

  /**
   * The payment provider failed a charge. Sent to ADMIN and MANAGER at most once per clock hour:
   * the dedupe key is the hour, so a long outage does not flood their inbox.
   */
  providerOutage(failure: {
    provider: string;
    paymentId: number;
    reason: "unavailable" | "error";
    at: Date;
  }): NotificationDraft[] {
    return [
      {
        audience: { kind: "roles", roles: PAYMENT_OUTAGE_RECIPIENTS },
        type: "PAYMENT_PROVIDER_OUTAGE",
        title: "Payments are failing",
        body:
          failure.reason === "unavailable"
            ? `The payment provider "${failure.provider}" could not be reached, so customers cannot check out. Nobody is charged; customers see an error and can retry.`
            : `The payment provider "${failure.provider}" returned an unexpected error, so customers cannot check out. Nobody is charged; the error is in the API logs.`,
        link: null,
        entity: { type: "PAYMENT", id: failure.paymentId },
        data: { provider: failure.provider, reason: failure.reason, paymentId: failure.paymentId },
        dedupeKey: `payments:provider-outage:${failure.at.toISOString().slice(0, 13)}`,
      },
    ];
  },
};

/** An order whose status staff just changed, with what its notifications need. */
export interface OrderStatusChange {
  orderId: number;
  orderNo: string;
  type: OrderType;
  /** Null for orders entered by staff: only staff are notified then. */
  customerId: number | null;
  tableLabel: string | null;
  pickupCode: string | null;
  itemCount: number;
  totalCents: number;
  from: OrderStatus;
  to: OrderStatus;
  reason: string | null;
  /** The staff member who changed it; never notified of their own change. */
  actorId: number;
}

/**
 * Order status notifications. Customers hear about the moments that matter to them (accepted,
 * ready, done, stopped), not every kitchen step; staff hear when they have to act. Each order
 * enters a status at most once, so the dedupe key is the status.
 */
export const orderStatusNotifications = {
  statusChanged(change: OrderStatusChange): NotificationDraft[] {
    // Customer drafts are null for orders entered by staff; they are filtered out at the end.
    const drafts: Array<NotificationDraft | null> = [];
    const entity = { type: "ORDER" as const, id: change.orderId };
    const data = {
      orderId: change.orderId,
      orderNo: change.orderNo,
      orderType: change.type,
      status: change.to,
      previousStatus: change.from,
      tableLabel: change.tableLabel,
      pickupCode: change.pickupCode,
      reason: change.reason,
    };
    const no = change.orderNo;
    const toCustomer = (
      type: NotificationType,
      title: string,
      body: string,
    ): NotificationDraft | null =>
      change.customerId === null
        ? null
        : {
            audience: { kind: "user", userId: change.customerId },
            type,
            title,
            body,
            link: `/account/orders/${change.orderId}`,
            entity,
            data,
            dedupeKey: `order:${change.orderId}:status:${change.to}`,
          };
    const toStaff = (
      type: NotificationType,
      roles: readonly UserRole[],
      title: string,
      body: string,
    ): NotificationDraft => ({
      audience: { kind: "roles", roles, excludeUserId: change.actorId },
      type,
      title,
      body,
      link: null,
      entity,
      data,
      dedupeKey: `order:${change.orderId}:status:${change.to}:staff`,
    });
    const summary = `${items(change.itemCount)} · ${formatCents(change.totalCents)}`;
    const payment = `Refunds are handled by the restaurant: please contact us about your payment of ${formatCents(change.totalCents)}.`;
    const because = change.reason ? ` Reason: ${change.reason}.` : "";

    switch (change.to) {
      case "ACCEPTED":
        drafts.push(
          toCustomer(
            "ORDER_ACCEPTED",
            `Order ${no} is accepted`,
            `We're preparing it now and will let you know when it's ready. Your pickup code is ${change.pickupCode}.`,
          ),
        );
        break;

      case "READY":
        drafts.push(
          toCustomer(
            "ORDER_READY",
            `Order ${no} is ready`,
            `It's on its way to table ${change.tableLabel}. Enjoy your meal!`,
          ),
          toStaff(
            "ORDER_READY_FOR_SERVICE",
            ORDER_READY_RECIPIENTS.DINE_IN,
            `Order ${no} is ready for table ${change.tableLabel}`,
            `${summary}. Serve it now.`,
          ),
        );
        break;

      case "READY_FOR_PICKUP":
        drafts.push(
          toCustomer(
            "ORDER_READY",
            `Order ${no} is ready for pickup`,
            `Show pickup code ${change.pickupCode} at the counter to collect it.`,
          ),
          toStaff(
            "ORDER_READY_FOR_SERVICE",
            ORDER_READY_RECIPIENTS.TAKEAWAY,
            `Order ${no} is ready for pickup`,
            `Pickup code ${change.pickupCode} · ${summary}. Hand it over when the customer shows the code.`,
          ),
        );
        break;

      case "COLLECTED":
        drafts.push(
          toCustomer(
            "ORDER_COMPLETED",
            `Thanks for collecting order ${no}`,
            "Enjoy your meal! We hope to see you again soon.",
          ),
        );
        break;

      case "CLOSED":
        drafts.push(
          toCustomer(
            "ORDER_COMPLETED",
            "Thanks for dining with us",
            `Order ${no} is complete. We hope to see you again soon.`,
          ),
        );
        break;

      case "REJECTED":
        drafts.push(
          toCustomer(
            "ORDER_CANCELLED",
            `Order ${no} was declined`,
            `The restaurant couldn't take your order.${because} ${payment}`,
          ),
          toStaff(
            "ORDER_STOPPED",
            ORDER_STOPPED_RECIPIENTS[change.type],
            `Order ${no} was declined`,
            `${summary}.${because} Don't prepare it.`,
          ),
        );
        break;

      case "CANCELLED":
        drafts.push(
          toCustomer(
            "ORDER_CANCELLED",
            `Order ${no} was cancelled`,
            `The restaurant cancelled your order.${because} ${payment}`,
          ),
          toStaff(
            "ORDER_STOPPED",
            ORDER_STOPPED_RECIPIENTS[change.type],
            `Order ${no} was cancelled`,
            `${change.tableLabel ? `Table ${change.tableLabel} · ` : ""}${summary}.${because} Stop preparing it.`,
          ),
        );
        break;

      case "NO_SHOW":
        drafts.push(
          toCustomer(
            "ORDER_CANCELLED",
            `Order ${no} was not collected`,
            `We kept your order ready, but it wasn't collected.${because} Please contact us if you still want it.`,
          ),
          toStaff(
            "ORDER_STOPPED",
            ["ADMIN", "MANAGER"],
            `Order ${no} was not collected`,
            `Pickup code ${change.pickupCode} · ${summary}.${because}`,
          ),
        );
        break;

      // SENT, IN_PROGRESS, PREPARING, SERVED, and the unpaid-order statuses: progress shows on
      // the customer's order tracker; a notification for every step would be noise.
      default:
        break;
    }

    return drafts.filter((draft): draft is NotificationDraft => draft !== null);
  },

  /** A takeaway order has waited too long to be accepted. Sent once per order. */
  acceptanceOverdue(order: {
    orderId: number;
    orderNo: string;
    pickupCode: string | null;
    itemCount: number;
    totalCents: number;
    minutesWaiting: number;
  }): NotificationDraft[] {
    return [
      {
        audience: { kind: "roles", roles: ORDER_OVERDUE_RECIPIENTS },
        type: "ORDER_ACCEPTANCE_OVERDUE",
        title: `Takeaway order ${order.orderNo} is waiting to be accepted`,
        body: `Placed ${order.minutesWaiting} minutes ago and not accepted yet. Pickup code ${order.pickupCode} · ${items(order.itemCount)} · ${formatCents(order.totalCents)}.`,
        link: null,
        entity: { type: "ORDER", id: order.orderId },
        data: {
          orderId: order.orderId,
          orderNo: order.orderNo,
          minutesWaiting: order.minutesWaiting,
        },
        dedupeKey: `order:${order.orderId}:acceptance-overdue`,
      },
    ];
  },
};

/** What a table notification needs to know about the table. */
export interface TableFacts {
  tableId: number;
  label: string;
  seats: number;
  zone: string | null;
}

function tableSummary(table: TableFacts): string {
  return `${table.seats} ${table.seats === 1 ? "seat" : "seats"}${table.zone ? ` · ${table.zone}` : ""}`;
}

/**
 * Floor notifications for staff. Tables change state many times a day, so these have no dedupe
 * key: every change is a new event. The person who made the change is never notified.
 */
export const floorNotifications = {
  billRequested(table: TableFacts, actorId: number): NotificationDraft[] {
    return [
      {
        audience: { kind: "roles", roles: TABLE_BILL_RECIPIENTS, excludeUserId: actorId },
        type: "TABLE_BILL_REQUESTED",
        title: `Table ${table.label} asked for the bill`,
        body: `Bring the bill to table ${table.label} (${tableSummary(table)}).`,
        link: null,
        entity: { type: "TABLE", id: table.tableId },
        data: { tableId: table.tableId, label: table.label },
        dedupeKey: null,
      },
    ];
  },

  needsCleaning(table: TableFacts, actorId: number): NotificationDraft[] {
    return [
      {
        audience: { kind: "roles", roles: TABLE_CLEANING_RECIPIENTS, excludeUserId: actorId },
        type: "TABLE_NEEDS_CLEANING",
        title: `Table ${table.label} needs cleaning`,
        body: `Set table ${table.label} to FREE once it's ready for the next guests.`,
        link: null,
        entity: { type: "TABLE", id: table.tableId },
        data: { tableId: table.tableId, label: table.label },
        dedupeKey: null,
      },
    ];
  },

  layoutChanged(
    table: TableFacts,
    change: "ADDED" | "REMOVED" | "OUT_OF_SERVICE" | "BACK_IN_SERVICE",
    actorId: number,
  ): NotificationDraft[] {
    const titles = {
      ADDED: `Table ${table.label} was added`,
      REMOVED: `Table ${table.label} was removed`,
      OUT_OF_SERVICE: `Table ${table.label} is out of service`,
      BACK_IN_SERVICE: `Table ${table.label} is back in service`,
    };
    const bodies = {
      ADDED: `${tableSummary(table)}. Customers can now choose it for dine-in.`,
      REMOVED: `${tableSummary(table)}. It is no longer on the floor plan.`,
      OUT_OF_SERVICE: `${tableSummary(table)}. Customers can't choose it until it's back in service.`,
      BACK_IN_SERVICE: `${tableSummary(table)}. Customers can choose it for dine-in again.`,
    };

    return [
      {
        audience: { kind: "roles", roles: TABLE_LAYOUT_RECIPIENTS, excludeUserId: actorId },
        type: "TABLE_LAYOUT_CHANGED",
        title: titles[change],
        body: bodies[change],
        link: null,
        entity: { type: "TABLE", id: table.tableId },
        data: { tableId: table.tableId, label: table.label, change },
        dedupeKey: null,
      },
    ];
  },
};
