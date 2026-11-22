import type { PublicMenuCategory, PublicMenuItem } from "@dinego/shared";
import { MenuCategory } from "./entities/menu-category.entity.js";
import { MenuItem } from "./entities/menu-item.entity.js";

export function toPublicCategory(category: MenuCategory, itemCount: number): PublicMenuCategory {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    itemCount,
  };
}

/** Public item shape. Internal fields such as `station` and `taxRate` are intentionally omitted. */
export function toPublicItem(item: MenuItem): PublicMenuItem {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    priceCents: item.priceCents,
    dietaryTags: item.dietaryTags,
    allergens: item.allergens,
    featured: item.featured,
    available: item.available,
    category: {
      id: item.category.id,
      slug: item.category.slug,
      name: item.category.name,
    },
  };
}
