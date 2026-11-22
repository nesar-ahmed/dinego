import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  checkoutSchema,
  IDEMPOTENCY_KEY_HEADER,
  idempotencyKeySchema,
  idParamSchema,
  ORDERS_DEFAULT_PAGE_SIZE,
  ORDERS_MAX_PAGE_SIZE,
  ordersQuerySchema,
  type CheckoutInput,
  type OrdersQuery,
  type TokenPayload,
} from "@dinego/shared";
import { IdempotencyKey } from "../common/idempotency-key.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PaymentErrorDto } from "../payments/dto/swagger.dto.js";
import { CurrentAuth } from "../users/decorators/current-auth.decorator.js";
import { CustomerGuard } from "../users/guards/customer.guard.js";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard.js";
import {
  CheckoutDto,
  OrderErrorDto,
  OrderResponseDto,
  OrdersResponseDto,
} from "./dto/swagger.dto.js";
import { OrdersService } from "./orders.service.js";

/** Checkout and the customer panel's order list and details. */
@ApiTags("Orders")
@ApiOAuth2(["api"], "developer-login")
@ApiUnauthorizedResponse({ description: "Missing or invalid session cookie or bearer token" })
@ApiForbiddenResponse({ description: "Staff accounts cannot use customer orders (CUSTOMER_ONLY)" })
@UseGuards(JwtAuthGuard, CustomerGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: "Checkout: pay and place the order",
    description: [
      "Pays for the cart with the DUMMY payment provider (no real money is charged) and places the order in the same request.",
      "DINE_IN needs a `tableId` from GET /tables; TAKEAWAY needs only the payment.",
      "The order is created from the paid cart; ordered items are removed from the cart and a FREE table becomes OCCUPIED.",
      "Send a new Idempotency-Key (e.g. a UUID) per checkout and reuse it when retrying: a retry returns the same order instead of charging again.",
    ].join(" "),
  })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description: "8–100 characters: letters, numbers, hyphens, underscores. A UUID works.",
    example: "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  })
  @ApiBody({ type: CheckoutDto })
  @ApiCreatedResponse({ type: OrderResponseDto, description: "Paid and placed" })
  @ApiBadRequestResponse({ description: "Invalid body or header (VALIDATION_ERROR)" })
  @ApiResponse({ status: 402, type: PaymentErrorDto, description: "PAYMENT_DECLINED" })
  @ApiNotFoundResponse({ type: PaymentErrorDto, description: "TABLE_NOT_FOUND" })
  @ApiConflictResponse({
    type: PaymentErrorDto,
    description:
      "CART_EMPTY, CART_HAS_UNAVAILABLE_ITEMS, TOTAL_CHANGED, TABLE_NOT_AVAILABLE, PAYMENT_IN_PROGRESS, PAYMENT_AWAITING_ORDER, or IDEMPOTENCY_KEY_REUSED",
  })
  @ApiBadGatewayResponse({ type: PaymentErrorDto, description: "PAYMENT_PROVIDER_ERROR" })
  @Post()
  checkout(
    @CurrentAuth() auth: TokenPayload,
    @IdempotencyKey(new ZodValidationPipe(idempotencyKeySchema)) idempotencyKey: string,
    @Body(new ZodValidationPipe(checkoutSchema)) input: CheckoutInput,
  ) {
    return this.ordersService.checkout(auth.sub, idempotencyKey, input);
  }

  @ApiOperation({ summary: "My orders", description: "Newest first." })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({
    name: "pageSize",
    required: false,
    example: ORDERS_DEFAULT_PAGE_SIZE,
    description: `1–${ORDERS_MAX_PAGE_SIZE}`,
  })
  @ApiOkResponse({ type: OrdersResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query (VALIDATION_ERROR)" })
  @Get()
  list(
    @CurrentAuth() auth: TokenPayload,
    @Query(new ZodValidationPipe(ordersQuerySchema)) query: OrdersQuery,
  ) {
    return this.ordersService.list(auth.sub, query);
  }

  @ApiOperation({ summary: "One of my orders, with items and payment" })
  @ApiParam({ name: "id", example: 42 })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ description: "Invalid id (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({ type: OrderErrorDto, description: "ORDER_NOT_FOUND" })
  @Get(":id")
  get(
    @CurrentAuth() auth: TokenPayload,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: number,
  ) {
    return this.ordersService.getOrder(auth.sub, id);
  }
}
