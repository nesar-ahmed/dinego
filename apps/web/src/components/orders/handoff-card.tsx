import type { CustomerOrderSummary } from "@dinego/shared";

/** "Show this at the counter" card for takeaway, or the table for dine-in, printed-paper style. */
export function HandoffCard({
  order,
  size = "lg",
}: {
  order: Pick<CustomerOrderSummary, "type" | "pickupCode" | "table">;
  size?: "md" | "lg";
}) {
  const takeaway = order.type === "TAKEAWAY";

  return (
    <div className={`relative w-full ${size === "lg" ? "max-w-xs" : "max-w-[15rem]"}`}>
      <div
        className="absolute inset-0 translate-x-1.5 translate-y-2 rotate-[2deg] rounded-[1.5rem] border border-line bg-surface-2"
        aria-hidden
      />
      <div
        className={`bg-grain relative rounded-[1.5rem] border border-line-strong bg-paper text-center ${size === "lg" ? "px-6 py-6" : "px-5 py-5"}`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">
          {takeaway ? "Pickup code" : "Your table"}
        </p>
        <p
          className={`mt-2 font-serif font-bold tabular-nums tracking-[0.12em] text-fg ${size === "lg" ? "text-6xl" : "text-5xl"}`}
          aria-label={takeaway ? `Pickup code ${order.pickupCode?.split("").join(" ")}` : undefined}
        >
          {takeaway ? order.pickupCode : order.table?.label}
        </p>
        <p className="mt-3 text-xs text-muted">
          {takeaway ? "Show this at the counter" : "We'll bring everything over"}
        </p>
      </div>
    </div>
  );
}
