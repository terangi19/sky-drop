"use client";

export const REVIEW_STAR_CLASS =
  "text-[var(--review-star)] drop-shadow-[0_0_4px_rgba(251,191,36,0.22)]";

export const REVIEW_STAR_HOVER_CLASS =
  "hover:text-[var(--review-star-hover)]";

export function starGlyphCount(rating: number): { fullStars: number; hasHalf: boolean } {
  const fullStars = Math.floor(Math.max(0, rating));
  const hasHalf = rating - fullStars >= 0.5;
  return { fullStars, hasHalf };
}

type ReviewStarsProps = {
  rating: number;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
};

const SIZE_CLASS = {
  xs: "text-[10px]",
  sm: "text-[11px]",
  md: "text-sm",
  lg: "text-base",
} as const;

export function ReviewStars({ rating, className = "", size = "sm" }: ReviewStarsProps) {
  const { fullStars, hasHalf } = starGlyphCount(rating);
  if (fullStars === 0 && !hasHalf) return null;

  return (
    <span className={`${REVIEW_STAR_CLASS} ${SIZE_CLASS[size]} ${className}`} aria-hidden>
      {"★".repeat(fullStars)}
      {hasHalf ? "½" : ""}
    </span>
  );
}

type SellerReviewSummaryProps = {
  avg: number;
  count: number;
  className?: string;
  starSize?: "xs" | "sm" | "md";
  ratingClassName?: string;
  countClassName?: string;
  emptyLabel?: string;
};

export function SellerReviewSummary({
  avg,
  count,
  className = "",
  starSize = "sm",
  ratingClassName = "text-white",
  countClassName = "text-zinc-500",
  emptyLabel = "No reviews yet",
}: SellerReviewSummaryProps) {
  if (count <= 0 || avg <= 0) {
    return <span className={`text-[11px] ${countClassName} ${className}`}>{emptyLabel}</span>;
  }

  const metaSize = starSize === "xs" ? "text-[10px]" : starSize === "md" ? "text-sm" : "text-[11px]";

  return (
    <span className={`inline-flex items-center gap-1 ${metaSize} ${className}`}>
      <ReviewStars rating={avg} size={starSize} />
      <span className={ratingClassName}>{avg.toFixed(1)}</span>
      <span className={countClassName}>·</span>
      <span className={countClassName}>
        {count} review{count !== 1 ? "s" : ""}
      </span>
    </span>
  );
}

type InteractiveReviewStarsProps = {
  value: number;
  onChange: (value: number) => void;
  className?: string;
};

export function InteractiveReviewStars({ value, onChange, className = "" }: InteractiveReviewStarsProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-2xl transition ${
            star <= value
              ? `${REVIEW_STAR_CLASS} ${REVIEW_STAR_HOVER_CLASS}`
              : "text-zinc-700 hover:text-zinc-500"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
