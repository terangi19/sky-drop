/**
 * Canonical listing image URL resolution — one source of truth for cards, detail, browse, etc.
 * Detail page uses full `images[0]`; cards must match (not prefer broken thumbnails/CDN rewrites).
 */

export type ListingImageFields = {
  images?: (string | { url?: string; thumbnail?: string })[];
  thumbnails?: string[];
  imageUrl?: string;
  image?: string;
};

const STORAGE_BUCKETS = [
  "sky-drop-de459.firebasestorage.app",
  "sky-drop-de459.appspot.com",
] as const;

function trimUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstImageValue(
  images: ListingImageFields["images"]
): string {
  const first = images?.[0];
  if (typeof first === "string") return trimUrl(first);
  if (first && typeof first === "object") {
    return trimUrl(first.url) || trimUrl(first.thumbnail);
  }
  return "";
}

/** Primary display URL — same priority as listing detail page. */
export function pickListingImageUrl(listing: ListingImageFields): string {
  return (
    firstImageValue(listing.images) ||
    trimUrl(listing.imageUrl) ||
    trimUrl(listing.image) ||
    ""
  );
}

/** Swap legacy ↔ current Firebase Storage bucket in a download URL. */
export function alternateStorageBucketUrl(url: string): string | null {
  if (!url) return null;
  for (const from of STORAGE_BUCKETS) {
    for (const to of STORAGE_BUCKETS) {
      if (from === to) continue;
      if (url.includes(from)) return url.replace(from, to);
    }
  }
  return null;
}

/** Ordered URLs to try on the client when the primary source fails. */
export function listingImageFallbackUrls(listing: ListingImageFields): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown) => {
    const url = trimUrl(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    ordered.push(url);
  };

  add(firstImageValue(listing.images));
  add(listing.imageUrl);
  add(listing.image);
  add(listing.thumbnails?.[0]);

  const withBucketVariants: string[] = [];
  for (const url of ordered) {
    withBucketVariants.push(url);
    const alt = alternateStorageBucketUrl(url);
    if (alt && !seen.has(alt)) {
      seen.add(alt);
      withBucketVariants.push(alt);
    }
  }

  return withBucketVariants;
}

/** @deprecated Use pickListingImageUrl — kept for existing imports. */
export function getListingImage(listing: ListingImageFields): string {
  return pickListingImageUrl(listing);
}
