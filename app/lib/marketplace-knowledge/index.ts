/**
 * Marketplace Knowledge Resolver — public API for Āwhina.
 *
 * Layered architecture (ONE assistant):
 *   Decision → Marketplace Knowledge Resolver → Current-info lookup → Tools → Listing Composer
 */

export type {
  KnowledgeProvenance,
  MarketplaceDomainId,
  MarketplaceEntity,
  MarketplaceResolveResult,
  MarketplaceListingHints,
  DomainConversationContext,
  DomainClarifyAsk,
  Attribute,
  Brand,
  Model,
  Variant,
  Generation,
  Category,
  CollectibleGrade,
  Alias,
  ConfidenceLevel,
} from "./types";

export { PROVENANCE_RANK, preferProvenance, mayOverwrite, isHallucinationRiskField } from "./provenance";
export { lookupCurrentInfo, markNeedsCurrentCheck } from "./current-info";
export {
  domainContextKey,
  getDomainContext,
  setDomainContext,
  clearDomainContext,
  clearAllDomainContextsForTests,
  expandWithDomainContext,
} from "./context";
export {
  resolveMarketplaceKnowledge,
  marketplaceClarifyQuestion,
  type ResolveMarketplaceOptions,
} from "./resolver";
export {
  resolveKnowledgeForAwhina,
  knowledgeTurnPatch,
  mergeKnowledgeHintsIntoFill,
  type KnowledgeTurnPatch,
} from "./awhina-bridge";
export { pickTopClarifications, formatClarifyQuestion } from "./clarify";
export { mapEntityToListingHints } from "./map-to-listing";
export { MARKETPLACE_DOMAINS } from "./domains";
