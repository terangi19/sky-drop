"use client";

import type { ChangeEvent, RefObject } from "react";

type Props = {
  imagePreviews: string[];
  fileInputRef: RefObject<HTMLInputElement>;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  /** Contextual empty-state title, e.g. "Add photos of your Skyline" */
  ctaTitle?: string;
  ctaSubtitle?: string;
  className?: string;
};

export default function SellPhotoUpload({
  imagePreviews,
  fileInputRef,
  onUpload,
  onRemove,
  ctaTitle = "Add photos",
  ctaSubtitle = "Upload up to 8 photos — first photo is your cover image",
  className = "",
}: Props) {
  const openPicker = () => fileInputRef.current?.click();

  return (
    <div className={className || undefined}>
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
        {imagePreviews.length === 0 ? (
          <div
            role="button"
            tabIndex={0}
            onClick={openPicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }}
            className="group relative flex min-h-[11rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.14] bg-white/[0.02] px-4 py-6 text-center transition hover:border-sky-500/35 hover:bg-sky-500/[0.04] active:scale-[0.99]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-sky-400/90">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <span className="mt-3 text-base font-semibold text-white">{ctaTitle}</span>
            <span className="mt-1.5 max-w-sm text-sm text-zinc-400">{ctaSubtitle}</span>
            <ul className="mt-3 max-w-sm space-y-1 text-left text-[11px] text-zinc-500">
              <li>• Bright, clear shots from a few angles</li>
              <li>• Show wear honestly — builds trust</li>
            </ul>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">{ctaTitle}</h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  First photo is the cover · {imagePreviews.length}/8
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-zinc-300">
                {imagePreviews.length}/8
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {imagePreviews.map((preview, i) => (
                <div
                  key={i}
                  className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/50"
                >
                  <img src={preview} alt={`Listing photo ${i + 1}`} className="h-24 w-full object-cover sm:h-28" />
                  {i === 0 && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-400"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {imagePreviews.length < 8 && (
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/[0.14] bg-white/[0.02] text-zinc-400 transition hover:border-sky-500/35 hover:text-sky-300 active:scale-[0.97] sm:h-28"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-[10px] font-semibold">Add more</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onUpload} className="hidden" />
    </div>
  );
}
