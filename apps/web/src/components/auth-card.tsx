import type { ReactNode } from "react";

type AuthCardProps = {
  children: ReactNode;
  footer: ReactNode;
};

export function AuthCard({ children, footer }: AuthCardProps) {
  return (
    <div className="relative flex min-h-[calc(100dvh-12rem)] w-full items-center justify-center px-1 py-10">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 size-80 -translate-x-1/2 rounded-full bg-brand/10 blur-[90px]"
        aria-hidden
      />

      <section className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-premium sm:p-8">
        {children}

        <div className="mt-6 border-t border-line pt-5 text-sm text-muted">{footer}</div>
      </section>
    </div>
  );
}
