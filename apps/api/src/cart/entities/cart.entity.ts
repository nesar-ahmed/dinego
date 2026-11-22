import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity.js";

/** The active cart of one customer. Created lazily on the first add. */
@Entity({ name: "carts" })
@Index("uq_carts_customer_id", ["customerId"], { unique: true })
export class Cart {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "integer", name: "customer_id" })
  customerId!: number;

  /** Deleting the customer deletes their cart. */
  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id", foreignKeyConstraintName: "fk_carts_customer" })
  customer!: User;

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;

  /** Touched on every cart change, so stale carts can be cleaned up later. */
  @UpdateDateColumn({ type: "datetime", name: "updated_at" })
  updatedAt!: Date;
}
