/**
 * Shared multimodal vision listings - feature flags.
 *
 * AWHINA_VISION_LISTINGS_ENABLED - server authority.
 * NEXT_PUBLIC_AWHINA_VISION_LISTINGS_ENABLED - UI only.
 * Backward-compat: also accepts singular AWHINA_VISION_LISTING_ENABLED.
 * Default OFF - only literal "true" enables.
 */

function envTruthy(raw: string | undefined): boolean {
  return String(raw || "").trim().toLowerCase() === "true";
}

function publicFlagOn(): boolean {
  return (
    process.env.NEXT_PUBLIC_AWHINA_VISION_LISTINGS_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_AWHINA_VISION_LISTING_ENABLED === "true"
  );
}

export const AWHINA_VISION_LISTING_UI_ENABLED = publicFlagOn();
export const AWHINA_VISION_LISTINGS_UI_ENABLED = AWHINA_VISION_LISTING_UI_ENABLED;

export function isAwhinaVisionListingEnabledServer(): boolean {
  return (
    envTruthy(process.env.AWHINA_VISION_LISTINGS_ENABLED) ||
    envTruthy(process.env.AWHINA_VISION_LISTING_ENABLED)
  );
}

export function isAwhinaVisionListingsEnabledServer(): boolean {
  return isAwhinaVisionListingEnabledServer();
}

export function isAwhinaVisionListingVisibleClient(): boolean {
  return publicFlagOn();
}

export function isAwhinaVisionListingsVisibleClient(): boolean {
  return isAwhinaVisionListingVisibleClient();
}

export function isAwhinaVisionListingProductEnabled(): boolean {
  if (typeof window === "undefined") return isAwhinaVisionListingEnabledServer();
  return isAwhinaVisionListingVisibleClient();
}
