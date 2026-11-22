# DineGo

**Eat in. Take away. One flow.**

DineGo is a restaurant management system with two customer journeys — dine-in and takeaway — that share one menu, one kitchen, one payment system, and one report.

This repository is the Phase 1 foundation: a **npm workspaces + Turborepo** monorepo with a NestJS + TypeORM + SQLite API, a Next.js + Tailwind web app, and a shared Zod contract package. The API implements the **users** domain (registration, login, admin login, JWT cookie/Bearer sessions, and user/customer listing) a read-only **public menu** (categories and items with filtering, search, sorting, and pagination), a **customer cart**, **dining tables** (a public dine-in table picker and staff floor management), **checkout** (dine-in at a table or takeaway, paid with **dummy payments only**), **customer orders** (order list and details for the customer panel), and **in-app notifications** (an inbox for customers and every staff role, starting with account events).

## Stack

| Layer            | Choice                                                |
| ---------------- | ----------------------------------------------------- |
| Monorepo         | npm workspaces + Turborepo                            |
| Backend          | NestJS 12 (ESM), TypeORM 1, SQLite (`better-sqlite3`) |
| Frontend         | Next.js 16 App Router, React 19, Tailwind CSS 4       |
| Shared contracts | Zod 4 schemas and inferred TypeScript types           |
| Database changes | TypeORM migrations (`npm run db:migrate`)             |
| Tooling          | TypeScript 6, ESLint 10, Prettier, Vitest 5           |

## Structure

```
dinego/
  apps/
    api/
      dinego.sqlite          SQLite file at the root of the API
      src/
        main.ts              Nest bootstrap, CORS, cookies, Swagger
        app.module.ts        database + users + menu + cart + tables + payments + orders + staff + notifications + health modules
        database/
          data-source.ts      TypeORM connection + migration registry
          database.module.ts
          migrate.ts          CLI runner for pending migrations
          migrations/
            *-CreateUsers.ts  initial users table
            *-CreateMenu.ts   menu_categories + menu_items
            *-CreateCarts.ts  carts + cart_items
            *-CreateDiningTables.ts  dining_tables
            *-CreatePayments.ts  payments (checkout snapshot, idempotency, one open checkout)
            *-CreateOrders.ts  orders + order_items, payments.order_id FK
            *-AddUserTokenVersion.ts  users.token_version (session versioning)
            *-CreateNotifications.ts  notifications (one row per recipient, dedupe key)
            *-AddOrderStatusReason.ts  orders.status_reason (why an order was stopped)
          seeds/
            index.ts          seed runner
            users.seed.ts     demo staff and customer accounts
            menu.seed.ts      demo menu (mirrors the web app's static menu)
            tables.seed.ts    demo floor: 8 tables, 48 seats
            demo-service.seed.ts  demo service: 13 orders mid-service, through the real services
        users/                accounts and authentication
          users.module.ts
          users.controller.ts
          users.service.ts
          users.mapper.ts
          auth-cookie.ts      HttpOnly JWT cookie helpers
          entities/
            user.entity.ts    staff and customers
          dto/
            swagger.dto.ts    OpenAPI request/response schemas
          guards/             JWT auth, role, and customer-only guards
          decorators/         @CurrentAuth, @Roles
          users.service.spec.ts  unit tests
        menu/                 public, read-only menu
          menu.module.ts
          menu.controller.ts  GET /menu, /menu/categories, /menu/items, /menu/items/:slug
          menu.service.ts     visibility rules, filters, search, sorting, pagination
          menu.mapper.ts      public response shapes (hides station and taxRate)
          entities/           MenuCategory, MenuItem
          dto/swagger.dto.ts  OpenAPI schemas and query parameter docs
          menu.spec.ts        unit tests
        cart/                 signed-in customer's cart
          cart.controller.ts  GET /cart, POST /cart/items, PATCH|DELETE /cart/items/:menuItemId
          cart.service.ts     atomic single-statement cart writes (see Concurrency)
          cart.errors.ts      coded error bodies
          entities/           Cart, CartItem
          dto/swagger.dto.ts  OpenAPI schemas
          cart.spec.ts        unit tests
        tables/               dining tables
          tables.controller.ts  GET /tables (public dine-in picker)
          floor.controller.ts   /floor/tables: staff floor view, layout, and status
          tables.service.ts   atomic single-statement writes with the floor rules
          tables.mapper.ts    public vs staff shapes, orderable rule, natural sort
          entities/           DiningTable
          dto/swagger.dto.ts  OpenAPI schemas
          tables.spec.ts      unit tests
        payments/             dummy checkout payments
          payments.controller.ts  GET /payments/quote, GET /payments[/:id]
          payments.service.ts validate + reserve atomically, charge, record failures
          pricing.ts          the one checkout pricing rule (tax-exclusive, per-line rounding)
          providers/          PaymentProvider port + SimulatedPaymentProvider (dummy only)
          entities/           Payment
          dto/swagger.dto.ts  OpenAPI schemas
          payments.spec.ts    unit tests
        orders/               checkout and customer orders
          orders.controller.ts  POST /orders (checkout), GET /orders, GET /orders/:id
          orders.service.ts   charge, then place the order atomically; restart recovery
          staff-orders.controller.ts  GET /staff/orders, GET /staff/orders/:id, PATCH …/status
          staff-orders.service.ts     status changes: rules, item statuses, notifications
          order-escalation.ts  alerts managers about takeaway orders waiting to be accepted
          orders.mapper.ts    order list and detail shapes
          entities/           Order, OrderItem
          dto/swagger.dto.ts  OpenAPI schemas
        notifications/        in-app notifications for every account type
          notifications-core.module.ts  NotificationPublisher, importable by any module
          notification-publisher.ts     the only writer: fan-out by role, dedupe, atomic
          notifications.catalog.ts      every notification type: recipients, text, link
          notifications.module.ts       HTTP API + retention purge
          notifications.controller.ts   GET /notifications, unread-count, read, read-all
          notifications.service.ts      the user's own inbox, 7-day window
          notification-retention.ts     deletes notifications older than 7 days
          entities/           Notification
          dto/swagger.dto.ts  OpenAPI schemas
          notifications.spec.ts  unit tests (catalog, schemas, publisher SQL)
        staff/                read models for the staff dashboards
          staff-dashboard.controller.ts  GET /staff/board, GET /staff/floor
          staff-dashboard.service.ts     board (orders + items + actions), floor (tables + open orders)
          dto/swagger.dto.ts  OpenAPI schemas
          staff-dashboard.spec.ts  unit tests (actions, board scopes, table rule, demo data)
        health/               GET /health
          dto/health.dto.ts   Swagger health response
        common/               Zod pipe, coded errors, Idempotency-Key, runAtomically
      test/                   Vitest e2e tests
      vitest.config.ts        Unit test config
      vitest.config.e2e.ts    E2E test config
    web/
      src/
        app/                  App Router pages
          fonts/              bundled DM Sans and Playfair Display files
          page.tsx            restaurant landing page
          menu/               static restaurant menu
          checkout/           checkout: dine in or take away, dummy payment, place order
          login/              shared login
          register/           customer registration
          account/            customer panel (shared layout with side navigation)
            page.tsx          /account overview
            orders/           /account/orders and /account/orders/[id]
            notifications/    /account/notifications: filter, read/unread, delete
            profile/          /account/profile: details, email, password
          admin/login/        redirects to the shared /login page
          admin/(panel)/      protected admin dashboard
            page.tsx          /admin overview
            users/            /admin/users
            customers/        /admin/customers
            notifications/    /admin/notifications: the staff member's inbox
            settings/         /admin/settings
          staff/              staff dashboards (KITCHEN, WAITER, CASHIER), one role each
            kitchen/          /staff/kitchen: kitchen board
            waiter/           /staff/waiter: service board; waiter/tables/: the floor
            cashier/          /staff/cashier: pickup counter
            notifications/    /staff/notifications: the staff member's inbox
        components/
          admin/              admin provider and shell config, tables, notifications page, settings
          console/            console shell shared by the admin console and the staff dashboards
          staff/              staff provider (role gate), console config, boards, tickets, tables
          cart/               cart provider, drawer (with Checkout), buttons, toast
          checkout/           checkout page: steps, table picker, dummy payment, bill
          orders/             order list, order details, status badge and progress
          notifications/      provider (count, polling, actions), bell and dropdown, inbox page, icons
          app-shell.tsx       public layout + focused/admin/staff routes
          site-header.tsx     public navigation
          auth-nav.tsx        account dropdown: Dashboard and Logout
          auth-card.tsx       focused login/register card
          account/            customer panel shell, overview, profile and its forms
          theme-toggle.tsx    light/dark switch
          form.tsx            form fields and submit button
        lib/                  API client, auth, menu, cart, checkout, orders, staff orders, floor,
                              and dashboards (where each role lands) helpers
  packages/
    shared/                   @dinego/shared
      src/
        enums.ts              every domain enum
        entities.ts           every domain entity and its properties
        api.ts                auth, users, and health contracts
  eslint.config.mjs           root ESLint flat config
  turbo.json
```

