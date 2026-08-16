"use client";

import type { ReactNode } from "react";

type Props = {
  editMode?: boolean;
  onEnterManually: () => void;
  onFocusAwhina?: () => void;
  children?: ReactNode;
};

/**
 * Calm fresh-state hero for /post/ai — photo CTAs live in children (SellPhotoUpload).
 * Presentational only; parent owns all handlers/state.
 */
export default function SellEmptyHero({
  editMode = false,
  onEnterManually,
  onFocusAwhina,
  children,
}: Props) {
  if (editMode) return null;

  return (
    <section
      className="sell-empty-hero space-y-2 motion-safe:animate-[sellFade_180ms_ease-out] sm:space-y-5"
      aria-labelledby="sell-empty-heading"
    >
      <div className="text-center sm:space-y-2 sm:text-left">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-star)]">
          Sell with Āwhina
        </p>
        <h1
          id="sell-empty-heading"
          className="text-lg font-semibold leading-tight tracking-tight text-[var(--foreground)] sm:text-3xl"
        >
          Add a photo and Āwhina will build your listing for you.
        </h1>
        <p className="hidden text-base font-medium leading-snug text-[var(--foreground)] sm:block sm:text-lg">
          Take a clear photo to get started.
        </p>
      </div>

      {children}

      <p className="pt-1 text-center text-sm leading-relaxed text-[var(--muted)] sm:pt-0 sm:text-left">
        Āwhina can identify your item, write the title and description, choose the
        category, and fill in most details. You just add things it can&apos;t know,
        like price, condition, location and delivery.
      </p>

      <div className="flex items-center gap-3" role="separator" aria-label="or">
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
          or
        </span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        {onFocusAwhina ? (
          <button
            type="button"
            onClick={onFocusAwhina}
            className="sell-active-action inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border bg-[var(--surface-2)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--accent-primary)]/15 text-[10px] text-[var(--accent-star)]" aria-hidden>
              ✦
            </span>
            Tell Āwhina…
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEnterManually}
          data-testid="edit-details-empty"
          className="min-h-[44px] px-2 text-sm font-medium text-[var(--muted)] underline-offset-4 transition duration-150 hover:text-[var(--foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:ml-auto"
        >
          Enter details manually
        </button>
      </div>
    </section>
  );
}
