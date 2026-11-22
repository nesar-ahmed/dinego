import { ApiProperty } from "@nestjs/swagger";
import {
  STAFF_ORDER_ERROR_CODES,
  STATIONS,
  type Station,
  CHECKOUT_MAX_TIP_CENTS,
  CHECKOUT_PAYMENT_METHODS,
  ITEM_STATUSES,
  ORDER_ERROR_CODES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type ItemStatus,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type PaymentStatus,
} from "@dinego/shared";
import { PaginationDto } from "../../menu/dto/swagger.dto.js";
import { PaymentTableDto } from "../../payments/dto/swagger.dto.js";

export class CheckoutDto {
  @ApiProperty({
    enum: [...ORDER_TYPES],
    example: "TAKEAWAY",
    description:
      "Delivery mode. DINE_IN: send `tableId` from GET /tables. TAKEAWAY: only the payment is needed; do not send a table.",
  })
  orderType!: OrderType;

  @ApiProperty({
    example: 4,
    required: false,
    description: "DINE_IN only: an orderable table from GET /tables.",
  })
  tableId?: number;

  @ApiProperty({ enum: [...CHECKOUT_PAYMENT_METHODS], example: "CARD" })
  method!: "CARD" | "ONLINE";

  @ApiProperty({
    example: "tok_visa",
    description:
      "DUMMY payment token; no real money is charged. Approved: tok_visa, tok_mastercard, tok_amex, tok_wallet. Declined: tok_declined, tok_insufficient_funds, tok_expired_card. Outage: tok_provider_error.",
  })
  paymentToken!: string;

  @ApiProperty({
    example: 0,
    required: false,
    default: 0,
    minimum: 0,
    maximum: CHECKOUT_MAX_TIP_CENTS,
  })
  tipCents?: number;

  @ApiProperty({
    example: 3580,
    description:
      "The totalCents from GET /payments/quote that the customer confirmed. A different server total returns TOTAL_CHANGED.",
  })
  expectedTotalCents!: number;
}

export class CustomerOrderItemDto {
  @ApiProperty({ example: 31 })
  id!: number;

  @ApiProperty({ example: 5 })
  menuItemId!: number;

  @ApiProperty({ example: "Smash burger" })
  name!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: 1290, description: "Price paid per item, before tax." })
  unitPriceCents!: number;

  @ApiProperty({ example: 2580 })
  lineTotalCents!: number;

  @ApiProperty({ enum: [...ITEM_STATUSES], example: "FIRED" })
  status!: ItemStatus;
}

export class OrderPaymentDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ enum: [...PAYMENT_METHODS], example: "CARD" })
  method!: PaymentMethod;

  @ApiProperty({ enum: [...PAYMENT_STATUSES], example: "SUCCEEDED" })
  status!: PaymentStatus;

  @ApiProperty({ example: 3580 })
  amountCents!: number;

  @ApiProperty({ example: "2026-11-16T09:00:00.000Z", format: "date-time" })
  createdAt!: string;
}

export class CustomerOrderSummaryDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: "DG-00042" })
  orderNo!: string;

  @ApiProperty({ enum: [...ORDER_TYPES], example: "DINE_IN" })
  type!: OrderType;

  @ApiProperty({
    enum: [...ORDER_STATUSES],
    example: "SENT",
    description:
      "New dine-in orders start SENT (to the kitchen); new takeaway orders start PLACED.",
  })
  status!: OrderStatus;

  @ApiProperty({ type: PaymentTableDto, nullable: true, description: "Null for takeaway." })
  table!: PaymentTableDto | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description: "Takeaway only: 4-digit code to show at pickup.",
  })
  pickupCode!: string | null;

  @ApiProperty({ example: 3 })
  itemCount!: number;

  @ApiProperty({ example: 3580 })
  totalCents!: number;

  @ApiProperty({ example: "2026-11-16T09:00:00.000Z", format: "date-time" })
  createdAt!: string;
}

export class CustomerOrderDto extends CustomerOrderSummaryDto {
  @ApiProperty({ type: [CustomerOrderItemDto] })
  items!: CustomerOrderItemDto[];