Ten Nest modules exist: **database**, **users**, **menu**, **cart**, **tables**, **payments**, **orders**, **staff** (the staff dashboards' read models), **notifications** (with its writer in **notifications core**), and **health**. The TypeORM entities are `User`, `MenuCategory`, `MenuItem`, `Cart`, `CartItem`, `DiningTable`, `Payment`, `Order`, `OrderItem`, and `Notification`. Customers are users with the `CUSTOMER` role, so customer registration and login share the same table and entity as staff accounts.

## Shared domain model

`@dinego/shared` is the single source of truth for the full restaurant domain, even before each
Nest module exists. Entity schemas live in `packages/shared/src/entities.ts` and enums live in
`packages/shared/src/enums.ts`.

| Area             | Entities                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| Identity         | `User`, `Customer`                                                           |
| Menu             | `MenuCategory`, `MenuItem`, `ModifierGroup`, `Modifier`, `ItemModifierGroup` |
| Cart             | `Cart`, `CartItem`                                                           |
| Floor            | `DiningTable`                                                                |
| Orders           | `Order`, `OrderItem`, `OrderItemModifier`                                    |
| Payments         | `Payment`, `Refund`                                                          |
| Inventory        | `Ingredient`, `Recipe`, `StockMovement`                                      |
| Staff and system | `Shift`, `PickupSlot`, `AuditLog`                                            |
| Notifications    | `Notification`                                                               |

Conventions encoded in the schemas:

- IDs are positive integers.
- All money values are integer cents.
- Dates are ISO-8601 strings.
- Secrets such as `passwordHash` and `pinHash` are excluded from serialized entity contracts.
- Order, item, table, payment, and stock-movement states use the shared enum unions.

## Prerequisites

- Node.js 24.11 or newer, **24.18.x recommended** (see below)
- npm 11 (`npm -v`)

**Node 24.19+ and `better-sqlite3`:** from Node 24.19, the `ObjectWrap` base class in Node's
addon headers removes an environment cleanup hook when a native object is destroyed. When
`better-sqlite3` is compiled against those headers, a prepared statement that is garbage-collected
outside a JavaScript context aborts the process (`Assertion failed: (env) != nullptr` in
`Statement::~Statement`). TypeORM discards cached statements routinely, so the API crashes at
random. Use Node 24.18.x, or rebuild `better-sqlite3` (`npm rebuild better-sqlite3`) after
switching Node versions.

## Quick start

```bash
# 1. Install all workspace dependencies
npm install

# 2. Create the users table with a migration
npm run db:migrate

# 3. Seed the demo users, menu, and tables
npm run db:seed

# 4. Run the API and web app together
npm run dev
```

`npm run db:seed` also runs `db:migrate` first, so the two commands can be used together or
separately.

Then open:

- Web app: <http://localhost:3000>
- API: <http://localhost:4000/api/v1>
- Health: <http://localhost:4000/api/v1/health>
- Swagger UI: <http://localhost:4000/api/docs>
- OpenAPI JSON: <http://localhost:4000/api/docs-json>

The SQLite file lives at `apps/api/dinego.sqlite`. `synchronize` is disabled; the schema is owned
by migrations.

### Offline fonts

The web app bundles its fonts locally in `apps/web/src/app/fonts`:

- **DM Sans** for body text
- **Playfair Display** for display headings

They are loaded with `next/font/local`, so builds and page loads do not request Google Fonts or any
other external font service. OFL license files are included beside the font files.

Optional environment files (sensible local defaults are built in):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

## Scripts

| Command              | What it does                                       |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | Runs shared watch, API watch, and Next dev         |
| `npm run build`      | Cleans first, then builds shared, API, and web     |
| `npm run start`      | Starts the built API and Next app                  |
| `npm run typecheck`  | Type-checks every workspace package                |
| `npm run lint`       | Lints API, web, and shared with ESLint             |
| `npm run lint:fix`   | Applies ESLint fixes                               |
| `npm run test`       | Runs API unit tests with Vitest                    |
| `npm run test:e2e`   | Runs API e2e tests with Vitest + Supertest         |
| `npm run db:migrate` | Applies pending TypeORM migrations                 |
| `npm run db:seed`    | Runs migrations, then seeds the demo users         |
| `npm run clean`      | Removes build output, `.turbo`, and `.tsbuildinfo` |
| `npm run format`     | Formats the repository with Prettier               |

### Fresh, no-cache runs

Turbo caching is disabled for `build`, `dev`, `start`, `typecheck`, `lint`, `lint:fix`, `test`, and
`clean`. Every invocation executes the actual task instead of replaying a cached result.

- `npm run build` runs `clean` first, so stale `dist`, `.next`, `.tsbuildinfo`, and Turbo output
  are removed before compiling.
- `npm run typecheck` and `npm run test` resolve `@dinego/shared` from its TypeScript source, so they
  do not compile the shared package first.
- `npm run lint` and `npm run format` do not produce build output.
- `apps/api` unit/e2e tests alias the shared source package, so tests run without a prior build.
- Generated development output (`apps/api/dist`, `apps/web/.next`, `.turbo`) stays gitignored and can
  be removed with `npm run clean`.

## Demo accounts

Customers are stored in the same `users` table with the `CUSTOMER` role.

| Role     | Email                 | Password        |
| -------- | --------------------- | --------------- |
| Admin    | `admin@dinego.com`    | `Admin1234!`    |
| Manager  | `manager@dinego.com`  | `Manager1234!`  |
| Waiter   | `waiter@dinego.com`   | `Waiter1234!`   |
| Cashier  | `cashier@dinego.com`  | `Cashier1234!`  |
| Kitchen  | `kitchen@dinego.com`  | `Kitchen1234!`  |
| Customer | `customer@dinego.com` | `Customer1234!` |
| Customer | `alex@dinego.com`     | `Customer1234!` |

## API endpoints

```
GET  /api/v1/health
POST /api/v1/users/register       customer registration
POST /api/v1/users/login          customer login
POST /api/v1/users/session-login  unified customer or staff login
POST /api/v1/users/admin/login    restaurant admin login (ADMIN only)
POST /api/v1/users/staff/login    staff login for future POS/KDS screens
POST /api/v1/users/logout         clear the HttpOnly session cookie
GET  /api/v1/users/me             current customer or staff account
PATCH /api/v1/users/me/profile    update my name and phone (CUSTOMER)
PUT  /api/v1/users/me/email       change my email; needs current password (CUSTOMER)
PUT  /api/v1/users/me/password    change my password; signs out other sessions (CUSTOMER)
GET  /api/v1/users                staff list, CUSTOMER role excluded (ADMIN or MANAGER)
GET  /api/v1/users/customers      customer list (ADMIN or MANAGER)

GET  /api/v1/menu                 full menu grouped by category (public)
GET  /api/v1/menu/categories      active categories with item counts (public)
GET  /api/v1/menu/items           paginated items: filter, search, sort (public)
GET  /api/v1/menu/items/:slug     one item by slug (public)

GET    /api/v1/cart                       my cart (CUSTOMER)
POST   /api/v1/cart/items                 add an item; repeats increase quantity (CUSTOMER)
PATCH  /api/v1/cart/items/:menuItemId     set quantity; 0 removes (CUSTOMER)
DELETE /api/v1/cart/items/:menuItemId     remove an item; idempotent (CUSTOMER)

GET    /api/v1/tables                     tables customers can choose for dine-in (public)
GET    /api/v1/floor/tables               floor view with status (ADMIN, MANAGER, WAITER, CASHIER)
GET    /api/v1/floor/tables/:id           one table (ADMIN, MANAGER, WAITER, CASHIER)
PATCH  /api/v1/floor/tables/:id/status    change status (ADMIN, MANAGER, WAITER, CASHIER)
POST   /api/v1/floor/tables               add a table (ADMIN, MANAGER)
PATCH  /api/v1/floor/tables/:id           edit or take out of service (ADMIN, MANAGER)
DELETE /api/v1/floor/tables/:id           delete an unused table (ADMIN, MANAGER)

GET    /api/v1/payments/quote             checkout total for my cart (CUSTOMER)
GET    /api/v1/payments                   my dummy payments, incl. declines (CUSTOMER)
GET    /api/v1/payments/:id               one of my payments (CUSTOMER)

POST   /api/v1/orders                     checkout: dummy payment + place order (CUSTOMER)
GET    /api/v1/orders                     my orders, newest first (CUSTOMER)
GET    /api/v1/orders/:id                 one of my orders with items and payment (CUSTOMER)

GET    /api/v1/staff/orders               all orders, filter by status and type (staff)
GET    /api/v1/staff/orders/:id           one order with items and stations (staff)
PATCH  /api/v1/staff/orders/:id/status    move an order along; notifies (staff, by role)

GET    /api/v1/staff/board                my board: orders with items and actions (staff)
GET    /api/v1/staff/floor                tables with open orders and actions (not KITCHEN)

GET    /api/v1/notifications              my notifications, newest first (any account)
GET    /api/v1/notifications/unread-count my unread count and newest id, for polling (any account)
PATCH  /api/v1/notifications/:id/read     mark one as read when clicked; idempotent (any account)
PATCH  /api/v1/notifications/:id/unread   mark one as unread again; idempotent (any account)
DELETE /api/v1/notifications/:id          delete one for good (any account)
POST   /api/v1/notifications/read-all     mark all as read, up to an optional id (any account)
```

### Public menu

The menu endpoints need no authentication and return only customer-facing fields; the kitchen
`station` and `taxRate` stay internal.

- **Visibility:** only items in **active** categories are public. Deactivating a category hides it
  and all of its items everywhere, including item detail (`404`). Sold-out items
  (`available: false`) stay listed so customers see the full menu; pass `available=true` to hide
  them.
- **Query parameters** (`GET /menu` and `GET /menu/items`):

  | Parameter             | Example                  | Behavior                                                                    |
  | --------------------- | ------------------------ | --------------------------------------------------------------------------- |
  | `q`                   | `mushroom`               | Case-insensitive search in item name, description, category                 |
  | `category`            | `mains,desserts`         | Category slugs; matches ANY                                                 |
  | `tags`                | `vegetarian,gluten-free` | `VEGETARIAN`, `VEGAN`, `GLUTEN_FREE`, `SPICY`; matches ALL                  |
  | `minPrice`/`maxPrice` | `500` / `1500`           | Inclusive bounds in cents                                                   |
  | `featured`            | `true`                   | Chef's picks only (`true`/`false`)                                          |
  | `available`           | `true`                   | Hide sold-out items (`true`/`false`)                                        |
  | `sort`                | `price_asc`              | `recommended` (default), `price_asc`, `price_desc`, `name_asc`, `name_desc` |
  | `page`/`pageSize`     | `2` / `20`               | `/menu/items` only; `pageSize` 1–100, default 20                            |

- List parameters accept `a,b` or repeated keys (`?tags=a&tags=b`).
- Unknown or malformed parameters return `400 VALIDATION_ERROR` instead of being ignored.
- Sorts always end with the item id, so pagination is stable when prices or names tie.
- `GET /menu` omits categories with no matching items. `itemCount` is always the category's total
  number of public items, independent of filters.
- Query schemas and response types are shared from `@dinego/shared` (`menuItemsQuerySchema`,
  `menuItemsResponseSchema`, and so on), so the web app can build and validate requests with the
  same contract.

### Customer cart

The cart belongs to the signed-in **customer** (HttpOnly cookie or Bearer token). Staff tokens get
`403 CUSTOMER_ONLY`, and a deactivated customer's still-valid token gets `401`. Every endpoint
returns the full, updated cart.

- **Add** (`POST /cart/items`, body `{ "menuItemId": 5, "quantity": 1 }`, quantity defaults to 1):
  adding an item that is already in the cart increases its quantity instead of adding a line.
- **Increase or decrease** (`PATCH /cart/items/:menuItemId`, body `{ "quantity": 3 }`): sets an
  absolute quantity; `0` removes the item.
- **Remove** (`DELETE /cart/items/:menuItemId`): idempotent, so a repeated click is not an error.
- **Prices are live:** lines always use the current menu price. Prices are snapshotted on the
  order at checkout, not in the cart.
- **Availability:** only items on the public menu that are not sold out can be added. If an item
  later sells out or its category is deactivated, its line stays with `purchasable: false`, is
  excluded from `itemCount` and `subtotalCents`, and can only be lowered or removed.
- **Limits:** up to 20 of one item and 50 different items.
- **Errors** use the shared error shape with a `code`: `MENU_ITEM_NOT_FOUND` (404),
  `CART_ITEM_NOT_FOUND` (404), `ITEM_UNAVAILABLE`, `QUANTITY_LIMIT`, `CART_FULL` (409), and
  `VALIDATION_ERROR` (400).
- **Concurrency:** the better-sqlite3 driver shares one TypeORM query runner across all requests,
  so interactive transactions from concurrent requests interfere with each other. Each cart write
  is a single atomic SQL statement with its limits enforced inside the statement; simultaneous
  adds are never lost and never exceed the limits.

### Customer account

Profile, email, and password are three separate endpoints, each for signed-in customers only
(staff get `403 CUSTOMER_ONLY`):

| Endpoint                  | Body                                   | Returns                              |
| ------------------------- | -------------------------------------- | ------------------------------------ |
| `PATCH /users/me/profile` | `{ "name"?, "phone"? }`                | `{ customer }`                       |
| `PUT /users/me/email`     | `{ "newEmail", "currentPassword" }`    | `{ customer }`                       |
| `PUT /users/me/password`  | `{ "currentPassword", "newPassword" }` | `{ accessToken, customer }` + cookie |

- **Profile:** at least one of `name` (2–120 characters) and `phone` (6–30); `phone: null` or an
  empty string removes it. Email and password are rejected here; they have their own endpoints.
- **Email:** stored trimmed and lowercase. Requires the current password. The address must not
  belong to any other account, regardless of case (`409 EMAIL_TAKEN`); the current email is a
  validation error. Other sessions stay signed in. The change applies immediately: there is no
  verification email yet.
- **Password:** requires the current password; the new one is 8–128 characters and must differ.
  Changing it **signs out every other session and device**; this one gets a new token and cookie.
- A wrong current password is `400 INVALID_CURRENT_PASSWORD` with a `currentPassword` field
  detail (not `401`, so clients show it on the form instead of signing out).
- Each change is one conditional `UPDATE` that also requires the password hash that was just
  verified, so of two simultaneous changes only one wins; the other gets `409 CREDENTIALS_CHANGED`
  (or `INVALID_CURRENT_PASSWORD`). Simultaneous requests for the same new email give it to one
  account only.

### Dining tables

- **Customers** call `GET /tables` (no login) to pick a table for dine-in. It lists active tables in
  natural label order (T2 before T10) with an `orderable` flag; the internal floor status is not
  exposed. A table is orderable when it is **active** and **FREE or OCCUPIED**: a free table the
  customer sits down at, or one staff already seated them at. Reserved, cleaning, and
  bill-requested tables cannot be chosen.
- **Staff status changes** follow the floor flow; repeating the current status is a no-op:

  | From             | Allowed to                           |
  | ---------------- | ------------------------------------ |
  | `FREE`           | `OCCUPIED`, `RESERVED`, `CLEANING`   |
  | `RESERVED`       | `OCCUPIED`, `FREE`                   |
  | `OCCUPIED`       | `BILL_REQUESTED`, `CLEANING`, `FREE` |
  | `BILL_REQUESTED` | `OCCUPIED`, `CLEANING`, `FREE`       |
  | `CLEANING`       | `FREE`                               |

- **Layout:** labels are unique regardless of case (`t4` = `T4`). Only a FREE table can be taken
  out of service (`active: false`); inactive tables are hidden from customers and cannot change
  status. Only FREE tables without order or payment history can be deleted; deactivate the others so their
  history is kept.
- **Errors:** `TABLE_NOT_FOUND` (404), `TABLE_LABEL_TAKEN`, `TABLE_IN_USE`, `TABLE_INACTIVE`,
  `INVALID_STATUS_TRANSITION` (409), and `VALIDATION_ERROR` (400).
- Every write is one SQL statement with its rule in the `WHERE` clause, like the cart.

### Checkout and orders

Checkout is **one request**: `POST /orders` pays for the cart with the **dummy payment provider**
and places the order. The checkout page flow is:

1. **Choose the delivery mode.**
   - **Dine-in:** show the tables from `GET /tables` and let the customer pick an `orderable` one.
   - **Takeaway:** no table; the customer only provides the payment.
2. **Show the total** from `GET /payments/quote?tipCents=300`: lines, `subtotalCents`, `taxCents`,
   `tipCents`, `totalCents`. Menu prices are tax-exclusive; tax uses each item's internal
   `taxRate`, rounded half-up per line.
3. **Pay and place the order:** `POST /orders` with an `Idempotency-Key` header (a new UUID per
   checkout; reuse it when retrying):

   ```json
   {
     "orderType": "TAKEAWAY",
     "method": "CARD",
     "paymentToken": "tok_visa",
     "expectedTotalCents": 3130
   }
   ```

   ```json
   {
     "orderType": "DINE_IN",
     "tableId": 4,
     "method": "CARD",
     "paymentToken": "tok_visa",
     "tipCents": 300,
     "expectedTotalCents": 3430
   }
   ```

   `201` returns the placed order (same shape as `GET /orders/:id`).

What happens on success, in **one atomic transaction**: the payment is marked `SUCCEEDED`, the
order and its items are created from the payment's snapshot of the cart, the payment is linked to
the order, the ordered quantities are removed from the cart (items added in another tab stay), and
a FREE dine-in table becomes OCCUPIED. A payment can never succeed without its order.

| Order    | Starts as | Items start as                | Extra                                          |
| -------- | --------- | ----------------------------- | ---------------------------------------------- |
| Dine-in  | `SENT`    | `FIRED` (sent to the kitchen) | table `{ id, label }`                          |
| Takeaway | `PLACED`  | `PENDING` (awaits acceptance) | 4-digit `pickupCode`; `pickupTime` null (ASAP) |

Orders get a number like `DG-00042`. Items keep the name and price that were paid, so the
customer's history does not change when the menu does.

**Customer panel:** `GET /orders` lists the customer's orders newest first (`page`, `pageSize`)
with number, type, status, table or pickup code, item count, and total. `GET /orders/:id` adds
the items, subtotal, tax, tip, and payments. Other customers' orders return `404 ORDER_NOT_FOUND`.

**Safety rules**

- **Server-side amounts:** the client never sends an amount. It sends `expectedTotalCents` (the
  quote it showed); a different server total returns `409 TOTAL_CHANGED` with the new quote.
- **Idempotency:** retrying with the same key returns the same order instead of charging again.
  Reusing a key for a different request returns `IDEMPOTENCY_KEY_REUSED`. Keys are per customer.
- **No double orders:** a partial unique index allows one checkout in progress per customer, so
  simultaneous submits place one order; the others get `409 PAYMENT_IN_PROGRESS`.
- **Checkout rules:** `CART_EMPTY`, `CART_HAS_UNAVAILABLE_ITEMS` (409); a dine-in table must exist
  and be orderable (`404 TABLE_NOT_FOUND`, `409 TABLE_NOT_AVAILABLE`). Dine-in without a table or
  takeaway with one is a `400 VALIDATION_ERROR` with a plain message.
- **Declines** place no order and keep the cart: `402 PAYMENT_DECLINED` with `paymentId` and
  `failureCode`. Retry with a new key.
- **Provider outage:** a provider that cannot be reached throws `PaymentProviderUnavailableError`.
  The API records the payment as `FAILED` (`provider_error`), answers `502 PAYMENT_PROVIDER_ERROR`,
  logs one line (`Payment 12 not charged: payment provider "simulated" is unavailable …`), and
  keeps serving; retrying with the same key replays the 502 without a second charge. Any other
  error from a provider is treated as a bug: also recorded as `FAILED`, logged with its stack.
- **Restart recovery:** on startup, a payment left `PENDING` by a restart mid-checkout is marked
  `FAILED` (`interrupted`; nothing was charged), and a `SUCCEEDED` payment without an order gets
  its order.
- Menu items, tables, and customers with orders or payments cannot be deleted (`RESTRICT`).

**Atomic writes:** the SQLite driver shares one connection across requests, so the code never
uses async TypeORM transactions. Single-statement writes are atomic on their own. Multi-table
writes (placing an order) use `runAtomically` (`common/database/atomic.ts`): a synchronous
better-sqlite3 transaction that no other request can interleave with, which waits if another
transaction is open. Customer registration saves with `{ transaction: false }` for the same reason.

### Staff order handling

Staff move customer orders along with `PATCH /staff/orders/:id/status` (`{ "status", "reason"? }`),
and read them with `GET /staff/orders` (newest first; `status=PLACED,ACCEPTED`, `type`, `page`,
`pageSize`) and `GET /staff/orders/:id` (items with their kitchen station and fire and ready times,
the customer, and the status reason). Every staff role may read; customers get `403`.

| Order type | Path                                                                                                 | Exits                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Dine-in    | `SENT` → `IN_PROGRESS` → `READY` → `SERVED` → `CLOSED` (SENT may skip to READY)                      | `SENT` or `IN_PROGRESS` → `CANCELLED`                                                                  |
| Takeaway   | `PLACED` → `ACCEPTED` → `PREPARING` → `READY_FOR_PICKUP` → `COLLECTED` (ACCEPTED may skip PREPARING) | `PLACED` → `REJECTED`; `PLACED`, `ACCEPTED`, `PREPARING` → `CANCELLED`; `READY_FOR_PICKUP` → `NO_SHOW` |

- **Who:** KITCHEN cooks (`IN_PROGRESS`, `READY`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`),
  WAITER serves dine-in (`SENT`, `SERVED`, `CLOSED`), CASHIER hands over takeaway (`ACCEPTED`,
  `COLLECTED`, `NO_SHOW`, `CLOSED`). Only ADMIN and MANAGER reject or cancel, and they may set any
  status. Otherwise `403 STATUS_NOT_ALLOWED_FOR_ROLE`.
- **Rules** live in `@dinego/shared` (`ORDER_STATUS_TRANSITIONS`, `ORDER_STATUS_SETTERS`). Moves
  the order cannot make, including leaving a final status, are `409 INVALID_STATUS_TRANSITION`;
  repeating the current status is a no-op.
- **Reasons:** `REJECTED` and `CANCELLED` need a `reason` (3–300 characters), shown to the
  customer and kept on the order (`statusReason`); `NO_SHOW` may have one; other statuses may not.
- **Items follow the order:** accepted or sent items are `FIRED`, then `PREPARING`, `READY` (with
  the ready time), and `SERVED`; rejected or cancelled orders void their items. The customer's
  order page shows them.
- Every order is paid at checkout, so dine-in goes from `SERVED` straight to `CLOSED`;
  `BILL_REQUESTED` and `PAID` are kept for unpaid orders taken at a till later. Refunds for stopped
  orders are not automated yet: the customer is asked to contact the restaurant.
- Each change is one synchronous transaction (order, items, notifications), so two staff acting at
  once never both win.

### Dummy payments only

DineGo takes **dummy payments only. No real money is charged**, no payment gateway SDK is
installed, and no network request is made. `PaymentsModule` binds the `PaymentProvider` port to
`SimulatedPaymentProvider`, which decides the outcome from a test token (listed in
`DUMMY_PAYMENT_TOKENS` in `@dinego/shared`, so the checkout page can offer them):

| `paymentToken`                                               | Result                             |
| ------------------------------------------------------------ | ---------------------------------- |
| `tok_visa`, `tok_mastercard`, `tok_amex`, `tok_wallet`       | approved                           |
| `tok_declined`, `tok_insufficient_funds`, `tok_expired_card` | declined (`402`)                   |
| `tok_provider_error`                                         | provider outage (`502`)            |
| anything else, including real card numbers                   | declined (`invalid_payment_token`) |

The API logs `Dummy payments: no real money is charged` at startup. Customers pay with `CARD` or
`ONLINE`; `CASH` is reserved for future staff/POS payments. The demo menu's `taxRate` is a `0`
placeholder, so demo quotes show no tax until real rates are set.

Request bodies are validated against shared Zod schemas; invalid payloads return `400` with a
`VALIDATION_ERROR` code and field-level details. Passwords are hashed with bcrypt, and admin
routes are guarded by role checks on the server.

### In-app notifications

Every account type (customers and all five staff roles) has an inbox. Notifications are created by
the API when something happens; clients only read them and mark them as read.

**Account notifications:**

| Type                  | When                              | Who receives it                    | Priority | Opens                       |
| --------------------- | --------------------------------- | ---------------------------------- | -------- | --------------------------- |
| `CUSTOMER_WELCOME`    | a customer registers              | that customer                      | NORMAL   | `/menu`                     |
| `CUSTOMER_REGISTERED` | a customer registers              | every active ADMIN and MANAGER     | LOW      | `/admin/customers`          |
| `EMAIL_CHANGED`       | a customer changes their email    | that customer (all their sessions) | HIGH     | `/account/profile#email`    |
| `PASSWORD_CHANGED`    | a customer changes their password | that customer (the session kept)   | HIGH     | `/account/profile#password` |

Profile edits (name, phone) and refused requests (wrong password, taken email, duplicate
registration) create no notification.

**Checkout and payment notifications** (order-status notifications come with staff order
handling):

| Type                      | When                                                     | Who receives it                                                                      | Priority | Opens                  |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- | ---------------------- |
| `ORDER_PLACED`            | a paid checkout becomes an order                         | that customer: table, or the pickup code, items, total, how it was paid              | NORMAL   | `/account/orders/{id}` |
| `ORDER_RECEIVED`          | a paid checkout becomes an order                         | dine-in: ADMIN, MANAGER, WAITER, KITCHEN; takeaway: ADMIN, MANAGER, CASHIER, KITCHEN | HIGH     | nothing yet            |
| `CHECKOUT_INTERRUPTED`    | a restart interrupted a checkout before the charge ended | that customer: nothing was charged and the cart is unchanged                         | HIGH     | `/checkout`            |
| `PAYMENT_PROVIDER_OUTAGE` | the payment provider fails a charge                      | ADMIN and MANAGER, at most once per clock hour each                                  | HIGH     | nothing yet            |

- Declined cards and provider errors create no customer notification: the checkout page shows them
  at once, and the cart is unchanged.
- Dine-in staff alerts say "the table is now occupied" only when the order seated a FREE table.
- Idempotent retries and simultaneous submits place one order and notify once; an order placed by
  restart recovery is notified like any other.
- Staff alerts open nothing yet (`link: null`) because staff order screens do not exist; they
  carry `entityType: "ORDER"`, `entityId`, and `data` (order number, type, table, pickup code,
  item count, total) for those screens.
- The checkout endpoints are unchanged: `POST /orders` returns the same `{ order }`, and the new
  notifications are read through the existing notifications API and shown by the existing bell.

**Order status notifications** (from `PATCH /staff/orders/:id/status`, see _Staff order handling_):

| Type                       | When the order becomes                   | Who receives it                                                          | Priority |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ | -------- |
| `ORDER_ACCEPTED`           | `ACCEPTED` (takeaway)                    | the customer, with the pickup code                                       | NORMAL   |
| `ORDER_READY`              | `READY` (dine-in), `READY_FOR_PICKUP`    | the customer: on its way to the table, or show the pickup code           | HIGH     |
| `ORDER_READY_FOR_SERVICE`  | `READY`, `READY_FOR_PICKUP`              | WAITER (dine-in) or CASHIER (takeaway): serve or hand it over            | HIGH     |
| `ORDER_COMPLETED`          | `COLLECTED`, `CLOSED`                    | the customer: thanks                                                     | LOW      |
| `ORDER_CANCELLED`          | `REJECTED`, `CANCELLED`, `NO_SHOW`       | the customer, with the reason and who to ask about the payment           | HIGH     |
| `ORDER_STOPPED`            | `REJECTED`, `CANCELLED` (`NO_SHOW`)      | ADMIN, MANAGER, KITCHEN, and WAITER or CASHIER (no-show: ADMIN, MANAGER) | HIGH     |
| `ORDER_ACCEPTANCE_OVERDUE` | still `PLACED` 10 minutes after checkout | ADMIN and MANAGER, once per order (checked every minute)                 | HIGH     |

- Kitchen steps (`IN_PROGRESS`, `PREPARING`, `SERVED`) notify nobody: the customer's order tracker
  shows them, and a notification for every step would be noise.
- The staff member who changes the status is never notified of it, and a repeated status (a
  double tap) notifies nobody again. Customer notifications open `/account/orders/{id}`.
- A status change and its notifications are one transaction, and, like checkout, a notification
  failure never blocks the change.
- The acceptance check only looks at orders from the last day, so an old order never alerts again
  after its notification expired.

**Floor notifications** (from the staff floor endpoints):

| Type                   | When                                                            | Who receives it    | Priority |
| ---------------------- | --------------------------------------------------------------- | ------------------ | -------- |
| `TABLE_BILL_REQUESTED` | a table's status becomes `BILL_REQUESTED`                       | CASHIER and WAITER | HIGH     |
| `TABLE_NEEDS_CLEANING` | a table's status becomes `CLEANING`                             | WAITER             | NORMAL   |
| `TABLE_LAYOUT_CHANGED` | a table is added, removed, or taken out of or back into service | ADMIN and MANAGER  | LOW      |

The person who made the change is never notified; repeated statuses, refused changes, and edits to
a table's label, seats, or zone notify nobody.

- **Reading:** `GET /notifications` lists the user's own notifications newest first, with `page`,
  `pageSize` (up to 50), `unread=true|false`, and `category` filters, plus the inbox's
  `unreadCount`. Each item has `type`, `category`, `priority`, `title`, `body`, `link` (a path
  inside the app), the record it is about (`entityType`, `entityId`), `read`, and `readAt`.
  `entityType` and `entityId` (sent together) list the notifications about one record, for
  example one order's updates: `?entityType=ORDER&entityId=42`.
- **Show more:** pass the oldest id already shown as `beforeId` (a cursor). Unlike page offsets, a
  cursor never skips or repeats items when notifications are deleted or arrive in between.
  `pagination.total` always counts every match, ignoring the cursor.
- **Polling:** clients poll `GET /notifications/unread-count` every 30 seconds while the page is
  visible (`NOTIFICATION_POLL_INTERVAL_MS`). It returns `unreadCount` and `latestId`, which changes
  when something new arrives.
- **Read on click:** clicking a notification (in a dropdown or a list) calls
  `PATCH /notifications/:id/read`. It is idempotent and keeps the first read time; another user's
  notification is `404 NOTIFICATION_NOT_FOUND`. `POST /notifications/read-all` with
  `{ "upToId": 14 }` marks everything the user has seen, so a notification that arrives at the same
  moment stays unread; an empty body marks everything.
- **Unread and delete:** `PATCH /notifications/:id/unread` puts a notification back in the unread
  count (idempotent). `DELETE /notifications/:id` removes it for good and returns the new
  `unreadCount`. Both are limited to the user's own notifications in the retention window
  (`404 NOTIFICATION_NOT_FOUND` otherwise).
- **Retention:** notifications are kept for **7 days** (`NOTIFICATION_RETENTION_DAYS`). Older ones
  are hidden immediately and deleted at startup and then every hour.
- **Recipients:** a notification is one row per recipient, so every user has their own read state.
  Role audiences (for example "every ADMIN and MANAGER") are resolved when the event happens, only
  active accounts are notified, and the person who caused an event is never notified of it.
- **Exactly once:** each event carries a dedupe key that is unique per recipient, so processing an
  event twice (a retry, a replay, restart recovery) never notifies anyone twice.
- **Never in the way:** account notifications and payment-provider alerts are written after the
  change is saved, in one atomic transaction of their own (`NotificationPublisher.publish`). Order
  notifications and interrupted-checkout notices are written inside the order's (or the recovery's)
  own `runAtomically` transaction with `NotificationPublisher.writeAlongside`, in a SAVEPOINT: they
  exist exactly when the order does, yet if writing them fails, only they are rolled back. Either
  way the error is logged and the user's request (registration, a paid order) still succeeds.
- **Adding a type:** add it to `NOTIFICATION_TYPES` in `@dinego/shared`, describe its category and
  priority in `NOTIFICATION_TYPE_META` (a compile error reminds you), add a builder to
  `notifications.catalog.ts`, and call the publisher from the feature. No migration is needed:
  `type` has no database CHECK, so new types never require rebuilding the table.

## Swagger / OpenAPI

The API ships with Swagger UI at <http://localhost:4000/api/docs>. The generated OpenAPI 3 document
is available at <http://localhost:4000/api/docs-json>.

- Endpoints are grouped by tag: Health, Users, Menu, Cart, Tables, Floor, Orders, and Payments.
- Request bodies and response schemas are documented with DTO classes.
- Swagger uses an **OAuth2 password flow** named `developer-login`.
- Click **Authorize**, enter your email in the username field and your password, and Swagger
  requests a JWT from `/api/v1/users/swagger-login`. Client ID and client secret can be left blank.
  Swagger then adds the token as a Bearer header automatically.
- Use an admin account to test admin endpoints, or a customer account to test customer endpoints.
- Swagger keeps the OAuth2 credentials in memory only; passwords are not persisted in
  `localStorage`.

The Swagger token endpoint is excluded from the public operation list. The API still accepts
HttpOnly cookies and manually supplied Bearer tokens for non-Swagger clients.

Swagger configuration lives in `apps/api/src/main.ts`; endpoint annotations live beside the
controllers, and documentation DTOs are in `users/dto/swagger.dto.ts` and
`health/dto/health.dto.ts`.

## API testing with Vitest

The API uses **Vitest 5** instead of Jest, with `unplugin-swc` for NestJS decorator metadata and
Supertest for HTTP e2e tests.

```bash
npm run test                 # unit tests through Turborepo
npm run test:e2e             # e2e tests in the API workspace

npm run test -w @dinego/api          # unit tests
npm run test:watch -w @dinego/api    # unit watch mode
```

Coverage generation is intentionally not configured. Tests do not create a `coverage/` directory.

- Unit tests: `apps/api/src/**/*.spec.ts`
- E2E tests: `apps/api/test/**/*.e2e-spec.ts`
- Unit config: `apps/api/vitest.config.ts`
- E2E config: `apps/api/vitest.config.e2e.ts`

The e2e suites create a temporary SQLite database, run migrations, seed data, and start the real
Nest application with `createE2eApp()` (`test/support/e2e-app.ts`), configured like `main.ts`.

**Server logs in e2e tests.** The app's logger is replaced by `ServerLogs`, which captures
instead of printing. After every test, any **error the API logged that the test did not expect
fails the test**, so an unhandled 500 or a failing background step can never pass silently. Tests
that trigger an expected error assert it explicitly, e.g. the payment provider outage:

```ts
logs.expectError(/Payment \d+ not charged: payment provider "simulated" is unavailable/);
```

`logs.expectWarning(...)` does the same for warnings (such as restart recovery). The test output
stays free of server log lines. The cart suite covers access rules, add/merge/change/remove, live prices, items
that become unavailable, both limits, validation, and concurrent requests. The account suite covers profile, email, and password changes, sessions signed out across
devices and endpoints, simultaneous changes, legacy tokens, and deactivated or re-roled staff.
The users suite verifies cookie login, admin access, logout, registration, and
Bearer auth. The menu suite adds fixtures (an inactive category, a sold-out item, a price tie, and
a literal `%`) and verifies visibility, search, filters, sorting, pagination, and validation.
The tables suite covers the public list, role access, layout rules, status transitions, and
validation. The orders suite covers dine-in and takeaway checkout, cart and table side effects,
table and cart rules, `TOTAL_CHANGED`, dummy declines and outages, idempotent and simultaneous
submits, the order list and details, restart recovery, atomic placement, and validation. The
payments suite covers quotes with tax and tip and the payment history. The notifications suite
covers access for every role, registration and account-change notifications (and none for refused
requests or profile edits), recipients by role, simultaneous registrations, read on click,
read-all up to an id, filters and paging, privacy between inboxes, validation, and the 7-day
retention window. The checkout notifications suite covers dine-in and takeaway orders and who is told about
them, reading them through the notifications API, declines, retries and double submits, the
hourly provider-outage alert, restart recovery, and a paid order going through even when
notifications cannot be written. The staff orders suite covers access, the staff order list and
details, both order lifecycles with their notifications and item statuses, rejecting, cancelling,
and no-shows with reasons, role rules, refused moves, repeated statuses, two staff acting at once,
validation, a status change going through when notifications cannot be written, the acceptance
alert, and the floor notifications.
The temporary database is removed afterward and never touches `apps/api/dinego.sqlite`.

## Linting

The monorepo uses **ESLint 10** with flat config:

- `eslint.config.mjs` — shared root configuration
- `typescript-eslint` — TypeScript rules for API, web, and shared
- `@next/eslint-plugin-next` — Next.js rules for the web app
- `eslint-plugin-react-hooks` — React hooks rules
- `eslint-config-prettier` — disables formatting rules handled by Prettier

```bash
npm run lint          # lint every workspace through Turborepo
npm run lint:fix      # apply fixes

npm run lint -w @dinego/api
npm run lint -w @dinego/web
npm run lint -w @dinego/shared
```

Generated folders (`dist`, `.next`, `.turbo`), `.tsbuildinfo` files, and the SQLite database are
ignored. TypeScript incremental output is disabled for the web app.

## Session cookies

Login and registration return the access token and also set it in an HttpOnly cookie named
`dinego_access_token`. The JWT guard accepts either the cookie or an `Authorization: Bearer` header,
so browser sessions work without exposing the token to JavaScript while API clients can still use
Bearer auth.

Besides the signature, the guard checks the account on every request, so these take effect
immediately instead of when the 7-day token expires:

- **Deactivated or deleted accounts** are signed out.
- **Session versioning:** each token carries the account's `token_version` as `ver`. Changing
  the password increments it, which signs out every token issued before. Tokens without `ver`
  (issued before versioning) count as version 0.
- **Roles** come from the database, so a staff role change applies at once. A customer token for
  an account that is no longer a customer (or the reverse) is rejected.

Cookie options:

| Variable           | Default                    | Purpose                       |
| ------------------ | -------------------------- | ----------------------------- |
| `COOKIE_SECURE`    | `false` outside production | Send cookie only over HTTPS   |
| `COOKIE_SAME_SITE` | `lax`                      | `lax`, `strict`, or `none`    |
| `COOKIE_DOMAIN`    | unset                      | Optional shared cookie domain |

The browser frontend calls the API with `credentials: "include"`. For a production frontend on a
different site, use `COOKIE_SAME_SITE=none` together with HTTPS (`COOKIE_SECURE=true`). In that
cross-site deployment, add CSRF protection because the browser sends the cookie automatically.

## Web pages

- `/` — editorial landing page: hero with a printed "house card" (today's services, address,
  directions), a dish ticker, live chef's picks with **Add** buttons, story, ways to eat, and
  visit details with today's opening hours highlighted
- `/menu` — live menu from the public menu API: search, category and dietary filters, price
  ranges, sorting, sold-out handling, and shareable filter URLs (`/menu?tags=vegan&sort=price_asc`);
  every dish has an **Add** button that turns into a quantity stepper once it is in the cart
- `/register` — customer account creation with the shared public header/footer
- `/login` — one login page for customers and restaurant staff, with a Register link and a
  show/hide password control
- `/checkout` — checkout: dine in (choose a table) or take away (payment only), tip, dummy
  payment, and the bill; placing the order forwards to the order panel
- `/account` — customer panel overview: greeting, order stats, the order in progress, recent
  orders, and shortcuts to the profile sections
- `/account/orders` — the customer's orders, newest first
- `/account/notifications` — the customer's notifications: all, unread, or read, grouped by day,
  with open, mark as read or unread, delete, and mark all as read
- `/account/orders/[id]` — order details: progress, pickup code or table, items, totals, payment;
  `?placed=1` shows the thank-you state after checkout
- `/account/profile` — personal details (name, phone), sign-in email, and password, each viewed
  and changed on its own; `/account/security` redirects to `/account/profile#password`
- `/admin` — protected admin overview
- `/admin/login` — legacy route that redirects to `/login?next=/admin`
- `/admin/users` — staff accounts with search and role filter
- `/admin/customers` — customer accounts with search
- `/admin/notifications` — the signed-in ADMIN or MANAGER's notifications: filter, read/unread,
  delete, mark all as read
- `/admin/settings` — restaurant profile, admin account, and appearance
- `/staff/kitchen` — kitchen board (KITCHEN)
- `/staff/waiter` and `/staff/waiter/tables` — service board and the floor (WAITER)
- `/staff/cashier` — takeaway pickup counter (CASHIER)
- `/staff/notifications` — the signed-in kitchen, waiter, or cashier's notifications

The navbar links are restaurant-focused: **Menu**, **Our Story**, and **Visit Us**. The only public
auth action is **Login**; there are no public Register or Admin links. Registration is reachable
from a link on the login page. Protected pages pass a `next` query parameter so the user returns to
the page they originally tried to open after signing in.

The admin console has no public link. Going directly to `/admin` while signed out redirects to
`/login?next=/admin`, and a successful staff login returns to the requested admin page. The same
login form sends customers to `/account`, ADMIN and MANAGER to `/admin`, and KITCHEN, WAITER, and
CASHIER to their own dashboard (`/staff/kitchen`, `/staff/waiter`, `/staff/cashier`). Where each
account lands is defined once, in `apps/web/src/lib/dashboards.ts`, and is also used by the
header's **Dashboard** link and by the redirects of the customer panel and the admin console.

The header supports light and dark themes with a persisted switch, and signed-in users get an
avatar dropdown with only a role-aware **Dashboard** link and **Logout**.

Admin pages and the staff dashboards use one full-viewport console shell
(`components/console/console-shell.tsx`), configured per console (pages, labels, bell text):

- Full-height, full-width layout with no public max-width container.
- Collapsible left sidebar — icons and labels when expanded, icon-only with hover tooltips when collapsed.
- Sidebar state is persisted in `localStorage`.
- Mobile and tablet drawer navigation with backdrop and scroll lock.
- Top bar with theme switch, **Visit website** (admin only; opens in a new tab), the notification
  bell, and the avatar dropdown.
- Admin dropdown contains **Dashboard** and **Logout**.
- Verified with no horizontal overflow from 320px through 1920px widths.

The menu page calls the live API through `apps/web/src/lib/menu.ts`: responses are validated
against the shared Zod contracts, typing in the search box is debounced and stale requests are
aborted, filters are kept in the URL so views are shareable, and the page has skeleton, empty,
sold-out, and error-with-retry states. The filter toolbar scrolls with the page. The home page's
chef's picks also come from the API; there is no static copy of the menu in the web app.

### Design system

- **Editorial, low-shadow styling:** hairline rules and tonal surfaces instead of boxed cards and
  drop shadows. Page content uses no shadows; one soft `shadow-overlay` is reserved for floating
  layers (toasts and the account menu).
- **Selection vs. action:** selected filter chips are ink (`bg-fg`); brand orange is reserved for
  actions such as **Add** and primary buttons.
- **Tokens** live in `apps/web/src/app/globals.css`, including `inverse-*` colours for the deep
  story panel and footer, `paper` plus the `bg-grain` texture for the house card, and the
  reduced-motion-aware dish ticker.
- **Restaurant details** (address, phone, email, hours, services) come from one file,
  `apps/web/src/lib/restaurant.ts`, used by the home page, menu page, and footer.
- The footer is shared by every public page: a closing call to action, visit details, hours,
  links, and a large wordmark. Below `lg`, the header shows a compact navigation row.

### Cart drawer

The header has a cart button with a live item count on every public page. It opens a slide-over
cart drawer (full width on phones) with each dish, its allergens, a quantity stepper, remove, and
the subtotal. The cart lives in `components/cart/` and talks to the cart API through
`lib/cart.ts`.

- **Signed out:** pressing **Add** remembers the dish, sends the visitor to
  `/login?next=<current menu URL>`, and adds the dish automatically after they sign in.
- **Staff accounts** have no cart, so the cart button and Add buttons are hidden.
- **Instant feedback:** changes are applied optimistically and sent to the API one at a time in
  click order; the server's cart replaces the optimistic state when the queue is idle, and any
  rejected change (for example a sold-out item) is rolled back with a short message.
- Items that sell out after being added are flagged in the drawer, excluded from the subtotal,
  and can only be lowered or removed.
- Accessible: dialog semantics, focus trap, Escape to close, scroll lock, and focus returned to
  the cart button; removing a line keeps focus inside the list.
- **Checkout** opens `/checkout`. It is disabled, with the reason shown, while the cart holds items
  that sold out, because checkout would refuse them.

### Checkout page

`/checkout` is for signed-in customers (guests go to `/login?next=/checkout`; staff see a note).
It is built from numbered editorial steps beside a printed bill:

1. **How would you like to eat?** Dine in or take away.
2. **Dine in:** choose the table you are sitting at (`GET /tables`, grouped by zone; unavailable
   tables are disabled). **Take away:** no table, just pay and collect with a pickup code.
3. **Tip:** none, 10%, 15%, or 20% of the subtotal.
4. **Payment (test mode):** card or online wallet, then a test option whose outcome is shown up
   front (approves, declines, fails). Options come from `DUMMY_PAYMENT_TOKENS`; no card details
   are collected and no real money is charged.

The bill shows the lines, subtotal, tax, tip, and total from `GET /payments/quote`, refreshed when
the cart (edited in the drawer) or the tip changes. **Pay · Place order** sends `POST /orders`
with the quoted total and an `Idempotency-Key`:

- The key is reused only to retry the exact same request after a network failure, so a lost
  response never places a second order; any definite answer, or a changed request, gets a new key.
- Errors are explained next to the button: a declined test card, prices that changed (the new
  total is fetched), a table that was just taken (tables reload and the choice is cleared),
  sold-out items (review the cart), or an ended session (sign in again).
- On success the cart is refreshed (the API removed the ordered items) and the customer is
  forwarded to `/account/orders/{id}?placed=1`.

Checkout notifications on the page:

- **Order placed:** the API notifies the customer in the same request, so on success the page
  asks the header bell to check right away (`refresh()` on the notifications provider) instead of
  waiting for the 30-second poll. The new "Order DG-… is placed" notification, with the table or
  pickup code, appears in the bell as the customer arrives on their order.
- **Interrupted checkout:** when a restart interrupted an earlier checkout, the page shows the
  customer's unread `CHECKOUT_INTERRUPTED` notification at the top (nothing was charged, the cart
  is unchanged), with its own text and time, and a count of any earlier ones. **Got it** marks them
  as read, which also clears them from the bell; reading one from the bell hides it here. It
  appears without a reload if it arrives while the page is open, and shows on the empty-cart
  screen too. Staff and guests never see it.
