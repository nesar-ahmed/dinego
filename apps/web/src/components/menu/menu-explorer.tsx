"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MenuResponse, PublicMenuCategory } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import {
  DEFAULT_FILTERS,
  fetchMenu,
  fetchMenuCategories,
  filtersFromUrlParams,
  filtersToUrlParams,
  hasActiveFilters,
  type MenuFilters,
} from "@/lib/menu";
import { MenuFilterBar } from "./menu-filter-bar";
import { MenuItemCard } from "./menu-item-card";
import { MenuSkeleton } from "./menu-skeleton";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Interactive menu browser. Filters live in the URL (`/menu?tags=vegan&sort=price_asc`),
 * so views are shareable and survive reloads. Every change is fetched from the public
 * menu API; stale in-flight requests are aborted.
 */
export function MenuExplorer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<MenuFilters>(() => filtersFromUrlParams(searchParams));
  const [searchText, setSearchText] = useState(filters.q);
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [categories, setCategories] = useState<PublicMenuCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [retryToken, setRetryToken] = useState(0);

  // Debounce typing into the applied filters.
  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((current) => (current.q === searchText ? current : { ...current, q: searchText }));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [searchText]);

  // Keep the URL shareable without adding history entries.
  useEffect(() => {
    const next = filtersToUrlParams(filters).toString();
    const current = new URLSearchParams(window.location.search).toString();

    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [filters, pathname, router]);

  // Fetch the menu for the current filters; load the category list once.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      setBusy(true);

      try {
        const [menuResponse, categoriesResponse] = await Promise.all([
          fetchMenu(filters, controller.signal),
          categories === null ? fetchMenuCategories(controller.signal) : null,
        ]);

        if (cancelled) return;
        setMenu(menuResponse);
        if (categoriesResponse) setCategories(categoriesResponse.categories);
        setError(null);
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong while loading the menu.",
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `categories` is only read to decide the one-time fetch.
  }, [filters, retryToken]);

  const filtered = hasActiveFilters(filters);
  const activeFilterCount =
    (filters.q.trim() ? 1 : 0) +
    filters.categories.length +
    filters.tags.length +
    (filters.price ? 1 : 0) +
    (filters.sort !== "recommended" ? 1 : 0) +
    (filters.hideSoldOut ? 1 : 0);

  const shownCount = useMemo(
    () => (menu ? menu.categories.reduce((sum, section) => sum + section.items.length, 0) : 0),
    [menu],
  );
  const totalCount = useMemo(
    () => (categories ? categories.reduce((sum, category) => sum + category.itemCount, 0) : null),
    [categories],
  );

  const featured = useMemo(
    () =>
      menu
        ? menu.categories.flatMap((section) => section.items.filter((item) => item.featured))
        : [],
    [menu],
  );

  const clearAll = () => {
    setSearchText("");
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <div className="space-y-8">
      <MenuFilterBar
        categories={categories ?? []}
        filters={filters}
        searchText={searchText}
        busy={busy}
        activeFilterCount={activeFilterCount}
        onSearchTextChange={setSearchText}
        onChange={(update) => setFilters((current) => ({ ...current, ...update }))}
        onClear={clearAll}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-danger/30 bg-surface/70 px-6 py-12 text-center"
        >
          <h2 className="font-serif text-2xl font-bold tracking-tight text-fg">
            The menu is taking a moment
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{error}</p>
          <button
            type="button"
            onClick={() => setRetryToken((token) => token + 1)}
            className="mt-6 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition hover:opacity-90"
          >
            Try again
          </button>
        </div>
      ) : menu === null ? (
        <MenuSkeleton />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] text-muted"
              aria-live="polite"
            >
              {filtered
                ? `Showing ${shownCount}${totalCount !== null ? ` of ${totalCount}` : ""} dishes`
                : `${totalCount ?? shownCount} dishes · ${menu.categories.length} categories`}
            </p>
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-muted sm:max-w-md">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              >
                <path d="M10 3.2 17.5 16.5h-15L10 3.2Z" strokeLinejoin="round" />
                <path d="M10 8.5v3.2M10 14.2v.1" strokeLinecap="round" />
              </svg>
              <span>
                <span className="font-semibold text-fg">Allergies?</span> Allergen details are a
                guide. Our kitchen handles all major allergens, so please tell the team before
                ordering.
              </span>
            </p>
          </div>

          {menu.categories.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface/70 px-6 py-14 text-center">
              <p className="font-serif text-2xl font-bold tracking-tight text-fg">
                Nothing matches just yet
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
                Try a different search, or loosen a filter — the kitchen probably has something
                close.
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="mt-6 rounded-xl border border-line-strong px-5 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/50 hover:text-brand-soft"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div
              className={`space-y-20 transition-opacity duration-150 ${busy ? "opacity-60" : ""}`}
              aria-busy={busy}
            >
              {!filtered && featured.length > 0 ? (
                <section aria-labelledby="chefs-picks">
                  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-soft">
                        Start here
                      </p>
                      <h2
                        id="chefs-picks"
                        className="mt-2 font-serif text-4xl font-bold tracking-tight text-fg sm:text-5xl"
                      >
                        Chef&apos;s picks
                      </h2>
                    </div>
                    <p className="max-w-sm text-sm leading-relaxed text-muted">
                      The plates we would order ourselves — ask the team what is best today.
                    </p>
                  </div>
                  <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {featured.map((item) => (
                      <MenuItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              ) : null}

              {menu.categories.map((section, index) => (
                <section key={section.slug} id={section.slug}>
                  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
                    <div className="flex items-baseline gap-4">
                      <span className="font-serif text-sm font-semibold tabular-nums text-brand">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h2 className="font-serif text-4xl font-bold tracking-tight text-fg sm:text-5xl">
                          {section.name}
                        </h2>
                        {section.description ? (
                          <p className="mt-2 text-sm text-muted sm:text-base">
                            {section.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      {filtered && section.items.length !== section.itemCount
                        ? `${section.items.length} of ${section.itemCount} dishes`
                        : `${section.itemCount} dishes`}
                    </span>
                  </div>
                  <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {section.items.map((item) => (
                      <MenuItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
