import { FIREBASE_STORAGE_URL_PREFIXES } from "./firebase-storage-config";

const CDN_DOMAIN = "https://cdn.skydrop.nz";

/**
 * Rewrite Firebase Storage download URLs to the Sky Drop CDN when enabled.
 * Listing cards and detail pages use raw Firebase URLs via `pickListingImageUrl`
 * so images stay consistent if the CDN is unavailable.
 */
export function cdnUrl(url: string | undefined | null, options?: { force?: boolean }): string {
  if (!url) return "";

  const useCdn = options?.force ?? process.env.NEXT_PUBLIC_USE_LISTING_CDN === "true";
  if (!useCdn) return url;

  for (const prefix of FIREBASE_STORAGE_URL_PREFIXES) {
    if (url.startsWith(prefix)) {
      const path = url.replace(prefix, "");
      const decoded = decodeURIComponent(path.split("?")[0]);
      return `${CDN_DOMAIN}/${decoded}`;
    }
  }
  return url;
}

export function cdnUrls(urls: (string | undefined | null)[]): string[] {
  return urls.filter(Boolean).map((u) => cdnUrl(u));
}
