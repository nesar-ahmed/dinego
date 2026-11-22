"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import { fetchMe, logout } from "@/lib/auth-client";
import {
  dashboardPathForSession,
  isStaffDashboardRole,
  STAFF_HOME,
  type StaffDashboardRole,
} from "@/lib/dashboards";

export const STAFF_NOTIFICATIONS_HREF = "/staff/notifications";

type StaffContextValue = {
  user: User;
  role: StaffDashboardRole;
  signOut: () => Promise<void>;
};

const StaffContext = createContext<StaffContextValue | null>(null);

export function useStaff(): StaffContextValue {
  const context = useContext(StaffContext);
  if (!context) throw new Error("useStaff must be used inside <StaffProvider>");
  return context;
}

/** A role's own pages: its board (and sub-pages) and the shared notifications page. */
function canOpen(role: StaffDashboardRole, pathname: string): boolean {
  const home = STAFF_HOME[role];
  return (
    pathname === home || pathname.startsWith(`${home}/`) || pathname === STAFF_NOTIFICATIONS_HREF
  );
}

/**
 * Loads the signed-in staff member for every /staff page. Kitchen, waiter, and cashier accounts
 * only see their own dashboard: any other /staff page sends them home. Guests go to login,
 * customers to their account, and admins and managers to the admin console.
 */
export function StaffProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<(User & { role: StaffDashboardRole }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      const session = await fetchMe();

      if (session.type !== "STAFF" || !isStaffDashboardRole(session.user.role)) {
        router.replace(dashboardPathForSession(session));
        return;
      }

      setUser({ ...session.user, role: session.user.role });
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

  const allowed = user !== null && canOpen(user.role, pathname);

  useEffect(() => {
    if (user && !canOpen(user.role, pathname)) router.replace(STAFF_HOME[user.role]);
  }, [pathname, router, user]);

  const signOut = useCallback(async () => {
    await logout();
    router.replace("/login");
    router.refresh();
  }, [router]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md rounded-2xl border border-danger/25 bg-danger/10 p-6 text-sm text-danger">
          <p className="font-medium">Your dashboard could not be loaded.</p>
          <p className="mt-1 opacity-80">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-xl border border-danger/30 px-4 py-2 text-xs font-semibold transition hover:border-danger/60"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Nothing from another role's board renders (or loads) while the redirect happens.
  if (!user || !allowed) {
    return (
      <div className="flex min-h-dvh" role="status" aria-label="Loading your dashboard">
        <div className="hidden w-64 shrink-0 border-r border-line bg-surface/35 lg:block" />
        <div className="flex-1 p-6 lg:p-8">
          <div className="h-10 w-56 animate-pulse rounded-xl bg-surface-2/70" />
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((column) => (
              <div
                key={column}
                className="h-72 animate-pulse rounded-3xl border border-line bg-surface/50"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <StaffContext.Provider value={{ user, role: user.role, signOut }}>
      {children}
    </StaffContext.Provider>
  );
}
