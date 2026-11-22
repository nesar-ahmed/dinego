import type { ReactNode } from "react";

/** A numbered checkout section with a hairline rule, like the editorial sections on the home page. */
export function CheckoutStep({
  number,
  title,
  description,
  aside,
  children,
}: {
  number: number;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `checkout-step-${number}`;

  return (
    <section aria-labelledby={headingId} className="border-t border-line-strong pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-4">
          <span className="pt-1.5 font-serif text-sm font-semibold tabular-nums text-brand">
            {String(number).padStart(2, "0")}
          </span>
          <div>
            <h2
              id={headingId}
              className="font-serif text-2xl font-bold tracking-tight text-fg sm:text-[1.75rem]"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {aside}
      </div>
      <div className="mt-6 sm:pl-9">{children}</div>
    </section>
  );
}
