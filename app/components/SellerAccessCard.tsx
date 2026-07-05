"use client";

type SellerAccessCardProps = {
  readyToList: boolean;
  listingBlockReason: string | null;
  className?: string;
};

export default function SellerAccessCard({
  readyToList,
  listingBlockReason,
  className = "",
}: SellerAccessCardProps) {
  const needsSetup = !readyToList && listingBlockReason;

  return (
    <div
      className={`rounded-xl border px-4 py-4 ${
        readyToList
          ? "border-sky-500/25 bg-sky-500/[0.06]"
          : "border-white/[0.06] bg-white/[0.02]"
      } ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Seller access</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Browse and buy anytime. List items whenever you&apos;re ready to sell.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            readyToList
              ? "bg-sky-500/20 text-sky-300"
              : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {readyToList ? "Ready to sell" : "Almost ready"}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-white/[0.04] bg-black/20 px-3 py-3">
        <p className="text-sm font-medium text-white">
          {readyToList ? "Ready to sell" : "Complete your profile"}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          {readyToList
            ? "You can list items for sale."
            : listingBlockReason || "Finish any remaining profile steps to start selling."}
        </p>
      </div>

      {needsSetup && (
        <p className="mt-4 text-xs text-amber-300/90">{listingBlockReason}</p>
      )}
    </div>
  );
}
