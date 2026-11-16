import type { Metadata } from "next";
import Link from "next/link";
import { featuredDishes, formatPrice, menuCategories } from "@/lib/menu-data";

export const metadata: Metadata = {
  title: "Menu — DineGo Kitchen",
  description:
    "Seasonal small plates, mains, desserts, and drinks at DineGo Kitchen. Dine in or take away.",
};

export default function MenuPage() {
  return (
    <div className="pb-12">
      <section className="relative isolate mt-6 overflow-hidden rounded-[2rem] border border-line bg-surface/60 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand/20 blur-[110px]"
          aria-hidden
        />
        <div className="relative max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-soft">
            DineGo Kitchen
          </p>
          <h1 className="mt-4 font-serif text-5xl font-bold leading-[0.95] tracking-tight text-fg sm:text-6xl xl:text-7xl">
            The menu
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Seasonal plates, slow-cooked favourites, and a few things worth staying for. Everything
            is prepared in our open kitchen and served from lunch through late dinner.
          </p>
          <p className="mt-4 text-sm text-muted">
            Lunch 12:00–15:00 · Dinner 17:00–22:00 · Takeaway available all day
          </p>
        </div>

        <nav className="relative mt-8 flex flex-wrap gap-2" aria-label="Menu categories">
          {menuCategories.map((category) => (
            <a
              key={category.id}
              href={`#${category.id}`}
              className="rounded-full border border-line bg-ink/50 px-4 py-2 text-xs font-semibold text-muted transition hover:border-brand/40 hover:text-brand-soft"
            >
              {category.name}
            </a>
          ))}
        </nav>
      </section>

      <section className="py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-soft">
              Chef&apos;s picks
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Start here
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            Three plates we would order ourselves. Ask the team what is best today.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {featuredDishes.slice(0, 3).map((dish) => (
            <article
              key={dish.name}
              className="rounded-2xl border border-line bg-surface/70 p-5 transition hover:border-brand/30"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-soft">
                {dish.category}
              </p>
              <h3 className="mt-2 font-serif text-xl font-semibold tracking-tight">{dish.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{dish.description}</p>
              <p className="mt-4 text-sm font-semibold tabular-nums">
                {formatPrice(dish.priceCents)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className="space-y-14">
        {menuCategories.map((category) => (
          <section key={category.id} id={category.id} className="scroll-mt-24">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
              <div>
                <h2 className="font-serif text-3xl font-bold tracking-tight">{category.name}</h2>
                <p className="mt-1 text-sm text-muted">{category.note}</p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
                {category.items.length} dishes
              </span>
            </div>

            <ul className="mt-2">
              {category.items.map((item) => (
                <li
                  key={item.name}
                  className="grid gap-2 border-b border-line py-5 last:border-0 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-6"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-fg">{item.name}</h3>
                      {item.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-fg sm:text-right">
                    {formatPrice(item.priceCents)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-14 rounded-3xl border border-line bg-gradient-to-br from-surface to-ink p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-soft">
              Join us
            </p>
            <h2 className="mt-2 font-serif text-2xl font-bold tracking-tight">
              Dine in tonight or take something home
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Walk-ins are welcome. For larger groups, call us and we will find the right table.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/#visit"
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition hover:opacity-90"
            >
              Visit us
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
