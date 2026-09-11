/**
 * Structured seller meaning. Public description writers may consume only the
 * public classes exposed by `publicFacts`; raw seller text is provenance only.
 */

export type SellerMeaningClass =
  | "identity"
  | "attribute"
  | "included_item"
  | "positive_condition"
  | "negative_condition"
  | "modification"
  | "location"
  | "price_confirmed"
  | "price_tentative"
  | "price_historical"
  | "seller_intent"
  | "seller_instruction"
  | "non_fact_filler";

export type SellerFactProvenance = {
  evidence: string;
  source: "seller_message" | "canonical_field" | "structured_extra";
  field?: string;
  start?: number;
  end?: number;
  turn?: number;
};

export type AtomicSellerFact = {
  id: string;
  class: SellerMeaningClass;
  value: string;
  normalized: string;
  provenance: SellerFactProvenance[];
  confidence: number;
};

export type IncludedItemFact = AtomicSellerFact & {
  class: "included_item";
  name: string;
  quantity?: number;
};

export type SellerFactConflict = {
  key: string;
  factIds: string[];
  resolution: "latest_explicit" | "conservative" | "unresolved";
  publicFactId?: string;
};

export type StructuredSellerFactModel = {
  version: 1;
  identity: AtomicSellerFact[];
  attributes: AtomicSellerFact[];
  includedItems: IncludedItemFact[];
  positiveCondition: AtomicSellerFact[];
  negativeCondition: AtomicSellerFact[];
  modifications: AtomicSellerFact[];
  location: AtomicSellerFact[];
  price: {
    confirmed: AtomicSellerFact | null;
    tentative: AtomicSellerFact | null;
    historical: AtomicSellerFact | null;
  };
  sellerIntent: AtomicSellerFact[];
  sellerInstructions: AtomicSellerFact[];
  filler: AtomicSellerFact[];
  conflicts: SellerFactConflict[];
  /**
   * Validated, deduplicated facts allowed to reach a public writer. Excluded
   * classes can never appear here by construction.
   */
  publicFacts: AtomicSellerFact[];
};

export const PUBLIC_SELLER_MEANING_CLASSES = new Set<SellerMeaningClass>([
  "identity",
  "attribute",
  "included_item",
  "positive_condition",
  "negative_condition",
  "modification",
  "location",
]);
