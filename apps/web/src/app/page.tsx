import type { Metadata } from "next";
import Link from "next/link";
import { DishMarquee } from "@/components/home/dish-marquee";
import { FeaturedDishes } from "@/components/home/featured-dishes";
import { OpeningHours } from "@/components/home/opening-hours";
import { restaurant, services } from "@/lib/restaurant";

export const metadata: Metadata = {
  title: "DineGo Kitchen — Seasonal plates, warm rooms",
  description:
    "DineGo Kitchen is a neighbourhood restaurant in Riverside serving seasonal small plates, comforting mains, desserts, and drinks. Dine in or take away.",
};

const pillars = [
  {
    title: "The menu follows the season",
    body: "We cook with what arrives that morning, so a few plates change every week.",
  },
  {
    title: "The kitchen is open to the room",
    body: "Pull up a stool at the pass and watch dinner come together.",
  },
  {
    title: "Plates are made to share",
    body: "Order a few for the middle of the table and keep them coming.",
  },
];

const waysToEat = [
  {
    title: "Dine in",
    body: "Warm lighting, an open kitchen, and a table that is yours for the evening. Walk-ins are always welcome.",
    detail: "Lunch 12:00 – 15:00 · Dinner from 17:00",
  },
  {
    title: "Take away",
    body: "The same menu, packed to travel. Order at the counter or call ahead and collect when it suits you.",
    detail: "Last order 30 minutes before close",
  },
  {
    title: "Private tables",
    body: "Birthdays, team dinners, and long Sunday lunches. Tell us the occasion and we will take care of the rest.",
    detail: "Groups from 6 to 24 guests",
  },
];

const eyebrow = "text-xs font-semibold uppercase tracking-[0.22em] text-brand-soft";

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="size-4 transition-transform group-hover:translate-x-0.5"
      aria-hidden
    >
      <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A printed "house card": today's services and where to find us, styled like paper. */
