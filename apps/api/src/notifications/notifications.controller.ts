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
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
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
  markAllNotificationsReadSchema,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATIONS_DEFAULT_PAGE_SIZE,
  NOTIFICATIONS_MAX_PAGE_SIZE,
  notificationsQuerySchema,
  type MarkAllNotificationsReadInput,
  type NotificationsQuery,
  type TokenPayload,
} from "@dinego/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CurrentAuth } from "../users/decorators/current-auth.decorator.js";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard.js";
import {
  MarkAllNotificationsReadDto,
  MarkAllNotificationsReadResponseDto,
  NotificationDeleteResponseDto,
  NotificationErrorDto,
  NotificationReadResponseDto,
  NotificationsResponseDto,
  NotificationUnreadCountResponseDto,
} from "./dto/swagger.dto.js";
import { NotificationsService } from "./notifications.service.js";

/** The signed-in user's in-app notifications. Works for customers and every staff role. */
@ApiTags("Notifications")
@ApiOAuth2(["api"], "developer-login")
@ApiUnauthorizedResponse({ description: "Missing or invalid session cookie or bearer token" })
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({
    summary: "My notifications",
    description: `Newest first. Only the last ${NOTIFICATION_RETENTION_DAYS} days are kept. \`unreadCount\` covers the whole inbox, regardless of filters.`,
  })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({
    name: "pageSize",
    required: false,
    example: NOTIFICATIONS_DEFAULT_PAGE_SIZE,
    description: `1–${NOTIFICATIONS_MAX_PAGE_SIZE}`,
  })
  @ApiQuery({
    name: "unread",
    required: false,
    enum: ["true", "false"],
    description: "true: unread only. false: read only. Omit for both.",
  })
  @ApiQuery({ name: "category", required: false, enum: [...NOTIFICATION_CATEGORIES] })
  @ApiQuery({
    name: "entityType",
    required: false,
    enum: [...NOTIFICATION_ENTITY_TYPES],
    description: "With entityId: only notifications about that record, e.g. one order's updates.",
  })
  @ApiQuery({ name: "entityId", required: false, example: 42 })
  @ApiQuery({
    name: "beforeId",
    required: false,
    example: 14,
    description:
      "Cursor for Show more: only notifications older than this id. Unlike page offsets, it never skips or repeats items when notifications are deleted or arrive. `pagination.total` ignores it.",
  })
  @ApiOkResponse({ type: NotificationsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query (VALIDATION_ERROR)" })
  @Get()
  list(
    @CurrentAuth() auth: TokenPayload,
    @Query(new ZodValidationPipe(notificationsQuerySchema)) query: NotificationsQuery,
  ) {
    return this.notificationsService.list(auth.sub, query);
  }

  @ApiOperation({
    summary: "My unread count",
    description:
      "The cheap call to poll for the badge (every 30 seconds while the page is visible). `latestId` changes when a new notification arrives.",
  })
  @ApiOkResponse({ type: NotificationUnreadCountResponseDto })
  @Get("unread-count")
  unreadCount(@CurrentAuth() auth: TokenPayload) {
    return this.notificationsService.unreadCount(auth.sub);
  }

  @ApiOperation({
    summary: "Mark one notification as read",
    description:
      "Call it when the user clicks the notification (in the dropdown or the list). Safe to repeat: the first read time is kept.",
  })
  @ApiParam({ name: "id", example: 12 })
  @ApiOkResponse({ type: NotificationReadResponseDto })
  @ApiBadRequestResponse({ description: "Invalid id (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({
    type: NotificationErrorDto,
    description: "NOTIFICATION_NOT_FOUND: not yours, or older than the retention window",
  })
  @Patch(":id/read")
  markRead(
    @CurrentAuth() auth: TokenPayload,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: number,
  ) {
    return this.notificationsService.markRead(auth.sub, id);
  }

  @ApiOperation({
    summary: "Mark one notification as unread",
    description:
      "Puts the notification back in the unread count until the user opens it again. Safe to repeat.",
  })
  @ApiParam({ name: "id", example: 12 })
  @ApiOkResponse({ type: NotificationReadResponseDto })
  @ApiBadRequestResponse({ description: "Invalid id (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({
    type: NotificationErrorDto,
    description: "NOTIFICATION_NOT_FOUND: not yours, or older than the retention window",
  })
  @Patch(":id/unread")
  markUnread(
    @CurrentAuth() auth: TokenPayload,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: number,
  ) {
    return this.notificationsService.markUnread(auth.sub, id);
  }

  @ApiOperation({
    summary: "Delete a notification",
    description: "Removes the notification from the user's inbox for good.",
  })
  @ApiParam({ name: "id", example: 12 })
  @ApiOkResponse({ type: NotificationDeleteResponseDto })
  @ApiBadRequestResponse({ description: "Invalid id (VALIDATION_ERROR)" })
  @ApiNotFoundResponse({
    type: NotificationErrorDto,
    description: "NOTIFICATION_NOT_FOUND: not yours, already deleted, or expired",
  })
  @Delete(":id")
  remove(
    @CurrentAuth() auth: TokenPayload,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: number,
  ) {
    return this.notificationsService.remove(auth.sub, id);
  }

  @ApiOperation({
    summary: "Mark all as read",
    description:
      "Send the newest id the user has seen as `upToId`, so a notification that arrives at the same moment stays unread. An empty body marks everything.",
  })
  @ApiBody({ type: MarkAllNotificationsReadDto, required: false })
  @ApiOkResponse({ type: MarkAllNotificationsReadResponseDto })
  @ApiBadRequestResponse({ description: "Invalid body (VALIDATION_ERROR)" })
  @HttpCode(HttpStatus.OK)
  @Post("read-all")
  markAllRead(
    @CurrentAuth() auth: TokenPayload,
    @Body(new ZodValidationPipe(markAllNotificationsReadSchema))
    input: MarkAllNotificationsReadInput,
  ) {
    return this.notificationsService.markAllRead(auth.sub, input);
  }
}
