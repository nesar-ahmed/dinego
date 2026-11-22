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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  createTableSchema,
  idParamSchema,
  updateTableSchema,
  updateTableStatusSchema,
  type CreateTableInput,
  type UpdateTableInput,
  type UpdateTableStatusInput,
  type TokenPayload,
} from "@dinego/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CurrentAuth } from "../users/decorators/current-auth.decorator.js";
import { Roles } from "../users/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard.js";
import { RolesGuard } from "../users/guards/roles.guard.js";
import {
  CreateTableDto,
  FloorTablesResponseDto,
  TableErrorDto,
  TableResponseDto,
  UpdateTableDto,
  UpdateTableStatusDto,
} from "./dto/swagger.dto.js";
import { TablesService } from "./tables.service.js";

const idParam = new ZodValidationPipe(idParamSchema);

/**
 * Staff floor management. Front-of-house staff (waiter, cashier) see the floor and change table
 * status; only admins and managers change the floor layout.
 */
@ApiTags("Floor")
@ApiOAuth2(["api"], "developer-login")
@ApiUnauthorizedResponse({ description: "Missing or invalid session cookie or bearer token" })
@ApiForbiddenResponse({ description: "Staff role not allowed for this action" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER", "WAITER", "CASHIER")
@Controller("floor/tables")
export class FloorController {
  constructor(private readonly tablesService: TablesService) {}

  @ApiOperation({
    summary: "Floor view: every table with its status",
    description: "Includes inactive tables. ADMIN, MANAGER, WAITER, or CASHIER.",
  })
  @ApiOkResponse({ type: FloorTablesResponseDto })
  @Get()
  list() {
    return this.tablesService.listFloor();
  }

  @ApiOperation({ summary: "Get one table", description: "ADMIN, MANAGER, WAITER, or CASHIER." })
  @ApiParam({ name: "id", example: 4 })
  @ApiOkResponse({ type: TableResponseDto })
  @ApiNotFoundResponse({ type: TableErrorDto, description: "TABLE_NOT_FOUND" })
  @Get(":id")
  get(@Param("id", idParam) id: number) {
    return this.tablesService.getTable(id);
  }

  @ApiOperation({
    summary: "Add a table",
    description: "New tables start FREE and active. ADMIN or MANAGER.",
  })
  @ApiBody({ type: CreateTableDto })
  @ApiCreatedResponse({ type: TableResponseDto })
  @ApiBadRequestResponse({ description: "Invalid body (VALIDATION_ERROR)" })
  @ApiConflictResponse({ type: TableErrorDto, description: "TABLE_LABEL_TAKEN" })
  @Roles("ADMIN", "MANAGER")
  @Post()
  create(
    @CurrentAuth() auth: TokenPayload,
    @Body(new ZodValidationPipe(createTableSchema)) input: CreateTableInput,
  ) {
    return this.tablesService.create(input, auth.sub);
  }

  @ApiOperation({
    summary: "Edit a table",
    description:
      "Change label, seats, zone, or take it in/out of service. Deactivating requires the table to be FREE. ADMIN or MANAGER.",
  })
  @ApiParam({ name: "id", example: 4 })
  @ApiBody({ type: UpdateTableDto })
  @ApiOkResponse({ type: TableResponseDto })
  @ApiBadRequestResponse({ description: "Invalid body or id (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({ type: TableErrorDto, description: "TABLE_NOT_FOUND" })
  @ApiConflictResponse({ type: TableErrorDto, description: "TABLE_LABEL_TAKEN or TABLE_IN_USE" })
  @Roles("ADMIN", "MANAGER")
  @Patch(":id")
  update(
    @CurrentAuth() auth: TokenPayload,
    @Param("id", idParam) id: number,
    @Body(new ZodValidationPipe(updateTableSchema)) input: UpdateTableInput,
  ) {
    return this.tablesService.update(id, input, auth.sub);
  }

  @ApiOperation({
    summary: "Change a table's status",
    description: [
      "Allowed changes (repeating the current status is a no-op):",
      "FREE → OCCUPIED, RESERVED, CLEANING;",
      "RESERVED → OCCUPIED, FREE;",
      "OCCUPIED → BILL_REQUESTED, CLEANING, FREE;",
      "BILL_REQUESTED → OCCUPIED, CLEANING, FREE;",
      "CLEANING → FREE.",
      "ADMIN, MANAGER, WAITER, or CASHIER.",
    ].join(" "),
  })
  @ApiParam({ name: "id", example: 4 })
  @ApiBody({ type: UpdateTableStatusDto })
  @ApiOkResponse({ type: TableResponseDto })
  @ApiBadRequestResponse({ description: "Invalid body or id (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({ type: TableErrorDto, description: "TABLE_NOT_FOUND" })
  @ApiConflictResponse({
    type: TableErrorDto,
    description: "INVALID_STATUS_TRANSITION or TABLE_INACTIVE",
  })
  @Patch(":id/status")
  changeStatus(
    @CurrentAuth() auth: TokenPayload,
    @Param("id", idParam) id: number,
    @Body(new ZodValidationPipe(updateTableStatusSchema)) input: UpdateTableStatusInput,
  ) {
    return this.tablesService.changeStatus(id, input.status, auth.sub);
  }

  @ApiOperation({
    summary: "Delete a table",
    description:
      "Only FREE tables without order or payment history. Otherwise deactivate the table instead. ADMIN or MANAGER.",
  })
  @ApiParam({ name: "id", example: 9 })
  @ApiNoContentResponse({ description: "Deleted" })
  @ApiNotFoundResponse({ type: TableErrorDto, description: "TABLE_NOT_FOUND" })
  @ApiConflictResponse({ type: TableErrorDto, description: "TABLE_IN_USE" })
  @Roles("ADMIN", "MANAGER")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":id")
  async remove(@CurrentAuth() auth: TokenPayload, @Param("id", idParam) id: number) {
    await this.tablesService.remove(id, auth.sub);
  }
}
