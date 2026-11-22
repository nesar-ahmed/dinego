import type { OrderType } from "@dinego/shared";

const OPTIONS: Array<{ value: OrderType; title: string; body: string; meta: string }> = [
  {
    value: "DINE_IN",
    title: "Dine in",
    body: "Order to the table you're sitting at. We'll bring everything over.",
    meta: "Served to your table",
  },
  {
    value: "TAKEAWAY",
    title: "Take away",
    body: "No table needed. Collect your order at the counter when it's ready.",
    meta: "Pickup code after payment",
  },
];

function DineInIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="size-6"
      aria-hidden
    >
      <path
        d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17.5 21V3c-2 1.2-3 3.6-3 6.5V13h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TakeawayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="size-6"
      aria-hidden
    >
      <path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z" strokeLinejoin="round" />
      <path d="M9 10V6.5a3 3 0 0 1 6 0V10" strokeLinecap="round" />
    </svg>
  );
}

/** Dine in or take away. Native radios keep keyboard and screen-reader behaviour. */
export function DeliveryModePicker({
  value,
  onChange,
  disabled,
}: {
  value: OrderType | null;
  onChange: (value: OrderType) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">How would you like to eat?</legend>
      {OPTIONS.map((option) => (
        <label
          key={option.value}
          className="group relative flex cursor-pointer flex-col rounded-2xl border border-line bg-surface/60 p-5 transition hover:border-line-strong has-checked:border-fg has-checked:bg-surface has-focus-visible:ring-2 has-focus-visible:ring-brand/40 has-disabled:cursor-not-allowed has-disabled:opacity-60"
        >
          <input
            type="radio"
            name="orderType"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span className="flex items-start justify-between gap-4">
            <span className="grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-brand-soft transition group-has-checked:border-fg group-has-checked:bg-fg group-has-checked:text-ink">
              {option.value === "DINE_IN" ? <DineInIcon /> : <TakeawayIcon />}
            </span>
            <span
              className="grid size-5 place-items-center rounded-full border border-line-strong transition group-has-checked:border-fg"
              aria-hidden
            >
              <span className="size-2.5 scale-0 rounded-full bg-fg transition group-has-checked:scale-100" />
            </span>
          </span>
          <span className="mt-5 font-serif text-xl font-bold tracking-tight text-fg">
            {option.title}
          </span>
          <span className="mt-1 text-sm leading-relaxed text-muted">{option.body}</span>
          <span className="mt-4 border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {option.meta}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
