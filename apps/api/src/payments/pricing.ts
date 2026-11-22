import type { Station } from "@dinego/shared";
import type { PaymentLineSnapshot } from "./entities/payment.entity.js";

export interface PricingLineInput {
  menuItemId: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
  /** Percentage, e.g. 8.875. */
  taxRate: number;
  station?: Station;
}

export interface PricedCheckout {
  lines: PaymentLineSnapshot[];
  itemCount: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

/**
 * Tax for one line, in cents. Menu prices are tax-exclusive. Tax is rounded half-up per line.
 * The rate is converted to thousandths of a percent so the math is exact integer arithmetic
 * (8.875% × $12.90 never drifts through floating point).
 */
export function lineTaxCents(lineTotalCents: number, taxRate: number): number {
  const rateThousandths = Math.round(taxRate * 1000);
  return Math.floor((lineTotalCents * rateThousandths + 50_000) / 100_000);
}

/**
 * The single pricing rule for checkout. The payment stores the result as its snapshot and the
 * order is created from that snapshot, so the order always matches what was charged.
 */
export function priceCheckout(lines: PricingLineInput[], tipCents: number): PricedCheckout {
  const priced = lines.map((line) => {
    const lineTotalCents = line.unitPriceCents * line.quantity;
    return {
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      taxRate: line.taxRate,
      station: line.station,
      lineTotalCents,
      taxCents: lineTaxCents(lineTotalCents, line.taxRate),
    };
  });

  const subtotalCents = priced.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const taxCents = priced.reduce((sum, line) => sum + line.taxCents, 0);

  return {
    lines: priced,
    itemCount: priced.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents,
    taxCents,
    tipCents,
    totalCents: subtotalCents + taxCents + tipCents,
  };
}

/** `1290` → `$12.90`, for error messages. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
