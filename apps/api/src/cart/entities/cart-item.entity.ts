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
import { MenuItem } from "../../menu/entities/menu-item.entity.js";
import { Cart } from "./cart.entity.js";

/** One menu item in a cart. Prices are read from the menu item at request time. */
@Entity({ name: "cart_items" })
@Index("uq_cart_items_cart_menu_item", ["cartId", "menuItemId"], { unique: true })
@Index("idx_cart_items_menu_item_id", ["menuItemId"])
@Check("chk_cart_items_quantity", `"quantity" > 0`)
export class CartItem {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "integer", name: "cart_id" })
  cartId!: number;

  @ManyToOne(() => Cart, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "cart_id", foreignKeyConstraintName: "fk_cart_items_cart" })
  cart!: Cart;

  @Column({ type: "integer", name: "menu_item_id" })
  menuItemId!: number;

  /** Deleting a menu item removes it from every cart. */
  @ManyToOne(() => MenuItem, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "menu_item_id", foreignKeyConstraintName: "fk_cart_items_menu_item" })
  menuItem!: MenuItem;

  @Column({ type: "integer" })
  quantity!: number;

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime", name: "updated_at" })
  updatedAt!: Date;
}
