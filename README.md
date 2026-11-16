# DineGo

**Eat in. Take away. One flow.**

DineGo is a restaurant management system with two customer journeys — dine-in and takeaway — that share one menu, one kitchen, one payment system, and one report.

This repository is the Phase 1 foundation: a **npm workspaces + Turborepo** monorepo with a NestJS + TypeORM + SQLite API, a Next.js + Tailwind web app, and a shared Zod contract package. The API currently implements only the **users** domain: registration, login, admin login, JWT cookie/Bearer sessions, and user/customer listing.

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
        app.module.ts        database + users + health modules
        database/
          data-source.ts      TypeORM connection + migration registry
          database.module.ts
          migrate.ts          CLI runner for pending migrations
          migrations/
            *-CreateUsers.ts  initial users table
          seeds/
            index.ts          seed runner
            users.seed.ts     one file for the only entity: User
        users/                the only feature module
          users.module.ts
          users.controller.ts
          users.service.ts
          users.mapper.ts
          auth-cookie.ts      HttpOnly JWT cookie helpers
          entities/
            user.entity.ts    the only TypeORM entity
          dto/
            swagger.dto.ts    OpenAPI request/response schemas
          guards/             JWT auth + role guard
          decorators/         @CurrentAuth, @Roles
          users.service.spec.ts  unit tests
        health/               GET /health
          dto/health.dto.ts   Swagger health response
        common/               Zod validation pipe
      test/                   Vitest e2e tests
      vitest.config.ts        Unit test config
      vitest.config.e2e.ts    E2E test config
    web/
      src/
        app/                  App Router pages
          fonts/              bundled DM Sans and Playfair Display files
          page.tsx            restaurant landing page
          menu/               static restaurant menu
          login/              shared login
          register/           customer registration
          account/            customer dashboard
          admin/login/        redirects to the shared /login page
          admin/(panel)/      protected admin dashboard
            page.tsx          /admin overview
            users/            /admin/users
            customers/        /admin/customers
            settings/         /admin/settings
        components/
          admin/              admin provider, shell, tables, settings
          app-shell.tsx       public layout + focused/admin routes
          site-header.tsx     public navigation
          auth-nav.tsx        customer/admin dropdown + logout
          auth-card.tsx       focused login/register card
          account-view.tsx    customer dashboard
          theme-toggle.tsx    light/dark switch
          form.tsx            form fields and submit button
        lib/                  API client, cookie auth, and static menu data
  packages/
    shared/                   @dinego/shared
      src/
        enums.ts              every domain enum
        entities.ts           every domain entity and its properties
        api.ts                auth, users, and health contracts
  eslint.config.mjs           root ESLint flat config
  turbo.json
```

Only three Nest modules exist: **database**, **users**, and **health**. There is one TypeORM entity, `users/entities/user.entity.ts`. Customers are users with the `CUSTOMER` role, so customer registration and login share the same table and entity as staff accounts.

## Shared domain model

`@dinego/shared` is the single source of truth for the full restaurant domain, even before each
Nest module exists. Entity schemas live in `packages/shared/src/entities.ts` and enums live in
`packages/shared/src/enums.ts`.

| Area             | Entities                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| Identity         | `User`, `Customer`                                                           |
| Menu             | `MenuCategory`, `MenuItem`, `ModifierGroup`, `Modifier`, `ItemModifierGroup` |
| Floor            | `DiningTable`                                                                |
| Orders           | `Order`, `OrderItem`, `OrderItemModifier`                                    |
| Payments         | `Payment`, `Refund`                                                          |
| Inventory        | `Ingredient`, `Recipe`, `StockMovement`                                      |
| Staff and system | `Shift`, `PickupSlot`, `AuditLog`                                            |

Conventions encoded in the schemas:

- IDs are positive integers.
- All money values are integer cents.
- Dates are ISO-8601 strings.
- Secrets such as `passwordHash` and `pinHash` are excluded from serialized entity contracts.
- Order, item, table, payment, and stock-movement states use the shared enum unions.

## Prerequisites

- Node.js 24.11 or newer
- npm 11 (`npm -v`)

## Quick start

```bash
# 1. Install all workspace dependencies
npm install

