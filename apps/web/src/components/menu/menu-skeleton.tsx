function SkeletonCard() {
  return (
    <div className="h-44 rounded-2xl border border-line bg-surface/70 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="h-4 w-2/5 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
        <div className="h-4 w-12 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
      </div>
      <div className="mt-4 h-3 w-4/5 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
      <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
      <div className="mt-6 flex gap-2">
        <div className="h-6 w-20 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none" />
        <div className="h-6 w-16 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

/** Placeholder shown while the first menu response loads. */
export function MenuSkeleton() {
  return (
    <div aria-hidden className="space-y-10">
      {[4, 6].map((cards, section) => (
        <section key={section}>
          <div className="h-7 w-44 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
          <div className="mt-2 h-3 w-64 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: cards }, (_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
