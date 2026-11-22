const phrases = [
  "Seasonal small plates",
  "Comforting mains",
  "Desserts worth staying for",
  "Coffee & house pours",
  "Dine in",
  "Take away",
  "Made to share",
];

/** Slow, pausable ticker. Decorative: hidden from assistive technology; stops for reduced motion. */
export function DishMarquee() {
  const sequence = [...phrases, ...phrases];

  return (
    <div className="overflow-hidden border-y border-line py-5" aria-hidden>
      <div className="animate-marquee flex w-max items-center gap-8 whitespace-nowrap">
        {sequence.map((phrase, index) => (
          <span key={index} className="flex items-center gap-8">
            <span className="font-serif text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              {phrase}
            </span>
            <svg viewBox="0 0 20 20" className="size-3.5 text-brand" fill="currentColor">
              <path d="M10 0c.6 4.9 5.1 9.4 10 10-4.9.6-9.4 5.1-10 10-.6-4.9-5.1-9.4-10-10C4.9 9.4 9.4 4.9 10 0Z" />
            </svg>
          </span>
        ))}
      </div>
    </div>
  );
}
