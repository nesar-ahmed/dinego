import type { PublicTable } from "@dinego/shared";

/** Groups tables by zone, keeping the API's natural label order inside each group. */
function byZone(tables: PublicTable[]): Array<[string, PublicTable[]]> {
  const groups = new Map<string, PublicTable[]>();
  for (const table of tables) {
    const zone = table.zone ?? "Dining room";
    groups.set(zone, [...(groups.get(zone) ?? []), table]);
  }
  return [...groups.entries()];
}

export function TablePicker({
  tables,
  error,
  value,
  onChange,
  onRetry,
  disabled,
}: {
  tables: PublicTable[] | null;
  error: string | null;
  value: number | null;
  onChange: (tableId: number) => void;
  onRetry: () => void;
  disabled?: boolean;
}) {
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger"
      >
        <p>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold transition hover:border-danger/60"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!tables) {
    return (
      <div
        className="grid grid-cols-3 gap-2.5 sm:grid-cols-4"
        role="status"
        aria-label="Loading tables"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-[5.25rem] animate-pulse rounded-xl border border-line bg-surface-2/60"
          />
        ))}
      </div>
    );
  }

  const available = tables.filter((table) => table.orderable).length;

  if (available === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface-2/60 p-5 text-sm leading-relaxed text-muted">
        Every table is taken right now. Choose{" "}
        <span className="font-semibold text-fg">Take away</span> instead, or ask our team to seat
        you.
      </p>
    );
  }

  return (
    <fieldset disabled={disabled} className="space-y-6">
      <legend className="sr-only">Choose your table</legend>
      {byZone(tables).map(([zone, zoneTables]) => (
        <div key={zone}>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            {zone}
          </p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {zoneTables.map((table) => (
              <label
                key={table.id}
                className="group relative flex cursor-pointer flex-col rounded-xl border border-line bg-surface/60 px-3.5 py-3 transition hover:border-line-strong has-checked:border-fg has-checked:bg-fg has-focus-visible:ring-2 has-focus-visible:ring-brand/40 has-disabled:cursor-not-allowed has-disabled:border-dashed has-disabled:bg-transparent has-disabled:hover:border-line"
              >
                <input
                  type="radio"
                  name="tableId"
                  value={table.id}
                  checked={value === table.id}
                  disabled={!table.orderable}
                  onChange={() => onChange(table.id)}
                  className="sr-only"
                />
                <span className="font-serif text-xl font-bold tracking-tight text-fg group-has-checked:text-ink group-has-disabled:text-muted">
                  {table.label}
                </span>
                <span className="mt-0.5 text-xs text-muted group-has-checked:text-ink/70">
                  {table.orderable ? `${table.seats} seats` : "Unavailable"}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {available < tables.length ? (
        <p className="text-xs text-muted">
          Unavailable tables are reserved or being reset for the next guests.
        </p>
      ) : null}
    </fieldset>
  );
}
