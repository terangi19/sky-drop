import type { VisionAdapterResult } from "./awhina-vision-adapter";

/**
 * On a vision cache hit we still re-adapt against the current draft, but we must
 * not re-run the description writer (OpenAI) when identity is unchanged — the
 * cached fill already has a grounded description from the first call.
 */
export function reuseCachedVisionListingFill(
  adapted: VisionAdapterResult,
  cached: VisionAdapterResult
): { adapted: VisionAdapterResult; skippedDescriptionWriter: boolean } {
  const nextFill = adapted.listingFill;
  const cachedFill = cached.listingFill;
  const cachedDesc = String(cachedFill?.description || "").trim();

  if (!cachedDesc) {
    return { adapted, skippedDescriptionWriter: false };
  }

  const identityMatches =
    String(adapted.displayIdentity || "") === String(cached.displayIdentity || "") ||
    String(nextFill?.title || "") === String(cachedFill?.title || "");

  if (!identityMatches) {
    return { adapted, skippedDescriptionWriter: false };
  }

  if (!nextFill) {
    return { adapted, skippedDescriptionWriter: true };
  }

  if (String(nextFill.description || "").trim()) {
    return { adapted, skippedDescriptionWriter: true };
  }

  return {
    adapted: {
      ...adapted,
      listingFill: {
        ...nextFill,
        description: cachedFill!.description,
        descriptionSource: cachedFill!.descriptionSource || nextFill.descriptionSource,
      },
    },
    skippedDescriptionWriter: true,
  };
}
