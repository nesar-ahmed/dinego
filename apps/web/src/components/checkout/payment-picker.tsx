import { CHECKOUT_PAYMENT_METHODS, type CheckoutPaymentMethod } from "@dinego/shared";
import { PAYMENT_METHOD_LABELS, TEST_PAYMENT_OPTIONS, type TestCard } from "@/lib/checkout";

const OUTCOME_STYLES: Record<TestCard["outcome"], { label: string; className: string }> = {
  approves: { label: "Approves", className: "border-ok/30 bg-ok/10 text-ok" },
  declines: { label: "Declines", className: "border-danger/30 bg-danger/10 text-danger" },
  outage: { label: "Fails", className: "border-line-strong bg-surface-2 text-muted" },
};

function CardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="size-5"
      aria-hidden
    >
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h3" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="size-5"
      aria-hidden
    >
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <circle cx="15.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Dummy payment: a payment method and a test instrument. Nothing here is real card data; each
 * option maps to a dummy token whose outcome is shown up front.
 */
export function PaymentPicker({
  method,
  token,
  onMethodChange,
  onTokenChange,
  disabled,
}: {
  method: CheckoutPaymentMethod;
  token: string;
  onMethodChange: (method: CheckoutPaymentMethod) => void;
  onTokenChange: (token: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-2xl border border-brand/25 bg-brand/5 px-4 py-3 text-sm leading-relaxed">
        <span
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-black text-brand-ink"
          aria-hidden
        >
          !
        </span>
        <p className="text-muted">
          <span className="font-semibold text-fg">Test payments only.</span> No real money is
          charged and no card details are needed — pick a test option to simulate the result.
        </p>
      </div>

      <fieldset disabled={disabled} className="grid grid-cols-2 gap-3">
        <legend className="sr-only">Payment method</legend>
        {CHECKOUT_PAYMENT_METHODS.map((option) => (
          <label
            key={option}
            className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3.5 transition hover:border-line-strong has-checked:border-fg has-checked:bg-surface has-focus-visible:ring-2 has-focus-visible:ring-brand/40"
          >
            <input
              type="radio"
              name="paymentMethod"
              value={option}
              checked={method === option}
              onChange={() => onMethodChange(option)}
              className="sr-only"
            />
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line text-muted transition group-has-checked:border-fg group-has-checked:bg-fg group-has-checked:text-ink">
              {option === "CARD" ? <CardIcon /> : <WalletIcon />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-fg">
                {PAYMENT_METHOD_LABELS[option].title}
              </span>
              <span className="block truncate text-xs text-muted">
                {PAYMENT_METHOD_LABELS[option].body}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          {method === "CARD" ? "Test card" : "Test wallet"}
        </legend>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {TEST_PAYMENT_OPTIONS[method].map((option) => {
            const outcome = OUTCOME_STYLES[option.outcome];
            return (
              <label
                key={option.token}
                className="group flex cursor-pointer items-center gap-3.5 bg-surface/60 px-4 py-3 transition hover:bg-surface has-checked:bg-surface has-focus-visible:bg-surface-2"
              >
                <input
                  type="radio"
                  name="paymentToken"
                  value={option.token}
                  checked={token === option.token}
                  onChange={() => onTokenChange(option.token)}
                  className="sr-only"
                />
                <span
                  className="grid size-4 shrink-0 place-items-center rounded-full border border-line-strong transition group-has-checked:border-fg"
                  aria-hidden
                >
                  <span className="size-2 scale-0 rounded-full bg-fg transition group-has-checked:scale-100" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">{option.label}</span>
                  <span className="block truncate text-xs text-muted">{option.detail}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${outcome.className}`}
                >
                  {outcome.label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
