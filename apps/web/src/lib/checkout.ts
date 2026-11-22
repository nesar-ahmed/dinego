import {
  CHECKOUT_MAX_TIP_CENTS,
  checkoutQuoteResponseSchema,
  DUMMY_PAYMENT_TOKENS,
  IDEMPOTENCY_KEY_HEADER,
  orderResponseSchema,
  publicTablesResponseSchema,
  type CheckoutPaymentMethod,
  type CheckoutQuote,
  type CheckoutRequest,
  type CustomerOrder,
  type PublicTable,
} from "@dinego/shared";
import { ApiError, apiRequest } from "./api";

function contractError(label: string): ApiError {
  return new ApiError(`The ${label} response did not match the shared contract.`, 0);
}

/* ------------------------------- API calls ------------------------------- */

/** Active tables for the dine-in picker. */
export async function fetchTables(signal?: AbortSignal): Promise<PublicTable[]> {
  const parsed = publicTablesResponseSchema.safeParse(
    await apiRequest<unknown>("/tables", { signal }),
  );

  if (!parsed.success) throw contractError("tables");
  return parsed.data.tables;
}

/** What the cart costs right now, exactly as it would be charged. */
export async function fetchQuote(tipCents: number, signal?: AbortSignal): Promise<CheckoutQuote> {
  const parsed = checkoutQuoteResponseSchema.safeParse(
    await apiRequest<unknown>(`/payments/quote?tipCents=${tipCents}`, { signal }),
  );

  if (!parsed.success) throw contractError("quote");
  return parsed.data.quote;
}

/** Pays with the dummy provider and places the order in one request. */
export async function placeOrder(
  request: CheckoutRequest,
  idempotencyKey: string,
): Promise<CustomerOrder> {
  const parsed = orderResponseSchema.safeParse(
    await apiRequest<unknown>("/orders", {
      method: "POST",
      body: request,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),
  );

  if (!parsed.success) throw contractError("order");
  return parsed.data.order;
}

/* ------------------------------ Idempotency ------------------------------ */

/**
 * A new key per checkout attempt. `crypto.randomUUID` only exists on secure origins, so plain
 * HTTP on a LAN address falls back to `getRandomValues`, which is available everywhere.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------ Dummy payment ----------------------------- */

export type TestCard = {
  token: string;
  label: string;
  detail: string;
  outcome: "approves" | "declines" | "outage";
};

const DECLINE_LABELS: Record<string, string> = {
  tok_declined: "Declined card",
  tok_insufficient_funds: "Insufficient funds",
  tok_expired_card: "Expired card",
};

/**
 * Test instruments per payment method. Tokens come from the shared DUMMY_PAYMENT_TOKENS, so the
 * page always offers exactly what the dummy provider understands. No real card data is collected.
 */
export const TEST_PAYMENT_OPTIONS: Record<CheckoutPaymentMethod, TestCard[]> = {
  CARD: [
    { token: "tok_visa", label: "Visa", detail: "•••• 4242", outcome: "approves" },
    { token: "tok_mastercard", label: "Mastercard", detail: "•••• 4444", outcome: "approves" },
    { token: "tok_amex", label: "American Express", detail: "•••• 0005", outcome: "approves" },
    ...Object.keys(DUMMY_PAYMENT_TOKENS.declined).map((token) => ({
      token,
      label: DECLINE_LABELS[token] ?? token,
      detail: "Test decline",
      outcome: "declines" as const,
    })),
    {
      token: DUMMY_PAYMENT_TOKENS.outage,
      label: "Provider outage",
      detail: "Simulates the payment service being down",
      outcome: "outage",
    },
  ],
  ONLINE: [
    {
      token: "tok_wallet",
      label: "Digital wallet",
      detail: "Apple Pay · Google Pay",
      outcome: "approves",
    },
  ],
};

export const PAYMENT_METHOD_LABELS: Record<CheckoutPaymentMethod, { title: string; body: string }> =
  {
    CARD: { title: "Card", body: "Credit or debit card" },
    ONLINE: { title: "Online wallet", body: "Apple Pay, Google Pay" },
  };

/* ---------------------------------- Tips ---------------------------------- */

export const TIP_OPTIONS = [
  { key: "none", label: "No tip", percent: 0 },
  { key: "10", label: "10%", percent: 10 },
  { key: "15", label: "15%", percent: 15 },
  { key: "20", label: "20%", percent: 20 },
] as const;
export type TipKey = (typeof TIP_OPTIONS)[number]["key"];

/** Tip on the tax-exclusive subtotal, rounded to the cent and capped like the API. */
export function tipFor(subtotalCents: number, key: TipKey): number {
  const percent = TIP_OPTIONS.find((option) => option.key === key)?.percent ?? 0;
  return Math.min(Math.round((subtotalCents * percent) / 100), CHECKOUT_MAX_TIP_CENTS);
}

/* ------------------------------- Messages -------------------------------- */

/** What went wrong, and what the page should do about it. */
export type CheckoutProblem = {
  message: string;
  /** Re-fetch the quote (prices or the cart changed). */
  refreshQuote?: boolean;
  /** Re-fetch tables and clear the selected table. */
  refreshTables?: boolean;
  /** Offer to open the cart. */
  reviewCart?: boolean;
  /** Offer to go to the order list (a payment is already being handled). */
  viewOrders?: boolean;
  /** Session ended; sign in again. */
  signIn?: boolean;
};

export function checkoutProblem(error: unknown): CheckoutProblem {
  if (!(error instanceof ApiError)) {
    return { message: "Something went wrong. Please try again." };
  }

  if (error.status === 0) {
    return {
      message: "We couldn't reach the restaurant. Check your connection and try again.",
    };
  }

  if (error.status === 401) {
    return { message: "Your session has ended. Please sign in again.", signIn: true };
  }

  switch (error.code) {
    case "TOTAL_CHANGED":
      return {
        message: "Prices changed while you were checking out. Please review the new total.",
        refreshQuote: true,
      };
    case "CART_EMPTY":
      return { message: "Your cart is empty.", refreshQuote: true, reviewCart: true };
    case "CART_HAS_UNAVAILABLE_ITEMS":
      return {
        message: "Some dishes just sold out. Remove them from your cart to continue.",
        refreshQuote: true,
        reviewCart: true,
      };
    case "TABLE_NOT_FOUND":
    case "TABLE_NOT_AVAILABLE":
      return {
        message: "That table was just taken. Please choose another one.",
        refreshTables: true,
      };
    case "PAYMENT_DECLINED":
      return { message: `${error.message} Try another payment option.` };
    case "PAYMENT_PROVIDER_ERROR":
      return {
        message: "The payment service is not responding. Nothing was charged — please try again.",
      };
    case "PAYMENT_IN_PROGRESS":
    case "PAYMENT_AWAITING_ORDER":
      return {
        message: "Your previous payment is still being processed. Check your orders in a moment.",
        viewOrders: true,
      };
    case "VALIDATION_ERROR":
      return { message: error.details[0]?.message ?? error.message };
  }

  return { message: error.message || "Checkout failed. Please try again." };
}
