import {
  DIETARY_TAGS,
  MENU_SORTS,
  menuCategoriesResponseSchema,
  menuItemsResponseSchema,
  menuResponseSchema,
  type DietaryTag,
  type MenuCategoriesResponse,
  type MenuQueryInput,
  type MenuResponse,
  type MenuSort,
  type PublicMenuItem,
} from "@dinego/shared";
import { ApiError, apiRequest } from "./api";

/* ------------------------------- API calls ------------------------------- */

function contractError(label: string): ApiError {
  return new ApiError(`The ${label} response did not match the shared contract.`, 0);
}

/** Grouped public menu, filtered and sorted by the API. */
export async function fetchMenu(filters: MenuFilters, signal?: AbortSignal): Promise<MenuResponse> {
  const query = buildMenuSearchParams(filters).toString();
  const payload = await apiRequest<unknown>(`/menu${query ? `?${query}` : ""}`, { signal });
  const parsed = menuResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw contractError("menu");
  }

  return parsed.data;
}

/** Chef's picks for the home page. */
export async function fetchFeaturedItems(signal?: AbortSignal): Promise<PublicMenuItem[]> {
  const payload = await apiRequest<unknown>("/menu/items?featured=true&pageSize=6", { signal });
  const parsed = menuItemsResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw contractError("featured items");
  }

  return parsed.data.items;
}

/** All active categories with their public item counts, independent of filters. */
export async function fetchMenuCategories(signal?: AbortSignal): Promise<MenuCategoriesResponse> {
  const payload = await apiRequest<unknown>("/menu/categories", { signal });
  const parsed = menuCategoriesResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw contractError("menu categories");
  }

  return parsed.data;
}

/* --------------------------- Filter state model --------------------------- */

export const PRICE_RANGES = {
  "under-10": { label: "Under $10", maxPrice: 999 },
  "10-20": { label: "$10 – $20", minPrice: 1000, maxPrice: 2000 },
  "over-20": { label: "Over $20", minPrice: 2001 },
} as const;
export type PriceRangeKey = keyof typeof PRICE_RANGES;

export type MenuFilters = {
  q: string;
  categories: string[];
  tags: DietaryTag[];
  price: PriceRangeKey | null;
  sort: MenuSort;
  hideSoldOut: boolean;
};

export const DEFAULT_FILTERS: MenuFilters = {
  q: "",
  categories: [],
  tags: [],
  price: null,
  sort: "recommended",
  hideSoldOut: false,
};

export function hasActiveFilters(filters: MenuFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.categories.length > 0 ||
    filters.tags.length > 0 ||
    filters.price !== null ||
    filters.sort !== "recommended" ||
    filters.hideSoldOut
  );
}

function toQueryInput(filters: MenuFilters): MenuQueryInput {
  const price = filters.price ? PRICE_RANGES[filters.price] : undefined;

  return {
    q: filters.q.trim() || undefined,
    category: filters.categories.length ? filters.categories.join(",") : undefined,
    tags: filters.tags.length ? filters.tags.join(",") : undefined,
    minPrice: price && "minPrice" in price ? String(price.minPrice) : undefined,
    maxPrice: price && "maxPrice" in price ? String(price.maxPrice) : undefined,
    available: filters.hideSoldOut ? "true" : undefined,
    sort: filters.sort === "recommended" ? undefined : filters.sort,
  };
}

function buildMenuSearchParams(filters: MenuFilters): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(toQueryInput(filters))) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return params;
}

/* ------------------------- Shareable URL handling ------------------------- */

const PRICE_KEYS = Object.keys(PRICE_RANGES) as PriceRangeKey[];

/** Serializes only non-default filters, so default state keeps a clean `/menu` URL. */
export function filtersToUrlParams(filters: MenuFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.categories.length) params.set("category", filters.categories.join(","));
  if (filters.tags.length) params.set("tags", filters.tags.join(",").toLowerCase());
  if (filters.price) params.set("price", filters.price);
  if (filters.sort !== "recommended") params.set("sort", filters.sort);
  if (filters.hideSoldOut) params.set("available", "true");

  return params;
}

/** Restores filters from the URL, silently dropping values that are not valid. */
export function filtersFromUrlParams(params: URLSearchParams): MenuFilters {
  const tags = (params.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim().toUpperCase().replace(/-/g, "_"))
    .filter((tag): tag is DietaryTag => (DIETARY_TAGS as readonly string[]).includes(tag));

  const categories = (params.get("category") ?? "")
    .split(",")
    .map((slug) => slug.trim().toLowerCase())
    .filter((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug));

  const sort = params.get("sort");
  const price = params.get("price");

  return {
    q: params.get("q")?.slice(0, 100) ?? "",
    categories: [...new Set(categories)],
    tags: [...new Set(tags)],
    price: PRICE_KEYS.find((key) => key === price) ?? null,
    sort: MENU_SORTS.find((key) => key === sort) ?? "recommended",
    hideSoldOut: params.get("available") === "true",
  };
}

/* ------------------------------- UI labels -------------------------------- */

export const DIETARY_TAG_LABELS: Record<DietaryTag, string> = {
  VEGETARIAN: "Vegetarian",
  VEGAN: "Vegan",
  GLUTEN_FREE: "Gluten-free",
  SPICY: "Spicy",
};

export const SORT_LABELS: Record<MenuSort, string> = {
  recommended: "Recommended",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  name_asc: "Name: A to Z",
  name_desc: "Name: Z to A",
};

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
