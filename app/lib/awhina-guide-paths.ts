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
  "/login",
]);

/** Category browse pages — inline Āwhina assistant under the page header. */
export const AWHINA_GUIDE_BROWSE_PATHS = new Set([
  "/digital",
  "/services",
  "/rentals",
  "/vehicles",
  "/property",
  "/jobs",
  "/events",
]);

/** Main navbar routes — Sell (/post/ai) uses the listing flow, not this panel. */
export const AWHINA_NAVBAR_PATHS = new Set([
  "/",
  "/digital",
  "/services",
  "/rentals",
  "/vehicles",
  "/list-list",
  "/watchlist",
  "/purchases",
  "/sales",
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

export function isAwhinaNavbarPath(pathname: string): boolean {
  const path = normalizeAwhinaGuidePath(pathname);
  return AWHINA_NAVBAR_PATHS.has(path);
}

export function isAwhinaGuideExcluded(pathname: string): boolean {
  const path = normalizeAwhinaGuidePath(pathname);
  if (AWHINA_GUIDE_EXCLUDED_PATHS.has(path)) return true;
  if (isAwhinaNavbarPath(pathname) || AWHINA_GUIDE_BROWSE_PATHS.has(path)) return true;
  return isAwhinaBrowsePath(path);
}

/** Portal guide disabled — account pages use inline guides only; everything else uses floating ✦ chat. */
export function shouldRenderAwhinaPortalGuide(_pathname: string): boolean {
  return false;
}
