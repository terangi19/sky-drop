type TrendingTradesProps = {
  trendingPosts?: any[];

  formatTime: (
    timestamp: any
  ) => string;
};

export default function TrendingTrades({
  trendingPosts = [],
  formatTime,
}: TrendingTradesProps) {

  if (
    !trendingPosts ||
    trendingPosts.length === 0
  ) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-[#111318]/90 p-4">

      {/* HEADER */}
      <div className="mb-4">

        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">

          Trending Listings

        </p>

        <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-white">

          Popular Right Now

        </h2>

      </div>

      {/* LIST */}
      <div className="space-y-2">

        {trendingPosts.map(
          (post) => (

            <div
              key={post.id}
              className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.04]"
            >

              {/* IMAGE */}
              <div className="h-[58px] w-[58px] overflow-hidden rounded-xl bg-[#1a1d24]">

                {post.image ? (
                  <img
                    src={post.image}
                    alt={post.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
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
              <div className="min-w-0 flex-1">

                <h3 className="line-clamp-1 text-[13px] font-medium text-white">

                  {post.title}

                </h3>

                <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">

                  <span>
                    @{post.sellerUsername}
                  </span>

                  <span className="text-zinc-700">
                    •
                  </span>

                  <span>
                    {formatTime(
                      post.createdAt
                    )}
                  </span>

                </div>

              </div>

              {/* PRICE */}
              <div className="text-right">

                <p className="text-[13px] font-semibold text-white">

                  {post.price
                    ? `$${post.price}`
                    : "Trade"}

                </p>

              </div>

            </div>
          )
        )}

      </div>

    </div>
  );
}