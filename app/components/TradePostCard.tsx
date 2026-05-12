import UserBadge from "./UserBadge";

type TradePostCardProps = {
  post: any;
  user: any;

  formatTime: (
    timestamp: any
  ) => string;

  deleteTrade: (
    id: string
  ) => void;
};

export default function TradePostCard({
  post,
  user,
  formatTime,
  deleteTrade,
}: TradePostCardProps) {

  function getTypeStyles() {

    if (
      post.type === "WTB"
    ) {
      return "bg-emerald-500/[0.08] text-emerald-300";
    }

    if (
      post.type === "Trading"
    ) {
      return "bg-violet-500/[0.08] text-violet-300";
    }

    return "bg-sky-500/[0.08] text-sky-300";
  }

  return (
    <div className="group rounded-2xl border border-white/[0.045] bg-[#111318]/95 p-4 transition hover:bg-[#151922]">

      <div className="flex gap-4">

        {/* IMAGE */}
        <div className="h-[110px] w-[110px] shrink-0 overflow-hidden rounded-2xl bg-[#1a1d24]">

          {post.image ? (

            <img
              src={post.image}
              alt={post.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />

          ) : (

            <div className="flex h-full w-full items-center justify-center">

              <span className="text-[11px] text-zinc-600">

                No image

              </span>

            </div>

          )}

        </div>

        {/* CONTENT */}
        <div className="min-w-0 flex-1">

          {/* TOP */}
          <div className="flex items-start justify-between gap-4">

            {/* LEFT */}
            <div className="min-w-0">

              <div className="flex flex-wrap items-center gap-2">

                <div
                  className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${getTypeStyles()}`}
                >

                  {post.type}

                </div>

                <span className="text-[12px] text-zinc-400">

                  @{post.sellerUsername}

                </span>

                <span className="text-zinc-700">
                  •
                </span>

                <span className="text-[12px] text-zinc-500">

                  {formatTime(
                    post.createdAt
                  )}

                </span>

              </div>

              {/* TITLE */}
              <h2 className="mt-3 line-clamp-1 text-[22px] font-bold tracking-tight text-white">

                {post.title}

              </h2>

              {/* DESCRIPTION */}
              <p className="mt-2 line-clamp-2 max-w-[700px] text-[14px] leading-relaxed text-zinc-400">

                {post.message ||
                  "No description added."}

              </p>

            </div>

            {/* PRICE */}
            <div className="shrink-0 text-right">

              <p className="text-[11px] text-zinc-500">

                Price

              </p>

              <h3 className="mt-1 text-[28px] font-bold tracking-tight text-white">

                {post.price
                  ? `$${post.price}`
                  : "Trade"}

              </h3>

            </div>

          </div>

          {/* FOOTER */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">

            {/* META */}
            <div className="flex flex-wrap items-center gap-2">

              <div className="rounded-lg bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-400">

                {post.location ||
                  "Auckland"}

              </div>

              <UserBadge
                verified
              />

            </div>

            {/* ACTIONS */}
            <div className="flex items-center gap-2">

              <button className="rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-white transition hover:bg-white/[0.07]">

                Message

              </button>

              {user?.email ===
                post.sellerEmail && (

                <button
                  onClick={() =>
                    deleteTrade(
                      post.id
                    )
                  }
                  className="rounded-lg border border-red-500/15 bg-red-500/[0.06] px-3 py-2 text-[12px] font-medium text-red-400 transition hover:bg-red-500/[0.1]"
                >

                  Delete

                </button>

              )}

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}