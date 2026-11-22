import { z } from "zod";
import {
  DIETARY_TAGS,
  dietaryTagSchema,
  itemStatusSchema,
  menuSortSchema,
  notificationCategorySchema,
  notificationEntityTypeSchema,
  orderStatusSchema,
  orderTypeSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  stationSchema,
  tableStatusSchema,
  userRoleSchema,
  ORDER_STATUSES,
  type OrderStatus,
  type OrderType,
  type TableStatus,
  type UserRole,
} from "./enums";
import {
  centsSchema,
  customerSchema,
  diningTableSchema,
  idSchema,
  menuCategorySchema,
  menuItemSchema,
  notificationSchema,
  slugSchema,
  timestampSchema,
  userSchema,
} from "./entities";

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

/** Shared field rules, so registration and profile updates validate the same way. */
export const customerNameSchema = z
  .string()
  .trim()
  .min(2, "Enter at least 2 characters")
  .max(120, "Use 120 characters or fewer");
export const customerPhoneSchema = z
  .string()
  .trim()
  .min(6, "Enter at least 6 characters")
  .max(30, "Use 30 characters or fewer");
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use 128 characters or fewer");

export const customerRegisterSchema = z.object({
  name: customerNameSchema,
  email: z.email(),
  phone: customerPhoneSchema.nullable().optional(),
  password: passwordSchema,
});
export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

export const AUTH_PRINCIPAL_TYPES = ["STAFF", "CUSTOMER"] as const;
export const authPrincipalTypeSchema = z.enum(AUTH_PRINCIPAL_TYPES);

