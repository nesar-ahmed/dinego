"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { ThemeToggle } from "@/components/theme-toggle";

export type ConsoleIcon =
  | "grid"
  | "users"
  | "customers"
  | "bell"
  | "settings"
  | "kitchen"
  | "service"
  | "tables"
  | "counter";

export type ConsoleNavItem = {
  href: string;
  label: string;
  icon: ConsoleIcon;
};

/** Everything that differs between the consoles built on this shell (admin, staff roles). */
export type ConsoleConfig = {
  /** Short name, e.g. "Admin" or "Kitchen": navigation label and the mobile menu buttons. */
  name: string;
  /** Under the logo, e.g. "Admin console". */
  consoleLabel: string;
  /** Above the page title, e.g. "Admin workspace". */
  workspaceLabel: string;
  /** Where the logo and the user menu's Dashboard link lead. */
  homeHref: string;
  navigation: ConsoleNavItem[];
  pageTitles: Record<string, string>;
  /** The notifications page: the bell's "View all" and the sidebar's unread count. */
  notificationsHref: string;
  /** Shown in the bell's dropdown when the inbox is empty. */
  bellEmptyText: string;
  /** Remembers the collapsed sidebar, per console. */
  sidebarStorageKey: string;
  /** Adds "Visit website" to the top bar. */
  showWebsiteLink?: boolean;
};

export type ConsoleUser = { name: string; email: string | null; role: string };

/**
 * The full-viewport console layout shared by the admin console and the staff dashboards:
 * collapsible sidebar with unread count, top bar with theme switch, notification bell, and the
 * user menu, and a drawer on phones and tablets. Needs a NotificationsProvider above it.
 */
