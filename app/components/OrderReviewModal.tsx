"use client";

import { InteractiveReviewStars } from "./SellerReviewStars";
import { REVIEW_COMMENT_MAX } from "../lib/order-reviews";

type Props = {
  open: boolean;
  title: string;
  subtitle: string;
  rating: number;
  comment: string;
  sending: boolean;
  onRatingChange: (n: number) => void;
  onCommentChange: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function OrderReviewModal({
  open,
  title,
  subtitle,
  rating,
  comment,
  sending,
  onRatingChange,
  onCommentChange,
  onClose,
  onSubmit,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-black text-[var(--foreground)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        <InteractiveReviewStars value={rating} onChange={onRatingChange} className="mt-4" />
        <textarea
          placeholder="Optional comment..."
          value={comment}
          maxLength={REVIEW_COMMENT_MAX}
          onChange={(e) => onCommentChange(e.target.value)}
          rows={3}
          className="mt-4 w-full rounded-xl border border-[var(--input-border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500 placeholder:text-[var(--muted)]"
        />
        <p className="mt-1 text-right text-[10px] text-[var(--muted)]">
          {comment.length}/{REVIEW_COMMENT_MAX}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-[var(--card-hover)] active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!rating || sending}
            onClick={onSubmit}
            className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-always-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97] disabled:opacity-50"
          >
            {sending ? "Sending..." : "Submit Review"}
          </button>
        </div>
      </div>
    </div>
  );
}
