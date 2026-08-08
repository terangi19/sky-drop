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
  ctaSubtitle = "Up to 8 photos — first is the cover",
  className = "",
}: Props) {
  const openPicker = () => fileInputRef.current?.click();

  return (
    <div className={className || undefined}>
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
          className="group flex min-h-[14rem] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-5 py-10 text-center transition hover:border-white/20 hover:bg-white/[0.03] sm:min-h-[16rem]"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] text-zinc-400 transition group-hover:border-white/15 group-hover:text-zinc-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <span className="mt-4 text-base font-medium text-white">{ctaTitle}</span>
          <span className="mt-1.5 text-sm text-zinc-500">{ctaSubtitle}</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-zinc-300">{ctaTitle}</p>
            <p className="text-[11px] text-zinc-500">{imagePreviews.length}/8</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {imagePreviews.map((preview, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-xl bg-zinc-900/50"
              >
                <img src={preview} alt={`Listing photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/90">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
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
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/[0.12] text-zinc-500 transition hover:border-white/20 hover:text-zinc-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-[10px] font-medium">Add</span>
              </button>
            )}
          </div>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onUpload} className="hidden" />
    </div>
  );
}
