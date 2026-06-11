"use client";

import {
  SELL_WAIT_DAYS,
  getSellerAccessState,
  sellUnlockDate,
  sellUnlockDaysLeft,
  sellWaitDaysElapsed,
  sellWaitProgressPercent,
} from "../lib/seller-eligibility";

const dateFmt: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-NZ", dateFmt);
}

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
  memberSince,
  readyToList,
  listingBlockReason,
  onVerifyId,
  className = "",
}: SellerAccessCardProps) {
  const accessState = getSellerAccessState(kycApproved, memberSince);
  const unlockDate = sellUnlockDate(memberSince);
  const daysLeft = sellUnlockDaysLeft(memberSince);
  const daysElapsed = sellWaitDaysElapsed(memberSince);
  const progress = sellWaitProgressPercent(memberSince);

  const unlocked = accessState === "kyc_unlocked" || accessState === "wait_complete";
  const showProgress = accessState === "waiting" && !!memberSince;

  let statusTitle = "Waiting period";
  let statusDetail = `Selling unlocks after ${SELL_WAIT_DAYS} days on Sky Drop, or immediately with ID verification.`;

  if (accessState === "kyc_unlocked") {
    statusTitle = "Unlocked via ID verification";
    statusDetail = "Your identity is verified — no 30-day wait required.";
  } else if (accessState === "wait_complete") {
    statusTitle = "30-day wait complete";
    statusDetail = "Your account is old enough to sell without ID verification.";
  } else if (accessState === "no_join_date") {
    statusTitle = "Countdown not started";
    statusDetail = "Complete your profile to record your join date and start the 30-day timer.";
  } else {
    statusDetail = `${daysLeft} day${daysLeft === 1 ? "" : "s"} until you can sell without ID verification.`;
  }

  const needsSetup = unlocked && !readyToList && listingBlockReason;

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
            Browse and buy anytime. Selling needs verification or account age.
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

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Joined</dt>
          <dd className="mt-0.5 text-sm text-white">{formatDate(memberSince)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {accessState === "kyc_unlocked" ? "Sell access" : "Selling unlocks"}
          </dt>
          <dd className="mt-0.5 text-sm text-white">
            {accessState === "kyc_unlocked"
              ? "Immediate (ID verified)"
              : accessState === "wait_complete"
                ? "Now (30 days met)"
                : formatDate(unlockDate)}
          </dd>
        </div>
      </dl>

      {showProgress && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-zinc-500">
              Day {daysElapsed} of {SELL_WAIT_DAYS}
            </span>
            <span className="font-medium text-sky-300">
              {daysLeft} day{daysLeft === 1 ? "" : "s"} left
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {needsSetup && (
        <p className="mt-4 text-xs text-amber-300/90">{listingBlockReason}</p>
      )}

      {!readyToList && accessState === "waiting" && onVerifyId && (
        <button
          type="button"
          onClick={onVerifyId}
          className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-sky-400 active:scale-[0.99] sm:w-auto"
        >
          Verify ID to sell now
        </button>
      )}

      {!readyToList && accessState === "no_join_date" && onVerifyId && (
        <p className="mt-3 text-xs text-zinc-500">
          Or{" "}
          <button type="button" onClick={onVerifyId} className="font-medium text-sky-400 hover:text-sky-300">
            verify your ID
          </button>{" "}
          to skip the wait.
        </p>
      )}
    </div>
  );
}
