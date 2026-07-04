"use client";

import { useCallback, useState } from "react";
import {
  listingImageFallbackUrls,
  pickListingImageUrl,
  type ListingImageFields,
} from "../lib/listing-image-url";

export type ListingImageProps = {
  listing?: ListingImageFields;
  /** Direct URL when no listing object is available */
  src?: string;
  alt: string;
  className?: string;
  /** Parent must be `relative` with defined dimensions */
  fill?: boolean;
  loading?: "lazy" | "eager";
  /** Shown when every URL in the fallback chain fails */
  placeholderClassName?: string;
  /** Log prefix for debugging load failures */
  context?: string;
};

function ListingImagePlaceholder({
  className,
  alt,
}: {
  className?: string;
  alt: string;
}) {
  return (
    <div
      className={`flex items-center justify-center bg-zinc-900 ${className ?? ""}`}
      role="img"
      aria-label={alt ? `${alt} — no image` : "No listing image"}
    >
      <div className="text-center">
        <div className="text-3xl font-black tracking-tighter text-zinc-600">SD</div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-700">Sky Drop</div>
      </div>
    </div>
  );
}

export default function ListingImage({
  listing,
  src,
  alt,
  className = "",
  fill = false,
  loading = "lazy",
  placeholderClassName,
  context = "listing",
}: ListingImageProps) {
  const fallbackUrls = listing
    ? listingImageFallbackUrls(listing)
    : src?.trim()
      ? [src.trim()]
      : [];

  const [urlIndex, setUrlIndex] = useState(0);
  const [exhausted, setExhausted] = useState(fallbackUrls.length === 0);

  const currentSrc = fallbackUrls[urlIndex] ?? "";

  const handleError = useCallback(() => {
    const failedUrl = fallbackUrls[urlIndex];
    console.warn("[ListingImage] load failed", {
      context,
      alt,
      failedUrl,
      attempt: urlIndex + 1,
      total: fallbackUrls.length,
    });

    if (urlIndex + 1 < fallbackUrls.length) {
      setUrlIndex((i) => i + 1);
      return;
    }

    setExhausted(true);
  }, [alt, context, fallbackUrls, urlIndex]);

  if (exhausted || !currentSrc) {
    return (
      <ListingImagePlaceholder
        className={placeholderClassName ?? (fill ? "absolute inset-0" : className)}
        alt={alt}
      />
    );
  }

  const imgClass = fill
    ? `absolute inset-0 h-full w-full object-cover ${className}`.trim()
    : className;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- matches detail page; avoids next/image remotePatterns/CDN issues
    <img
      src={currentSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={handleError}
      className={imgClass}
    />
  );
}

/** Whether a listing has any resolvable image source */
export function listingHasImage(listing: ListingImageFields): boolean {
  return Boolean(pickListingImageUrl(listing) || listing.thumbnails?.[0]);
}
