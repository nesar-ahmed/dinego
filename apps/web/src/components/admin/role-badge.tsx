import type { UserRole } from "@dinego/shared";

const styles: Record<UserRole, string> = {
  ADMIN: "border-brand/30 bg-brand/10 text-brand-soft",
  MANAGER: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-200",
  WAITER: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-ok",
  CASHIER: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  KITCHEN: "border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-200",
  CUSTOMER: "border-line bg-surface-2 text-muted",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[role]}`}
    >
      {role}
    </span>
  );
}
