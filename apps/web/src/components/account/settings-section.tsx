import type { ReactNode } from "react";

/** A settings block: explanation on the left, the form on the right, hairline between blocks. */
export function SettingsSection({
  anchor,
  title,
  description,
  children,
}: {
  /** Section id for deep links, e.g. `/account/profile#password`. */
  anchor?: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  const id = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;

  return (
    <section
      id={anchor}
      aria-labelledby={id}
      className="grid scroll-mt-28 gap-6 border-t border-line-strong py-8 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h2 id={id} className="font-serif text-xl font-bold tracking-tight text-fg">
          {title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="min-w-0 max-w-xl">{children}</div>
    </section>
  );
}

/** Brand action button that sizes to its label (forms in the panel are not full width). */
export function SaveButton({
  saving,
  disabled,
  children,
}: {
  saving: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || saving}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-brand-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-brand-ink/30 border-t-brand-ink motion-reduce:animate-none"
          aria-hidden
        />
      ) : null}
      {saving ? "Saving…" : children}
    </button>
  );
}

/** One line of feedback next to the save button. */
export function FormStatus({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string | null;
}) {
  if (!message) return null;

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`inline-flex items-center gap-2 text-sm font-medium ${tone === "error" ? "text-danger" : "text-ok"}`}
    >
      {tone === "success" ? (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          className="size-4 shrink-0"
          aria-hidden
        >
          <path d="m5 10.5 3.2 3L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {message}
    </p>
  );
}
