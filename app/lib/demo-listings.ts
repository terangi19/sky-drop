/**
 * Demo Listings Configuration
 * Controls visibility and behavior of demo listings across the platform
 */

// Feature flag to globally hide/show demo listings
// Set to false to hide all demo listings from the marketplace
export const DEMO_LISTINGS_ENABLED = process.env.NEXT_PUBLIC_DEMO_LISTINGS_ENABLED !== "false";

// Demo seller email for identification
export const DEMO_SELLER_EMAIL = "demo@skydrop.nz";

/**
 * Check if a listing is a demo listing
 */
export function isDemoListing(listing: Record<string, any>): boolean {
  return listing.isDemo === true || listing.sellerEmail === DEMO_SELLER_EMAIL;
}

/**
 * Check if demo listings are currently enabled
 */
export function areDemoListingsEnabled(): boolean {
  return DEMO_LISTINGS_ENABLED;
}
