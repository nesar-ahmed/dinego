"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { useAdmin } from "./admin-provider";
import { RoleBadge } from "./role-badge";

export function AdminSettings() {
  const { admin } = useAdmin();

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-soft">
          Workspace
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Restaurant profile, appearance, and your admin account.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-line bg-surface/70 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold tracking-tight text-fg">Restaurant profile</h2>
              <p className="text-xs text-muted">These fields will be saved by the settings API.</p>
            </div>
            <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Preview
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SettingField label="Restaurant name" value="DineGo Demo Kitchen" />
            <SettingField label="Contact email" value="hello@dinego.com" />
            <SettingField label="Timezone" value="UTC" />
            <SettingField label="Currency" value="USD · integer cents" />
            <SettingField label="Service model" value="Dine-in + takeaway" />
            <SettingField label="Location" value="Main floor · 8 tables" />
          </div>

          <button
            type="button"
            disabled
            className="mt-5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink opacity-60"
          >
            Save changes
          </button>
          <p className="mt-2 text-xs text-muted">
            Settings persistence arrives with the settings module.
          </p>
        </section>

        <div className="space-y-5">
          <section className="rounded-3xl border border-line bg-surface/70 p-5 sm:p-6">
            <h2 className="font-semibold tracking-tight text-fg">Your admin account</h2>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand text-base font-black text-brand-ink">
                {admin.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{admin.name}</p>
                <p className="truncate text-xs text-muted">{admin.email}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
              <span>Role</span>
              <RoleBadge role={admin.role} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>Status</span>
              <span className="inline-flex items-center gap-1.5 text-ok">
                <span className="size-1.5 rounded-full bg-ok" />
                Active
              </span>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-surface/70 p-5 sm:p-6">
            <h2 className="font-semibold tracking-tight text-fg">Appearance</h2>
            <p className="mt-1 text-xs text-muted">
              Switch between the light and dark themes. Your choice is saved in this browser.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-ink/40 p-3">
              <div>
                <p className="text-sm font-medium text-fg">Theme</p>
                <p className="text-xs text-muted">Light or dark</p>
              </div>
              <ThemeToggle />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SettingField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <input
        readOnly
        value={value}
        className="w-full rounded-xl border border-line bg-ink/50 px-3.5 py-2.5 text-sm text-fg outline-none"
      />
    </label>
  );
}