- Declines and provider errors stay on the page next to the button and create no notification.

### Customer panel

Every `/account` page shares one layout (`components/account/account-shell.tsx`) in the site's
editorial style: no cards or shadows, hairline rules, serif headings, ink for the active
navigation item, and brand orange only for actions.

- **Navigation:** a sticky side rail on large screens (initials, name, email, Overview, Orders,
  Notifications with the unread count, Profile, Order from the menu, Sign out) and ink-selected
  tabs on phones.
- **Access:** the shell loads the account once and shares it with every page; guests are sent to
  `/login?next=…` and staff to their own dashboard.
- **Overview:** hairline stats (orders, member since, last order), the order in progress with its
  tracker and pickup-code or table card, or an inverse "Hungry again?" band, then recent orders
  and shortcuts to the profile sections.
- **Profile:** three sections, each with the explanation beside it and its own endpoint:
  **Personal details** (name, phone), **Email address** (needs the current password), and
  **Password** (current, new, confirm; signs out other devices). Each shows its current values
  read-only with one action (**Edit details**, **Change email**, **Change password**) that opens
  the form in place. Forms validate with the shared schemas before sending, show server errors
  such as a wrong password or a taken email on the matching field, close with **Cancel** or
  Escape, and confirm success in the view. Focus moves into the form and back to the action. The
  header and side rail update immediately after a name or email change. Sections have anchors
  (`#details`, `#email`, `#password`) used by the overview shortcuts.
