"use client";

type TradeTickerProps = {
  trades?: any[];
};

export default function TradeTicker({
  trades = [],
}: TradeTickerProps) {

  if (!trades.length) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.04] bg-[#111318]/90">

      <div className="flex items-center border-b border-white/[0.04] px-4 py-3">

        <div className="mr-2 h-2 w-2 rounded-full bg-emerald-400" />

        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">

          Live Marketplace Activity

        </span>

      </div>

      <div className="relative overflow-hidden">

        <div className="ticker-track flex min-w-max gap-3 px-4 py-3">

          {trades.map(
            (trade, index) => (

              <div
                key={index}
                className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2"
              >

                {/* IMAGE */}
                <div className="h-10 w-10 overflow-hidden rounded-lg bg-[#1a1d24]">

                  {trade.image ? (
                    <img
                      src={trade.image}
                      alt={trade.title}
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

                  <p className="line-clamp-1 text-[12px] font-medium text-white">

                    {trade.title}

                  </p>

                  <p className="text-[10px] text-zinc-500">

                    @{trade.sellerUsername}

                  </p>

                </div>

                {/* PRICE */}
                <div className="text-[12px] font-medium text-white">

                  {trade.price
                    ? `$${trade.price}`
                    : "Trade"}

                </div>

              </div>
            )
          )}

        </div>

      </div>

      <style jsx>{`
        .ticker-track {
          animation: ticker 45s linear infinite;
        }

        @keyframes ticker {
          from {
            transform: translateX(0);
          }

          to {
            transform: translateX(-50%);
          }
        }
      `}</style>

    </div>
  );
}