/**
 * Layered marketplace knowledge types.
 * Domains plug in via MarketplaceDomainModule — no monolithic dictionary.
 */

export type KnowledgeProvenance =
  | "USER"
  | "IMAGE"
  | "LOCAL_DATA"
  | "LOOKUP"
  | "MODEL_INFERENCE";

export type MarketplaceDomainId =
  | "vehicles"
  | "collectibles"
  | "electronics"
  | "fashion"
  | "gaming"
  | "equipment"
  | "home"
  | "services"
  | "unknown";

export type ConfidenceLevel = "high" | "medium" | "low";

export type Unit = {
  id: string;
  label: string;
  kind: "storage" | "length" | "weight" | "currency" | "count" | "other";
};

export type Attribute = {
  key: string;
  value: string;
  unit?: Unit;
  provenance: KnowledgeProvenance;
  /** True when value needs live lookup (price, pop report, current MSRP). */
  needsCurrentCheck?: boolean;
};

export type Brand = {
  id: string;
  name: string;
  aliases?: string[];
};

export type ProductFamily = {
  id: string;
  brandId?: string;
  name: string;
  aliases?: string[];
};

export type Model = {
  id: string;
  familyId?: string;
  brandId?: string;
  name: string;
  aliases?: string[];
};

export type Variant = {
  id: string;
  modelId?: string;
  name: string;
  aliases?: string[];
};

export type Generation = {
  id: string;
  modelId?: string;
  name: string;
  /** e.g. E92, R34 — chassis / gen codes */
  code?: string;
  yearFrom?: number;
  yearTo?: number;
  aliases?: string[];
};

export type Category = {
  id: string;
  label: string;
  /** Sky Drop physical/category bucket when applicable */
  skyDropCategory?: string;
  listingTypeHint?: "physical" | "vehicle" | "digital" | "service" | "rental";
};

export type CollectibleGrade = {
  company: string;
  grade: string;
  /** Never invent population / market value */
  population?: string;
  marketValue?: string;
  provenance: KnowledgeProvenance;
  needsCurrentCheck?: boolean;
};

export type Alias = {
  alias: string;
  /** Target entity id within the domain */
  targetId: string;
  /** Ambiguous slang must stay controlled — false = do not auto-resolve alone */
  safe: boolean;
  notes?: string;
};

/** Canonical resolved marketplace entity for one NL mention. */
export type MarketplaceEntity = {
  domain: MarketplaceDomainId;
  brand?: Brand;
  family?: ProductFamily;
  model?: Model;
  variant?: Variant;
  generation?: Generation;
  category?: Category;
  attributes: Attribute[];
  grade?: CollectibleGrade;
  /** Display label built only from resolved + user facts */
  displayName: string;
  confidence: ConfidenceLevel;
  provenance: KnowledgeProvenance;
  /** User-stated facts that must never be overwritten (e.g. GT-T trim) */
  userFacts: string[];
  /** Honest gaps — never filled with invented data */
  unknowns: string[];
  /** Values that static knowledge must not pretend are current */
  needsCurrentCheck: string[];
};

export type DomainClarifyAsk = {
  field: string;
  question: string;
  priority: number;
};

export type DomainResolveInput = {
  text: string;
  /** Prior domain context across turns */
  prior?: DomainConversationContext | null;
  /** Explicit user facts already known */
  userFacts?: string[];
};

export type DomainResolveResult = {
  hit: boolean;
  entity?: MarketplaceEntity;
  clarify?: DomainClarifyAsk[];
  /** Score for domain arbitration (higher wins) */
  score: number;
};

export type DomainConversationContext = {
  domain: MarketplaceDomainId;
  /** Sticky labels: set name, player, product line */
  sticky: Record<string, string>;
  displayName?: string;
  updatedAt: number;
};

export type MarketplaceDomainModule = {
  id: MarketplaceDomainId;
  /** Cheap prefilter — avoid running every module on every turn */
  detect: (text: string) => number;
  resolve: (input: DomainResolveInput) => DomainResolveResult;
  /** Highest-value missing listing fields for this domain */
  enrichmentPriority: (entity: MarketplaceEntity) => DomainClarifyAsk[];
};

export type MarketplaceResolveResult = {
  entity: MarketplaceEntity | null;
  domain: MarketplaceDomainId;
  clarify: DomainClarifyAsk[];
  /** Internal provenance trail */
  provenanceTrail: KnowledgeProvenance[];
  /** Suggested Sky Drop listing partial — never overwrites USER facts */
  listingHints: MarketplaceListingHints;
  context: DomainConversationContext | null;
};

/** Mapped hints for Sky Drop listing fill (subset only). */
export type MarketplaceListingHints = {
  listingType?: string;
  category?: string;
  titleHint?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleBodyType?: string;
  rentalSubType?: string;
  rentalPriceDaily?: string;
  servicePricingType?: string;
  /** Graded cards etc. — stored via extras until first-class fields exist */
  extras?: string[];
  attributes?: Attribute[];
};
