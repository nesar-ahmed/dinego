import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository, SelectQueryBuilder } from "typeorm";
import type {
  MenuCategoriesResponse,
  MenuItemResponse,
  MenuItemsQuery,
  MenuItemsResponse,
  MenuQuery,
  MenuResponse,
  MenuSort,
} from "@dinego/shared";
import { MenuCategory } from "./entities/menu-category.entity.js";
import { MenuItem } from "./entities/menu-item.entity.js";
import { toPublicCategory, toPublicItem } from "./menu.mapper.js";

type MenuFilters = Omit<MenuQuery, "sort">;

/**
 * Read-only public menu.
 *
 * Visibility rule: items are public only when their category is active. Sold-out items
 * (`available = false`) stay visible so customers can see the full menu; use `available=true`
 * to hide them.
 */
@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuCategory)
    private readonly categories: Repository<MenuCategory>,
    @InjectRepository(MenuItem)
    private readonly items: Repository<MenuItem>,
  ) {}

  async listCategories(): Promise<MenuCategoriesResponse> {
    const [categories, counts] = await Promise.all([
      this.activeCategories(),
      this.countItemsByCategory(),
    ]);

    return {
      categories: categories.map((category) =>
        toPublicCategory(category, counts.get(category.id) ?? 0),
      ),
    };
  }

  /** Full menu grouped by category. Categories without matching items are omitted. */
  async getMenu(query: MenuQuery): Promise<MenuResponse> {
    const [categories, counts, items] = await Promise.all([
      this.activeCategories(),
      this.countItemsByCategory(),
      this.publicItems(query).getMany(),
    ]);

    const itemsByCategory = new Map<number, MenuItem[]>();
    for (const item of items) {
      const group = itemsByCategory.get(item.categoryId) ?? [];
      group.push(item);
      itemsByCategory.set(item.categoryId, group);
    }

    return {
      categories: categories
        .filter((category) => itemsByCategory.has(category.id))
        .map((category) => ({
          ...toPublicCategory(category, counts.get(category.id) ?? 0),
          items: (itemsByCategory.get(category.id) ?? []).map(toPublicItem),
        })),
    };
  }

  async listItems(query: MenuItemsQuery): Promise<MenuItemsResponse> {
    const { page, pageSize } = query;
    const builder = this.publicItems(query);
    const total = await builder.getCount();
    // offset/limit (not skip/take) is correct here: the only join is many-to-one, so rows never multiply.
    const items = await builder
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getMany();

    return {
      items: items.map(toPublicItem),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getItem(slug: string): Promise<MenuItemResponse> {
    const item = await this.baseItemQuery()
      .andWhere("item.slug = :slug", { slug: slug.toLowerCase() })
      .getOne();

    if (!item) {
      throw new NotFoundException("Menu item not found");
    }

    return { item: toPublicItem(item) };
  }

  private activeCategories(): Promise<MenuCategory[]> {
    return this.categories.find({
      where: { active: true },
      order: { sortOrder: "ASC", id: "ASC" },
    });
  }

  /** Counts every public item per active category, regardless of request filters. */
  private async countItemsByCategory(): Promise<Map<number, number>> {
    const rows = await this.baseItemQuery()
      .select("item.categoryId", "categoryId")
      .addSelect("COUNT(item.id)", "count")
      .groupBy("item.categoryId")
      .getRawMany<{ categoryId: number; count: number }>();

    return new Map(rows.map((row) => [Number(row.categoryId), Number(row.count)]));
  }

  /** Items in active categories only. Every public query starts here. */
  private baseItemQuery(): SelectQueryBuilder<MenuItem> {
    return this.items
      .createQueryBuilder("item")
      .innerJoinAndSelect("item.category", "category")
      .where("category.active = :categoryActive", { categoryActive: true });
  }

  private publicItems(query: MenuFilters & { sort: MenuSort }): SelectQueryBuilder<MenuItem> {
    const builder = this.baseItemQuery();

    if (query.q) {
      builder.andWhere(
        "(item.name LIKE :search ESCAPE '\\' OR item.description LIKE :search ESCAPE '\\' OR category.name LIKE :search ESCAPE '\\')",
        { search: `%${escapeLike(query.q)}%` },
      );
    }

    if (query.category?.length) {
      builder.andWhere("category.slug IN (:...categorySlugs)", { categorySlugs: query.category });
    }

    // Items must carry every requested tag.
    for (const [index, tag] of (query.tags ?? []).entries()) {
      builder.andWhere(
        `EXISTS (SELECT 1 FROM json_each(item.dietaryTags) WHERE json_each.value = :tag${index})`,
        { [`tag${index}`]: tag },
      );
    }

    if (query.minPrice !== undefined) {
      builder.andWhere("item.priceCents >= :minPrice", { minPrice: query.minPrice });
    }

    if (query.maxPrice !== undefined) {
      builder.andWhere("item.priceCents <= :maxPrice", { maxPrice: query.maxPrice });
    }

    if (query.featured !== undefined) {
      builder.andWhere("item.featured = :featured", { featured: query.featured });
    }

    if (query.available !== undefined) {
      builder.andWhere("item.available = :available", { available: query.available });
    }

    return applySort(builder, query.sort);
  }
}

/** Escapes LIKE wildcards so user input such as `%` or `_` is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Every sort ends with `item.id` so pagination is stable when values tie. */
function applySort(
  builder: SelectQueryBuilder<MenuItem>,
  sort: MenuSort,
): SelectQueryBuilder<MenuItem> {
  switch (sort) {
    case "price_asc":
      return builder.orderBy("item.priceCents", "ASC").addOrderBy("item.id", "ASC");
    case "price_desc":
      return builder.orderBy("item.priceCents", "DESC").addOrderBy("item.id", "ASC");
    case "name_asc":
      return builder.orderBy("LOWER(item.name)", "ASC").addOrderBy("item.id", "ASC");
    case "name_desc":
      return builder.orderBy("LOWER(item.name)", "DESC").addOrderBy("item.id", "ASC");
    case "recommended":
      return builder
        .orderBy("category.sortOrder", "ASC")
        .addOrderBy("category.id", "ASC")
        .addOrderBy("item.sortOrder", "ASC")
        .addOrderBy("item.id", "ASC");
  }
}
