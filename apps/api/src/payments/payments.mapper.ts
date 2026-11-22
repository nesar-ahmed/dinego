import type { CheckoutLine, CheckoutQuote, CustomerPayment } from "@dinego/shared";
import type { Payment, PaymentLineSnapshot } from "./entities/payment.entity.js";
import type { PricedCheckout } from "./pricing.js";

/** Customer-facing line. The per-line tax rate stays internal, like on the public menu. */
function toCheckoutLine(line: PaymentLineSnapshot): CheckoutLine {
  return {
    menuItemId: line.menuItemId,
    name: line.name,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    lineTotalCents: line.lineTotalCents,
  };
}

export function toQuote(priced: PricedCheckout): CheckoutQuote {
  return {
    lines: priced.lines.map(toCheckoutLine),
    itemCount: priced.itemCount,
    subtotalCents: priced.subtotalCents,
    taxCents: priced.taxCents,
    tipCents: priced.tipCents,
    totalCents: priced.totalCents,
  };
}

/** Requires `payment.table` to be loaded for dine-in payments. */
export function toCustomerPayment(payment: Payment): CustomerPayment {
  return {
    id: payment.id,
    status: payment.status,
    method: payment.method,
    orderType: payment.orderType,
    table: payment.table ? { id: payment.table.id, label: payment.table.label } : null,
    orderId: payment.orderId,
    lines: payment.lines.map(toCheckoutLine),
    subtotalCents: payment.subtotalCents,
    taxCents: payment.taxCents,
    tipCents: payment.tipCents,
    amountCents: payment.amountCents,
    failureCode: payment.failureCode,
    failureMessage: payment.failureMessage,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}
