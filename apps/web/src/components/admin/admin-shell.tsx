"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAdmin } from "./admin-provider";

type NavItem = {
  href: string;
  label: string;
  icon: "grid" | "users" | "customers" | "settings";
};

const navigation: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "grid" },
  { href: "/admin/users", label: "Staff", icon: "users" },
  { href: "/admin/customers", label: "Customers", icon: "customers" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

const pageTitles: Record<string, string> = {
  "/admin": "Overview",
  "/admin/users": "Staff accounts",
  "/admin/customers": "Customers",
  "/admin/settings": "Settings",
};

const SIDEBAR_STORAGE_KEY = "dinego-admin-sidebar-collapsed";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
  }, []);

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
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
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
            <Link href="/admin" title="DineGo Admin" className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-lg font-black text-brand-ink shadow-[0_0_30px_rgba(232,93,31,0.25)]">
                D
              </span>
              {!collapsed && (
                <span>
                  <span className="block text-sm font-bold leading-tight text-fg">DineGo</span>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-muted">
                    Admin console
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

          <SidebarNav collapsed={collapsed} />

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
              aria-label="Open admin menu"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface/60 text-muted transition hover:border-line-strong hover:text-fg lg:hidden"
            >
              <MenuIcon />
            </button>

            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Admin workspace
              </p>
              <p className="truncate text-sm font-semibold text-fg">
                {pageTitles[pathname] ?? "Admin"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle />

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

            <AdminMenu />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close admin menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-ink p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2 px-1">
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-brand text-lg font-black text-brand-ink">
                  D
                </span>
                <span>
                  <span className="block text-sm font-bold leading-tight text-fg">DineGo</span>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-muted">
                    Admin console
                  </span>
                </span>
              </Link>

              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close admin menu"
                className="grid size-8 place-items-center rounded-lg border border-line text-muted transition hover:border-line-strong hover:text-fg"
              >
                <CloseIcon />
              </button>
            </div>

            <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />

            <div className="mt-auto border-t border-line pt-4">
              <ConsoleStatus />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <nav className="mt-5 space-y-1" aria-label="Admin">
      {navigation.map((item) => {
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            title={collapsed ? item.label : undefined}
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
            <NavIcon name={item.icon} />
            {!collapsed && <span>{item.label}</span>}

            {collapsed && hovered === item.href && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-premium"
              >
                {item.label}
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

function AdminMenu() {
  const { admin, signOut } = useAdmin();
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
          {admin.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-24 truncate text-xs font-semibold leading-tight text-fg">
            {admin.name.split(" ")[0]}
          </span>
          <span className="block text-[10px] leading-tight text-muted">{admin.role}</span>
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
            <p className="truncate text-sm font-semibold text-fg">{admin.name}</p>
            <p className="truncate text-xs text-muted">{admin.email}</p>
          </div>

          <div className="p-1.5">
            <Link
              href="/admin"
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
              onClick={() => void signOut()}
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

function NavIcon({ name }: { name: NavItem["icon"] }) {
  const paths: Record<NavItem["icon"], ReactNode> = {
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
