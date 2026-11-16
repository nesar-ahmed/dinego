"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MeResponse } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import { fetchMe, logout } from "@/lib/auth-client";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";

export function AuthNav() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<MeResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const current = await fetchMe();

        if (active) {
          setSession(current);
        }
      } catch (error) {
        if (active) {
          setSession(null);
        }

        if (error instanceof ApiError && error.status >= 500) {
          // Keep a failed API visible as signed out; protected pages show the full error.
          setSession(null);
        }
      }
    }

    void loadSession();
    window.addEventListener(AUTH_CHANGED_EVENT, loadSession);

    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, loadSession);
    };
  }, []);

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

  async function handleSignOut() {
    setBusy(true);

    try {
      await logout();
      setSession(null);
      setOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <Link
        href="/login"
        className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-brand-ink transition hover:opacity-90"
      >
        Login
      </Link>
    );
  }

  const customer = session.type === "CUSTOMER" ? session.customer : null;
  const staff = session.type === "STAFF" ? session.user : null;
  const name = customer?.name ?? staff?.name ?? "Account";
  const email = customer?.email ?? staff?.email ?? "";
  const roleLabel = customer ? "Customer" : (staff?.role ?? "Staff");
  const dashboardHref = customer ? "/account" : "/admin";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-line bg-surface/60 py-1.5 pl-1.5 pr-2 transition hover:border-line-strong"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-brand text-[11px] font-black text-brand-ink">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-24 truncate text-xs font-semibold leading-tight text-fg">
            {name.split(" ")[0]}
          </span>
          <span className="block text-[10px] leading-tight text-muted">{roleLabel}</span>
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`size-3.5 text-muted transition ${open ? "rotate-180" : ""}`}
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
            <p className="truncate text-sm font-semibold text-fg">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>

          <div className="p-1.5">
            <Link
              href={dashboardHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <DashboardIcon />
              Dashboard
            </Link>
            <Link
              href="/#features"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <CompassIcon />
              Explore platform
            </Link>
          </div>

          <div className="border-t border-line p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleSignOut()}
              disabled={busy}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-danger transition hover:bg-danger/10 disabled:opacity-60"
            >
              <LogoutIcon />
              {busy ? "Signing out…" : "Logout"}
            </button>
          </div>
        </div>
      )}
    </div>
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

function CompassIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
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
