import { ApiProperty } from "@nestjs/swagger";
import { CART_ERROR_CODES, CART_MAX_ITEM_QUANTITY } from "@dinego/shared";
import { PublicMenuItemDto } from "../../menu/dto/swagger.dto.js";

export class AddCartItemDto {
  @ApiProperty({ example: 5, description: "Menu item id from the public menu." })
  menuItemId!: number;

  @ApiProperty({
    example: 1,
    required: false,
    default: 1,
    minimum: 1,
    maximum: CART_MAX_ITEM_QUANTITY,
    description: "Added to the existing quantity when the item is already in the cart.",
  })
  quantity?: number;
}

export class UpdateCartItemDto {
  @ApiProperty({
    example: 2,
    minimum: 0,
    maximum: CART_MAX_ITEM_QUANTITY,
    description: "Absolute quantity. 0 removes the item.",
  })
  quantity!: number;
}

export class CartLineDto {
  @ApiProperty({ type: PublicMenuItemDto })
  item!: PublicMenuItemDto;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: 2580, description: "Current price × quantity, in cents." })
  lineTotalCents!: number;

  @ApiProperty({
    example: true,
    description:
      "False when the item is sold out or no longer on the menu. Excluded from totals; quantity can only be lowered.",
  })
  purchasable!: boolean;
}

export class CustomerCartDto {
  @ApiProperty({ type: [CartLineDto] })
  items!: CartLineDto[];

  @ApiProperty({ example: 3, description: "Total quantity of purchasable items." })
  itemCount!: number;

  @ApiProperty({ example: 3470, description: "Purchasable subtotal before tax, in cents." })
  subtotalCents!: number;

  @ApiProperty({ example: false })
  hasUnavailableItems!: boolean;

  @ApiProperty({ example: "2026-11-16T09:00:00.000Z", format: "date-time", nullable: true })
  updatedAt!: string | null;
}

export class CartResponseDto {
  @ApiProperty({ type: CustomerCartDto })
  cart!: CustomerCartDto;
}

export class CartErrorDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ enum: [...CART_ERROR_CODES], example: "ITEM_UNAVAILABLE" })
  code!: string;

  @ApiProperty({ example: "Espresso is sold out" })
  message!: string;
}
