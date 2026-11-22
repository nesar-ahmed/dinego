import { formatPrice } from "@/lib/menu";
import { TIP_OPTIONS, tipFor, type TipKey } from "@/lib/checkout";

export function TipPicker({
  subtotalCents,
  value,
  onChange,
  disabled,
}: {
  subtotalCents: number;
  value: TipKey;
  onChange: (value: TipKey) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-wrap gap-2">
      <legend className="sr-only">Tip</legend>
      {TIP_OPTIONS.map((option) => (
        <label
          key={option.key}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-fg transition hover:border-line-strong has-checked:border-fg has-checked:bg-fg has-checked:text-ink has-focus-visible:ring-2 has-focus-visible:ring-brand/40 has-disabled:cursor-not-allowed has-disabled:opacity-60"
        >
          <input
            type="radio"
            name="tip"
            value={option.key}
            checked={value === option.key}
            onChange={() => onChange(option.key)}
            className="sr-only"
          />
          {option.label}
          {option.percent > 0 ? (
            <span className="text-xs font-medium tabular-nums opacity-70">
              {formatPrice(tipFor(subtotalCents, option.key))}
            </span>
          ) : null}
        </label>
      ))}
    </fieldset>
  );
}
