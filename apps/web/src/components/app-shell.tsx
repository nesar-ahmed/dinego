"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartToast } from "@/components/cart/cart-toast";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { OrderUpdateToast } from "@/components/notifications/order-update-toast";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin") || pathname.startsWith("/staff")) {
    return <div className="min-h-dvh w-full">{children}</div>;
  }

  return (
    <CartProvider>
      <NotificationsProvider>
        <div className="flex min-h-screen w-full flex-col">
          <SiteHeader />

          <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-6">{children}</main>

          <SiteFooter />
        </div>
        <CartDrawer />
        <CartToast />
        <OrderUpdateToast />
      </NotificationsProvider>
    </CartProvider>
  );
}
