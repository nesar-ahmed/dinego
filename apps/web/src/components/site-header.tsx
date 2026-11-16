import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
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
          <span className="grid size-10 place-items-center rounded-xl bg-brand text-lg font-black text-brand-ink shadow-[0_0_30px_rgba(232,93,31,0.25)]">
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
          <AuthNav />
        </div>
      </div>
    </header>
  );
}
