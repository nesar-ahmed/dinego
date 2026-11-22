import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** A section of the restaurant menu, such as "Small plates" or "Drinks". */
@Entity({ name: "menu_categories" })
@Index("uq_menu_categories_slug", ["slug"], { unique: true })
export class MenuCategory {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "text" })
  slug!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "integer", name: "sort_order", default: 0 })
  sortOrder!: number;

  /** Inactive categories and all of their items are hidden from the public menu. */
  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime", name: "updated_at" })
  updatedAt!: Date;
}
