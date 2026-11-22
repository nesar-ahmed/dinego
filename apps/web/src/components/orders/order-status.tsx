import type { OrderStatus, OrderType } from "@dinego/shared";
import { ORDER_PROGRESS, ORDER_STATUS_LABELS, progressIndex, statusTone } from "@/lib/orders";

/** Statuses are information, not actions, so active ones stay neutral (brand is for actions). */
const TONE_CLASSES = {
  active: "border-line-strong bg-surface-2 text-fg",
  done: "border-ok/30 bg-ok/10 text-ok",
  stopped: "border-danger/30 bg-danger/10 text-danger",
} as const;

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone = statusTone(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TONE_CLASSES[tone]}`}
    >
      <span
        className={`size-1.5 rounded-full ${tone === "active" ? "animate-pulse bg-brand motion-reduce:animate-none" : "bg-current"}`}
        aria-hidden
      />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

/** Step-by-step progress for the order type. Cancelled and rejected orders show no tracker. */
export function OrderProgress({ type, status }: { type: OrderType; status: OrderStatus }) {
  const steps = ORDER_PROGRESS[type];
  const current = progressIndex(type, status);

  if (current < 0) {
    return null;
  }

  return (
    <ol
      className={`grid gap-3 sm:gap-0 ${steps.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}
    >
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "next";

        return (
          <li
            key={step.label}
            aria-current={state === "current" ? "step" : undefined}
            className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-3"
          >
            <div className="flex items-center sm:w-full">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full border text-[11px] font-bold tabular-nums ${
                  state === "next" ? "border-line-strong text-muted" : "border-fg bg-fg text-ink"
                }`}
              >
                {state === "done" ? (
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    className="size-3.5"
                    aria-hidden
                  >
                    <path d="m5 10.5 3.2 3L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              {index < steps.length - 1 ? (
                <span
                  className={`mx-2 hidden h-px flex-1 sm:block ${index < current ? "bg-fg" : "bg-line-strong"}`}
                  aria-hidden
                />
              ) : null}
            </div>
            <span
              className={`text-sm sm:pr-3 ${state === "next" ? "text-muted" : "font-semibold text-fg"}`}
            >
              {step.label}
              {state === "current" ? <span className="sr-only"> (current)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
