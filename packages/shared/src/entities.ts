import { z } from "zod";
import { userRoleSchema } from "./enums";

/**
 * Serialized API shapes for the users domain.
 * Dates are serialized as ISO-8601 strings.
 */
export const timestampSchema = z.iso.datetime();

export const userSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.email().nullable(),
  phone: z.string().nullable(),
  role: userRoleSchema,
  active: z.boolean(),
  createdAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;

export const customerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.email().nullable(),
  createdAt: timestampSchema,
});
export type Customer = z.infer<typeof customerSchema>;