- Form fields name only the field in their `<label>`; hints and errors are linked with
  `aria-describedby`.

### Order panel

`/account/orders` lists orders with number, date, dine-in table or pickup code, item count, status,
and total, with **Show more** paging. `/account/orders/{id}` shows a progress tracker for the order
type (dine in: sent, prepared, ready, served; takeaway: placed, accepted, prepared, ready,
collected), the pickup code or table on a paper card, the items with their kitchen status, the
totals, and the test payment. In-progress orders refresh every 20 seconds while the page is
visible. Status badges are neutral: brand orange stays reserved for actions. The header menu has a
**My orders** link, and the dashboard shows the order count and recent orders.

Order changes made by staff reach the customer panel through their notifications:

- **Updates:** each order page has an **Updates** timeline built from that order's notifications
  (placed, accepted, ready, completed, or declined/cancelled/not collected), oldest first, with
  their time. Unread ones have a dot and **Mark as read**, which also updates the bell.
- **Live:** when a notification arrives, the order page, the order list (newest page merged in
  place, keeping orders loaded with **Show more**), and the overview's **Happening now** reload, so
  statuses change without a refresh. The timeline also reloads whenever the order itself changes.
- **Stopped orders:** a declined, cancelled, or not-collected order shows why (`statusReason` from
  `GET /orders/:id`), what was paid, and how to reach the restaurant about a refund (phone and
  email links); the pickup-code or table card is hidden, since there is nothing to collect.
