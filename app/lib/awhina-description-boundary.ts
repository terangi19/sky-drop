/**
 * PUBLIC LISTING DESCRIPTION BOUNDARY
 *
 * Every AI-owned marketplace description MUST pass through:
 *   enforcePublicListingDescription()
 *   enforcePublicListingDescriptionAsync()
 *
 * Pipeline:
 *   Seller input → fact extraction → canonical draft facts
 *   → semantic dedupe → domain-aware writer → quality contract → public copy
 *
 * FAIL CLOSED: invalid prose is never shown. Retry from facts, then minimal
 * safe deterministic copy.
 *
 * Do not add parallel description writers. New features that touch
 * listingFill.description must call enforcePublicListingDescription before
 * returning to UI/API/session.
 *
 * Implementation: app/lib/awhina-listing-composer.ts
 * Quality contract: app/lib/awhina-description-quality.ts
 */

export {
  enforcePublicListingDescription,
  enforcePublicListingDescriptionAsync,
  finalizeAwhinaListingDescription,
  finalizeAwhinaListingDescriptionAsync,
} from "./awhina-listing-composer";

export {
  validateDescriptionQualityContract,
  minimalSafeDescription,
  type DescriptionQualityViolation,
  type DescriptionQualityContractResult,
} from "./awhina-description-quality";

/** Preferred names for route handlers */
export { enforcePublicListingDescription as finalizePublicListingDescription } from "./awhina-listing-composer";
export { enforcePublicListingDescriptionAsync as finalizePublicListingDescriptionAsync } from "./awhina-listing-composer";
