import Link from "next/link";
import { OpeningHours } from "@/components/home/opening-hours";
import { restaurant } from "@/lib/restaurant";

const explore = [
  { href: "/menu", label: "Menu" },
  { href: "/#story", label: "Our story" },
  { href: "/#visit", label: "Visit us" },
  { href: "/account", label: "Your account" },
];

const heading = "text-[11px] font-semibold uppercase tracking-[0.22em] text-inverse-muted";
const link = "transition hover:text-brand";

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-inverse text-inverse-fg">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6">
        <div className="flex flex-col gap-8 border-b border-inverse-line py-16 lg:flex-row lg:items-end lg:justify-between lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Save us a seat
            </p>
            <h2 className="mt-4 font-serif text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[1.02] tracking-tight">
              There is always room for one more.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/menu"
              className="rounded-full bg-brand px-7 py-3.5 text-sm font-bold text-brand-ink transition hover:opacity-90"
            >
              Explore the menu
            </Link>
            <a
              href={restaurant.phone.href}
              className="rounded-full border border-inverse-line px-7 py-3.5 text-sm font-semibold transition hover:border-brand"
            >
              Call {restaurant.phone.display}
            </a>
          </div>
        </div>

        <div className="grid gap-12 py-14 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr_1.25fr_0.6fr]">
          <div>
            <Link href="/" className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand text-lg font-black text-brand-ink">
                D
              </span>
              <span className="font-serif text-xl font-bold tracking-tight">{restaurant.name}</span>
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-inverse-muted">
              A neighbourhood kitchen for long lunches, after-work dinners, and plates made to
              share. {restaurant.tagline}
            </p>
          </div>

          <div>
            <h3 className={heading}>Visit</h3>
            <address className="mt-5 space-y-2 text-sm not-italic leading-relaxed">
              <p>
                {restaurant.address.line1}, {restaurant.address.line2}
              </p>
              <p>
                <a href={restaurant.mapsUrl} target="_blank" rel="noreferrer" className={link}>
                  Get directions →
                </a>
              </p>
              <p>
                <a href={restaurant.phone.href} className={link}>
                  {restaurant.phone.display}
                </a>
              </p>
              <p>
                <a href={`mailto:${restaurant.email}`} className={link}>
                  {restaurant.email}
                </a>
              </p>
            </address>
          </div>

          <div>
            <h3 className={heading}>Hours</h3>
            <div className="mt-2">
              <OpeningHours tone="inverse" />
            </div>
          </div>

          <nav aria-label="Footer">
            <h3 className={heading}>Explore</h3>
            <ul className="mt-5 space-y-2 text-sm">
              {explore.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={link}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p
          className="select-none overflow-hidden whitespace-nowrap text-center font-serif text-[clamp(4.5rem,19vw,15rem)] font-bold leading-[0.8] tracking-[-0.04em] text-inverse-fg/[0.07]"
          aria-hidden
        >
          DineGo
        </p>

        <div className="flex flex-col gap-2 border-t border-inverse-line py-6 text-xs text-inverse-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {restaurant.name}. All rights reserved.
          </p>
          <p>Allergen information is available from our team — just ask.</p>
        </div>
      </div>
    </footer>
  );
}
