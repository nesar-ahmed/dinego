import type { InputHTMLAttributes, ReactNode } from "react";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

/**
 * Labelled input. The label names only the field; the hint or error is linked with
 * `aria-describedby`, so screen readers announce it as a description rather than the name.
 */
export function Field({ label, hint, error, trailing, id, ...props }: FieldProps) {
  const inputId = id ?? props.name;
  const descriptionId = error || hint ? `${inputId}-description` : undefined;

  return (
    <div className="block">
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionId}
          {...props}
          className={`w-full rounded-xl border bg-ink/60 py-2.5 pl-3.5 text-sm text-fg outline-none transition placeholder:text-muted/60 focus:ring-2 ${
            trailing ? "pr-11" : "pr-3.5"
          } ${
            error
              ? "border-danger/60 focus:border-danger focus:ring-danger/15"
              : "border-line focus:border-brand/70 focus:ring-brand/20"
          }`}
        />
        {trailing && (
          <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>
        )}
      </div>
      {error ? (
        <span id={descriptionId} className="mt-1.5 block text-xs text-danger">
          {error}
        </span>
      ) : (
        hint && (
          <span id={descriptionId} className="mt-1.5 block text-xs text-muted">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
    >
      {message}
    </p>
  );
}

export function SubmitButton({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-brand-ink/30 border-t-brand-ink"
          aria-hidden
        />
      )}
      {loading ? "Please wait…" : children}
    </button>
  );
}