- **Toast:** important order updates that arrive while the customer browses (ready, ready for
  pickup, declined, cancelled, not collected: HIGH priority) show a card below the bell with
  **View order**, which opens the order and marks the update as read; dismissing leaves it unread.
  It hides after 12 seconds (not while hovered or focused), never shows notifications the customer
  already had when the page loaded, and stays quiet on that order's own page.

The auth forms call the live API through `apps/web/src/lib/auth-client.ts`. Login and registration
store the JWT in the HttpOnly session cookie and redirect to a safe `next` target when present,
otherwise to the dashboard. API validation errors are mapped back onto the matching form fields.
API requests use `credentials: "include"`, and the header listens for auth changes so the account
menu updates immediately. The admin console re-checks the role on the server through
`GET /users/me`.

Customer and staff sessions share one browser cookie, so signing in as an admin replaces a customer
session in that browser. Logging out calls `POST /users/logout` and clears the cookie.

### Notifications

Signed-in customers get a **bell** in the header, between the cart and the account menu, and a
**Notifications** page in the customer panel. In the admin console, ADMIN and MANAGER accounts get
the same bell in the top bar, beside the avatar dropdown, and a **Notifications** page
(`/admin/notifications`). Kitchen, waiter, and cashier accounts get them in their dashboards
(`/staff/notifications`; see [Staff dashboards](#staff-dashboards)). Guests see no bell, and staff
see none on the public site.

- **Badge:** the unread count (99+ above 99), refreshed every 30 seconds while the page is visible
  and as soon as it becomes visible again. New arrivals are announced to screen readers.
- **Dropdown:** the 8 newest notifications with an unread dot, **Mark all as read**, a per-item
  check that marks one as read, and **View all notifications**. Clicking a notification marks it
  as read and opens its link (for example the profile's email section). Escape or a click outside
  closes it; on phones it spans the screen just below the header.
- **Page** (`/account/notifications`): **All**, **Unread**, and **Read** filters, combined with
  topics (**Everything**, **Orders**, **Payments**, **Account**; the topic chips scroll sideways on
  phones); notifications grouped by day (Today, Yesterday, weekday, date); each row opens its link
  and can be marked as read or unread, or deleted; **Mark all as read**; and **Show more** paging
  with a cursor. Deleting keeps keyboard focus in the list.
- **One state for every view:** `components/notifications/notifications-provider.tsx` holds the
  count and the dropdown's items. Actions update the bell, the side rail, the dropdown, and the
  page at once, reach the server one at a time in click order, and on failure show a message and
  reload from the server, so no view shows a change that did not happen. API calls and date
  formatting live in `apps/web/src/lib/notifications.ts`; responses are validated against the
  shared contracts, and only links inside the app are followed.

**Admin console.** The admin panel reuses the same components with its own inbox:

- **One provider per inbox:** `NotificationsProvider` takes an `audience`. The public site
  mounts it for customers (the default) and the admin layout mounts it for staff
  (`audience="staff"`), inside `AdminProvider`, so it only starts once an ADMIN or MANAGER session
  is confirmed. The API is the same (`/notifications`): every account has its own inbox.
- **Bell:** `NotificationBell` with `viewAllHref="/admin/notifications"`; the same badge, polling,
  dropdown, and actions as the customer bell.
- **Sidebar:** a **Notifications** item with the unread count (a dot when the sidebar is
  collapsed), kept in sync with the bell and the page.
- **Page:** `components/notifications/notification-inbox.tsx` is the notifications page body
  shared by both panels (filters, topics, day groups, rows, paging, live arrivals). Each panel
  supplies its header, topics, and empty-state text. Admin topics are **Orders**, **Payments**,
  **Tables**, and **Accounts**, matching what ADMIN and MANAGER are notified about: new, declined,
  cancelled, or overdue orders, payment provider outages, table layout changes, and new customer
  accounts (which open `/admin/customers`).

### Staff dashboards

Every order is paid at checkout, then moves through `ORDER_STATUS_TRANSITIONS`; the API only lets
the roles in `ORDER_STATUS_SETTERS` make each move. Following an order from placement to the guest
shows which staff need a screen:

| Mode     | Step                                                    | Who                        |
| -------- | ------------------------------------------------------- | -------------------------- |
| Dine-in  | checkout: `SENT`, the table becomes `OCCUPIED`          | automatic                  |
|          | `SENT → IN_PROGRESS → READY` (cook)                     | **KITCHEN**                |
|          | `READY → SERVED → CLOSED` (serve, close)                | **WAITER**                 |
|          | table `OCCUPIED → CLEANING → FREE` (next guests)        | **WAITER**                 |
| Takeaway | checkout: `PLACED`                                      | automatic                  |
|          | `PLACED → ACCEPTED`                                     | **KITCHEN** or **CASHIER** |
|          | `ACCEPTED → PREPARING → READY_FOR_PICKUP` (cook)        | **KITCHEN**                |
|          | `READY_FOR_PICKUP → COLLECTED` or `NO_SHOW` (hand over) | **CASHIER** only           |

ADMIN and MANAGER may make any move and are the only ones who reject or cancel; they use the admin
console. So three roles get a dashboard. Each sees only its own (any other `/staff` page sends
them home, and `/admin` and `/account` send them to it):

- **Kitchen board** (`/staff/kitchen`): every order the kitchen cooks, oldest first, in **To
  start** (new dine-in orders; takeaway orders to accept or start), **Cooking**, and **Ready**
  (waiting for the waiter or the customer). One tap per step: _Accept order_, _Start cooking_,
  _Ready to serve_ or _Ready for pickup_. Filters by order type and by **station** (Grill, Cold,
  Bar, Dessert, Other, from the menu); a station shows only its items, and the chip counts the
  items it still has to cook.
- **Service board** (`/staff/waiter`): dine-in orders **In the kitchen**, **Ready to serve**
  (_Mark served_), and **Served** (_Close order_). Closing a table's last open order offers to mark
  the table for cleaning.
- **Tables** (`/staff/waiter/tables`): the floor by zone with each table's status and open orders:
  _Seat guests_, _Mark for cleaning_ (only once its orders are closed), _Ready for guests_, and
  _Release_ a reservation.
- **Pickup counter** (`/staff/cashier`): takeaway orders **New** (_Accept order_), **In the
  kitchen**, and **Ready for pickup**. _Hand over_ asks the cashier to check the customer's pickup
  code first; _No-show_ takes an optional reason for the customer. A search finds orders by pickup
  code (codes are 4 digits and not unique, so every match is shown).

The dashboards' API (`src/staff/`) serves each screen in one request; changes still go through
the existing endpoints, which enforce the same rules:

- **`GET /staff/board`** (every staff role; `?type=DINE_IN|TAKEAWAY` narrows it): the orders on
  the caller's board, oldest first, with items, table or pickup code, and customer. Which orders:
  `STAFF_BOARD_SCOPES` (kitchen: both modes from new to ready; waiter: dine-in until served;
  cashier: takeaway until pickup; admin and manager: every order still in service). Each order has
  **`actions`**: the statuses the caller may move it to now (`orderActionsFor`: the type's
  transitions that the role may set), the usual next step first. Send one to
  `PATCH /staff/orders/:id/status`. At most 200 orders (`hasMore` says when there are more).
- **`GET /staff/floor`** (ADMIN, MANAGER, WAITER, CASHIER): every table in floor-plan order with
  its **`openOrders`** (dine-in orders still being served there) and **`actions`**
  (`tableActionsFor`: the table transitions, none out of service, and no `CLEANING` or `FREE`
  while it has open orders). Send one to `PATCH /floor/tables/:id/status`.

The rules are data and functions in `@dinego/shared`, so the screens show what the server allows
instead of repeating it: a board only groups orders into columns and labels the buttons.

How they work:

- **Live:** each board reloads every 15 seconds while visible, as soon as the page becomes visible,
  and when a notification arrives: one request (`GET /staff/board` or `GET /staff/floor`), however
  many orders there are. After a change the board reloads, and only the latest load is shown, so
  an older answer never undoes a change.
- **Conflicts:** if someone else moved the order first (`INVALID_STATUS_TRANSITION`), the board
  says so and reloads; nothing is changed twice.
- **Notifications:** the same bell, sidebar count, and inbox as the admin console, with topics for
  what the role receives (kitchen: orders; waiter and cashier: orders and tables). Staff order
  notifications have no link of their own, so the dashboards open the order on the role's board
  (`?order=<id>`: the board reloads, scrolls to it, and highlights it) and waiters' table
  notifications open the table. Stopped orders only inform: they have left every board.
- **Layout:** three columns from 1024px (collapse the sidebar on tablets for wider tickets),
  stacked on phones; large touch targets; a ticket waiting over 15 minutes (to be cooked or
  handed over) shows its timer in red.

## Seed data

`npm run db:seed` seeds:

- 5 staff accounts: admin, manager, waiter, cashier, kitchen
- 2 customer accounts stored with the `CUSTOMER` role
- bcrypt password hashes and staff PIN hashes
- the demo menu: 4 categories and 17 items, matching the web app's static menu
- the demo floor: 8 tables (T1–T8) with 48 seats in the Window, Main floor, and Chef's table zones
- a **demo service** (`demo-service.seed.ts`): the restaurant mid-service, so the staff dashboards
  and the customer panel have real data. 13 orders from the two demo customers fill every column
  of the kitchen, service, and pickup boards: dine-in orders just sent, cooking (one over 15
  minutes, so late), ready, and served; takeaway orders new, accepted, cooking, and ready for
  pickup; and some history (a closed dine-in order, a collected and a not-collected takeaway
  order). The floor has occupied tables, one reserved (T4), one to clean (T6), and one free (T8).
  Every order goes through the real services: added to the cart, paid with the dummy provider,
  placed (payment, pickup code, items, table, notifications), then moved on by the staff role that
  does each step. Times are then set back so tickets show realistic waits. Each role's bell has
  the notifications it would have received; those about finished orders are already read.

The seed is idempotent: existing demo users are updated by email and menu rows by slug instead of
being duplicated. The demo service runs once: when demo orders exist (payment idempotency keys
starting with `seed-demo-`), it creates nothing, so re-seeding never duplicates orders or undoes
what the staff did. It also skips a customer whose cart has items, because checkout pays for the
whole cart. Times are relative to when the seed runs. To start the demo service again, delete
`apps/api/dinego.sqlite` and run `npm run db:seed`.

Demo menu caveats: `allergens` are illustrative values inferred from dish descriptions and must be
confirmed by the kitchen before being shown to customers, and `taxRate` is seeded as a `0`
placeholder.

## Next steps

1. Add an orders page to the admin console for ADMIN and MANAGER (the only roles that reject or
   cancel orders), then refunds, menu admin, inventory, and reports.
2. Bring the login and register pages in line with the low-shadow design of the customer panel.
3. Add refresh tokens and PIN login for staff devices.
4. Build takeaway pickup slots and order tracking inside their feature modules.
5. Add the Socket.IO gateway so the staff boards and customer tracking update instantly instead
   of polling.
