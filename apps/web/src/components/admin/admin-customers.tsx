"use client";

import { useMemo, useState } from "react";
import { useAdmin } from "./admin-provider";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function AdminCustomers() {
  const { customers, refresh } = useAdmin();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle === "") {
      return customers;
    }

    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(needle) ||
        (customer.email ?? "").toLowerCase().includes(needle) ||
        (customer.phone ?? "").toLowerCase().includes(needle),
    );
  }, [customers, query]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-soft">
            Audience
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">Customers</h1>
          <p className="mt-1 text-sm text-muted">
            {customers.length} accounts registered from the public site.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-fg transition hover:border-brand/50 disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <section className="rounded-3xl border border-line bg-surface/70">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-ink/50 px-3 py-2">
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customers by name, email, or phone"
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted/60"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.16em] text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Phone</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 place-items-center rounded-lg bg-brand/10 text-[11px] font-bold text-brand-soft">
                        {customer.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-medium text-fg">{customer.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{customer.email ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{customer.phone ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-ok">
                      <span className="size-1.5 rounded-full bg-ok" />
                      Active
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {dateFormat.format(new Date(customer.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No customers match this search.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted">
          <span>
            Showing {filtered.length} of {customers.length}
          </span>
          <span>GET /api/v1/users/customers</span>
        </div>
      </section>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
