"use client";

import UserBadge from "./UserBadge";

type TradePostCardProps = {
  post: any;
  user: any;
  formatTime: (timestamp: any) => string;
  deleteTrade: (id: string) => void;
};

import { useMemo } from "react";

export default function TradePostCard({ post, user, formatTime, deleteTrade }: TradePostCardProps) {
  const now = useMemo(() => Date.now(), []);
  const isNew = post.createdAt && (now - (post.createdAt?.seconds || 0) * 1000) < 300000;

  function getTypeStyles() {
    if (post.type === "WTB") return "bg-sky-500/10 text-sky-400";
    if (post.type === "Trading") return "bg-sky-500/10 text-sky-400";
    return "bg-sky-500/10 text-sky-400";
  }

  return (
    <div className="flex gap-3 rounded-xl border border-white/5 bg-zinc-900/50 p-3 transition hover:bg-zinc-900">
      {/* IMAGE */}
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
        {post.image ? (
          <img src={post.image} alt={post.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600 text-xs">None</div>
        )}
      </div>

      {/* CONTENT */}
      <div className="min-w-0 flex-1">
        {/* TOP ROW */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded px-1.5 py-0.5 font-medium ${getTypeStyles()}`}>{post.type}</span>
          {isNew && <span className="animate-bounce rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-[var(--foreground)]">NEW</span>}
          <span className="text-[var(--muted)]">@{post.sellerUsername}</span>
          <span className="text-zinc-600">•</span>
          <span className="text-[var(--muted)]">{formatTime(post.createdAt)}</span>
        </div>

        {/* TITLE & PRICE */}
        <div className="mt-1 flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-[var(--foreground)]">{post.title}</h3>
          <span className="shrink-0 font-bold text-sky-400">{post.price ? `$${post.price}` : "Trade"}</span>
        </div>

        {/* DESCRIPTION */}
        <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{post.message || "No description"}</p>

        {/* ACTIONS */}
        <div className="mt-2 flex items-center gap-2">
          <button className="rounded bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/20">Message</button>
          {user?.email === post.sellerEmail && (
            <button onClick={() => deleteTrade(post.id)} className="rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20">Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}