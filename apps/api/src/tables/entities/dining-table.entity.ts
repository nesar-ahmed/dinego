import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { TableStatus } from "@dinego/shared";

/** A table on the restaurant floor. Dine-in checkouts and orders are placed against a table. */
@Entity({ name: "dining_tables" })
@Index("uq_dining_tables_label", ["label"], { unique: true })
@Check("chk_dining_tables_seats", `"seats" > 0 AND "seats" <= 50`)
@Check(
  "chk_dining_tables_status",
  `"status" IN ('FREE', 'OCCUPIED', 'BILL_REQUESTED', 'CLEANING', 'RESERVED')`,
)
export class DiningTable {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  /**
   * Unique. The service also rejects labels that differ only in case ("t4" vs "T4") inside its
   * atomic INSERT/UPDATE; TypeORM's SQLite driver cannot express a NOCASE column collation.
   */
  @Column({ type: "text" })
  label!: string;

  @Column({ type: "integer" })
  seats!: number;

  @Column({ type: "text", nullable: true })
  zone!: string | null;

  @Column({ type: "text", default: "FREE" })
  status!: TableStatus;

  /** Out-of-service tables are hidden from customers and keep their history. */
  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime", name: "updated_at" })
  updatedAt!: Date;
}
