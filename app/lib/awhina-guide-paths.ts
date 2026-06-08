/** Normalize pathname for guide routing (no query, no trailing slash). */
export function normalizeAwhinaGuidePath(pathname: string): string {
  return pathname.split("?")[0].replace(/\/$/, "") || "/";
}

/**
 * Passive / informational pages — no in-page Āwhina guide card.
 * Task flows use SkyAiChat (/post/ai) or AwhinaProfileAssistant (/profile) instead.
 */
export const AWHINA_GUIDE_EXCLUDED_PATHS = new Set([
  "/",
  "/checkout",
  "/post",
  "/post/ai",
  "/reviews",
  "/faqs",
  "/about",
  "/terms",
  "/privacy",
  "/profile",
]);

/** Category browse pages — floating ✦ chat only, no in-page guide card. */
export const AWHINA_GUIDE_BROWSE_PATHS = new Set([
  "/digital",
  "/services",
  "/rentals",
  "/vehicles",
  "/property",
  "/jobs",
  "/events",
]);

const AWHINA_GUIDE_BROWSE_PREFIXES = ["/post/listing/", "/seller/"] as const;

/** Pages that render the guide inline (not via layout portal). */
export const AWHINA_GUIDE_INLINE_PATHS = new Set([
  "/dashboard",
  "/messages",
  "/purchases",
  "/watchlist",
  "/sales",
  "/list-list",
]);

export function isAwhinaBrowsePath(pathname: string): boolean {
  const path = normalizeAwhinaGuidePath(pathname);
  if (AWHINA_GUIDE_BROWSE_PATHS.has(path)) return true;
  return AWHINA_GUIDE_BROWSE_PREFIXES.some(
    (prefix) => path.startsWith(prefix) && path.length > prefix.length
  );
}

export function isAwhinaGuideExcluded(pathname: string): boolean {
  const path = normalizeAwhinaGuidePath(pathname);
  if (AWHINA_GUIDE_EXCLUDED_PATHS.has(path)) return true;
  return isAwhinaBrowsePath(path);
}

/** Portal guide disabled — account pages use inline guides only; everything else uses floating ✦ chat. */
export function shouldRenderAwhinaPortalGuide(_pathname: string): boolean {
  return false;
}