  @ApiProperty({ example: 2930 })
  subtotalCents!: number;

  @ApiProperty({ example: 0 })
  taxCents!: number;

  @ApiProperty({ example: 650 })
  tipCents!: number;

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    format: "date-time",
    description: "Null means as soon as possible.",
  })
  pickupTime!: string | null;

  @ApiProperty({ example: null, nullable: true, type: String })
  notes!: string | null;

  @ApiProperty({ type: [OrderPaymentDto] })
  payments!: OrderPaymentDto[];

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description: "Why the restaurant declined, cancelled, or marked the order as not collected.",
  })
  statusReason!: string | null;

  @ApiProperty({ example: "2026-11-16T09:00:00.000Z", format: "date-time" })
  updatedAt!: string;
}

export class OrderResponseDto {
  @ApiProperty({ type: CustomerOrderDto })
  order!: CustomerOrderDto;
}

export class OrdersResponseDto {
  @ApiProperty({ type: [CustomerOrderSummaryDto] })
  orders!: CustomerOrderSummaryDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class OrderErrorDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ enum: [...ORDER_ERROR_CODES], example: "ORDER_NOT_FOUND" })
  code!: string;

  @ApiProperty({ example: "Order not found" })
  message!: string;
}

/* -------------------------------- Staff --------------------------------- */

export class StaffOrderItemDto extends CustomerOrderItemDto {
  @ApiProperty({ enum: [...STATIONS], example: "GRILL" })
  station!: Station;

  @ApiProperty({
    example: "2026-11-16T09:00:00.000Z",
    nullable: true,
    type: String,
    format: "date-time",
  })
  firedAt!: string | null;

  @ApiProperty({ example: null, nullable: true, type: String, format: "date-time" })
  readyAt!: string | null;
}

export class StaffOrderCustomerDto {
  @ApiProperty({ example: 6 })
  id!: number;

  @ApiProperty({ example: "Sofia Alvarez" })
  name!: string;
}

export class StaffOrderSummaryDto extends CustomerOrderSummaryDto {
  @ApiProperty({
    type: StaffOrderCustomerDto,
    nullable: true,
    description: "Null for orders entered by staff.",
  })
  customer!: StaffOrderCustomerDto | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description: "Why the order was rejected, cancelled, or not collected.",
  })
  statusReason!: string | null;

  @ApiProperty({ example: "2026-11-16T09:05:00.000Z", format: "date-time" })
  updatedAt!: string;
}

export class StaffOrderDto extends StaffOrderSummaryDto {
  @ApiProperty({ type: [StaffOrderItemDto] })
  items!: StaffOrderItemDto[];

  @ApiProperty({ example: 2930 })
  subtotalCents!: number;

  @ApiProperty({ example: 0 })
  taxCents!: number;

  @ApiProperty({ example: 650 })
  tipCents!: number;

  @ApiProperty({ example: null, nullable: true, type: String, format: "date-time" })
  pickupTime!: string | null;

  @ApiProperty({ example: null, nullable: true, type: String })
  notes!: string | null;
}

export class StaffOrderResponseDto {
  @ApiProperty({ type: StaffOrderDto })
  order!: StaffOrderDto;
}

export class StaffOrdersResponseDto {
  @ApiProperty({ type: [StaffOrderSummaryDto] })
  orders!: StaffOrderSummaryDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: [...ORDER_STATUSES], example: "ACCEPTED" })
  status!: OrderStatus;

  @ApiProperty({
    example: "We ran out of fresh fish today",
    required: false,
    description:
      "Shown to the customer. Required for REJECTED and CANCELLED, optional for NO_SHOW, not allowed otherwise. 3–300 characters.",
  })
  reason?: string;
}

export class StaffOrderErrorDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ enum: [...STAFF_ORDER_ERROR_CODES], example: "INVALID_STATUS_TRANSITION" })
  code!: string;

  @ApiProperty({ example: "Order DG-00042 is PLACED; it cannot change to SERVED" })
  message!: string;
}
