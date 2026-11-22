import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  idParamSchema,
  ORDER_STATUSES,
  ORDER_TYPES,
  STAFF_ORDERS_DEFAULT_PAGE_SIZE,
  STAFF_ORDERS_MAX_PAGE_SIZE,
  staffOrdersQuerySchema,
  updateOrderStatusSchema,
  type StaffOrdersQuery,
  type TokenPayload,
  type UpdateOrderStatusInput,
  type UserRole,
} from "@dinego/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CurrentAuth } from "../users/decorators/current-auth.decorator.js";
import { Roles } from "../users/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard.js";
import { RolesGuard } from "../users/guards/roles.guard.js";
import {
  StaffOrderErrorDto,
  StaffOrderResponseDto,
  StaffOrdersResponseDto,
  UpdateOrderStatusDto,
} from "./dto/swagger.dto.js";
import { StaffOrdersService } from "./staff-orders.service.js";

/** Orders for restaurant staff: the list, the details, and moving an order along. */
@ApiTags("Staff orders")
@ApiOAuth2(["api"], "developer-login")
@ApiUnauthorizedResponse({ description: "Missing or invalid session cookie or bearer token" })
@ApiForbiddenResponse({ description: "Customer accounts (staff access is required)" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN")
@Controller("staff/orders")
export class StaffOrdersController {
  constructor(private readonly staffOrdersService: StaffOrdersService) {}

  @ApiOperation({
    summary: "All orders",
    description:
      "Newest first. Filter by one or more statuses (`status=PLACED,ACCEPTED`) and type.",
  })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({
    name: "pageSize",
    required: false,
    example: STAFF_ORDERS_DEFAULT_PAGE_SIZE,
    description: `1–${STAFF_ORDERS_MAX_PAGE_SIZE}`,
  })
  @ApiQuery({
    name: "status",
    required: false,
    example: "PLACED,ACCEPTED",
    description: `Comma-separated: ${ORDER_STATUSES.join(", ")}`,
  })
  @ApiQuery({ name: "type", required: false, enum: [...ORDER_TYPES] })
  @ApiOkResponse({ type: StaffOrdersResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query (VALIDATION_ERROR)" })
  @Get()
  list(@Query(new ZodValidationPipe(staffOrdersQuerySchema)) query: StaffOrdersQuery) {
    return this.staffOrdersService.list(query);
  }

  @ApiOperation({ summary: "One order with its items" })
  @ApiParam({ name: "id", example: 42 })
  @ApiOkResponse({ type: StaffOrderResponseDto })
  @ApiBadRequestResponse({ description: "Invalid id (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({ type: StaffOrderErrorDto, description: "ORDER_NOT_FOUND" })
  @Get(":id")
  get(@Param("id", new ZodValidationPipe(idParamSchema)) id: number) {
    return this.staffOrdersService.get(id);
  }

  @ApiOperation({
    summary: "Move an order to a new status",
    description: [
      "Dine-in: SENT → IN_PROGRESS → READY → SERVED → CLOSED (SENT may go straight to READY; SENT or IN_PROGRESS → CANCELLED).",
      "Takeaway: PLACED → ACCEPTED → PREPARING → READY_FOR_PICKUP → COLLECTED (ACCEPTED may go straight to READY_FOR_PICKUP; PLACED → REJECTED; PLACED, ACCEPTED, or PREPARING → CANCELLED; READY_FOR_PICKUP → NO_SHOW).",
      "Who: KITCHEN cooks (IN_PROGRESS, READY, ACCEPTED, PREPARING, READY_FOR_PICKUP), WAITER serves dine-in (SENT, SERVED, CLOSED), CASHIER hands over takeaway (ACCEPTED, COLLECTED, NO_SHOW, CLOSED); only ADMIN and MANAGER reject or cancel, and they may set any status.",
      "REJECTED and CANCELLED need a `reason`, shown to the customer. Repeating the current status is a no-op.",
      "The customer and the staff who act next are notified (in-app notifications).",
    ].join(" "),
  })
  @ApiParam({ name: "id", example: 42 })
  @ApiBody({ type: UpdateOrderStatusDto })
  @ApiOkResponse({ type: StaffOrderResponseDto })
  @ApiBadRequestResponse({
    description: "Invalid body or id, or a missing reason (VALIDATION_ERROR)",
  })
  @ApiForbiddenResponse({
    type: StaffOrderErrorDto,
    description: "STATUS_NOT_ALLOWED_FOR_ROLE: this role cannot set that status",
  })
  @ApiNotFoundResponse({ type: StaffOrderErrorDto, description: "ORDER_NOT_FOUND" })
  @ApiConflictResponse({ type: StaffOrderErrorDto, description: "INVALID_STATUS_TRANSITION" })
  @Patch(":id/status")
  changeStatus(
    @CurrentAuth() auth: TokenPayload,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: number,
    @Body(new ZodValidationPipe(updateOrderStatusSchema)) input: UpdateOrderStatusInput,
  ) {
    return this.staffOrdersService.changeStatus(
      { id: auth.sub, role: auth.role as UserRole },
      id,
      input,
    );
  }
}
