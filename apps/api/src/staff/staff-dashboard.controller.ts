import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  ORDER_TYPES,
  staffBoardQuerySchema,
  type StaffBoardQuery,
  type StaffRole,
  type TokenPayload,
} from "@dinego/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CurrentAuth } from "../users/decorators/current-auth.decorator.js";
import { Roles } from "../users/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard.js";
import { RolesGuard } from "../users/guards/roles.guard.js";
import { StaffBoardResponseDto, StaffFloorResponseDto } from "./dto/swagger.dto.js";
import { StaffDashboardService } from "./staff-dashboard.service.js";

/**
 * What the staff dashboards show, one request per screen. Changes go through
 * `PATCH /staff/orders/:id/status` and `PATCH /floor/tables/:id/status`.
 */
@ApiTags("Staff dashboards")
@ApiOAuth2(["api"], "developer-login")
@ApiUnauthorizedResponse({ description: "Missing or invalid session cookie or bearer token" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("staff")
export class StaffDashboardController {
  constructor(private readonly dashboards: StaffDashboardService) {}

  @ApiOperation({
    summary: "My board",
    description: [
      "The orders the signed-in role works on, oldest first, with items and `actions` (the statuses you may move each one to now).",
      "KITCHEN: dine-in SENT, IN_PROGRESS, READY and takeaway PLACED, PAY_AT_PICKUP, ACCEPTED, PREPARING, READY_FOR_PICKUP.",
      "WAITER: dine-in SENT, IN_PROGRESS, READY, SERVED. CASHIER: takeaway PLACED, PAY_AT_PICKUP, ACCEPTED, PREPARING, READY_FOR_PICKUP.",
      "ADMIN and MANAGER: every order still in service.",
    ].join(" "),
  })
  @ApiQuery({ name: "type", required: false, enum: [...ORDER_TYPES] })
  @ApiOkResponse({ type: StaffBoardResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query (VALIDATION_ERROR)" })
  @ApiForbiddenResponse({ description: "Customer accounts (staff access is required)" })
  @Roles("ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN")
  @Get("board")
  board(
    @CurrentAuth() auth: TokenPayload,
    @Query(new ZodValidationPipe(staffBoardQuerySchema)) query: StaffBoardQuery,
  ) {
    return this.dashboards.board(auth.role as StaffRole, query);
  }

  @ApiOperation({
    summary: "The floor",
    description:
      "Every table in floor-plan order with its open dine-in orders and `actions` (the statuses it may change to now). A table with open orders cannot be cleaned or freed.",
  })
  @ApiOkResponse({ type: StaffFloorResponseDto })
  @ApiForbiddenResponse({ description: "Customers and KITCHEN accounts" })
  @Roles("ADMIN", "MANAGER", "WAITER", "CASHIER")
  @Get("floor")
  floor() {
    return this.dashboards.floor();
  }
}
