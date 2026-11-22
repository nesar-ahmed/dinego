"use client";

import type { ChangeEvent } from "react";
import {
  DIETARY_TAGS,
  MENU_SORTS,
  type DietaryTag,
  type MenuSort,
  type PublicMenuCategory,
} from "@dinego/shared";
import {
  DIETARY_TAG_LABELS,
  PRICE_RANGES,
  SORT_LABELS,
  type MenuFilters,
  type PriceRangeKey,
} from "@/lib/menu";

type MenuFilterBarProps = {
  categories: PublicMenuCategory[];
  filters: MenuFilters;
  searchText: string;
  busy: boolean;
  activeFilterCount: number;
  onSearchTextChange: (value: string) => void;
  onChange: (update: Partial<MenuFilters>) => void;
  onClear: () => void;
};

function Chip({
  label,
  active,
  onClick,
  dotClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dotClass?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-fg bg-fg text-ink"
          : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg"
      }`}
    >
      {dotClass ? (
        <span className={`size-1.5 rounded-full ${active ? "bg-ink/70" : dotClass}`} aria-hidden />
      ) : null}
      {label}
    </button>
  );
}

const TAG_DOT_CLASS: Record<DietaryTag, string> = {
  VEGETARIAN: "bg-emerald-500",
  VEGAN: "bg-lime-500",
  GLUTEN_FREE: "bg-sky-500",
  SPICY: "bg-red-500",
};

const selectClass =
  "h-11 rounded-full border border-line bg-surface pl-4 pr-9 text-sm text-fg outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/25";

export function MenuFilterBar({
  categories,
  filters,
  searchText,
  busy,
  activeFilterCount,
  onSearchTextChange,
  onChange,
  onClear,
}: MenuFilterBarProps) {
  const toggleCategory = (slug: string) => {
    onChange({
      categories: filters.categories.includes(slug)
        ? filters.categories.filter((existing) => existing !== slug)
        : [...filters.categories, slug],
    });
  };

  const toggleTag = (tag: DietaryTag) => {
    onChange({
      tags: filters.tags.includes(tag)
        ? filters.tags.filter((existing) => existing !== tag)
        : [...filters.tags, tag],
    });
  };

  return (
    <section
      aria-label="Menu filters"
      className="rounded-[1.75rem] border border-line bg-surface/60 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          >
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 3.5 3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            maxLength={100}
            value={searchText}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onSearchTextChange(event.target.value)
            }
            placeholder="Search dishes, ingredients, categories…"
            aria-label="Search the menu"
            className="h-12 w-full rounded-full border border-line bg-surface pl-11 pr-11 text-sm text-fg outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-2 focus:ring-brand/25 [&::-webkit-search-cancel-button]:hidden"
          />
          {busy ? (
            <span
              className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-brand motion-reduce:animate-none"
              role="status"
              aria-label="Updating results"
            />
          ) : searchText ? (
            <button
              type="button"
              onClick={() => onSearchTextChange("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="size-3.5"
                aria-hidden
              >
                <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="hidden sm:inline">Sort</span>
          <select
            value={filters.sort}
            onChange={(event) => onChange({ sort: event.target.value as MenuSort })}
            aria-label="Sort dishes"
            className={selectClass}
          >
            {MENU_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="no-scrollbar -mx-4 mt-3.5 flex items-center gap-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5"
        role="group"
        aria-label="Filter by category"
      >
        <Chip
          label="All categories"
          active={filters.categories.length === 0}
          onClick={() => onChange({ categories: [] })}
        />
        {categories.map((category) => (
          <Chip
            key={category.slug}
            label={`${category.name} · ${category.itemCount}`}
            active={filters.categories.includes(category.slug)}
            onClick={() => toggleCategory(category.slug)}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div
          className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          role="group"
          aria-label="Filter by dietary preference"
        >
          {DIETARY_TAGS.map((tag) => (
            <Chip
              key={tag}
              label={DIETARY_TAG_LABELS[tag]}
              dotClass={TAG_DOT_CLASS[tag]}
              active={filters.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            />
          ))}
          <Chip
            label="Hide sold out"
            active={filters.hideSoldOut}
            onClick={() => onChange({ hideSoldOut: !filters.hideSoldOut })}
          />
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <select
            value={filters.price ?? ""}
            onChange={(event) =>
              onChange({ price: (event.target.value || null) as PriceRangeKey | null })
            }
            aria-label="Filter by price"
            className={selectClass}
          >
            <option value="">Any price</option>
            {Object.entries(PRICE_RANGES).map(([key, range]) => (
              <option key={key} value={key}>
                {range.label}
              </option>
            ))}
          </select>

          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="h-11 whitespace-nowrap rounded-full px-4 text-xs font-semibold text-fg underline-offset-4 transition hover:text-brand-soft hover:underline"
            >
              Clear all · {activeFilterCount}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
