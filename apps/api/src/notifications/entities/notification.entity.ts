import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type {
  NotificationCategory,
  NotificationEntityType,
  NotificationPriority,
  NotificationType,
} from "@dinego/shared";
import { User } from "../../users/entities/user.entity.js";

/**
 * An in-app notification for one user. Written with raw SQL by NotificationPublisher (so fan-out
 * to many staff is one atomic statement) and read through this entity.
 */
@Entity({ name: "notifications" })
@Index("uq_notifications_recipient_dedupe", ["recipientId", "dedupeKey"], { unique: true })
@Index("idx_notifications_recipient_read", ["recipientId", "readAt"])
@Index("idx_notifications_created_at", ["createdAt"])
@Check(
  "chk_notifications_category",
  `"category" IN ('ACCOUNT', 'ORDER', 'PAYMENT', 'FLOOR', 'SYSTEM')`,
)
@Check("chk_notifications_priority", `"priority" IN ('LOW', 'NORMAL', 'HIGH')`)
@Check("chk_notifications_link", `"link" IS NULL OR ("link" LIKE '/%' AND "link" NOT LIKE '//%')`)
@Check("chk_notifications_entity", `("entity_type" IS NULL) = ("entity_id" IS NULL)`)
@Check(
  "chk_notifications_data",
  `"data" IS NULL OR (json_valid("data") AND json_type("data") = 'object')`,
)
export class Notification {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "integer", name: "recipient_id" })
  recipientId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "recipient_id", foreignKeyConstraintName: "fk_notifications_recipient" })
  recipient!: User;

  @Column({ type: "text" })
  type!: NotificationType;

  @Column({ type: "text" })
  category!: NotificationCategory;

  @Column({ type: "text", default: "NORMAL" })
  priority!: NotificationPriority;

  @Column({ type: "text" })
  title!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ type: "text", nullable: true })
  link!: string | null;

  @Column({ type: "text", name: "entity_type", nullable: true })
  entityType!: NotificationEntityType | null;

  @Column({ type: "integer", name: "entity_id", nullable: true })
  entityId!: number | null;

  @Column({ type: "simple-json", nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ type: "text", name: "dedupe_key", nullable: true })
  dedupeKey!: string | null;

  @Column({ type: "datetime", name: "read_at", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;
}