export function ConsoleShell({
  config,
  user,
  onSignOut,
  children,
}: {
  config: ConsoleConfig;
  user: ConsoleUser;
  onSignOut: () => void | Promise<void>;
  children: ReactNode;
}) {
  const {
    name,
    consoleLabel,
    workspaceLabel,
    homeHref,
    navigation,
    pageTitles,
    notificationsHref,
    bellEmptyText,
    sidebarStorageKey,
    showWebsiteLink = false,
  } = config;
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(sidebarStorageKey) === "1");
  }, [sidebarStorageKey]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarStorageKey, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-dvh w-full bg-ink">
      <aside
        className={`hidden shrink-0 border-r border-line bg-surface/35 transition-[width] duration-300 lg:flex lg:flex-col ${
          collapsed ? "w-[4.75rem]" : "w-64 xl:w-72"
        }`}
      >
        <div className="sticky top-0 flex h-dvh flex-col p-3">
          <div
            className={`flex px-1 ${
              collapsed ? "flex-col items-center gap-2.5" : "items-center justify-between gap-2"
            }`}
          >
            <Link href={homeHref} title={`DineGo ${name}`} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-lg font-black text-brand-ink shadow-[0_0_30px_rgba(232,93,31,0.25)]">
                D
              </span>
              {!collapsed && (
                <span>
                  <span className="block text-sm font-bold leading-tight text-fg">DineGo</span>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-muted">
                    {consoleLabel}
                  </span>
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition hover:border-line-strong hover:text-fg"
            >
              <CollapseIcon collapsed={collapsed} />
            </button>
          </div>

          <SidebarNav
            name={name}
            navigation={navigation}
            notificationsHref={notificationsHref}
            collapsed={collapsed}
          />

          <div className="mt-auto border-t border-line pt-4">
            <ConsoleStatus collapsed={collapsed} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ink/85 px-3 py-3 backdrop-blur-xl sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={`Open ${name.toLowerCase()} menu`}
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface/60 text-muted transition hover:border-line-strong hover:text-fg lg:hidden"
            >
              <MenuIcon />
            </button>

            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                {workspaceLabel}
              </p>
              <p className="truncate text-sm font-semibold text-fg">
                {pageTitles[pathname] ?? name}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle />

            {showWebsiteLink && (
              <Link
                href="/"
                target="_blank"
                rel="noreferrer"
                title="Visit website in a new tab"
                className="inline-flex size-9 items-center justify-center rounded-xl border border-line bg-surface/60 text-muted transition hover:border-line-strong hover:text-fg sm:w-auto sm:gap-2 sm:px-2.5"
              >
                <ExternalLinkIcon />
                <span className="hidden text-xs font-semibold sm:inline">Visit website</span>
              </Link>
            )}

            <NotificationBell viewAllHref={notificationsHref} emptyText={bellEmptyText} />

            <UserMenu user={user} homeHref={homeHref} onSignOut={onSignOut} />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={`Close ${name.toLowerCase()} menu`}
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-ink p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2 px-1">
              <Link
                href={homeHref}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-brand text-lg font-black text-brand-ink">
                  D
                </span>
                <span>
                  <span className="block text-sm font-bold leading-tight text-fg">DineGo</span>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-muted">
                    {consoleLabel}
                  </span>
                </span>
              </Link>

              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={`Close ${name.toLowerCase()} menu`}
                className="grid size-8 place-items-center rounded-lg border border-line text-muted transition hover:border-line-strong hover:text-fg"
              >
                <CloseIcon />
              </button>
            </div>

            <SidebarNav
              name={name}
              navigation={navigation}
              notificationsHref={notificationsHref}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />

            <div className="mt-auto border-t border-line pt-4">
              <ConsoleStatus />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function SidebarNav({
  name,
  navigation,
  notificationsHref,
  collapsed,
  onNavigate,
}: {
  name: string;
  navigation: ConsoleNavItem[];
  notificationsHref: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);
  const { unreadCount } = useNotifications();

  return (
    <nav className="mt-5 space-y-1" aria-label={name}>
      {navigation.map((item) => {
        const active = pathname === item.href;
        const unread = item.href === notificationsHref ? unreadCount : 0;
        const label = unread > 0 ? `${item.label}, ${unread} unread` : item.label;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={collapsed ? label : undefined}
            onMouseEnter={() => setHovered(item.href)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(item.href)}
            onBlur={() => setHovered(null)}
            onClick={onNavigate}
            className={`relative flex items-center rounded-xl py-2.5 text-sm transition ${
              collapsed ? "justify-center px-0" : "gap-2.5 px-3"
            } ${
              active
                ? "bg-brand/10 font-semibold text-brand-soft"
                : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <span className="relative">
              <NavIcon name={item.icon} />
              {collapsed && unread > 0 && (
                <span
                  className="absolute -right-1 -top-1 size-2 rounded-full bg-brand ring-2 ring-ink"
                  aria-hidden
                />
              )}
            </span>
            {!collapsed && <span>{item.label}</span>}
            {!collapsed && unread > 0 && (
              <span
                className="ml-auto rounded-full bg-surface-2 px-1.5 py-px text-[11px] font-semibold tabular-nums text-fg"
                aria-hidden
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}

            {collapsed && hovered === item.href && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-premium"
              >
                {label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function ConsoleStatus({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="flex justify-center">
        <span
          title="API connected"
          className="inline-flex size-7 items-center justify-center rounded-full border border-ok/25 bg-ok/10"
        >
          <span className="size-1.5 rounded-full bg-ok" />
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-ink/40 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        Console status
      </p>
      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-ok">
        <span className="size-1.5 rounded-full bg-ok" />
        API connected
      </p>
    </div>
  );
}

function UserMenu({
  user,
  homeHref,
  onSignOut,
}: {
  user: ConsoleUser;
  homeHref: string;
  onSignOut: () => void | Promise<void>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-line bg-surface/60 py-1.5 pl-1.5 pr-1.5 transition hover:border-line-strong sm:pr-2"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-brand text-[11px] font-black text-brand-ink">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-24 truncate text-xs font-semibold leading-tight text-fg">
            {user.name.split(" ")[0]}
          </span>
          <span className="block text-[10px] leading-tight text-muted">{user.role}</span>
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`hidden size-3.5 text-muted transition sm:block ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 7l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface shadow-premium"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>

          <div className="p-1.5">
            <Link
              href={homeHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <DashboardIcon />
              Dashboard
            </Link>
          </div>

          <div className="border-t border-line p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => void onSignOut()}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-danger transition hover:bg-danger/10"
            >
              <LogoutIcon />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M20 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h5" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function NavIcon({ name }: { name: ConsoleIcon }) {
  const paths: Record<ConsoleIcon, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
        <path d="M16 5.5a3 3 0 010 5.5" />
        <path d="M18 15c2 .8 3 2.3 3 5" />
      </>
    ),
    customers: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21c0-3.5 3.1-6 7-6s7 2.5 7 6" />
      </>
    ),
    bell: (
      <>
        <path d="M6 9.5a6 6 0 0 1 12 0c0 3.6.9 5.6 1.8 6.8.3.4 0 .9-.5.9H4.7c-.5 0-.8-.5-.5-.9C5.1 15.1 6 13.1 6 9.5Z" />
        <path d="M10 20a2.2 2.2 0 0 0 4 0" />
      </>
    ),
    kitchen: (
      <>
        <path d="M7 14.5a4 4 0 01-.9-7.9 5 5 0 019.8 0 4 4 0 01-.9 7.9" />
        <path d="M7 14.5V20h10v-5.5" />
        <path d="M7 17h10" />
      </>
    ),
    service: (
      <>
        <path d="M4 17h16" />
        <path d="M5.5 17a6.5 6.5 0 0113 0" />
        <path d="M12 8.5V7M10.5 7h3" />
        <path d="M3 20h18" />
      </>
    ),
    tables: (
      <>
        <rect x="4" y="8" width="16" height="5" rx="1.5" />
        <path d="M7 13v6M17 13v6" />
        <path d="M8 5h8" />
      </>
    ),
    counter: (
      <>
        <path d="M6 8h12l-1 12H7L6 8z" />
        <path d="M9 8V6.5a3 3 0 016 0V8" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6v.2h-4v-.2a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H2.8v-4H3a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 001.9.3 1.7 1.7 0 001-1.6v-.2h4V3a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.6 1h.2v4H21a1.7 1.7 0 00-1.6 1z" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}
