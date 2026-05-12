"use client";

type LivePopupProps = {
  trades?: any[];
};

export default function LivePopup({
  trades = [],
}: LivePopupProps) {

  if (!trades.length) {
    return null;
  }

  const latestTrade =
    trades[0];

  return (
    <div className="fixed bottom-5 right-5 z-50 hidden md:block">

      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-[#111318]/95 px-3 py-3 shadow-xl backdrop-blur-xl">

        {/* IMAGE */}
        <div className="h-11 w-11 overflow-hidden rounded-xl bg-[#1a1d24]">

          {latestTrade.image ? (
            <img
              src={latestTrade.image}
              alt={latestTrade.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">

              <span className="text-[10px] text-zinc-600">

                SD

              </span>

            </div>
          )}

        </div>

        {/* CONTENT */}
        <div className="min-w-0">

          <p className="text-[11px] text-zinc-500">

            New listing posted

          </p>

          <p className="mt-0.5 line-clamp-1 text-[13px] font-medium text-white">

            {latestTrade.title}

          </p>

          <p className="mt-0.5 text-[11px] text-zinc-500">

            @{latestTrade.sellerUsername}

          </p>

        </div>

      </div>

    </div>
  );
}