# 2. Create the users table with a migration
npm run db:migrate

# 3. Seed the demo users
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
GET  /api/v1/users                staff list, CUSTOMER role excluded (ADMIN or MANAGER)
GET  /api/v1/users/customers      customer list (ADMIN or MANAGER)
```

Request bodies are validated against shared Zod schemas; invalid payloads return `400` with a
`VALIDATION_ERROR` code and field-level details. Passwords are hashed with bcrypt, and admin
routes are guarded by role checks on the server.

## Swagger / OpenAPI

The API ships with Swagger UI at <http://localhost:4000/api/docs>. The generated OpenAPI 3 document
is available at <http://localhost:4000/api/docs-json>.

- Health and users endpoints are grouped by tag.
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

The e2e suite creates a temporary SQLite database, runs migrations, seeds users, starts the real
Nest application, and verifies cookie login, admin access, logout, registration, and Bearer auth.
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

- `/` — restaurant landing page with featured dishes, story, dining options, opening hours, and visit details
- `/menu` — static restaurant menu with categories, descriptions, prices, and dietary labels
- `/register` — customer account creation with the shared public header/footer
- `/login` — one login page for customers and restaurant staff, with a Register link and a
  show/hide password control
- `/account` — customer dashboard: overview, profile, and security
- `/admin` — protected admin overview
- `/admin/login` — legacy route that redirects to `/login?next=/admin`
- `/admin/users` — staff accounts with search and role filter
- `/admin/customers` — customer accounts with search
- `/admin/settings` — restaurant profile, admin account, and appearance

The navbar links are restaurant-focused: **Menu**, **Our Story**, and **Visit Us**. The only public
auth action is **Login**; there are no public Register or Admin links. Registration is reachable
from a link on the login page. Protected pages pass a `next` query parameter so the user returns to
the page they originally tried to open after signing in.

The admin console has no public link. Going directly to `/admin` while signed out redirects to
`/login?next=/admin`, and a successful staff login returns to the requested admin page. The same
login form sends customers to `/account` and staff to `/admin`.

The header supports light and dark themes with a persisted switch, and signed-in users get an
avatar dropdown with a role-aware **Dashboard** link and **Logout**.

Admin pages use a dedicated full-viewport console shell:

- Full-height, full-width layout with no public max-width container.
- Collapsible left sidebar — icons and labels when expanded, icon-only with hover tooltips when collapsed.
- Sidebar state is persisted in `localStorage`.
- Mobile and tablet drawer navigation with backdrop and scroll lock.
- Top bar with theme switch, **Visit website** (opens in a new tab), and the admin avatar dropdown.
- Admin dropdown contains **Dashboard** and **Logout**.
- Verified with no horizontal overflow from 320px through 1920px widths.

The auth forms call the live API through `apps/web/src/lib/auth-client.ts`. Login and registration
store the JWT in the HttpOnly session cookie and redirect to a safe `next` target when present,
otherwise to the dashboard. API validation errors are mapped back onto the matching form fields.
API requests use `credentials: "include"`, and the header listens for auth changes so the account
menu updates immediately. The admin console re-checks the role on the server through
`GET /users/me`.

Customer and staff sessions share one browser cookie, so signing in as an admin replaces a customer
session in that browser. Logging out calls `POST /users/logout` and clears the cookie.

## Seed data

`npm run db:seed` seeds the single `User` entity only:

- 5 staff accounts: admin, manager, waiter, cashier, kitchen
- 2 customer accounts stored with the `CUSTOMER` role
- bcrypt password hashes and staff PIN hashes

The seed is idempotent: existing demo users are updated by email instead of duplicated.

## Next steps

1. Add the remaining Nest modules (menu, orders, payments, inventory, reports) with their own entities.
2. Add refresh tokens and PIN login for staff devices.
3. Build takeaway ordering, pickup slots, and order tracking inside their feature modules.
4. Add the Socket.IO gateway for KDS and customer tracking.
