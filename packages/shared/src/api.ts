import { z } from "zod";
import { userRoleSchema } from "./enums";
import { customerSchema, timestampSchema, userSchema } from "./entities";

/* -------------------------------------------------------------------------- */
/* Common envelopes                                                            */
/* -------------------------------------------------------------------------- */

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string().optional(),
  message: z.union([z.string(), z.array(z.string())]),
  details: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});

export const healthSchema = z.object({
  status: z.literal("ok"),
  database: z.literal("up"),
  timestamp: timestampSchema,
});
export type Health = z.infer<typeof healthSchema>;

/* -------------------------------------------------------------------------- */
/* Users and auth                                                              */
/* -------------------------------------------------------------------------- */

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const customerRegisterSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  phone: z.string().trim().min(6).max(30).nullable().optional(),
  password: z.string().min(8).max(128),
});
export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

export const AUTH_PRINCIPAL_TYPES = ["STAFF", "CUSTOMER"] as const;
export const authPrincipalTypeSchema = z.enum(AUTH_PRINCIPAL_TYPES);

export const tokenPayloadSchema = z.object({
  sub: z.number().int().positive(),
  type: authPrincipalTypeSchema,
  role: userRoleSchema.optional(),
});
export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export const staffAuthResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});
export type StaffAuthResponse = z.infer<typeof staffAuthResponseSchema>;

export const customerAuthResponseSchema = z.object({
  accessToken: z.string(),
  customer: customerSchema,
});
export type CustomerAuthResponse = z.infer<typeof customerAuthResponseSchema>;

export const sessionAuthResponseSchema = z.union([
  customerAuthResponseSchema,
  staffAuthResponseSchema,
]);
export type SessionAuthResponse = z.infer<typeof sessionAuthResponseSchema>;

export const meResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("STAFF"), user: userSchema }),
  z.object({ type: z.literal("CUSTOMER"), customer: customerSchema }),
]);
export type MeResponse = z.infer<typeof meResponseSchema>;

export const usersResponseSchema = z.object({
  users: z.array(userSchema),
});
export type UsersResponse = z.infer<typeof usersResponseSchema>;

export const customersResponseSchema = z.object({
  customers: z.array(customerSchema),
});
export type CustomersResponse = z.infer<typeof customersResponseSchema>;
