import Link from "next/link";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
};

/** Shared empty / zero-results state for marketplace pages. */
export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = "",
}: EmptyStateProps) {
  const actionClass =
    "inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110 active:scale-[0.98]";

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center sm:py-16 ${className}`}
      role="status"
    >
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 text-2xl ring-1 ring-sky-500/20">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-bold text-[var(--foreground)] sm:text-lg">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">{description}</p>
      ) : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className={`mt-5 ${actionClass}`}>
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && onAction && !actionHref ? (
        <button type="button" onClick={onAction} className={`mt-5 ${actionClass}`}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
