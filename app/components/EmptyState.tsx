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
  const actionClass = "btn btn-primary mt-5";

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-6 py-12 text-center sm:py-16 ${className}`}
      role="status"
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--info-muted)] text-[var(--info)] ring-1 ring-[var(--lc-badge-border)]">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-[var(--foreground)] sm:text-lg">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">{description}</p>
      ) : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className={actionClass}>
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && onAction && !actionHref ? (
        <button type="button" onClick={onAction} className={actionClass}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