export const tokenPayloadSchema = z.object({
  sub: z.number().int().positive(),
  type: authPrincipalTypeSchema,
  role: userRoleSchema.optional(),
  /**
   * Session version. Changing the password increments the account's version, which signs out
   * every token issued before. Tokens without `ver` count as version 0.
   */
  ver: z.number().int().nonnegative().optional(),
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

/* -------------------------------------------------------------------------- */
/* Customer account: profile, email, password                                  */
/* -------------------------------------------------------------------------- */

/** Error codes returned by the account endpoints, in addition to `VALIDATION_ERROR`. */
export const ACCOUNT_ERROR_CODES = [
  "INVALID_CURRENT_PASSWORD",
  "EMAIL_TAKEN",
  "CREDENTIALS_CHANGED",
  "CUSTOMER_ONLY",
] as const;
export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number];

/**
 * `PATCH /users/me/profile`. Name and phone only; email and password have their own endpoints.
 * Send `phone: null` (or an empty string) to remove the phone number.
 */
export const updateProfileSchema = z
  .strictObject({
    name: customerNameSchema.optional(),
    phone: z
      .string()
      .trim()
      .max(30, "Use 30 characters or fewer")
      .nullable()
      .transform((value) => value || null)
      .refine((value) => value === null || value.length >= 6, {
        message: "Enter at least 6 characters, or leave it empty to remove it",
      })
      .optional(),
  })
  .refine((value) => value.name !== undefined || value.phone !== undefined, {
    message: "Provide a name or phone number to update",
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Email addresses are stored trimmed and lowercase. */
const normalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

/** `PUT /users/me/email`. The current password confirms it is really the account owner. */
export const changeEmailSchema = z.strictObject({
  newEmail: normalizedEmailSchema,
  currentPassword: z.string().min(1, "Enter your current password").max(128),
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

/** `PUT /users/me/password`. Signs out every other session. */
export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    newPassword: passwordSchema,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password that is different from your current one",
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const customerResponseSchema = z.object({
  customer: customerSchema,
});
export type CustomerResponse = z.infer<typeof customerResponseSchema>;

export const usersResponseSchema = z.object({
  users: z.array(userSchema),
});
export type UsersResponse = z.infer<typeof usersResponseSchema>;

export const customersResponseSchema = z.object({
  customers: z.array(customerSchema),
});
export type CustomersResponse = z.infer<typeof customersResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Public menu                                                                 */
/* -------------------------------------------------------------------------- */

/** Upper bound for price filters, in cents ($100,000). */
export const MENU_MAX_PRICE_CENTS = 10_000_000;
export const MENU_DEFAULT_PAGE_SIZE = 20;
export const MENU_MAX_PAGE_SIZE = 100;

/**
 * A list query parameter. Accepts `?tags=a,b`, `?tags=a&tags=b`, or a mix of both.
 * Empty values are ignored, so `?tags=` behaves like an absent parameter.
 */
function listParam<T extends z.ZodType>(item: T, maxItems: number) {
  return z.preprocess((value) => {
    if (value === undefined) {
      return undefined;
    }

    const parts = (Array.isArray(value) ? value : [value])
      .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : [entry]))
      .map((entry) => (typeof entry === "string" ? entry.trim() : entry))
      .filter((entry) => entry !== "");

    return parts.length === 0 ? undefined : parts;
  }, z.array(item).max(maxItems).optional());
}

/** Whole-number query parameter. Rejects empty strings, decimals, and signs instead of coercing. */
function integerParam(min: number, max: number) {
  return z
    .string()
    .regex(/^\d+$/, "Must be a whole number")
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
}

const booleanParam = z.enum(["true", "false"]).transform((value) => value === "true");

/** Dietary tags are matched case-insensitively and accept hyphens: `gluten-free` → `GLUTEN_FREE`. */
const dietaryTagParam = z
  .string()
  .transform((value) => value.toUpperCase().replace(/-/g, "_"))
  .pipe(dietaryTagSchema);

const categorySlugParam = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(slugSchema);

const menuFilterShape = {
  /** Case-insensitive text search across item name, item description, and category name. */
  q: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || undefined)
    .optional(),
  /** Category slugs. Items in ANY of the listed categories match. */
  category: listParam(categorySlugParam, 20),
  /** Dietary tags. Items must have ALL of the listed tags. */
  tags: listParam(dietaryTagParam, DIETARY_TAGS.length),
  /** Inclusive lower price bound in cents. */
  minPrice: integerParam(0, MENU_MAX_PRICE_CENTS).optional(),
  /** Inclusive upper price bound in cents. */
  maxPrice: integerParam(0, MENU_MAX_PRICE_CENTS).optional(),
  featured: booleanParam.optional(),
  available: booleanParam.optional(),
  sort: menuSortSchema.default("recommended"),
};

function validatePriceRange(
  value: { minPrice?: number; maxPrice?: number },
  context: z.RefinementCtx,
): void {
  if (
    value.minPrice !== undefined &&
    value.maxPrice !== undefined &&
    value.minPrice > value.maxPrice
  ) {
    context.addIssue({
      code: "custom",
      path: ["minPrice"],
      message: "minPrice cannot be greater than maxPrice",
    });
  }
}

/** Query for the grouped menu (`GET /menu`). Unknown parameters are rejected. */
export const menuQuerySchema = z.strictObject(menuFilterShape).superRefine(validatePriceRange);
export type MenuQuery = z.infer<typeof menuQuerySchema>;
export type MenuQueryInput = z.input<typeof menuQuerySchema>;

/** Query for the paginated item list (`GET /menu/items`). Unknown parameters are rejected. */
export const menuItemsQuerySchema = z
  .strictObject({
    ...menuFilterShape,
    page: integerParam(1, 10_000).default(1),
    pageSize: integerParam(1, MENU_MAX_PAGE_SIZE).default(MENU_DEFAULT_PAGE_SIZE),
  })
  .superRefine(validatePriceRange);
export type MenuItemsQuery = z.infer<typeof menuItemsQuerySchema>;
export type MenuItemsQueryInput = z.input<typeof menuItemsQuerySchema>;

export const menuCategorySummarySchema = menuCategorySchema.pick({
  id: true,
  slug: true,
  name: true,
});
export type MenuCategorySummary = z.infer<typeof menuCategorySummarySchema>;

/**
 * Category as shown to customers. `itemCount` is the number of public items in the category,
 * independent of any filters applied to the request.
 */
export const publicMenuCategorySchema = menuCategorySchema
  .pick({ id: true, slug: true, name: true, description: true })
  .extend({ itemCount: z.number().int().nonnegative() });
export type PublicMenuCategory = z.infer<typeof publicMenuCategorySchema>;

/** Item as shown to customers. Kitchen routing (`station`) and `taxRate` stay internal. */
export const publicMenuItemSchema = menuItemSchema
  .pick({
    id: true,
    slug: true,
    name: true,
    description: true,
    priceCents: true,
    dietaryTags: true,
    allergens: true,
    featured: true,
    available: true,
  })
  .extend({ category: menuCategorySummarySchema });
export type PublicMenuItem = z.infer<typeof publicMenuItemSchema>;

export const menuSectionSchema = publicMenuCategorySchema.extend({
  items: z.array(publicMenuItemSchema),
});
export type MenuSection = z.infer<typeof menuSectionSchema>;

/** Grouped menu. Categories with no matching items are omitted. */
export const menuResponseSchema = z.object({
  categories: z.array(menuSectionSchema),
});
export type MenuResponse = z.infer<typeof menuResponseSchema>;

export const menuCategoriesResponseSchema = z.object({
  categories: z.array(publicMenuCategorySchema),
});
export type MenuCategoriesResponse = z.infer<typeof menuCategoriesResponseSchema>;

export const paginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const menuItemsResponseSchema = z.object({
  items: z.array(publicMenuItemSchema),
  pagination: paginationSchema,
});
export type MenuItemsResponse = z.infer<typeof menuItemsResponseSchema>;

export const menuItemResponseSchema = z.object({
  item: publicMenuItemSchema,
});
export type MenuItemResponse = z.infer<typeof menuItemResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

/** Maximum quantity of a single menu item in one cart. */
export const CART_MAX_ITEM_QUANTITY = 20;
/** Maximum number of distinct menu items in one cart. */
export const CART_MAX_LINES = 50;

/** Error codes returned by the cart endpoints, in addition to `VALIDATION_ERROR`. */
export const CART_ERROR_CODES = [
  "MENU_ITEM_NOT_FOUND",
  "ITEM_UNAVAILABLE",
  "QUANTITY_LIMIT",
  "CART_FULL",
  "CART_ITEM_NOT_FOUND",
  "CUSTOMER_ONLY",
] as const;
export type CartErrorCode = (typeof CART_ERROR_CODES)[number];

/** Numeric id route parameter, e.g. `/floor/tables/:id`. Rejects signs, decimals, and exponents. */
export const idParamSchema = z
  .string()
  .regex(/^\d+$/, "Must be a positive whole number")
  .transform(Number)
  .pipe(idSchema);

/** Route parameter for `/cart/items/:menuItemId`. */
export const cartItemParamSchema = idParamSchema;

/** `POST /cart/items`. Adding an item that is already in the cart increases its quantity. */
export const addCartItemSchema = z.strictObject({
  menuItemId: idSchema,
  quantity: z.number().int().min(1).max(CART_MAX_ITEM_QUANTITY).default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

/** `PATCH /cart/items/:menuItemId`. Sets an absolute quantity; `0` removes the item. */
export const updateCartItemSchema = z.strictObject({
  quantity: z.number().int().min(0).max(CART_MAX_ITEM_QUANTITY),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const cartLineSchema = z.object({
  item: publicMenuItemSchema,
  quantity: z.number().int().positive(),
  /** `item.priceCents × quantity`, using the current menu price. */
  lineTotalCents: centsSchema,
  /**
   * False when the item is sold out or no longer on the public menu. Such lines stay in the cart
   * so the customer can see what changed, but they are excluded from `itemCount` and
   * `subtotalCents`, and their quantity can only be lowered.
   */
  purchasable: z.boolean(),
});
export type CartLine = z.infer<typeof cartLineSchema>;

export const customerCartSchema = z.object({
  /** Lines in the order they were first added. */
  items: z.array(cartLineSchema),
  /** Total quantity across purchasable lines. */
  itemCount: z.number().int().nonnegative(),
  /** Sum of purchasable line totals, before tax. */
  subtotalCents: centsSchema,
  hasUnavailableItems: z.boolean(),
  /** Last change to the cart, or null when the customer has never added anything. */
  updatedAt: timestampSchema.nullable(),
});
export type CustomerCart = z.infer<typeof customerCartSchema>;

export const cartResponseSchema = z.object({
  cart: customerCartSchema,
});
export type CartResponse = z.infer<typeof cartResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Floor: dining tables                                                        */
/* -------------------------------------------------------------------------- */

export const TABLE_MAX_SEATS = 50;

/** Error codes returned by the table endpoints, in addition to `VALIDATION_ERROR`. */
export const TABLE_ERROR_CODES = [
  "TABLE_NOT_FOUND",
  "TABLE_LABEL_TAKEN",
  "TABLE_INACTIVE",
  "TABLE_IN_USE",
  "INVALID_STATUS_TRANSITION",
] as const;
export type TableErrorCode = (typeof TABLE_ERROR_CODES)[number];

/**
 * Statuses a customer can pick for a dine-in checkout: a free table they sit down at, or a table
 * they were already seated at. Reserved, cleaning, and bill-requested tables cannot be ordered to.
 */
export const ORDERABLE_TABLE_STATUSES = [
  "FREE",
  "OCCUPIED",
] as const satisfies readonly TableStatus[];

/**
 * Allowed manual status changes. Setting the current status again is always allowed (a no-op).
 * Staff can correct mistakes, e.g. OCCUPIED → FREE when a party leaves without ordering.
 */
export const TABLE_STATUS_TRANSITIONS: Readonly<Record<TableStatus, readonly TableStatus[]>> = {
  FREE: ["OCCUPIED", "RESERVED", "CLEANING"],
  RESERVED: ["OCCUPIED", "FREE"],
  OCCUPIED: ["BILL_REQUESTED", "CLEANING", "FREE"],
  BILL_REQUESTED: ["OCCUPIED", "CLEANING", "FREE"],
  CLEANING: ["FREE"],
};

export function canChangeTableStatus(from: TableStatus, to: TableStatus): boolean {
  return from === to || TABLE_STATUS_TRANSITIONS[from].includes(to);
}

const tableLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u, "Use letters, numbers, spaces, dots, and hyphens");
const tableSeatsSchema = z.number().int().min(1).max(TABLE_MAX_SEATS);
/** Empty strings clear the zone. */
const tableZoneSchema = z
  .string()
  .trim()
  .max(60)
  .transform((value) => value || null)
  .nullable();

/** `POST /floor/tables`. New tables start FREE and active. */
export const createTableSchema = z.strictObject({
  label: tableLabelSchema,
  seats: tableSeatsSchema,
  zone: tableZoneSchema.default(null),
});
export type CreateTableInput = z.infer<typeof createTableSchema>;

/** `PATCH /floor/tables/:id`. Deactivating (`active: false`) requires the table to be FREE. */
export const updateTableSchema = z
  .strictObject({
    label: tableLabelSchema.optional(),
    seats: tableSeatsSchema.optional(),
    zone: tableZoneSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

/** `PATCH /floor/tables/:id/status`. */
export const updateTableStatusSchema = z.strictObject({
  status: tableStatusSchema,
});
export type UpdateTableStatusInput = z.infer<typeof updateTableStatusSchema>;

/** Table as shown to customers choosing where they eat. The raw floor status stays internal. */
export const publicTableSchema = diningTableSchema
  .pick({ id: true, label: true, seats: true, zone: true })
  .extend({
    /** True when the table can be selected for a dine-in checkout right now. */
    orderable: z.boolean(),
  });
export type PublicTable = z.infer<typeof publicTableSchema>;

export const publicTablesResponseSchema = z.object({
  tables: z.array(publicTableSchema),
});
export type PublicTablesResponse = z.infer<typeof publicTablesResponseSchema>;

export const floorTablesResponseSchema = z.object({
  tables: z.array(diningTableSchema),
});
export type FloorTablesResponse = z.infer<typeof floorTablesResponseSchema>;

export const tableResponseSchema = z.object({
  table: diningTableSchema,
});
export type TableResponse = z.infer<typeof tableResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Payments: customer checkout                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Methods a customer can pay with at checkout. Payments are DUMMY payments: no real money moves.
 * The client sends a test token (see DUMMY_PAYMENT_TOKENS); card details never reach the API.
 * CASH is reserved for staff/POS payments.
 */
export const CHECKOUT_PAYMENT_METHODS = ["CARD", "ONLINE"] as const;
export const checkoutPaymentMethodSchema = z.enum(CHECKOUT_PAYMENT_METHODS);
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

/** Upper bound for a checkout tip, in cents ($500). */
export const CHECKOUT_MAX_TIP_CENTS = 50_000;
export const PAYMENTS_DEFAULT_PAGE_SIZE = 20;
export const PAYMENTS_MAX_PAGE_SIZE = 100;

/** Request header that makes `POST /orders` (checkout) safe to retry. Use a new UUID per checkout. */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/** Error codes returned by checkout (`POST /orders`) and the payment endpoints. */
export const PAYMENT_ERROR_CODES = [
  "CART_EMPTY",
  "CART_HAS_UNAVAILABLE_ITEMS",
  "TOTAL_CHANGED",
  "TABLE_NOT_FOUND",
  "TABLE_NOT_AVAILABLE",
  "PAYMENT_IN_PROGRESS",
  "PAYMENT_AWAITING_ORDER",
  "IDEMPOTENCY_KEY_REUSED",
  "PAYMENT_DECLINED",
  "PAYMENT_PROVIDER_ERROR",
  "PAYMENT_NOT_FOUND",
  "CUSTOMER_ONLY",
] as const;
export type PaymentErrorCode = (typeof PAYMENT_ERROR_CODES)[number];

/**
 * Test tokens accepted by the dummy payment provider, for the checkout page's payment step.
 * Any other token is declined as `invalid_payment_token`. No real money is ever charged.
 */
export const DUMMY_PAYMENT_TOKENS = {
  approved: ["tok_visa", "tok_mastercard", "tok_amex", "tok_wallet"],
  declined: {
    tok_declined: "card_declined",
    tok_insufficient_funds: "insufficient_funds",
    tok_expired_card: "expired_card",
  },
  /** Simulates the payment provider being unreachable (502). */
  outage: "tok_provider_error",
} as const;

export const idempotencyKeySchema = z
  .string({ error: `The ${IDEMPOTENCY_KEY_HEADER} header is required` })
  .trim()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens, and underscores, e.g. a UUID");

/** `GET /payments/quote`. */
export const checkoutQuoteQuerySchema = z.strictObject({
  tipCents: integerParam(0, CHECKOUT_MAX_TIP_CENTS).default(0),
});
export type CheckoutQuoteQuery = z.infer<typeof checkoutQuoteQuerySchema>;
export type CheckoutQuoteQueryInput = z.input<typeof checkoutQuoteQuerySchema>;

const checkoutPaymentFields = {
  method: checkoutPaymentMethodSchema,
  /** Dummy payment token, e.g. `tok_visa`. See DUMMY_PAYMENT_TOKENS. */
  paymentToken: z.string().trim().min(1).max(200),
  tipCents: z.number().int().min(0).max(CHECKOUT_MAX_TIP_CENTS).default(0),
  /**
   * The `totalCents` the customer was shown (from `GET /payments/quote`). The charge is refused
   * with `TOTAL_CHANGED` if the server-side total differs, so nobody is charged an unseen amount.
   */
  expectedTotalCents: centsSchema,
};

/**
 * `POST /orders`: checkout. Pays for the signed-in customer's cart with the dummy payment provider
 * and places the order. `orderType` is the delivery mode: DINE_IN needs a `tableId` (from
 * `GET /tables`); TAKEAWAY needs only the payment and must not send a table.
 */
export const checkoutSchema = z.discriminatedUnion("orderType", [
  z.strictObject({
    orderType: z.literal("DINE_IN"),
    tableId: z
      .number({
        error: (issue) =>
          issue.input === undefined ? "Choose a table for dine-in" : "Must be a table id",
      })
      .int()
      .positive(),
    ...checkoutPaymentFields,
  }),
  z.strictObject(
    {
      orderType: z.literal("TAKEAWAY"),
      ...checkoutPaymentFields,
    },
    {
      error: (issue) =>
        issue.code === "unrecognized_keys" && issue.keys.includes("tableId")
          ? "Takeaway orders do not use a table; remove tableId"
          : undefined,
    },
  ),
]);
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutRequest = z.input<typeof checkoutSchema>;

/** `GET /payments`. Newest first. */
export const paymentsQuerySchema = z.strictObject({
  page: integerParam(1, 10_000).default(1),
  pageSize: integerParam(1, PAYMENTS_MAX_PAGE_SIZE).default(PAYMENTS_DEFAULT_PAGE_SIZE),
});
export type PaymentsQuery = z.infer<typeof paymentsQuerySchema>;

/** One priced line of a checkout, using the menu price at the time of the quote or payment. */
export const checkoutLineSchema = z.object({
  menuItemId: idSchema,
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: centsSchema,
  lineTotalCents: centsSchema,
});
export type CheckoutLine = z.infer<typeof checkoutLineSchema>;

/** Prices are tax-exclusive: `totalCents = subtotalCents + taxCents + tipCents`. */
export const checkoutQuoteSchema = z.object({
  lines: z.array(checkoutLineSchema),
  itemCount: z.number().int().nonnegative(),
  subtotalCents: centsSchema,
  taxCents: centsSchema,
  tipCents: centsSchema,
  totalCents: centsSchema,
});
export type CheckoutQuote = z.infer<typeof checkoutQuoteSchema>;

export const checkoutQuoteResponseSchema = z.object({
  quote: checkoutQuoteSchema,
});
export type CheckoutQuoteResponse = z.infer<typeof checkoutQuoteResponseSchema>;

/** A payment as shown to the customer who made it. */
export const customerPaymentSchema = z.object({
  id: idSchema,
  status: paymentStatusSchema,
  method: paymentMethodSchema,
  orderType: orderTypeSchema,
  table: diningTableSchema.pick({ id: true, label: true }).nullable(),
  /** The order placed with this payment; null for declined attempts. */
  orderId: idSchema.nullable(),
  /** The cart as it was paid for. The order is created from these lines, not the live cart. */
  lines: z.array(checkoutLineSchema),
  subtotalCents: centsSchema,
  taxCents: centsSchema,
  tipCents: centsSchema,
  amountCents: z.number().int().positive(),
  /** Machine-readable decline reason for FAILED payments, e.g. `card_declined`. */
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type CustomerPayment = z.infer<typeof customerPaymentSchema>;

export const paymentResponseSchema = z.object({
  payment: customerPaymentSchema,
});
export type PaymentResponse = z.infer<typeof paymentResponseSchema>;

export const paymentsResponseSchema = z.object({
  payments: z.array(customerPaymentSchema),
  pagination: paginationSchema,
});
export type PaymentsResponse = z.infer<typeof paymentsResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Orders: customer                                                            */
/* -------------------------------------------------------------------------- */

export const ORDERS_DEFAULT_PAGE_SIZE = 20;
export const ORDERS_MAX_PAGE_SIZE = 100;

/** Error codes returned by the order read endpoints. Checkout returns PAYMENT_ERROR_CODES. */
export const ORDER_ERROR_CODES = ["ORDER_NOT_FOUND", "CUSTOMER_ONLY"] as const;
export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[number];

/** `GET /orders`. Newest first. */
export const ordersQuerySchema = z.strictObject({
  page: integerParam(1, 10_000).default(1),
  pageSize: integerParam(1, ORDERS_MAX_PAGE_SIZE).default(ORDERS_DEFAULT_PAGE_SIZE),
});
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;

const orderTableSchema = diningTableSchema.pick({ id: true, label: true });

export const customerOrderItemSchema = z.object({
  id: idSchema,
  menuItemId: idSchema,
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: centsSchema,
  lineTotalCents: centsSchema,
  status: itemStatusSchema,
});
export type CustomerOrderItem = z.infer<typeof customerOrderItemSchema>;

export const orderPaymentSchema = z.object({
  id: idSchema,
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  amountCents: z.number().int().positive(),
  createdAt: timestampSchema,
});
export type OrderPayment = z.infer<typeof orderPaymentSchema>;

/** One row of the customer's order list. */
export const customerOrderSummarySchema = z.object({
  id: idSchema,
  /** Human-friendly number, e.g. `DG-00042`. */
  orderNo: z.string(),
  type: orderTypeSchema,
  status: orderStatusSchema,
  /** The dine-in table; null for takeaway. */
  table: orderTableSchema.nullable(),
  /** Takeaway only: code the customer shows when collecting the order. */
  pickupCode: z.string().nullable(),
  itemCount: z.number().int().positive(),
  totalCents: centsSchema,
  createdAt: timestampSchema,
});
export type CustomerOrderSummary = z.infer<typeof customerOrderSummarySchema>;

/** Order details for the customer panel and the checkout confirmation. */
export const customerOrderSchema = customerOrderSummarySchema.extend({
  items: z.array(customerOrderItemSchema),
  subtotalCents: centsSchema,
  taxCents: centsSchema,
  tipCents: centsSchema,
  /** Requested pickup time; null means as soon as possible. */
  pickupTime: timestampSchema.nullable(),
  notes: z.string().nullable(),
  payments: z.array(orderPaymentSchema),
  /** Why the restaurant declined, cancelled, or marked the order as not collected. */
  statusReason: z.string().nullable(),
  updatedAt: timestampSchema,
});
export type CustomerOrder = z.infer<typeof customerOrderSchema>;

export const orderResponseSchema = z.object({
  order: customerOrderSchema,
});
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const ordersResponseSchema = z.object({
  orders: z.array(customerOrderSummarySchema),
  pagination: paginationSchema,
});
export type OrdersResponse = z.infer<typeof ordersResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

/** Notifications are kept for 7 days; older ones are hidden at once and deleted periodically. */
export const NOTIFICATION_RETENTION_DAYS = 7;
/** How often clients should poll `GET /notifications/unread-count` while the page is visible. */
export const NOTIFICATION_POLL_INTERVAL_MS = 30_000;
export const NOTIFICATIONS_DEFAULT_PAGE_SIZE = 20;
export const NOTIFICATIONS_MAX_PAGE_SIZE = 50;

/** Error codes returned by the notification endpoints, in addition to `VALIDATION_ERROR`. */
export const NOTIFICATION_ERROR_CODES = ["NOTIFICATION_NOT_FOUND"] as const;
export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];

/**
 * `GET /notifications`. Newest first.
 *
 * For "Show more", pass the id of the oldest notification already shown as `beforeId`: a cursor
 * never skips or repeats items when notifications are deleted or arrive in between, which page
 * offsets do. `pagination.total` always counts every match, ignoring the cursor.
 */
export const notificationsQuerySchema = z
  .strictObject({
    page: integerParam(1, 10_000).default(1),
    pageSize: integerParam(1, NOTIFICATIONS_MAX_PAGE_SIZE).default(NOTIFICATIONS_DEFAULT_PAGE_SIZE),
    /** Only notifications older than this one (a smaller id). */
    beforeId: integerParam(1, Number.MAX_SAFE_INTEGER).optional(),
    /** `true`: unread only. `false`: read only. Absent: both. */
    unread: booleanParam.optional(),
    category: notificationCategorySchema.optional(),
    /** Only notifications about one record, e.g. `entityType=ORDER&entityId=42`. Send both. */
    entityType: notificationEntityTypeSchema.optional(),
    entityId: integerParam(1, Number.MAX_SAFE_INTEGER).optional(),
  })
  .superRefine((value, context) => {
    if ((value.entityType === undefined) !== (value.entityId === undefined)) {
      context.addIssue({
        code: "custom",
        path: [value.entityType === undefined ? "entityType" : "entityId"],
        message: "Send entityType and entityId together",
      });
    }
  });
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;
export type NotificationsQueryInput = z.input<typeof notificationsQuerySchema>;

/**
 * `POST /notifications/read-all`. Send the newest id the user has seen as `upToId`, so a
 * notification that arrives while they click "Mark all as read" stays unread. An empty body
 * marks everything.
 */
export const markAllNotificationsReadSchema = z.preprocess(
  (value) => value ?? {},
  z.strictObject({
    upToId: idSchema.optional(),
  }),
);
export type MarkAllNotificationsReadInput = z.infer<typeof markAllNotificationsReadSchema>;

/** A notification as shown to its recipient. The recipient and dedupe key stay internal. */
export const notificationItemSchema = notificationSchema
  .pick({
    id: true,
    type: true,
    category: true,
    priority: true,
    title: true,
    body: true,
    link: true,
    entityType: true,
    entityId: true,
    data: true,
    readAt: true,
    createdAt: true,
  })
  .extend({
    read: z.boolean(),
  });
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationItemSchema),
  pagination: paginationSchema,
  /** Unread notifications in the whole inbox, regardless of the filters. */
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

/** `GET /notifications/unread-count`: the cheap call clients poll for the badge. */
export const notificationUnreadCountResponseSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  /** Newest notification id in the inbox (read or not); changes when something new arrives. */
  latestId: idSchema.nullable(),
});
export type NotificationUnreadCountResponse = z.infer<typeof notificationUnreadCountResponseSchema>;

/** `PATCH /notifications/:id/read` and `PATCH /notifications/:id/unread`. */
export const notificationReadResponseSchema = z.object({
  notification: notificationItemSchema,
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationReadResponse = z.infer<typeof notificationReadResponseSchema>;

/** `DELETE /notifications/:id`. */
export const notificationDeleteResponseSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationDeleteResponse = z.infer<typeof notificationDeleteResponseSchema>;

/** `POST /notifications/read-all`. */
export const markAllNotificationsReadResponseSchema = z.object({
  /** How many notifications this request marked as read. */
  updated: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});
export type MarkAllNotificationsReadResponse = z.infer<
  typeof markAllNotificationsReadResponseSchema
>;

/* -------------------------------------------------------------------------- */
/* Orders: staff handling                                                      */
/* -------------------------------------------------------------------------- */

export const STAFF_ORDERS_DEFAULT_PAGE_SIZE = 20;
export const STAFF_ORDERS_MAX_PAGE_SIZE = 100;

/**
 * How a customer order moves, per order type. Every order is paid at checkout, so a dine-in
 * order goes from SERVED straight to CLOSED; BILL_REQUESTED and PAID are kept for unpaid orders
 * taken at a till later. Exits: REJECTED (takeaway not accepted), CANCELLED, NO_SHOW.
 * Repeating the current status is always allowed and changes nothing.
 */
export const ORDER_STATUS_TRANSITIONS: Readonly<
  Record<OrderType, Partial<Record<OrderStatus, readonly OrderStatus[]>>>
> = {
  DINE_IN: {
    OPEN: ["SENT", "CANCELLED"],
    SENT: ["IN_PROGRESS", "READY", "CANCELLED"],
    IN_PROGRESS: ["READY", "CANCELLED"],
    READY: ["SERVED"],
    SERVED: ["CLOSED"],
  },
  TAKEAWAY: {
    PLACED: ["ACCEPTED", "REJECTED", "CANCELLED"],
    PAY_AT_PICKUP: ["ACCEPTED", "REJECTED", "CANCELLED"],
    ACCEPTED: ["PREPARING", "READY_FOR_PICKUP", "CANCELLED"],
    PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
    READY_FOR_PICKUP: ["COLLECTED", "NO_SHOW"],
  },
};

export function canChangeOrderStatus(type: OrderType, from: OrderStatus, to: OrderStatus): boolean {
  return from === to || (ORDER_STATUS_TRANSITIONS[type][from]?.includes(to) ?? false);
}

/**
 * Staff roles that may move an order INTO each status. ADMIN and MANAGER may set any status;
 * only they can reject or cancel. The kitchen cooks, waiters serve dine-in, cashiers hand over
 * takeaway.
 */
export const ORDER_STATUS_SETTERS: Readonly<Partial<Record<OrderStatus, readonly UserRole[]>>> = {
  SENT: ["ADMIN", "MANAGER", "WAITER"],
  IN_PROGRESS: ["ADMIN", "MANAGER", "KITCHEN"],
  READY: ["ADMIN", "MANAGER", "KITCHEN"],
  SERVED: ["ADMIN", "MANAGER", "WAITER"],
  CLOSED: ["ADMIN", "MANAGER", "WAITER", "CASHIER"],
  ACCEPTED: ["ADMIN", "MANAGER", "KITCHEN", "CASHIER"],
  PREPARING: ["ADMIN", "MANAGER", "KITCHEN"],
  READY_FOR_PICKUP: ["ADMIN", "MANAGER", "KITCHEN"],
  COLLECTED: ["ADMIN", "MANAGER", "CASHIER"],
  NO_SHOW: ["ADMIN", "MANAGER", "CASHIER"],
  REJECTED: ["ADMIN", "MANAGER"],
  CANCELLED: ["ADMIN", "MANAGER"],
};

export function canSetOrderStatus(role: UserRole, status: OrderStatus): boolean {
  return (ORDER_STATUS_SETTERS[status] ?? ["ADMIN", "MANAGER"]).includes(role);
}

/** Statuses that take a reason (shown to the customer). Required for REJECTED and CANCELLED. */
export const ORDER_STATUSES_WITH_REASON = ["REJECTED", "CANCELLED", "NO_SHOW"] as const;
export const ORDER_STATUSES_REQUIRING_REASON = ["REJECTED", "CANCELLED"] as const;

/** Error codes returned by the staff order endpoints, in addition to `VALIDATION_ERROR`. */
export const STAFF_ORDER_ERROR_CODES = [
  "ORDER_NOT_FOUND",
  "INVALID_STATUS_TRANSITION",
  "STATUS_NOT_ALLOWED_FOR_ROLE",
] as const;
export type StaffOrderErrorCode = (typeof STAFF_ORDER_ERROR_CODES)[number];

/** `GET /staff/orders`. Newest first. `status` takes one or more statuses. */
export const staffOrdersQuerySchema = z.strictObject({
  page: integerParam(1, 10_000).default(1),
  pageSize: integerParam(1, STAFF_ORDERS_MAX_PAGE_SIZE).default(STAFF_ORDERS_DEFAULT_PAGE_SIZE),
  status: listParam(orderStatusSchema, ORDER_STATUSES.length),
  type: orderTypeSchema.optional(),
});
export type StaffOrdersQuery = z.infer<typeof staffOrdersQuerySchema>;
export type StaffOrdersQueryInput = z.input<typeof staffOrdersQuerySchema>;

const statusReasonSchema = z
  .string()
  .trim()
  .min(3, "Give a reason of at least 3 characters")
  .max(300);

/** `PATCH /staff/orders/:id/status`. */
export const updateOrderStatusSchema = z
  .strictObject({
    status: orderStatusSchema,
    /** Shown to the customer. Required to reject or cancel; optional for a no-show. */
    reason: statusReasonSchema.optional(),
  })
  .superRefine((value, context) => {
    const needsReason = (ORDER_STATUSES_REQUIRING_REASON as readonly string[]).includes(
      value.status,
    );
    const takesReason = (ORDER_STATUSES_WITH_REASON as readonly string[]).includes(value.status);

    if (needsReason && value.reason === undefined) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Tell the customer why the order is rejected or cancelled",
      });
    }
    if (!takesReason && value.reason !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is only for REJECTED, CANCELLED, or NO_SHOW",
      });
    }
  });
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const staffOrderItemSchema = customerOrderItemSchema.extend({
  /** Kitchen station that prepares the item. */
  station: stationSchema,
  firedAt: timestampSchema.nullable(),
  readyAt: timestampSchema.nullable(),
});
export type StaffOrderItem = z.infer<typeof staffOrderItemSchema>;

/** One row of the staff order list. */
export const staffOrderSummarySchema = customerOrderSummarySchema.extend({
  /** The customer who placed it; null for orders entered by staff. */
  customer: z.object({ id: idSchema, name: z.string() }).nullable(),
  /** Why the order was rejected, cancelled, or not collected. */
  statusReason: z.string().nullable(),
  updatedAt: timestampSchema,
});
export type StaffOrderSummary = z.infer<typeof staffOrderSummarySchema>;

export const staffOrderSchema = staffOrderSummarySchema.extend({
  items: z.array(staffOrderItemSchema),
  subtotalCents: centsSchema,
  taxCents: centsSchema,
  tipCents: centsSchema,
  pickupTime: timestampSchema.nullable(),
  notes: z.string().nullable(),
});
export type StaffOrder = z.infer<typeof staffOrderSchema>;

export const staffOrderResponseSchema = z.object({
  order: staffOrderSchema,
});
export type StaffOrderResponse = z.infer<typeof staffOrderResponseSchema>;

export const staffOrdersResponseSchema = z.object({
  orders: z.array(staffOrderSummarySchema),
  pagination: paginationSchema,
});
export type StaffOrdersResponse = z.infer<typeof staffOrdersResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Staff dashboards: board and floor                                           */
/* -------------------------------------------------------------------------- */

export type StaffRole = Exclude<UserRole, "CUSTOMER">;

/**
 * An order is still in service while it can move on (it has a transition). ADMIN and MANAGER
 * see all of these on their board.
 */
const IN_SERVICE = {
  DINE_IN: Object.keys(ORDER_STATUS_TRANSITIONS.DINE_IN) as OrderStatus[],
  TAKEAWAY: Object.keys(ORDER_STATUS_TRANSITIONS.TAKEAWAY) as OrderStatus[],
} as const;

/**
 * Which orders each staff role's board shows, per order type: the statuses in which the role
 * acts, plus the ones it needs to see (the kitchen sees READY orders waiting for hand-over; the
 * waiter sees dine-in orders still in the kitchen). Types a role has no part in are absent:
 * cashiers may also close a served dine-in order, but that is the waiter's step, so the cashier
 * board stays on takeaway.
 */
export const STAFF_BOARD_SCOPES: Readonly<
  Record<StaffRole, Partial<Record<OrderType, readonly OrderStatus[]>>>
> = {
  KITCHEN: {
    DINE_IN: ["SENT", "IN_PROGRESS", "READY"],
    TAKEAWAY: ["PLACED", "PAY_AT_PICKUP", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"],
  },
  WAITER: { DINE_IN: ["SENT", "IN_PROGRESS", "READY", "SERVED"] },
  CASHIER: { TAKEAWAY: ["PLACED", "PAY_AT_PICKUP", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"] },
  MANAGER: IN_SERVICE,
  ADMIN: IN_SERVICE,
};

/** A board returns at most this many orders (the oldest first: they have waited longest). */
export const STAFF_BOARD_MAX_ORDERS = 200;

/**
 * The statuses `role` may move an order to right now: the order type's transitions from its
 * status that the role may set (ORDER_STATUS_TRANSITIONS ∩ ORDER_STATUS_SETTERS), in flow order,
 * so the first one is the usual next step.
 */
export function orderActionsFor(
  role: UserRole,
  type: OrderType,
  status: OrderStatus,
): OrderStatus[] {
  return (ORDER_STATUS_TRANSITIONS[type][status] ?? []).filter((next) =>
    canSetOrderStatus(role, next),
  );
}

/** `GET /staff/board`. The board is the signed-in staff member's; `type` narrows it. */
export const staffBoardQuerySchema = z.strictObject({
  type: orderTypeSchema.optional(),
});
export type StaffBoardQuery = z.infer<typeof staffBoardQuerySchema>;
export type StaffBoardQueryInput = z.input<typeof staffBoardQuerySchema>;

export const staffBoardOrderSchema = staffOrderSchema.extend({
  /** What the signed-in staff member may move this order to now (see orderActionsFor). */
  actions: z.array(orderStatusSchema),
});
export type StaffBoardOrder = z.infer<typeof staffBoardOrderSchema>;

export const staffBoardResponseSchema = z.object({
  /** Oldest first, with items. */
  orders: z.array(staffBoardOrderSchema),
  /** More than STAFF_BOARD_MAX_ORDERS orders are in scope; only the oldest were returned. */
  hasMore: z.boolean(),
});
export type StaffBoardResponse = z.infer<typeof staffBoardResponseSchema>;

/** Dine-in statuses in which the guests still have an order at the table. */
export const OPEN_TABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "OPEN",
  "SENT",
  "IN_PROGRESS",
  "READY",
  "SERVED",
  "BILL_REQUESTED",
  "PAID",
];

/**
 * The statuses a table may change to now (TABLE_STATUS_TRANSITIONS). A table out of service
 * has none, and a table whose guests still have open orders cannot be cleaned or freed.
 */
export function tableActionsFor(
  status: TableStatus,
  active: boolean,
  openOrderCount: number,
): TableStatus[] {
  if (!active) return [];
  return TABLE_STATUS_TRANSITIONS[status].filter(
    (next) => openOrderCount === 0 || (next !== "CLEANING" && next !== "FREE"),
  );
}

export const staffFloorOrderSchema = z.object({
  id: idSchema,
  orderNo: z.string(),
  status: orderStatusSchema,
});
export type StaffFloorOrder = z.infer<typeof staffFloorOrderSchema>;

export const staffFloorTableSchema = diningTableSchema.extend({
  /** Dine-in orders still open at this table, oldest first. */
  openOrders: z.array(staffFloorOrderSchema),
  /** Statuses the table may change to now (see tableActionsFor). */
  actions: z.array(tableStatusSchema),
});
export type StaffFloorTable = z.infer<typeof staffFloorTableSchema>;

/** `GET /staff/floor`. Tables in floor-plan order (T2 before T10). */
export const staffFloorResponseSchema = z.object({
  tables: z.array(staffFloorTableSchema),
});
export type StaffFloorResponse = z.infer<typeof staffFloorResponseSchema>;
