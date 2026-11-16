"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return <div className="min-h-dvh w-full">{children}</div>;
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-6">{children}</main>

      <footer className="mt-8 w-full border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-muted sm:px-6">
          <p>DineGo Kitchen · 18 Market Lane, Riverside</p>
          <nav className="flex flex-wrap items-center gap-4" aria-label="Footer">
            <Link href="/menu" className="transition hover:text-fg">
              Menu
            </Link>
            <Link href="/#story" className="transition hover:text-fg">
              Our Story
            </Link>
            <Link href="/#visit" className="transition hover:text-fg">
              Visit Us
            </Link>
            <Link href="/login" className="transition hover:text-fg">
              Login
            </Link>
          </nav>
          <p>Open daily · 12:00–22:00</p>
        </div>
      </footer>
    </div>
  );
}
