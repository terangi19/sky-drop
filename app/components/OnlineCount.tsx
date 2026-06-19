"use client";

type OnlineCountProps = {
  count?: number;
};

export default function OnlineCount({
  count = 0,
}: OnlineCountProps) {

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-[#111318]/90 px-3 py-2">

      <div className="relative">

        <div className="h-2 w-2 rounded-full bg-sky-400" />

        <div className="absolute inset-0 animate-ping rounded-full bg-sky-400 opacity-40" />

      </div>

      <div className="flex items-center gap-1">

        <span className="text-[12px] font-medium text-[var(--foreground)]">

          {count}

        </span>

        <span className="text-[11px] text-[var(--muted)]">

          online

        </span>

      </div>

    </div>
  );
}