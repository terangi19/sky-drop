"use client";

import {
  getRefundDisplay,
  getRefundHeadline,
  getRefundSubtext,
  REFUND_CARD_CLASS,
  type RefundViewerRole,
} from "../lib/refund-display";

type RefundStatusCardProps = {
  role: RefundViewerRole;
  refundAmount?: number | null;
  refundedAt?: unknown;
  total?: number | null;
  variant?: "default" | "compact";
  className?: string;
};

function RefundIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10h10a4 4 0 014 4v0a4 4 0 01-4 4H5m0-8l-3 3m3-3L5 6"
      />
    </svg>
  );
}

export default function RefundStatusCard({
  role,
  refundAmount,
  refundedAt,
  total,
  variant = "default",
  className = "",
}: RefundStatusCardProps) {
  const display = getRefundDisplay({ refundAmount, refundedAt, total });
  const headline = getRefundHeadline(role);
  const subtext = getRefundSubtext(role);

  if (variant === "compact") {
    return (
      <div className={`${REFUND_CARD_CLASS} p-3 ${className}`}>
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-500/30">
            <RefundIcon className="h-4 w-4 text-violet-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-400">
              Fully refunded
            </p>
            <p className="mt-0.5 text-[12px] font-bold text-[var(--foreground)]">{headline}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span className="text-[var(--muted)]">
                Amount{" "}
                <span className="font-bold text-violet-300">{display.amountLabel}</span>
              </span>
              <span className="text-[var(--muted)]">
                Date{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {display.refundedOnLabel}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${REFUND_CARD_CLASS} p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-500/20 ring-2 ring-violet-500/30">
          <RefundIcon className="h-5 w-5 text-violet-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-400">
            Fully refunded
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{subtext}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-violet-500/15 bg-violet-500/5 p-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-400/80">
                Refund amount
              </p>
              <p className="mt-0.5 text-sm font-black text-violet-300">{display.amountLabel}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-400/80">
                Refunded on
              </p>
              <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">
                {display.refundedOnLabel}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
