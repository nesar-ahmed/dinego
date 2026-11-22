import type { DietaryTag, PublicMenuItem } from "@dinego/shared";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { DIETARY_TAG_LABELS, formatPrice } from "@/lib/menu";

const TAG_DOT_CLASS: Record<DietaryTag, string> = {
  VEGETARIAN: "bg-emerald-500",
  VEGAN: "bg-lime-500",
  GLUTEN_FREE: "bg-sky-500",
  SPICY: "bg-red-500",
};

function formatAllergen(allergen: string): string {
  return allergen.charAt(0).toUpperCase() + allergen.slice(1);
}

export function MenuItemCard({ item }: { item: PublicMenuItem }) {
  const soldOut = !item.available;

  return (
    <article
      className={`group relative flex h-full flex-col rounded-2xl border border-line bg-surface/60 p-5 transition-colors duration-200 hover:border-line-strong hover:bg-surface ${
        soldOut ? "opacity-75 saturate-50" : ""
      }`}
    >
      {item.featured ? (
        <p className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-ink">
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-3" aria-hidden>
            <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.1l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
          </svg>
          Chef&apos;s pick
        </p>
      ) : null}

      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-serif text-lg font-semibold leading-snug tracking-tight text-fg">
          {item.name}
        </h3>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-fg">
          {formatPrice(item.priceCents)}
        </p>
      </div>

      {item.description ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">{item.description}</p>
      ) : null}

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="flex min-h-9 flex-wrap items-center gap-1.5">
          {item.dietaryTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted"
            >
              <span className={`size-1.5 rounded-full ${TAG_DOT_CLASS[tag]}`} aria-hidden />
              {DIETARY_TAG_LABELS[tag]}
            </span>
          ))}
        </div>
        <div className="shrink-0">
          <AddToCartButton item={item} />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs leading-relaxed">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          className={`mt-px size-3.5 shrink-0 ${item.allergens.length ? "text-amber-600 dark:text-amber-400" : "text-muted"}`}
          aria-hidden
        >
          <path d="M10 3.2 17.5 16.5h-15L10 3.2Z" strokeLinejoin="round" />
          <path d="M10 8.5v3.2M10 14.2v.1" strokeLinecap="round" />
        </svg>
        {item.allergens.length ? (
          <p className="text-muted">
            <span className="font-semibold text-fg">Allergens: </span>
            {item.allergens.map(formatAllergen).join(", ")}
          </p>
        ) : (
          <p className="text-muted">No allergens listed</p>
        )}
      </div>
    </article>
  );
}
