"use client";

import Link from "next/link";
import { useAdmin } from "./admin-provider";
import { RoleBadge } from "./role-badge";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function AdminOverview() {
  const { admin, staff, customers } = useAdmin();
  const activeStaff = staff.filter((user) => user.active).length;
  const managerCount = staff.filter((user) => user.role === "MANAGER").length;

  return (
    <div className="space-y-5">
      <section className="relative isolate overflow-hidden rounded-3xl border border-line bg-surface/70 p-6 shadow-premium sm:p-7">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-brand/15 blur-[80px]"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-ok/25 bg-ok/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ok">
              <span className="size-1.5 rounded-full bg-ok" />
              Live users data
            </span>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-fg sm:text-4xl">
              Good to see you, {admin.name.split(" ")[0]}.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Here is the current state of the restaurant team and customer accounts. Everything on
              this page is loaded from the live API.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/users"
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:opacity-90"
            >
              Manage staff
            </Link>
            <Link
              href="/admin/customers"
              className="rounded-xl border border-line-strong px-4 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/50"
            >
              View customers
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Staff accounts" value={staff.length} hint={`${activeStaff} active`} />
        <StatCard label="Customers" value={customers.length} hint="Registered accounts" />
        <StatCard label="Managers" value={managerCount} hint="Admin + manager access" />
        <StatCard label="Your role" value={admin.role} hint={admin.email ?? ""} small />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-line bg-surface/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-semibold tracking-tight text-fg">Restaurant team</h2>
              <p className="text-xs text-muted">Staff accounts, excluding customer users.</p>
            </div>
            <Link
              href="/admin/users"
              className="text-xs font-semibold text-brand-soft hover:text-brand"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y divide-line">
            {staff.slice(0, 5).map((user) => (
              <div key={user.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-xs font-bold text-fg">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email ?? "No email"}</p>
                </div>
                <RoleBadge role={user.role} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-surface/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-semibold tracking-tight text-fg">Newest customers</h2>
              <p className="text-xs text-muted">Accounts with the CUSTOMER role.</p>
            </div>
            <Link
              href="/admin/customers"
              className="text-xs font-semibold text-brand-soft hover:text-brand"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y divide-line">
            {customers.slice(0, 5).map((customer) => (
              <div key={customer.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-9 place-items-center rounded-xl bg-brand/10 text-xs font-bold text-brand-soft">
                  {customer.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{customer.name}</p>
                  <p className="truncate text-xs text-muted">{customer.email ?? "No email"}</p>
                </div>
                <span className="hidden text-[11px] text-muted sm:block">
                  {dateFormat.format(new Date(customer.createdAt))}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickAction
          href="/admin/users"
          title="Staff management"
          body="Review roles, activity, and account status."
        />
        <QuickAction
          href="/admin/customers"
          title="Customer accounts"
          body="See every customer registered from the public site."
        />
        <QuickAction
          href="/admin/settings"
          title="Restaurant settings"
          body="Restaurant profile, appearance, and admin details."
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  small = false,
}: {
  label: string;
  value: number | string;
  hint: string;
  small?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-line bg-surface/70 p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={`mt-1 font-bold tabular-nums text-fg ${small ? "text-xl" : "text-3xl"}`}>
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted">{hint}</p>
    </article>
  );
}

function QuickAction({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-line bg-surface/60 p-5 transition hover:border-brand/35 hover:bg-surface"
    >
      <h3 className="font-semibold text-fg">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      <span className="mt-3 inline-block text-xs font-semibold text-brand-soft transition group-hover:text-brand">
        Open →
      </span>
    </Link>
  );
}
