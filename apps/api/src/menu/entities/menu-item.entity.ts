import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { DietaryTag, Station } from "@dinego/shared";
import { MenuCategory } from "./menu-category.entity.js";

/** A dish or drink. Prices are integer cents. */
@Entity({ name: "menu_items" })
@Index("uq_menu_items_slug", ["slug"], { unique: true })
@Index("idx_menu_items_category_id", ["categoryId"])
@Check("chk_menu_items_price_cents", `"price_cents" >= 0`)
@Check("chk_menu_items_tax_rate", `"tax_rate" >= 0 AND "tax_rate" <= 100`)
@Check("chk_menu_items_station", `"station" IN ('GRILL', 'COLD', 'BAR', 'DESSERT', 'OTHER')`)
@Check("chk_menu_items_allergens", `json_valid("allergens") AND json_type("allergens") = 'array'`)
@Check(
  "chk_menu_items_dietary_tags",
  `json_valid("dietary_tags") AND json_type("dietary_tags") = 'array'`,
)
export class MenuItem {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "integer", name: "category_id" })
  categoryId!: number;

  /** Categories that still have items cannot be deleted; deactivate them instead. */
  @ManyToOne(() => MenuCategory, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "category_id", foreignKeyConstraintName: "fk_menu_items_category" })
  category!: MenuCategory;

  @Column({ type: "text" })
  slug!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "integer", name: "price_cents" })
  priceCents!: number;

  /** Percentage, for example 8.875. Internal only; not exposed on the public menu. */
  @Column({ type: "real", name: "tax_rate", default: 0 })
  taxRate!: number;

  /** Kitchen station that prepares the item. Internal only. */
  @Column({ type: "text", default: "OTHER" })
  station!: Station;

  @Column({ type: "simple-json", default: "[]" })
  allergens!: string[];

  @Column({ type: "simple-json", name: "dietary_tags", default: "[]" })
  dietaryTags!: DietaryTag[];

  @Column({ type: "boolean", default: false })
  featured!: boolean;

  /** False when temporarily sold out. The item stays listed but cannot be ordered. */
  @Column({ type: "boolean", default: true })
  available!: boolean;

  @Column({ type: "integer", name: "sort_order", default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime", name: "updated_at" })
  updatedAt!: Date;
}
