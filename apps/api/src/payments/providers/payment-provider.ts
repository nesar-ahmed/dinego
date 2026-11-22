import type { PaymentMethod } from "@dinego/shared";

/** Currency for every charge. The menu is priced in US dollar cents. */
export const PAYMENT_CURRENCY = "usd";

export interface ChargeRequest {
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  /** Single-use token from the provider's client SDK. Card details never reach the API. */
  paymentToken: string;
  /** Globally unique per payment, so the provider also de-duplicates retries. */
  idempotencyKey: string;
  description: string;
  metadata: Record<string, string>;
}

export type ChargeResult =
  | { status: "SUCCEEDED"; providerRef: string }
  | { status: "FAILED"; providerRef: string | null; failureCode: string; failureMessage: string };

/**
 * Thrown by a provider that cannot be reached or does not answer (an outage). Nothing was charged
 * and the checkout can be retried. Any other error thrown by `charge` is treated as a bug.
 */
export class PaymentProviderUnavailableError extends Error {
  override readonly name = "PaymentProviderUnavailableError";
}

/**
 * Payment provider port. PaymentsModule binds it to SimulatedPaymentProvider, the dummy provider:
 * DineGo takes dummy payments only. `charge` resolves with FAILED for declines and throws
 * PaymentProviderUnavailableError when the provider cannot be reached.
 */
export abstract class PaymentProvider {
  abstract readonly name: string;
  abstract charge(request: ChargeRequest): Promise<ChargeResult>;
}