function HouseCard() {
  return (
    <div className="relative mx-auto w-full max-w-md pr-2 lg:mx-0 lg:max-w-none">
      <div
        className="absolute inset-0 translate-x-2 translate-y-3 rotate-[2.5deg] rounded-[1.75rem] border border-line bg-surface-2"
        aria-hidden
      />
      <div className="bg-grain relative rounded-[1.75rem] border border-line-strong bg-paper px-7 py-8 sm:px-9 sm:py-10">
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.32em] text-muted">
          {restaurant.name}
        </p>
        <p className="mt-2 text-center font-serif text-3xl font-bold tracking-tight text-fg">
          Today at the kitchen
        </p>
        <div className="mx-auto my-6 w-24 border-t-[3px] border-double border-line-strong" />

        <ul className="space-y-3.5 text-sm">
          {services.map((service) => (
            <li key={service.label} className="flex items-baseline gap-3">
              <span className="font-semibold text-fg">{service.label}</span>
              <span
                className="flex-1 -translate-y-1 border-b border-dotted border-line-strong"
                aria-hidden
              />
              <span className="text-right text-muted">{service.time}</span>
            </li>
          ))}
        </ul>

        <div className="my-6 border-t border-line" />

        <address className="not-italic text-sm leading-relaxed text-muted">
          <span className="font-semibold text-fg">{restaurant.address.line1}</span>,{" "}
          {restaurant.address.line2}
          <br />
          <a href={restaurant.phone.href} className="transition hover:text-brand-soft">
            {restaurant.phone.display}
          </a>
        </address>
        <a
          href={restaurant.mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-soft"
        >
          Get directions
          <ArrowIcon />
        </a>
        <p className="mt-6 text-center font-serif text-sm text-muted">
          Walk-ins welcome · Groups of six or more, please call
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="pb-16 pt-10 sm:pt-14 lg:pb-24 lg:pt-16">
        <p className={`${eyebrow} flex items-center gap-3`}>
          <span className="h-px w-8 bg-brand" aria-hidden />
          Neighbourhood kitchen · {restaurant.address.line2}
        </p>
        <h1 className="mt-7 font-serif text-[clamp(3rem,8.2vw,7.25rem)] font-bold leading-[0.9] tracking-[-0.03em] text-fg">
          <span className="block">Good food,</span>
          <span className="block">warm rooms,</span>
          <span className="block text-brand">one more evening.</span>
        </h1>

        <div className="mt-12 grid gap-14 lg:mt-16 lg:grid-cols-[1fr_26rem] lg:items-start lg:gap-20">
          <div>
            <p className="max-w-xl text-lg leading-relaxed text-muted">
              Long lunches, after-work dinners, and the kind of plates everyone reaches across the
              table for. Sit down with us or take something home.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                href="/menu"
                className="group inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3.5 text-sm font-bold text-brand-ink transition hover:opacity-90"
              >
                Explore the menu
                <ArrowIcon />
              </Link>
              <Link
                href="/#visit"
                className="group inline-flex items-center gap-1.5 text-sm font-semibold text-fg underline-offset-8 hover:underline"
              >
                Plan your visit
                <ArrowIcon />
              </Link>
            </div>
            <dl className="mt-12 grid max-w-xl grid-cols-3 divide-x divide-line border-y border-line">
              {[
                ["Menu", "Seasonal"],
                ["Service", "Eat in · To go"],
                ["Open", "7 days"],
              ].map(([label, value]) => (
                <div key={label} className="px-3 py-4 first:pl-0 sm:px-4">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                    {label}
                  </dt>
                  <dd className="mt-1.5 whitespace-nowrap font-serif text-[15px] font-semibold leading-tight text-fg sm:text-xl">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <HouseCard />
        </div>
      </section>

      <DishMarquee />

      {/* Chef's picks */}
      <section className="py-20 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className={eyebrow}>From the kitchen</p>
            <h2 className="mt-3 font-serif text-4xl font-bold tracking-tight text-fg sm:text-5xl">
              Chef&apos;s picks
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted">
              Three plates we would order ourselves. Add them to your order now, or ask the team
              what came in this morning.
            </p>
          </div>
          <Link
            href="/menu"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-fg underline-offset-8 hover:underline"
          >
            See the full menu
            <ArrowIcon />
          </Link>
        </div>
        <div className="mt-12">
          <FeaturedDishes />
        </div>
      </section>

      {/* Story */}
      <section
        id="story"
        className="rounded-[2rem] bg-inverse px-6 py-16 text-inverse-fg sm:px-12 lg:px-16 lg:py-24"
      >
        <div className="grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Our story
            </p>
            <blockquote className="mt-6 font-serif text-[clamp(2.1rem,4.6vw,3.75rem)] font-bold leading-[1.05] tracking-tight">
              “Cooked simply. Served warmly. Nothing too precious.”
            </blockquote>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-inverse-muted">
              DineGo started with a simple idea: cook the food we want to eat, pour something good,
              and leave the door open for whoever comes in. The tables are close enough to share a
              plate, and the room stays warm long after the last order.
            </p>
          </div>
          <ol className="self-end">
            {pillars.map((pillar, index) => (
              <li
                key={pillar.title}
                className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-t border-inverse-line py-6 last:pb-0"
              >
                <span className="font-serif text-sm font-semibold tabular-nums text-brand">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-serif text-xl font-semibold tracking-tight">
                    {pillar.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-inverse-muted">{pillar.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Ways to eat */}
      <section className="py-20 lg:py-28">
        <p className={eyebrow}>However you like to eat</p>
        <h2 className="mt-3 max-w-2xl font-serif text-4xl font-bold tracking-tight text-fg sm:text-5xl">
          Dine in, take away, or settle in for the evening
        </h2>
        <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-3">
          {waysToEat.map((option, index) => (
            <article key={option.title} className="border-t border-line-strong pt-6">
              <p className="font-serif text-sm font-semibold tabular-nums text-brand">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 font-serif text-2xl font-bold tracking-tight text-fg">
                {option.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{option.body}</p>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg">
                {option.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Visit */}
      <section id="visit" className="border-t border-line pb-4 pt-20 lg:pt-28">
        <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <div>
            <p className={eyebrow}>Visit us</p>
            <h2 className="mt-3 font-serif text-4xl font-bold tracking-tight text-fg sm:text-5xl">
              Find us on the corner of Market Lane
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
              A short walk from the market, with the kitchen visible from the street. Walk in, call
              ahead, or send us a note for a larger table.
            </p>
            <address className="mt-10 not-italic">
              <p className="font-serif text-3xl font-semibold tracking-tight text-fg">
                {restaurant.address.line1}
              </p>
              <p className="mt-1 text-lg text-muted">{restaurant.address.line2}</p>
            </address>
            <div className="mt-8 flex flex-wrap gap-3">
              {[
                { href: restaurant.mapsUrl, label: "Get directions", external: true },
                { href: restaurant.phone.href, label: restaurant.phone.display },
                { href: `mailto:${restaurant.email}`, label: restaurant.email },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/60 hover:text-brand-soft"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Opening hours
            </h3>
            <div className="mt-4">
              <OpeningHours />
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted">
              The kitchen takes its last order 30 minutes before we close, for both dine in and
              takeaway.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
