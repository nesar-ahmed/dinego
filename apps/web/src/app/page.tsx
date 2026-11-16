import type { Metadata } from "next";
import Link from "next/link";
import { featuredDishes, formatPrice, menuCategories } from "@/lib/menu-data";

export const metadata: Metadata = {
  title: "DineGo Kitchen — Seasonal plates, warm rooms",
  description:
    "DineGo Kitchen is a neighbourhood restaurant serving seasonal small plates, comforting mains, desserts, and drinks for dine-in and takeaway.",
};

const diningOptions = [
  {
    title: "Dine in",
    body: "Warm lighting, an open kitchen, and a table that is yours for the evening. Walk-ins are always welcome.",
    detail: "Lunch 12:00–15:00 · Dinner 17:00–22:00",
  },
  {
    title: "Takeaway",
    body: "The same menu, packed to travel. Order at the counter or call ahead and collect when it suits you.",
    detail: "Collection from 12:00 · Last order 21:30",
  },
  {
    title: "Private tables",
    body: "Birthdays, team dinners, and long Sunday lunches. Tell us the occasion and we will take care of the rest.",
    detail: "Groups from 6 to 24 guests",
  },
];

const openingHours = [
  { days: "Monday – Thursday", hours: "12:00 – 22:00" },
  { days: "Friday – Saturday", hours: "12:00 – 23:00" },
  { days: "Sunday", hours: "12:00 – 21:00" },
];

