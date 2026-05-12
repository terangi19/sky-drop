"use client";

type TradeComposerProps = {
  type: string;
  setType: (type: string) => void;

  title: string;
  setTitle: (value: string) => void;

  price: string;
  setPrice: (value: string) => void;

  location: string;
  setLocation: (value: string) => void;

  message: string;
  setMessage: (value: string) => void;

  selectedListing: string;
  setSelectedListing: (value: string) => void;

  listings: any[];

  posting: boolean;

  postTrade: () => void;

  imagePreview: string;
  setImagePreview: (value: string) => void;
};

export default function TradeComposer({
  type,
  setType,

  title,
  setTitle,

  price,
  setPrice,

  message,
  setMessage,

  posting,

  postTrade,
}: TradeComposerProps) {

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-[#111318]/90 p-5">

      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

        {/* LEFT */}
        <div>

          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">

            Post Trade

          </p>

          <h2 className="mt-1 text-[30px] font-bold tracking-tight text-white">

            Live Trade Feed

          </h2>

        </div>

        {/* TYPE BUTTONS */}
        <div className="flex gap-2">

          {["WTS", "WTB", "Trading"].map(
            (tradeType) => (

              <button
                key={tradeType}
                onClick={() =>
                  setType(
                    tradeType
                  )
                }
                className={`rounded-xl px-4 py-2 text-[12px] font-medium transition-all duration-200 ${
                  type === tradeType
                    ? "bg-sky-500 text-white"
                    : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.07] hover:text-white"
                }`}
              >

                {tradeType}

              </button>

            )
          )}

        </div>

      </div>

      {/* INPUTS */}
      <div
        className={`mt-5 grid gap-3 ${
          type === "Trading"
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[1fr_160px]"
        }`}
      >

        {/* TITLE */}
        <input
          type="text"
          value={title}
          onChange={(e) =>
            setTitle(
              e.target.value
            )
          }
          placeholder="Listing title"
          className="h-12 rounded-xl border border-white/[0.04] bg-[#181b22] px-4 text-[14px] text-white outline-none placeholder:text-zinc-600 focus:border-white/[0.08]"
        />

        {/* PRICE / BUDGET */}
        {type !== "Trading" && (

          <input
            type="text"
            value={price}
            onChange={(e) =>
              setPrice(
                e.target.value
              )
            }
            placeholder={
              type === "WTB"
                ? "Budget"
                : "Price"
            }
            className="h-12 rounded-xl border border-white/[0.04] bg-[#181b22] px-4 text-[14px] text-white outline-none placeholder:text-zinc-600 focus:border-white/[0.08]"
          />

        )}

      </div>

      {/* DESCRIPTION */}
      <div className="mt-3">

        <textarea
          value={message}
          onChange={(e) =>
            setMessage(
              e.target.value
            )
          }
          placeholder="Describe your trade..."
          rows={4}
          className="w-full resize-none rounded-xl border border-white/[0.04] bg-[#181b22] px-4 py-4 text-[14px] text-white outline-none placeholder:text-zinc-600 focus:border-white/[0.08]"
        />

      </div>

      {/* FOOTER */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <p className="text-[12px] text-zinc-500">

          Trades appear instantly in the live marketplace feed.

        </p>

        <button
          onClick={postTrade}
          disabled={posting}
          className="rounded-xl bg-sky-500 px-5 py-3 text-[13px] font-medium text-white transition hover:bg-sky-400 disabled:opacity-50"
        >

          {posting
            ? "Posting..."
            : "Post Trade"}

        </button>

      </div>

    </div>
  );
}