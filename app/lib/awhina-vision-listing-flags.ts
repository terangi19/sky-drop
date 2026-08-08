/**
 * Camera-first Āwhina vision listing — feature flags.
 *
 * AWHINA_VISION_LISTING_ENABLED — server authority (API route + OpenAI calls).
 * NEXT_PUBLIC_AWHINA_VISION_LISTING_ENABLED — UI only (Take/Choose photos, result card).
 *
 * Default OFF — only the literal string "true" enables.
 */

function envTruthy(raw: string | undefined): boolean {
  return String(raw || "").trim().toLowerCase() === "true";
}

/** Build-time UI switch (folded by next.config env). */
export const AWHINA_VISION_LISTING_UI_ENABLED =
  process.env.NEXT_PUBLIC_AWHINA_VISION_LISTING_ENABLED === "true";

/** Server source of truth — never authorize vision from NEXT_PUBLIC_*. */
export function isAwhinaVisionListingEnabledServer(): boolean {
  return envTruthy(process.env.AWHINA_VISION_LISTING_ENABLED);
}

/** Client/UI visibility. Safe in client components. */
export function isAwhinaVisionListingVisibleClient(): boolean {
  return process.env.NEXT_PUBLIC_AWHINA_VISION_LISTING_ENABLED === "true";
}

export function isAwhinaVisionListingProductEnabled(): boolean {
  if (typeof window === "undefined") return isAwhinaVisionListingEnabledServer();
  return isAwhinaVisionListingVisibleClient();
}