export default function HomePage() {
  const totalDishes = menuCategories.reduce((sum, category) => sum + category.items.length, 0);

  return (
    <div className="pb-14">
      <section className="relative isolate mt-6 overflow-hidden rounded-[2rem] border border-line bg-surface/55 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand/25 blur-[110px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-28 -left-20 size-80 rounded-full bg-emerald-600/10 blur-[100px]"
          aria-hidden
        />

        <div className="relative grid gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-ok/25 bg-ok/10 px-3 py-1 text-xs font-medium text-ok">
              <span className="size-1.5 rounded-full bg-ok" />
              Open today · Walk-ins welcome
            </span>

            <h1 className="mt-6 font-serif text-5xl font-bold leading-[0.95] tracking-tight text-fg sm:text-6xl xl:text-7xl">
              Good food.
              <br />
              Warm rooms.
              <br />
              <span className="text-gradient">One more evening.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              A neighbourhood kitchen for long lunches, after-work dinners, and the kind of plates
              everyone reaches across the table for. Dine in or take something home.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/menu"
                className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink shadow-[0_12px_40px_-12px_rgba(255,122,26,0.7)] transition hover:opacity-90"
              >
                View the menu
              </Link>
              <Link
                href="/#visit"
                className="rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg transition hover:border-brand/50 hover:bg-surface-2"
              >
                Find us
              </Link>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">
                  In the kitchen
                </dt>
                <dd className="mt-1 font-serif text-2xl font-bold">{totalDishes} dishes</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">At the table</dt>
                <dd className="mt-1 font-serif text-2xl font-bold">48 seats</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">Open</dt>
                <dd className="mt-1 font-serif text-2xl font-bold">7 days</dd>
              </div>
            </dl>
          </div>

          <div className="relative">
            <div
              className="absolute inset-x-10 -bottom-4 h-24 rounded-full bg-brand/25 blur-3xl"
              aria-hidden
            />

            <div className="relative rounded-3xl border border-line bg-ink/85 p-5 shadow-premium backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <p className="font-serif text-lg font-semibold">Tonight at the pass</p>
                <span className="rounded-full border border-ok/25 bg-ok/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                  Chef&apos;s picks
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {featuredDishes.slice(0, 3).map((dish) => (
                  <div
                    key={dish.name}
                    className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface/50 px-3.5 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-fg">{dish.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{dish.category}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatPrice(dish.priceCents)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-line bg-ink/70 p-3.5 text-xs leading-relaxed text-muted">
                <p className="font-semibold uppercase tracking-[0.14em] text-fg">A note from us</p>
                <p className="mt-1.5">
                  The menu changes with the season. Ask your server what came in this morning.
                </p>
              </div>

              <Link
                href="/menu"
                className="mt-4 block rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-center text-sm font-semibold text-brand-soft transition hover:border-brand/60"
              >
                See the full menu
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-soft">
              From the kitchen
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Made for sharing
            </h2>
          </div>
          <Link
            href="/menu"
            className="text-sm font-semibold text-brand-soft transition hover:text-brand"
          >
            Full menu →
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {featuredDishes.slice(0, 3).map((dish) => (
            <article
              key={dish.name}
              className="group rounded-2xl border border-line bg-surface/60 p-5 transition hover:border-brand/30 hover:bg-surface"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-soft">
                {dish.category}
              </p>
              <h3 className="mt-2 font-serif text-xl font-semibold tracking-tight">{dish.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{dish.description}</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="text-sm font-semibold tabular-nums">
                  {formatPrice(dish.priceCents)}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted">
                  Chef&apos;s pick
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="story" className="scroll-mt-24 py-10">
        <div className="grid gap-8 rounded-3xl border border-line bg-surface/60 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-soft">
              Our story
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              A room that feels like dinner at home.
            </h2>
          </div>
          <div>
            <p className="text-sm leading-relaxed text-muted sm:text-base">
              DineGo started with a simple idea: cook the food we want to eat, pour something good,
              and leave the door open for whoever comes in. The kitchen is visible, the menu follows
              the season, and the tables are close enough to share a plate.
            </p>
            <blockquote className="mt-5 border-l-2 border-brand/40 pl-4 font-serif text-lg italic text-fg">
              “Cooked simply. Served warmly. Nothing too precious.”
            </blockquote>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted">
              The DineGo kitchen
            </p>
          </div>
        </div>
      </section>

      <section className="py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-soft">
          However you like to eat
        </p>
        <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          Dine in, take away, or settle in
        </h2>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {diningOptions.map((option) => (
            <article
              key={option.title}
              className="rounded-2xl border border-line bg-surface/60 p-5"
            >
              <h3 className="font-serif text-xl font-semibold tracking-tight">{option.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{option.body}</p>
              <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-brand-soft">
                {option.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="visit" className="scroll-mt-24 py-10">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-line bg-surface/60 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-soft">
              Visit us
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight">
              Find us on the corner
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              We are a short walk from the market, with the kitchen visible from the street. Walk
              in, call ahead, or send us a note for a larger table.
            </p>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-ink/40 p-4">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">Address</dt>
                <dd className="mt-1 text-sm font-medium">18 Market Lane, Riverside</dd>
              </div>
              <div className="rounded-2xl border border-line bg-ink/40 p-4">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">Phone</dt>
                <dd className="mt-1 text-sm font-medium">
                  <a href="tel:+15550100" className="transition hover:text-brand-soft">
                    +1 555 0100
                  </a>
                </dd>
              </div>
              <div className="rounded-2xl border border-line bg-ink/40 p-4 sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">Email</dt>
                <dd className="mt-1 text-sm font-medium">
                  <a
                    href="mailto:hello@dinegokitchen.com"
                    className="transition hover:text-brand-soft"
                  >
                    hello@dinegokitchen.com
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border border-line bg-surface/60 p-6 sm:p-8">
            <h3 className="font-serif text-xl font-semibold tracking-tight">Opening hours</h3>
            <dl className="mt-4 space-y-3">
              {openingHours.map((entry) => (
                <div
                  key={entry.days}
                  className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <dt className="text-sm text-muted">{entry.days}</dt>
                  <dd className="text-sm font-medium tabular-nums">{entry.hours}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 rounded-xl border border-brand/20 bg-brand/5 p-3 text-xs leading-relaxed text-brand-soft">
              Kitchen closes 30 minutes before the room. Last takeaway order 30 minutes before
              close.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-line bg-gradient-to-br from-surface to-ink p-6 sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-soft">
              Save us a seat
            </p>
            <h2 className="mt-2 font-serif text-2xl font-bold tracking-tight">
              There is always room for one more
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Take a look at the menu, then come by for lunch, dinner, or a drink at the counter.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/menu"
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition hover:opacity-90"
            >
              Explore the menu
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-line-strong px-5 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/50"
            >
              Login
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
