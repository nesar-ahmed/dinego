import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { CartButton } from "@/components/cart/cart-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { href: "/menu", label: "Menu" },
  { href: "/#story", label: "Our Story" },
  { href: "/#visit", label: "Visit Us" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand text-lg font-black text-brand-ink">
            D
          </span>
          <span>
            <span className="block text-lg font-bold leading-none tracking-tight text-fg">
              DineGo
            </span>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-muted">
              Eat in · Take away
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm text-muted lg:flex" aria-label="Main">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-1.5 transition hover:bg-surface-2 hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <ThemeToggle />
          <CartButton />
          <NotificationBell />
          <AuthNav />
        </div>
      </div>

      <nav
        className="no-scrollbar mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto border-t border-line px-3.5 py-1.5 text-sm text-muted sm:px-4 lg:hidden"
        aria-label="Main"
      >
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 transition hover:bg-surface-2 hover:text-fg"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
