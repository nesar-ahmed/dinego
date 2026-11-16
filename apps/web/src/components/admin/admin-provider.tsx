"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  customersResponseSchema,
  usersResponseSchema,
  type Customer,
  type User,
} from "@dinego/shared";
import { ApiError, apiRequest } from "@/lib/api";
import { fetchMe, logout } from "@/lib/auth-client";

type AdminContextValue = {
  admin: User;
  staff: User[];
  customers: Customer[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const loginPath = `/login?next=${encodeURIComponent(pathname || "/admin")}`;
  const [admin, setAdmin] = useState<User | null>(null);
  const [staff, setStaff] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    await logout();
    router.replace("/login");
    router.refresh();
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const session = await fetchMe();

      if (
        session.type !== "STAFF" ||
        (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")
      ) {
        router.replace(loginPath);
        return;
      }

      const [staffPayload, customerPayload] = await Promise.all([
        apiRequest<unknown>("/users"),
        apiRequest<unknown>("/users/customers"),
      ]);
      const staffResult = usersResponseSchema.safeParse(staffPayload);
      const customerResult = customersResponseSchema.safeParse(customerPayload);

      if (!staffResult.success || !customerResult.success) {
        throw new ApiError("The admin response did not match the shared contract.", 0);
      }

      setAdmin(session.user);
      setStaff(staffResult.data.users);
      setCustomers(customerResult.data.customers);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        router.replace(loginPath);
        return;
      }

      setError(cause instanceof Error ? cause.message : "Could not load the admin console.");
    } finally {
      setLoading(false);
    }
  }, [loginPath, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="py-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-2xl border border-line bg-surface/60"
            />
          ))}
        </div>
        <div className="mt-5 h-72 animate-pulse rounded-2xl border border-line bg-surface/50" />
      </div>
    );
  }

  if (error || !admin) {
    return (
      <div className="py-12">
        <div className="rounded-2xl border border-danger/25 bg-danger/10 p-6 text-sm text-danger">
          <p className="font-medium">The admin console could not be loaded.</p>
          <p className="mt-1 opacity-80">{error ?? "Please sign in again."}</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-4 rounded-xl border border-danger/30 px-4 py-2 text-xs font-semibold transition hover:border-danger/60"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ admin, staff, customers, refresh: load, signOut }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  const context = useContext(AdminContext);

  if (!context) {
    throw new Error("useAdmin must be used inside AdminProvider");
  }

  return context;
}
