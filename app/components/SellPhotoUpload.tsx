"use client";

import { useRef, type ChangeEvent, type RefObject } from "react";

type Props = {
  imagePreviews: string[];
  fileInputRef: RefObject<HTMLInputElement>;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  /** Contextual empty-state title, e.g. "Add photos of your Skyline" */
  ctaTitle?: string;
  ctaSubtitle?: string;
  className?: string;
  /**
   * Camera-first UX: [Take photos] [Choose photos] with native capture.
   * When false, keeps the classic single dropzone.
   */
  cameraFirst?: boolean;
};

export default function SellPhotoUpload({
  imagePreviews,
  fileInputRef,
  onUpload,
  onRemove,
  ctaTitle = "Add photos",
  ctaSubtitle = "Up to 8 photos — first is the cover",
  className = "",
  cameraFirst = false,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => fileInputRef.current?.click();
  const openCamera = () => cameraInputRef.current?.click();

  return (
    <div className={className || undefined}>
      {imagePreviews.length === 0 ? (
        cameraFirst ? (
          <div className="flex min-h-[14rem] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-5 py-10 text-center sm:min-h-[16rem]">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] text-zinc-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                />
              </svg>
            </div>
            <span className="mt-4 text-base font-medium text-white">{ctaTitle}</span>
            <span className="mt-1.5 text-sm text-zinc-500">{ctaSubtitle}</span>
            <div className="mt-5 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={openCamera}
                className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400"
              >
                Take photos
              </button>
              <button
                type="button"
                onClick={openPicker}
                className="flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-white/25 hover:text-white"
              >
                Choose photos
              </button>
            </div>
          </div>
        ) : (
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
            className="sd-photo-dropzone group flex min-h-[14rem] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-5 py-10 text-center transition hover:border-sky-500/35 hover:bg-white/[0.03] focus-visible:border-sky-500/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500/25 sm:min-h-[16rem]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] text-zinc-400 transition group-hover:border-sky-500/30 group-hover:text-sky-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <span className="mt-4 text-base font-medium text-white">{ctaTitle}</span>
            <span className="mt-1.5 text-sm text-zinc-500">{ctaSubtitle}</span>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-white">{ctaTitle}</p>
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
                onClick={cameraFirst ? openCamera : openPicker}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/[0.12] text-zinc-500 transition hover:border-sky-500/35 hover:text-sky-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-[10px] font-medium">{cameraFirst ? "Camera" : "Add"}</span>
              </button>
            )}
          </div>
          {cameraFirst && imagePreviews.length < 8 ? (
            <button
              type="button"
              onClick={openPicker}
              className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              Choose more from library
            </button>
          ) : null}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onUpload}
        className="hidden"
      />
      {cameraFirst ? (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onUpload}
          className="hidden"
        />
      ) : null}
    </div>
  );
}
