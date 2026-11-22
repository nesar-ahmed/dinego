import type { Metadata } from "next";
import { Suspense } from "react";
import { MenuExplorer } from "@/components/menu/menu-explorer";
import { MenuSkeleton } from "@/components/menu/menu-skeleton";
import { restaurant, services } from "@/lib/restaurant";

export const metadata: Metadata = {
  title: "Menu — DineGo Kitchen",
  description:
    "Browse the DineGo Kitchen menu: seasonal small plates, mains, desserts, and drinks. Search, filter by dietary preference, and sort by price. Dine in or take away.",
};

export default function MenuPage() {
  return (
    <div>
      <section className="pb-10 pt-10 sm:pt-14 lg:pb-14 lg:pt-20">
        <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand-soft">
          <span className="h-px w-8 bg-brand" aria-hidden />
          {restaurant.name}
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
          <h1 className="font-serif text-[clamp(3.25rem,9vw,7rem)] font-bold leading-[0.88] tracking-[-0.03em] text-fg">
            The menu
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted lg:pb-2 lg:text-lg">
            Seasonal plates, slow-cooked favourites, and a few things worth staying for — straight
            from our open kitchen, updated as the day goes on.
          </p>
        </div>
        <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-5 text-sm">
          {services.map((service) => (
            <li key={service.label} className="flex items-baseline gap-2">
              <span className="font-semibold text-fg">{service.label}</span>
              <span className="text-muted">{service.time}</span>
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={<MenuSkeleton />}>
        <MenuExplorer />
      </Suspense>
    </div>
  );
}
