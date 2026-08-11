"use client";

type Props = {
  thumbUrl?: string | null;
  title?: string;
  category?: string;
  statusLabel?: string;
  visible: boolean;
};

/**
 * Compact “building listing” strip after identity is known — not a giant loading card.
 */
export default function SellWorkingStrip({
  thumbUrl,
  title,
  category,
  statusLabel = "Building listing…",
  visible,
}: Props) {
  if (!visible) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2.5 motion-safe:animate-[sellFade_160ms_ease-out]"
      role="status"
      aria-live="polite"
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-3)] text-[var(--accent-star)]"
          aria-hidden
        >
          ✦
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--foreground)]">
          {title?.trim() || "Looking at your photo…"}
        </p>
        <p className="truncate text-xs text-[var(--muted)]">
          {[category, statusLabel].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--accent-primary)]/70 border-t-transparent"
        aria-hidden
      />
    </div>
  );
}
