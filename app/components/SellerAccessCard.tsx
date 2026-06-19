"use client";

import { getSellerAccessState, kycRequiredBlockMessage } from "../lib/seller-eligibility";

type SellerAccessCardProps = {
  kycApproved: boolean;
  memberSince: Date | null;
  readyToList: boolean;
  listingBlockReason: string | null;
  onVerifyId?: () => void;
  className?: string;
};

export default function SellerAccessCard({
  kycApproved,
  readyToList,
  listingBlockReason,
  onVerifyId,
  className = "",
}: SellerAccessCardProps) {
  const accessState = getSellerAccessState(kycApproved);

  const unlocked = accessState === "kyc_unlocked";
  const needsSetup = unlocked && !readyToList && listingBlockReason;

  let statusTitle = "ID verification required";
  let statusDetail = kycRequiredBlockMessage();

  if (accessState === "kyc_unlocked") {
    statusTitle = "ID verified";
    statusDetail = "Your identity is verified — you can list items for sale.";
  }

  return (
    <div
      className={`rounded-xl border px-4 py-4 ${
        unlocked
          ? "border-sky-500/25 bg-sky-500/[0.06]"
          : "border-white/[0.06] bg-white/[0.02]"
      } ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Seller access</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Browse and buy anytime. Complete ID verification to sell.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            readyToList
              ? "bg-sky-500/20 text-sky-300"
              : unlocked
                ? "bg-amber-500/15 text-amber-300"
                : "bg-white/[0.06] text-zinc-400"
          }`}
        >
          {readyToList ? "Ready to sell" : unlocked ? "Almost ready" : "In progress"}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-white/[0.04] bg-black/20 px-3 py-3">
        <p className="text-sm font-medium text-white">{statusTitle}</p>
        <p className="mt-1 text-xs text-zinc-400">{statusDetail}</p>
      </div>

      {needsSetup && (
        <p className="mt-4 text-xs text-amber-300/90">{listingBlockReason}</p>
      )}

      {!readyToList && accessState === "needs_kyc" && onVerifyId && (
        <button
          type="button"
          onClick={onVerifyId}
          className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-sky-400 active:scale-[0.99] sm:w-auto"
        >
          Verify ID to start selling
        </button>
      )}
    </div>
  );
}
