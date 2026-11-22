import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  menuItemsQuerySchema,
  menuQuerySchema,
  type MenuItemsQuery,
  type MenuQuery,
} from "@dinego/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import {
  ApiMenuFilterQueries,
  ApiMenuPaginationQueries,
  MenuCategoriesResponseDto,
  MenuItemResponseDto,
  MenuItemsResponseDto,
  MenuResponseDto,
} from "./dto/swagger.dto.js";
import { MenuService } from "./menu.service.js";

/** Public, read-only menu endpoints. No authentication required. */
@ApiTags("Menu")
@Controller("menu")
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @ApiOperation({
    summary: "Full menu grouped by category",
    description:
      "Active categories in menu order, each with its matching items. Categories with no matching items are omitted.",
  })
  @ApiMenuFilterQueries()
  @ApiOkResponse({ type: MenuResponseDto })
  @ApiBadRequestResponse({ description: "Invalid or unknown query parameter (VALIDATION_ERROR)" })
  @Get()
  getMenu(@Query(new ZodValidationPipe(menuQuerySchema)) query: MenuQuery) {
    return this.menuService.getMenu(query);
  }

  @ApiOperation({
    summary: "List menu categories",
    description: "Active categories in menu order.",
  })
  @ApiOkResponse({ type: MenuCategoriesResponseDto })
  @Get("categories")
  listCategories() {
    return this.menuService.listCategories();
  }

  @ApiOperation({
    summary: "Browse, filter, search, and sort menu items",
    description: "Paginated list of public menu items.",
  })
  @ApiMenuFilterQueries()
  @ApiMenuPaginationQueries()
  @ApiOkResponse({ type: MenuItemsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid or unknown query parameter (VALIDATION_ERROR)" })
  @Get("items")
  listItems(@Query(new ZodValidationPipe(menuItemsQuerySchema)) query: MenuItemsQuery) {
    return this.menuService.listItems(query);
  }

  @ApiOperation({ summary: "Get a menu item by slug" })
  @ApiParam({ name: "slug", example: "smash-burger" })
  @ApiOkResponse({ type: MenuItemResponseDto })
  @ApiNotFoundResponse({ description: "No public item with this slug" })
  @Get("items/:slug")
  getItem(@Param("slug") slug: string) {
    return this.menuService.getItem(slug);
  }
}
