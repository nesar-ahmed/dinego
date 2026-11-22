import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  CHECKOUT_MAX_TIP_CENTS,
  checkoutQuoteQuerySchema,
  idParamSchema,
  PAYMENTS_DEFAULT_PAGE_SIZE,
  PAYMENTS_MAX_PAGE_SIZE,
  paymentsQuerySchema,
  type CheckoutQuoteQuery,
  type PaymentsQuery,
  type TokenPayload,
} from "@dinego/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CurrentAuth } from "../users/decorators/current-auth.decorator.js";
import { CustomerGuard } from "../users/guards/customer.guard.js";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard.js";
import {
  CheckoutQuoteResponseDto,
  PaymentErrorDto,
  PaymentResponseDto,
  PaymentsResponseDto,
} from "./dto/swagger.dto.js";
import { PaymentsService } from "./payments.service.js";

/**
 * Checkout quote and payment history for the signed-in customer. Paying happens at checkout,
 * `POST /orders`, which charges the dummy payment provider and places the order together.
 */
@ApiTags("Payments")
@ApiOAuth2(["api"], "developer-login")
@ApiUnauthorizedResponse({ description: "Missing or invalid session cookie or bearer token" })
@ApiForbiddenResponse({ description: "Staff accounts cannot check out (CUSTOMER_ONLY)" })
@UseGuards(JwtAuthGuard, CustomerGuard)
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiOperation({
    summary: "Checkout quote",
    description:
      "Subtotal, tax, tip, and total for the current cart, exactly as it would be charged at checkout (POST /orders). Show totalCents on the checkout page and send it back as expectedTotalCents.",
  })
  @ApiQuery({
    name: "tipCents",
    required: false,
    example: 300,
    description: `Tip in cents, 0–${CHECKOUT_MAX_TIP_CENTS}. Default 0.`,
  })
  @ApiOkResponse({ type: CheckoutQuoteResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query (VALIDATION_ERROR)" })
  @ApiConflictResponse({
    type: PaymentErrorDto,
    description: "CART_EMPTY or CART_HAS_UNAVAILABLE_ITEMS",
  })
  @Get("quote")
  quote(
    @CurrentAuth() auth: TokenPayload,
    @Query(new ZodValidationPipe(checkoutQuoteQuerySchema)) query: CheckoutQuoteQuery,
  ) {
    return this.paymentsService.quote(auth.sub, query.tipCents);
  }

  @ApiOperation({
    summary: "My payments",
    description: "Newest first, including declined attempts. All payments are dummy payments.",
  })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({
    name: "pageSize",
    required: false,
    example: PAYMENTS_DEFAULT_PAGE_SIZE,
    description: `1–${PAYMENTS_MAX_PAGE_SIZE}`,
  })
  @ApiOkResponse({ type: PaymentsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query (VALIDATION_ERROR)" })
  @Get()
  list(
    @CurrentAuth() auth: TokenPayload,
    @Query(new ZodValidationPipe(paymentsQuerySchema)) query: PaymentsQuery,
  ) {
    return this.paymentsService.list(auth.sub, query);
  }

  @ApiOperation({ summary: "One of my payments" })
  @ApiParam({ name: "id", example: 12 })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiBadRequestResponse({ description: "Invalid id (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({ type: PaymentErrorDto, description: "PAYMENT_NOT_FOUND" })
  @Get(":id")
  get(
    @CurrentAuth() auth: TokenPayload,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: number,
  ) {
    return this.paymentsService.get(auth.sub, id);
  }
}
