import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  addCartItemSchema,
  cartItemParamSchema,
  updateCartItemSchema,
  type AddCartItemInput,
  type TokenPayload,
  type UpdateCartItemInput,
} from "@dinego/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CurrentAuth } from "../users/decorators/current-auth.decorator.js";
import { CustomerGuard } from "../users/guards/customer.guard.js";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard.js";
import { CartService } from "./cart.service.js";
import {
  AddCartItemDto,
  CartErrorDto,
  CartResponseDto,
  UpdateCartItemDto,
} from "./dto/swagger.dto.js";

/** The signed-in customer's cart. Every endpoint returns the full, updated cart. */
@ApiTags("Cart")
@ApiOAuth2(["api"], "developer-login")
@ApiUnauthorizedResponse({ description: "Missing or invalid session cookie or bearer token" })
@ApiForbiddenResponse({ description: "Staff accounts do not have a cart (CUSTOMER_ONLY)" })
@UseGuards(JwtAuthGuard, CustomerGuard)
@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @ApiOperation({
    summary: "Get my cart",
    description: "Returns an empty cart if nothing was added yet.",
  })
  @ApiOkResponse({ type: CartResponseDto })
  @Get()
  getCart(@CurrentAuth() auth: TokenPayload) {
    return this.cartService.getCart(auth.sub);
  }

  @ApiOperation({
    summary: "Add an item",
    description:
      "Adds a menu item. If it is already in the cart, the quantity is increased instead of creating a second line.",
  })
  @ApiBody({ type: AddCartItemDto })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ description: "Invalid body (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({ type: CartErrorDto, description: "MENU_ITEM_NOT_FOUND" })
  @ApiConflictResponse({
    type: CartErrorDto,
    description: "ITEM_UNAVAILABLE (sold out), QUANTITY_LIMIT, or CART_FULL",
  })
  @HttpCode(HttpStatus.OK)
  @Post("items")
  addItem(
    @CurrentAuth() auth: TokenPayload,
    @Body(new ZodValidationPipe(addCartItemSchema)) input: AddCartItemInput,
  ) {
    return this.cartService.addItem(auth.sub, input);
  }

  @ApiOperation({
    summary: "Change an item's quantity",
    description:
      "Sets an absolute quantity to increase or decrease it. A quantity of 0 removes the item. Increasing requires the item to still be available.",
  })
  @ApiParam({ name: "menuItemId", example: 5 })
  @ApiBody({ type: UpdateCartItemDto })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ description: "Invalid body or id (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({ type: CartErrorDto, description: "CART_ITEM_NOT_FOUND" })
  @ApiConflictResponse({ type: CartErrorDto, description: "ITEM_UNAVAILABLE when increasing" })
  @Patch("items/:menuItemId")
  setQuantity(
    @CurrentAuth() auth: TokenPayload,
    @Param("menuItemId", new ZodValidationPipe(cartItemParamSchema)) menuItemId: number,
    @Body(new ZodValidationPipe(updateCartItemSchema)) input: UpdateCartItemInput,
  ) {
    return this.cartService.setQuantity(auth.sub, menuItemId, input.quantity);
  }

  @ApiOperation({
    summary: "Remove an item",
    description: "Idempotent: removing an item that is not in the cart still returns 200.",
  })
  @ApiParam({ name: "menuItemId", example: 5 })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ description: "Invalid id (VALIDATION_ERROR)" })
  @Delete("items/:menuItemId")
  removeItem(
    @CurrentAuth() auth: TokenPayload,
    @Param("menuItemId", new ZodValidationPipe(cartItemParamSchema)) menuItemId: number,
  ) {
    return this.cartService.removeItem(auth.sub, menuItemId);
  }
}
