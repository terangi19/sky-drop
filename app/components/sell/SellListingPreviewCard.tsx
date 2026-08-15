"use client";

type Props = {
  coverUrl?: string | null;
  title: string;
  price?: string;
  meta?: string;
  descriptionSnippet?: string;
  typeLabel?: string;
  flashTitle?: boolean;
  flashPrice?: boolean;
  isReady?: boolean;
  isReviewing?: boolean;
  showManualEditor: boolean;
  hasDraft: boolean;
  awhinaIsAsking?: boolean;
  onReview: () => void;
  onPublish: () => void;
  onEditDetails: () => void;
  onDoneEditing: () => void;
  onAnswerAwhina?: () => void;
};

/**
 * Buyer-like compact listing preview. Chat owns conversation; this owns listing glance.
 */
export default function SellListingPreviewCard({
  coverUrl,
  title,
  price,
  meta,
  descriptionSnippet,
  typeLabel,
  flashTitle,
  flashPrice,
  isReady,
  isReviewing,
  showManualEditor,
  hasDraft,
  awhinaIsAsking,
  onReview,
  onPublish,
  onEditDetails,
  onDoneEditing,
  onAnswerAwhina,
}: Props) {
  return (
    <div
      id="live-listing-draft"
      className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] motion-safe:animate-[sellFade_180ms_ease-out]"
    >
      {coverUrl ? (
        <div className="relative aspect-[16/10] w-full bg-[var(--surface-3)] sm:aspect-[2/1]">
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
          {typeLabel ? (
            <span className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
              {typeLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 p-4 sm:p-5">
        {hasDraft ? (
          <div className="space-y-1.5">
            <h2
              className={`text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl ${
                flashTitle ? "text-[var(--accent-star)] transition-colors duration-500" : ""
              }`}
            >
              {title || "Your listing"}
            </h2>
            {price ? (
              <p
                className={`text-lg font-medium text-[var(--foreground)] sm:text-xl ${
                  flashPrice ? "text-[var(--accent-star)] transition-colors duration-500" : ""
                }`}
              >
                {price}
                {flashPrice ? (
                  <span className="ml-1.5 text-sm font-normal text-[var(--accent-star)]">✓</span>
                ) : null}
              </p>
            ) : null}
            {meta ? (
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{meta}</p>
            ) : null}
            {descriptionSnippet?.trim() ? (
              <p className="line-clamp-3 text-sm leading-relaxed text-[var(--muted)]">
                {descriptionSnippet}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-base font-medium text-[var(--foreground)]">Photos added</p>
            <p className="text-sm text-[var(--muted)]">
              Āwhina is building your listing.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-0.5">
          {isReviewing ? (
            <button
              type="button"
              onClick={onPublish}
              className="hidden min-h-[44px] items-center justify-center rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white transition duration-150 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:inline-flex"
            >
              Publish listing
            </button>
          ) : isReady ? (
            <button
              type="button"
              onClick={onReview}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white transition duration-150 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              Review
            </button>
          ) : null}
          {!showManualEditor ? (
            <button
              type="button"
              onClick={onEditDetails}
              data-testid={hasDraft ? "edit-details-listing" : "edit-details-empty"}
              className="min-h-[44px] text-sm font-medium text-[var(--muted)] underline-offset-4 transition duration-150 hover:text-[var(--foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              Edit details
            </button>
          ) : (
            <button
              type="button"
              onClick={onDoneEditing}
              data-testid="done-editing"
              className="min-h-[44px] text-sm font-medium text-[var(--muted)] transition duration-150 hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              Done editing
            </button>
          )}
          {awhinaIsAsking && onAnswerAwhina ? (
            <button
              type="button"
              onClick={onAnswerAwhina}
              className="min-h-[44px] text-sm font-medium text-[var(--accent-star)] transition duration-150 hover:text-[var(--accent-primary)] lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              Answer Āwhina
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
