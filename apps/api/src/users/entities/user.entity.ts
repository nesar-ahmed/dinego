import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import type { UserRole } from "@dinego/shared";

/** Staff and customer accounts. Customers are users with the `CUSTOMER` role. */
@Entity({ name: "users" })
@Index("idx_users_role", ["role"])
export class User {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text", unique: true, nullable: true })
  email!: string | null;

  @Column({ type: "text", nullable: true })
  phone!: string | null;

  @Column({ type: "text", name: "password_hash", nullable: true })
  passwordHash!: string | null;

  @Column({ type: "text", name: "pin_hash", nullable: true })
  pinHash!: string | null;

  @Column({ type: "text", default: "WAITER" })
  role!: UserRole;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  /** Session version carried in every JWT as `ver`. Incremented to sign out all sessions. */
  @Column({ type: "integer", name: "token_version", default: 0 })
  tokenVersion!: number;

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;
}
