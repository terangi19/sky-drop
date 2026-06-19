"use client";

import type { ChangeEvent, RefObject } from "react";

type Props = {
  imagePreviews: string[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
};

export default function SellPhotoUpload({ imagePreviews, fileInputRef, onUpload, onRemove }: Props) {
  const openPicker = () => fileInputRef.current?.click();

  return (
    <div className="mb-6">
      <div className="relative overflow-hidden rounded-2xl border border-[#D6ECFF] bg-white p-4 shadow-[0_4px_24px_rgba(14,165,233,0.08)] dark:border-sky-500/20 dark:bg-gradient-to-br dark:from-sky-500/[0.06] dark:via-sky-500/[0.04] dark:to-zinc-950/80 dark:shadow-[0_0_40px_rgba(14,165,233,0.08)] sm:p-5">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-sky-400/10 blur-2xl pointer-events-none dark:bg-sky-500/10" />
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
            className="group relative flex min-h-[10.5rem] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-sky-400/60 bg-white px-4 py-6 text-center transition-all duration-200 hover:border-sky-500 hover:bg-sky-50 hover:shadow-[0_8px_28px_rgba(14,165,233,0.14)] active:scale-[0.99] dark:border-white/[0.12] dark:bg-white/[0.02] dark:hover:border-sky-500/50 dark:hover:bg-sky-500/[0.04]"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D6ECFF] bg-sky-50 text-sky-500 shadow-sm transition-transform duration-200 group-hover:scale-105 dark:border-white/[0.08] dark:bg-sky-500/10">
              <svg className="h-7 w-7 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <span className="mt-4 text-base font-bold text-[#111827] dark:text-white">Add Photos</span>
            <span className="mt-1.5 max-w-sm text-sm text-[#6B7280] dark:text-zinc-400">
              Upload up to 8 photos to attract more buyers
            </span>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#111827] dark:text-white">Add Photos</h2>
                <p className="mt-0.5 text-sm text-[#6B7280] dark:text-zinc-400">
                  Upload up to 8 photos to attract more buyers
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-[#D6ECFF] bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-600 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300">
                {imagePreviews.length}/8
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {imagePreviews.map((preview, i) => (
                <div
                  key={i}
                  className="group relative overflow-hidden rounded-xl border border-[#D6ECFF] bg-white ring-1 ring-sky-100 dark:border-white/[0.06] dark:bg-zinc-900/60 dark:ring-white/[0.06]"
                >
                  <img src={preview} alt={`Listing photo ${i + 1}`} className="h-28 w-full object-cover" />
                  <div className="absolute inset-0 bg-sky-950/20 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-black/40" />
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {imagePreviews.length < 8 && (
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex h-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-sky-400/60 bg-sky-50/50 text-sky-600 transition-all duration-200 hover:border-sky-500 hover:bg-sky-50 active:scale-[0.97] dark:border-white/[0.12] dark:bg-white/[0.02] dark:text-sky-300 dark:hover:border-sky-500/50 dark:hover:bg-sky-500/[0.04]"
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
