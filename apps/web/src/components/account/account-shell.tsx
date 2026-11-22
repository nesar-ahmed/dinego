"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Customer } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import { fetchMe, logout } from "@/lib/auth-client";
import { dashboardPathForSession } from "@/lib/dashboards";
import { useNotifications } from "@/components/notifications/notifications-provider";

type AccountContextValue = {
  customer: Customer;
  /** Replace the customer after a profile or email change. */
  setCustomer: (customer: Customer) => void;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) throw new Error("useAccount must be used inside <AccountShell>");
  return context;
}

const NAV_ITEMS = [
  { href: "/account", label: "Overview", icon: OverviewIcon, exact: true },
  { href: "/account/orders", label: "Orders", icon: OrdersIcon },
  { href: "/account/notifications", label: "Notifications", icon: NotificationsIcon },
  { href: "/account/profile", label: "Profile", icon: ProfileIcon },
] as const;

const NOTIFICATIONS_HREF = "/account/notifications";

/** Unread count beside the Notifications link. Neutral: it is information, not an action. */
function UnreadBadge({ count, selected }: { count: number; selected?: boolean }) {
  if (count === 0) return null;

  return (
    <span
      className={`relative ml-auto rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums ${
        selected ? "bg-ink/15 text-ink" : "bg-surface-2 text-fg"
      }`}
    >
      <span className="sr-only">, </span>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * The customer panel: one layout for every /account page. Loads the signed-in customer once,
 * sends guests to login and staff to the admin console, and shares the customer with pages.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { unreadCount } = useNotifications();

  const load = useCallback(async () => {
    setError(null);
    try {
      const session = await fetchMe();

      if (session.type !== "CUSTOMER") {
        router.replace(dashboardPathForSession(session));
        return;
      }

      setCustomer(session.customer);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        router.replace(
          `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        );
        return;
      }
      setError(cause instanceof ApiError ? cause.message : "We couldn't load your account.");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async () => {
    await logout();
    router.replace("/");
    router.refresh();
  }, [router]);

  if (error) {
    return (
      <div className="border-t border-line-strong py-20 text-center">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-fg">
          Your account is taking a moment
        </h1>
        <p role="alert" className="mx-auto mt-3 max-w-md text-sm text-muted">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-7 rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-ink transition hover:opacity-90"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!customer) {
    return (
      <div
        className="grid gap-10 pb-20 pt-10 sm:pt-14 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-16"
        role="status"
        aria-label="Loading your account"
      >
        <div className="hidden space-y-3 lg:block">
          <div className="h-12 animate-pulse rounded-xl bg-surface-2/70" />
          <div className="h-40 animate-pulse rounded-xl bg-surface-2/50" />
        </div>
        <div className="space-y-5">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-2/70" />
          <div className="h-14 w-2/3 animate-pulse rounded-xl bg-surface-2/70" />
          <div className="h-56 animate-pulse rounded-2xl bg-surface-2/50" />
        </div>
      </div>
    );
  }

  return (
    <AccountContext.Provider value={{ customer, setCustomer, signOut }}>
      <div className="grid gap-8 pb-20 pt-8 sm:pt-12 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-16 lg:pt-14">
        {/* Desktop rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <div className="flex items-center gap-3">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-full bg-fg font-serif text-base font-bold text-ink"
                aria-hidden
              >
                {initials(customer.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{customer.name}</p>
                <p className="truncate text-xs text-muted">{customer.email}</p>
              </div>
            </div>

            <nav aria-label="Account" className="mt-8 border-l border-line">
              {NAV_ITEMS.map(({ href, label, icon: Icon, ...item }) => {
                const active = isActive(pathname, href, "exact" in item ? item.exact : false);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`-ml-px flex items-center gap-3 border-l-2 py-2.5 pl-4 text-sm transition ${
                      active
                        ? "border-fg font-semibold text-fg"
                        : "border-transparent text-muted hover:border-line-strong hover:text-fg"
                    }`}
                  >
                    <Icon />
                    {label}
                    {href === NOTIFICATIONS_HREF ? <UnreadBadge count={unreadCount} /> : null}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-8 space-y-1 border-t border-line pt-5">
              <Link
                href="/menu"
                className="group flex items-center gap-2 py-1.5 text-sm font-semibold text-brand-soft transition hover:text-brand"
              >
                Order from the menu
                <ArrowIcon />
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="py-1.5 text-sm text-muted transition hover:text-danger"
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile tabs */}
        <nav
          aria-label="Account"
          className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto border-b border-line px-5 pb-4 sm:-mx-6 sm:gap-2 sm:px-6 lg:hidden"
        >
          {NAV_ITEMS.map(({ href, label, ...item }) => {
            const active = isActive(pathname, href, "exact" in item ? item.exact : false);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${
                  active
                    ? "border-fg bg-fg text-ink"
                    : "border-line text-muted hover:border-line-strong hover:text-fg"
                }`}
              >
                {label}
                {href === NOTIFICATIONS_HREF ? (
                  <UnreadBadge count={unreadCount} selected={active} />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </AccountContext.Provider>
  );
}

/** Page title block shared by every panel page. */
export function AccountPageHeader({
  eyebrow = "Your account",
  title,
  description,
  back,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="pb-8">
      {back ? (
        <Link
          href={back.href}
          className="group mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-fg"
        >
          <span className="transition group-hover:-translate-x-0.5" aria-hidden>
            ←
          </span>
          {back.label}
        </Link>
      ) : null}
      <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand-soft">
        <span className="h-px w-8 bg-brand" aria-hidden />
        {eyebrow}
      </p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <h1 className="font-serif text-[clamp(2.4rem,5vw,3.75rem)] font-bold leading-[0.98] tracking-[-0.02em] text-fg">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="size-4 transition-transform group-hover:translate-x-0.5"
      aria-hidden
    >
      <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[18px] shrink-0"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function OverviewIcon() {
  return (
    <NavIcon>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </NavIcon>
  );
}

function OrdersIcon() {
  return (
    <NavIcon>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </NavIcon>
  );
}

function NotificationsIcon() {
  return (
    <NavIcon>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 3.6.9 5.6 1.8 6.8.3.4 0 .9-.5.9H4.7c-.5 0-.8-.5-.5-.9C5.1 15.1 6 13.1 6 9.5Z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </NavIcon>
  );
}

function ProfileIcon() {
  return (
    <NavIcon>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
    </NavIcon>
  );
}
