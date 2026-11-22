import { applyDecorators } from "@nestjs/common";
import { ApiProperty, ApiQuery } from "@nestjs/swagger";
import {
  DIETARY_TAGS,
  MENU_DEFAULT_PAGE_SIZE,
  MENU_MAX_PAGE_SIZE,
  MENU_MAX_PRICE_CENTS,
  MENU_SORTS,
  type DietaryTag,
} from "@dinego/shared";

export class MenuCategorySummaryDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: "mains" })
  slug!: string;

  @ApiProperty({ example: "Mains" })
  name!: string;
}

export class PublicMenuCategoryDto extends MenuCategorySummaryDto {
  @ApiProperty({ example: "Comforting plates from our open kitchen.", nullable: true })
  description!: string | null;

  @ApiProperty({
    example: 6,
    description: "Number of public items in the category, independent of request filters.",
  })
  itemCount!: number;
}

export class PublicMenuItemDto {
  @ApiProperty({ example: 5 })
  id!: number;

  @ApiProperty({ example: "smash-burger" })
  slug!: string;

  @ApiProperty({ example: "Smash burger" })
  name!: string;

  @ApiProperty({ example: "Double patty, aged cheddar, house pickles, brioche", nullable: true })
  description!: string | null;

  @ApiProperty({ example: 1290, description: "Price in integer cents." })
  priceCents!: number;

  @ApiProperty({ enum: [...DIETARY_TAGS], isArray: true, example: ["VEGETARIAN"] })
  dietaryTags!: DietaryTag[];

  @ApiProperty({ type: [String], example: ["gluten", "dairy"] })
  allergens!: string[];

  @ApiProperty({ example: true, description: "Highlighted as a chef's pick." })
  featured!: boolean;

  @ApiProperty({ example: true, description: "False when the item is temporarily sold out." })
  available!: boolean;

  @ApiProperty({ type: MenuCategorySummaryDto })
  category!: MenuCategorySummaryDto;
}

export class MenuSectionDto extends PublicMenuCategoryDto {
  @ApiProperty({ type: [PublicMenuItemDto] })
  items!: PublicMenuItemDto[];
}

export class MenuResponseDto {
  @ApiProperty({ type: [MenuSectionDto] })
  categories!: MenuSectionDto[];
}

export class MenuCategoriesResponseDto {
  @ApiProperty({ type: [PublicMenuCategoryDto] })
  categories!: PublicMenuCategoryDto[];
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: MENU_DEFAULT_PAGE_SIZE })
  pageSize!: number;

  @ApiProperty({ example: 17 })
  total!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}

export class MenuItemsResponseDto {
  @ApiProperty({ type: [PublicMenuItemDto] })
  items!: PublicMenuItemDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class MenuItemResponseDto {
  @ApiProperty({ type: PublicMenuItemDto })
  item!: PublicMenuItemDto;
}

/** Filter and sort parameters shared by `GET /menu` and `GET /menu/items`. */
export function ApiMenuFilterQueries() {
  return applyDecorators(
    ApiQuery({
      name: "q",
      required: false,
      description: "Case-insensitive search in item name, item description, and category name.",
      example: "mushroom",
    }),
    ApiQuery({
      name: "category",
      required: false,
      description: "Comma-separated category slugs. Matches items in ANY listed category.",
      example: "mains,desserts",
    }),
    ApiQuery({
      name: "tags",
      required: false,
      description: `Comma-separated dietary tags. Items must have ALL listed tags. Case-insensitive; hyphens are accepted (gluten-free). Values: ${DIETARY_TAGS.join(", ")}.`,
      example: "VEGETARIAN,GLUTEN_FREE",
    }),
    ApiQuery({
      name: "minPrice",
      required: false,
      type: Number,
      description: "Inclusive minimum price in cents.",
      example: 500,
    }),
    ApiQuery({
      name: "maxPrice",
      required: false,
      type: Number,
      description: `Inclusive maximum price in cents (up to ${MENU_MAX_PRICE_CENTS}).`,
      example: 1500,
    }),
    ApiQuery({ name: "featured", required: false, enum: ["true", "false"] }),
    ApiQuery({
      name: "available",
      required: false,
      enum: ["true", "false"],
      description: "Use `true` to hide sold-out items. Sold-out items are included by default.",
    }),
    ApiQuery({
      name: "sort",
      required: false,
      enum: [...MENU_SORTS],
      description: "`recommended` (default) follows the curated category and item order.",
    }),
  );
}

export function ApiMenuPaginationQueries() {
  return applyDecorators(
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({
      name: "pageSize",
      required: false,
      type: Number,
      example: MENU_DEFAULT_PAGE_SIZE,
      description: `Items per page, 1–${MENU_MAX_PAGE_SIZE}.`,
    }),
  );
}
