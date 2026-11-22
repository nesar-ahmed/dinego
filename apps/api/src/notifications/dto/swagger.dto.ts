import { ApiProperty } from "@nestjs/swagger";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_ERROR_CODES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_TYPES,
  NOTIFICATIONS_DEFAULT_PAGE_SIZE,
  type NotificationCategory,
  type NotificationEntityType,
  type NotificationPriority,
  type NotificationType,
} from "@dinego/shared";
import { PaginationDto } from "../../menu/dto/swagger.dto.js";

export class NotificationDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ enum: [...NOTIFICATION_TYPES], example: "CUSTOMER_WELCOME" })
  type!: NotificationType;

  @ApiProperty({ enum: [...NOTIFICATION_CATEGORIES], example: "ACCOUNT" })
  category!: NotificationCategory;

  @ApiProperty({
    enum: [...NOTIFICATION_PRIORITIES],
    example: "NORMAL",
    description: "HIGH: show it now (for example as a toast). LOW: list only.",
  })
  priority!: NotificationPriority;

  @ApiProperty({ example: "Welcome to DineGo, Sam!" })
  title!: string;

  @ApiProperty({
    example:
      "Your account is ready. Browse the menu to order for dine-in or takeaway, and follow your orders from your account.",
  })
  body!: string;

  @ApiProperty({
    example: "/menu",
    nullable: true,
    type: String,
    description: "Path inside the web app to open when the notification is clicked.",
  })
  link!: string | null;

  @ApiProperty({
    enum: [...NOTIFICATION_ENTITY_TYPES],
    example: "USER",
    nullable: true,
    description: "The record the notification is about.",
  })
  entityType!: NotificationEntityType | null;

  @ApiProperty({ example: 12, nullable: true, type: Number })
  entityId!: number | null;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    nullable: true,
    example: null,
    description: "Extra details for the client, e.g. { customerId: 12 }.",
  })
  data!: Record<string, unknown> | null;

  @ApiProperty({ example: false })
  read!: boolean;

  @ApiProperty({ example: null, nullable: true, type: String, format: "date-time" })
  readAt!: string | null;

  @ApiProperty({ example: "2026-11-17T09:00:00.000Z", format: "date-time" })
  createdAt!: string;
}

export class NotificationsResponseDto {
  @ApiProperty({ type: [NotificationDto] })
  notifications!: NotificationDto[];

  @ApiProperty({
    type: PaginationDto,
    example: { page: 1, pageSize: NOTIFICATIONS_DEFAULT_PAGE_SIZE, total: 3, totalPages: 1 },
  })
  pagination!: PaginationDto;

  @ApiProperty({ example: 2, description: "Unread in the whole inbox, regardless of filters." })
  unreadCount!: number;
}

export class NotificationUnreadCountResponseDto {
  @ApiProperty({ example: 2 })
  unreadCount!: number;

  @ApiProperty({
    example: 14,
    nullable: true,
    type: Number,
    description: "Newest notification id (read or not). Changes when something new arrives.",
  })
  latestId!: number | null;
}

export class NotificationReadResponseDto {
  @ApiProperty({ type: NotificationDto })
  notification!: NotificationDto;

  @ApiProperty({ example: 1 })
  unreadCount!: number;
}

export class NotificationDeleteResponseDto {
  @ApiProperty({ example: 1 })
  unreadCount!: number;
}

export class MarkAllNotificationsReadDto {
  @ApiProperty({
    example: 14,
    required: false,
    description:
      "Newest notification id the user has seen. Newer notifications stay unread. Omit to mark everything.",
  })
  upToId?: number;
}

export class MarkAllNotificationsReadResponseDto {
  @ApiProperty({ example: 2, description: "How many notifications this request marked as read." })
  updated!: number;

  @ApiProperty({ example: 0 })
  unreadCount!: number;
}

export class NotificationErrorDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ enum: [...NOTIFICATION_ERROR_CODES], example: "NOTIFICATION_NOT_FOUND" })
  code!: string;

  @ApiProperty({ example: "Notification not found" })
  message!: string;
}
