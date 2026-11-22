"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicMenuItem } from "@dinego/shared";
import { MenuItemCard } from "@/components/menu/menu-item-card";
import { fetchFeaturedItems } from "@/lib/menu";

/** Live chef's picks from the menu API, with working Add buttons. */
export function FeaturedDishes() {
  const [items, setItems] = useState<PublicMenuItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchFeaturedItems(controller.signal)
      .then((featured) => setItems(featured.slice(0, 3)))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });

    return () => controller.abort();
  }, []);

  if (failed) {
    return (
      <p className="rounded-2xl border border-line px-6 py-10 text-center text-sm text-muted">
        Today&apos;s picks are taking a moment.{" "}
        <Link
          href="/menu"
          className="font-semibold text-brand-soft underline-offset-4 hover:underline"
        >
          Browse the full menu
        </Link>
      </p>
    );
  }

  if (!items) {
    return (
      <div className="grid gap-4 md:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-56 animate-pulse rounded-2xl border border-line bg-surface/60 motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((item) => (
        <MenuItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
