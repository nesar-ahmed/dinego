"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Customer } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import { fetchMe, logout } from "@/lib/auth-client";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const navItems = [
  { href: "#overview", label: "Overview" },
  { href: "#profile", label: "Profile" },
  { href: "#security", label: "Security" },
];

export function AccountView() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const session = await fetchMe();

        if (session.type !== "CUSTOMER") {
          router.replace("/admin");
          return;
        }

        if (active) {
          setCustomer(session.customer);
        }
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
          router.replace(`/login?next=${encodeURIComponent("/account")}`);
          return;
        }

        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not load your profile.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [router]);

  async function signOut() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="py-8">
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-2xl border border-line bg-surface/60"
            />
          ))}
        </div>
        <div className="mt-5 h-64 animate-pulse rounded-3xl border border-line bg-surface/50" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="py-12">
        <div className="rounded-2xl border border-danger/25 bg-danger/10 p-6 text-sm text-danger">
          <p className="font-medium">Your dashboard could not be loaded.</p>
          <p className="mt-1 opacity-80">{error ?? "Please sign in again."}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-4 rounded-xl border border-danger/30 px-4 py-2 text-xs font-semibold transition hover:border-danger/60"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-3xl border border-line bg-surface/70 p-4 shadow-premium">
            <div className="flex items-center gap-3 px-2 py-1">
              <span className="grid size-10 place-items-center rounded-xl bg-brand text-base font-black text-brand-ink">
                {customer.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-fg">{customer.name}</p>
                <p className="truncate text-[11px] text-muted">{customer.email}</p>
              </div>
            </div>

            <nav className="mt-5 space-y-1" aria-label="Account">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="block rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-fg"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="mt-5 rounded-2xl border border-line bg-ink/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Account status
              </p>
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-ok">
                <span className="size-1.5 rounded-full bg-ok" />
                Active customer
              </p>
            </div>

            <Link
              href="/"
              className="mt-3 block rounded-xl border border-line px-3 py-2 text-center text-xs font-semibold text-muted transition hover:border-line-strong hover:text-fg"
            >
              Back to site
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-2 w-full rounded-xl px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          <nav
            className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface/60 p-1.5 lg:hidden"
            aria-label="Account mobile"
          >
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-fg"
              >
                {item.label}
              </a>
            ))}
            <button
              type="button"
              onClick={() => void signOut()}
              className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-danger"
            >
              Sign out
            </button>
          </nav>

          <section
            id="overview"
            className="relative isolate scroll-mt-24 overflow-hidden rounded-3xl border border-line bg-surface/70 p-6 shadow-premium sm:p-7"
          >
            <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
            <div
              className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-brand/15 blur-[80px]"
              aria-hidden
            />
            <div className="relative flex flex-wrap items-center justify-between gap-5">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-ok/25 bg-ok/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ok">
                  <span className="size-1.5 rounded-full bg-ok" />
                  Customer dashboard
                </span>
                <h1 className="mt-4 text-3xl font-black tracking-tight text-fg sm:text-4xl">
                  Welcome back, {customer.name.split(" ")[0]}.
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                  Your DineGo account is active. Manage your profile and security here while the
                  ordering modules are being built.
                </p>
              </div>
              <Link
                href="/#features"
                className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:opacity-90"
              >
                Explore platform
              </Link>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Account" value="Active" hint="CUSTOMER role" tone="ok" />
            <Stat
              label="Member since"
              value={dateFormat.format(new Date(customer.createdAt))}
              hint={`ID #${customer.id}`}
            />
            <Stat label="Orders" value="0" hint="Ordering module next" />
            <Stat label="Theme" value="Adaptive" hint="Switch in the header" />
          </div>

          <section
            id="profile"
            className="scroll-mt-24 rounded-3xl border border-line bg-surface/70 p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold tracking-tight text-fg">Profile</h2>
                <p className="text-xs text-muted">
                  Loaded from <code className="text-fg">GET /api/v1/users/me</code>.
                </p>
              </div>
              <span className="rounded-full border border-ok/25 bg-ok/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ok">
                Verified session
              </span>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <Detail label="Full name" value={customer.name} />
              <Detail label="Email address" value={customer.email ?? "Not provided"} />
              <Detail label="Phone number" value={customer.phone ?? "Not provided"} />
              <Detail label="Customer ID" value={`#${customer.id}`} />
            </dl>
          </section>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <section
              id="security"
              className="scroll-mt-24 rounded-3xl border border-line bg-surface/70 p-5 sm:p-6"
            >
              <h2 className="font-semibold tracking-tight text-fg">Security</h2>
              <p className="text-xs text-muted">Your session is protected by a signed JWT.</p>

              <div className="mt-4 space-y-2">
                <SecurityRow label="Session type" value="Customer JWT" />
                <SecurityRow label="Storage" value="Browser localStorage" />
                <SecurityRow label="Password" value="bcrypt hashed" />
              </div>

              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-5 w-full rounded-xl border border-danger/30 px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/10"
              >
                Sign out of this device
              </button>
            </section>

            <section className="rounded-3xl border border-line bg-surface/70 p-5 sm:p-6">
              <h2 className="font-semibold tracking-tight text-fg">What is next</h2>
              <p className="mt-1 text-xs text-muted">
                These modules will appear in your dashboard as they ship.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Menu", "Takeaway orders", "Pickup slots", "Receipts", "Order tracking"].map(
                  (item) => (
                    <span
                      key={item}
                      className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-muted"
                    >
                      {item}
                    </span>
                  ),
                )}
              </div>
              <Link
                href="/"
                className="mt-5 inline-flex rounded-xl border border-line-strong px-4 py-2 text-xs font-semibold text-fg transition hover:border-brand/50"
              >
                Back to home
              </Link>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "ok";
}) {
  return (
    <article className="rounded-2xl border border-line bg-surface/70 p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={`mt-1 truncate text-xl font-bold ${tone === "ok" ? "text-ok" : "text-fg"}`}>
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted">{hint}</p>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-ink/40 p-4">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}

function SecurityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-ink/40 px-3.5 py-2.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  );
}
