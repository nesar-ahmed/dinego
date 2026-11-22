import type { ReactNode } from "react";
import type { NotificationCategory } from "@dinego/shared";

/** Neutral round icon for a notification's category. Unread state is shown separately. */
export function NotificationIcon({
  category,
  className = "size-9",
}: {
  category: NotificationCategory;
  className?: string;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-fg ${className}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        {ICONS[category]}
      </svg>
    </span>
  );
}

const ICONS: Record<NotificationCategory, ReactNode> = {
  ACCOUNT: (
    <>
      <path d="M12 3.5 5 6.2v5.3c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6.2l-7-2.7Z" />
      <path d="m9.2 12.2 2 2 3.8-4" />
    </>
  ),
  ORDER: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  PAYMENT: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  FLOOR: (
    <>
      <path d="M4 9h16M6 9v10M18 9v10" />
      <path d="M8 5h8" />
    </>
  ),
  SYSTEM: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.1" />
    </>
  ),
};

export function BellIcon({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 9.5a6 6 0 0 1 12 0c0 3.6.9 5.6 1.8 6.8.3.4 0 .9-.5.9H4.7c-.5 0-.8-.5-.5-.9C5.1 15.1 6 13.1 6 9.5Z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}
