import { ApiProperty } from "@nestjs/swagger";
import {
  ORDER_TYPES,
  PAYMENT_ERROR_CODES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type OrderType,
  type PaymentMethod,
  type PaymentStatus,
} from "@dinego/shared";
import { PaginationDto } from "../../menu/dto/swagger.dto.js";

export class CheckoutLineDto {
  @ApiProperty({ example: 5 })
  menuItemId!: number;

  @ApiProperty({ example: "Smash burger" })
  name!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: 1290, description: "Menu price per item, in cents, before tax." })
  unitPriceCents!: number;

  @ApiProperty({ example: 2580 })
  lineTotalCents!: number;
}

export class CheckoutQuoteDto {
  @ApiProperty({ type: [CheckoutLineDto] })
  lines!: CheckoutLineDto[];

  @ApiProperty({ example: 3 })
  itemCount!: number;

  @ApiProperty({ example: 2980 })
  subtotalCents!: number;

  @ApiProperty({ example: 0, description: "Tax on the tax-exclusive menu prices." })
  taxCents!: number;

  @ApiProperty({ example: 300 })
  tipCents!: number;

  @ApiProperty({
    example: 3280,
    description: "subtotal + tax + tip. Send it back as `expectedTotalCents` to POST /orders.",
  })
  totalCents!: number;
}

export class CheckoutQuoteResponseDto {
  @ApiProperty({ type: CheckoutQuoteDto })
  quote!: CheckoutQuoteDto;
}

export class PaymentTableDto {
  @ApiProperty({ example: 4 })
  id!: number;

  @ApiProperty({ example: "T4" })
  label!: string;
}

export class CustomerPaymentDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ enum: [...PAYMENT_STATUSES], example: "SUCCEEDED" })
  status!: PaymentStatus;

  @ApiProperty({ enum: [...PAYMENT_METHODS], example: "CARD" })
  method!: PaymentMethod;

  @ApiProperty({ enum: [...ORDER_TYPES], example: "DINE_IN" })
  orderType!: OrderType;

  @ApiProperty({ type: PaymentTableDto, nullable: true })
  table!: PaymentTableDto | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Number,
    description: "The order placed with this payment; null for declined attempts.",
  })
  orderId!: number | null;

  @ApiProperty({ type: [CheckoutLineDto], description: "The cart as it was paid for." })
  lines!: CheckoutLineDto[];

  @ApiProperty({ example: 2980 })
  subtotalCents!: number;

  @ApiProperty({ example: 0 })
  taxCents!: number;

  @ApiProperty({ example: 300 })
  tipCents!: number;

  @ApiProperty({ example: 3280 })
  amountCents!: number;

  @ApiProperty({ example: null, nullable: true, type: String })
  failureCode!: string | null;

  @ApiProperty({ example: null, nullable: true, type: String })
  failureMessage!: string | null;

  @ApiProperty({ example: "2026-11-16T09:00:00.000Z", format: "date-time" })
  createdAt!: string;

  @ApiProperty({ example: "2026-11-16T09:00:00.000Z", format: "date-time" })
  updatedAt!: string;
}

export class PaymentResponseDto {
  @ApiProperty({ type: CustomerPaymentDto })
  payment!: CustomerPaymentDto;
}

export class PaymentsResponseDto {
  @ApiProperty({ type: [CustomerPaymentDto] })
  payments!: CustomerPaymentDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class PaymentErrorDto {
  @ApiProperty({ example: 402 })
  statusCode!: number;

  @ApiProperty({ enum: [...PAYMENT_ERROR_CODES], example: "PAYMENT_DECLINED" })
  code!: string;

  @ApiProperty({ example: "Your card was declined." })
  message!: string;

  @ApiProperty({
    example: 12,
    required: false,
    description: "The related payment, when one exists.",
  })
  paymentId?: number;
}
