/**
 * One-call grounded writer for AI-owned marketplace descriptions.
 *
 * Canonical fields remain the source of truth. The model only chooses wording
 * and organisation; it never supplies listing facts.
 */
import OpenAI from "openai";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  BANNED_TEMPLATE_RE,
  IMPLY_CLAIMS_RE,
  SELLER_EDITOR_GUIDANCE_RE,
  cleanDescriptionItemName,
  removeStructuredPriceCopy,
  splitListingDescriptionSentences,
  stripStructuredMetadataLeakage,
} from "./awhina-listing-description";
import { isSealedTradingCardProductFormat } from "./awhina-public-copy-gate";
import {
  compactSellerEvidence,
  groupedSellerEvidenceFromExtras,
  sellerEvidenceItemCount,
  type GroupedSellerEvidence,
} from "./awhina-seller-evidence";
import { containsInternalOrchestration } from "./awhina-orchestration-boundary";

const MODEL = process.env.OPENAI_DESCRIPTION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const CTA_RE =
  /\b(message|get in touch|feel free|send me a message|happy to|don't miss|great opportunity)\b/i;
const METADATA_RE = /\battr\s*:|\b(?:condition|location|price|title|seller_notes?)\s*:/i;

export type DescriptionWriterFacts = {
  /** Domain/object type choose fact priorities; they never choose canned prose. */
  domain?: string;
  objectType?: string;
  listingType: string;
  title: string;
  condition?: string;
  sealed?: boolean;
  quantity?: number;
  collection?: string;
  items?: string;
  parentIdentity?: string;
  /** High-authority seller-provided facts preserved from conversational answers. */
  sellerNotes?: string[];
  /** Named, grounded attributes the model may turn into prose. */
  product?: {
    brand?: string;
    family?: string;
    model?: string;
    generation?: string;
    colour?: string;
    storage?: string;
    variant?: string;
    format?: string;
    franchise?: string;
    size?: string;
  };
  /** Card-specific facts are distinct from generic product attributes. */
  collectible?: {
    manufacturer?: string;
    serialNumber?: string;
    parallel?: string;
    parallelColour?: string;
    grade?: string;
    grader?: string;
    year?: string;
    team?: string;
  };
  extras: string[];
  vehicle?: Record<string, string>;
  location?: string;
  /** High-authority seller statements that do not have dedicated schema fields. */
  sellerEvidence?: Record<string, unknown>;
};

const STRUCTURED_EXTRA_KEY_RE =
  /^(subject|player|playername|set|productline|product_line|manufacturer|brand|serial|serialnumber|serial_number|grade|grader|parallel|parallelcolour|parallel_colour|year|team|bundle_quantity|bundlequantity|quantity|listing_type|listingtype|domain|category_id|categoryid|condition_code|conditioncode|vision_confidence|visionconfidence|provenance|field_source|fieldsource)$/i;
export const MARKETING_FILLER_RE =
  /\b(?:must[- ]have|perfect(?:\s+(?:for|addition))?|great addition|valuable addition|perfect opportunity|enhance your|showcase these|step (?:into|up)|experience .{0,45}(?:like never before|gaming)|vibrant design|standout(?:\s+(?:vehicle|car|item|product|player))?|known for (?:its )?(?:performance|design)|performance and design|legendary (?:figures|status)|ideal for|sleek design|sneaker game|(?:unique|notable) collectible|fans? and collectors?|seamless gaming|reliable controller|reliable performance|reliable choice|reliable gaming experience|latest features|advanced capabilities|the seller (?:confirms|states)|seller states|details were not provided|any .* collection|don'?t miss out|highly sought[- ]after|rare|valuable|iconic|grab a bargain|sure to impress|classic era|represents a|era of .{0,40}performance|great choice)\b/i;

export type DescriptionValidationFailureReason =
  | "too_short"
  | "too_long"
  | "marketing_filler"
  | "metadata_leak"
  | "seller_guidance"
  | "unsupported_claim"
  | "invalid_condition_grammar"
  | "condition_missing"
  | "collection_missing"
  | "required_identity_missing"
  | "title_equivalent"
  | "price_or_location_leak"
  | "insufficient_seller_evidence"
  | "orchestration_leak";

export type DescriptionValidationResult =
  | { ok: true; description: string; requiredFacts: string[]; optionalFacts: string[] }
  | {
      ok: false;
      reason: DescriptionValidationFailureReason;
      description: string;
      requiredFacts: string[];
      optionalFacts: string[];
    };

export type DescriptionWriterAttempt = {
  writer_called: boolean;
  writer_input: DescriptionWriterFacts;
  writer_raw_output?: string;
  writer_validation_result: "accepted" | "rejected" | "not_run";
  writer_validation_failure_reason?: DescriptionValidationFailureReason | "missing_api_key" | "no_output" | "invalid_json" | "writer_exception" | "user_owned" | "insufficient_facts";
  writer_exception?: string;
  description?: string;
};

export function stripUnsupportedPromotionalSentences(proposed: string): string {
  return splitListingDescriptionSentences(proposed)
    .map((sentence) =>
      sentence
        .replace(
          /,?\s*making (?:it|this) (?:a|an)\s+(?:unique|notable|great)\s+collectible(?:\s+for\s+(?:fans?|collectors?)(?:\s+and\s+collectors?)?)?\s*(?:alike)?\.?$/i,
          "."
        )
        .replace(/,?\s*ensuring\s+reliable\s+performance\.?$/i, ".")
        .replace(/,?\s*making\s+(?:it|this)\s+a\s+reliable\s+choice[^.]*\.?$/i, ".")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter((sentence) => !MARKETING_FILLER_RE.test(sentence))
    .join(" ")
    .trim();
}

function orderParentBeforeCollection(
  proposed: string,
  facts: DescriptionWriterFacts
): string {
  if (!facts.parentIdentity || !facts.collection) return proposed;
  const parent = escapeWriterRegExp(facts.parentIdentity);
  const collection = escapeWriterRegExp(facts.collection);
  return proposed
    .replace(
      new RegExp(`\\b${collection}\\s+${parent}(?=\\s|[.,!?]|$)`, "gi"),
      `${facts.parentIdentity} ${facts.collection}`
    )
    .replace(
      new RegExp(`(${parent}\\s+${collection})\\s+(Featuring|Including)(?=\\s)`, "gi"),
      (_match, identity: string, connector: string) => `${identity} ${connector.toLowerCase()}`
    )
    .replace(/\s+/g, " ")
    .trim();
}

function describesKnownCondition(description: string, condition: string | undefined): boolean {
  if (!condition) return true;
  if (/^used\s*-\s*good$/i.test(condition)) {
    return /\b(?:good\s+used\s+condition|used\s+(?:item|controller|card|bike|phone|shoes?|car|vehicle).*?\bgood\s+condition|good\s+condition)\b/i.test(
      description
    );
  }
  if (/^used\s*-\s*like\s+new$/i.test(condition)) {
    return /\b(?:like[- ]new|used.*?\bnew\s+condition)\b/i.test(description);
  }
  if (/^used\s*-\s*fair$/i.test(condition)) {
    return /\b(?:fair\s+used\s+condition|fair\s+condition)\b/i.test(description);
  }
  if (/^new$/i.test(condition)) return /\bbrand new\b/i.test(description);
  return description.toLowerCase().includes(condition.toLowerCase());
}

function splitListedItems(items: string | undefined): string[] {
  if (!items) return [];
  const commaParts = items
    .split(/\s*,\s*/)
    .map((part) => part.replace(/^(?:and|&)\s+/i, "").trim())
    .filter(Boolean);
  if (commaParts.length > 1) {
    const last = commaParts.pop() || "";
    return [
      ...commaParts,
      ...last
        .split(/\s+(?:and|&)\s+/i)
        .map((part) => part.trim())
        .filter(Boolean),
    ];
  }
  return items
    .split(/\s+(?:and|&)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function inferListedItemCount(items: string | undefined): number | undefined {
  const parts = splitListedItems(items);
  return parts.length > 1 && parts.length <= 20 ? parts.length : undefined;
}

function escapeWriterRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferParentIdentity(
  title: string,
  items: string | undefined,
  collection: string | undefined
): string | undefined {
  if (!items) return undefined;
  let remainder = cleanDescriptionItemName(title);
  for (const item of splitListedItems(items)) {
    remainder = remainder.replace(new RegExp(escapeWriterRegExp(item), "gi"), " ");
  }
  if (collection) {
    remainder = remainder.replace(new RegExp(escapeWriterRegExp(collection), "gi"), " ");
  }
  remainder = remainder
    .replace(/[,:;|–—]+/g, " ")
    .replace(/(?:^|\s)(?:and|&)(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return remainder && !/^(?:set|bundle|collection|trading\s+)?cards?$/i.test(remainder)
    ? remainder
    : undefined;
}

function mentionsSupportedValue(description: string, value: string): boolean {
  const haystack = description
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/[^a-z0-9]+/g, " ");
  const tokens = value
    .toLowerCase()
    .replace(/,/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

function cleanSellerNote(value: string): string | undefined {
  const cleaned = value
    .replace(/\b(?:asking|priced at)\s*\$\s*[\d,]+(?:\.\d{1,2})?\s*k?\b/gi, " ")
    .replace(/\blocated\s+in\s+(?=[.,;]|$)/gi, " ")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, "")
    .trim();
  return cleaned.length >= 3 ? cleaned.slice(0, 1800) : undefined;
}

export function buildDescriptionWriterFacts(fill: SkyAiListingFill): DescriptionWriterFacts {
  const vehicle = Object.fromEntries(
    [
      ["year", fill.vehicleYear],
      ["make", fill.vehicleMake],
      ["model", fill.vehicleModel],
      ["generation", fill.vehicleGeneration],
      ["colour", fill.vehicleColour],
      ["odometer", fill.vehicleOdometer],
      ["transmission", fill.vehicleTransmission],
      ["fuel", fill.vehicleFuelType],
      ["body", fill.vehicleBodyType],
    ].filter(([, value]) => typeof value === "string" && value.trim())
  );

  let quantity: number | undefined;
  let collection: string | undefined;
  let items: string | undefined;
  let productFormat: string | undefined;
  const product: NonNullable<DescriptionWriterFacts["product"]> = {};
  const collectible: NonNullable<DescriptionWriterFacts["collectible"]> = {};
  const freeformExtras: string[] = [];
  const sellerNotes: string[] = [];

  for (const raw of fill.extras || []) {
    const extra = String(raw || "").trim();
    if (!extra) continue;
    const match = extra.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
    if (match) {
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      if (key === "seller_notes" || key === "seller_note") {
        const cleaned = cleanSellerNote(value);
        if (cleaned) sellerNotes.push(cleaned);
        continue;
      }
      if (key === "bundle_quantity" || key === "bundlequantity" || key === "quantity") {
        const n = Number(value);
        if (Number.isInteger(n) && n > 1) quantity = n;
        continue;
      }
      if (key === "set" || key === "productline" || key === "product_line") {
        collection = value;
        continue;
      }
      if (key === "subject" || key === "player" || key === "playername") {
        items = value;
        continue;
      }
      if (key === "brand") {
        product.brand = value;
        continue;
      }
      if (key === "productfamily" || key === "product_family" || key === "product") {
        product.family = value;
        continue;
      }
      if (key === "model") {
        product.model = value;
        continue;
      }
      if (key === "generation") {
        product.generation = value;
        continue;
      }
      if (key === "colour" || key === "color") {
        product.colour = value;
        continue;
      }
      if (key === "storage") {
        product.storage = value;
        continue;
      }
      if (key === "size") {
        product.size = value;
        continue;
      }
      if (key === "variant") {
        product.variant = value;
        continue;
      }
      if (key === "manufacturer") {
        collectible.manufacturer = value;
        continue;
      }
      if (key === "serial" || key === "serialnumber" || key === "serial_number") {
        collectible.serialNumber = value;
        continue;
      }
      if (key === "productformat" || key === "product_format" || key === "format") {
        productFormat = value;
        product.format = value;
        continue;
      }
      if (key === "league" || key === "franchise") {
        product.franchise = value;
        continue;
      }
      if (key === "parallel") {
        collectible.parallel = value;
        continue;
      }
      if (key === "parallelcolour" || key === "parallel_colour") {
        collectible.parallelColour = value;
        continue;
      }
      if (key === "grade") {
        collectible.grade = value;
        continue;
      }
      if (key === "grader") {
        collectible.grader = value;
        continue;
      }
      if (key === "year") {
        collectible.year = value;
        continue;
      }
      if (key === "team") {
        collectible.team = value;
        continue;
      }
      if (STRUCTURED_EXTRA_KEY_RE.test(key)) {
        // Useful internally, never as raw key:value writer input.
        continue;
      }
      if (
        /^(modification|maintenance|conditiondetail|condition_detail|mechanical|compliance|included|note|seller_notes)$/i.test(
          key
        )
      ) {
        continue;
      }
      if (value.split(/\s+/).length >= 2) {
        freeformExtras.push(value);
      }
      continue;
    }
    freeformExtras.push(extra);
  }

  quantity ??= inferListedItemCount(items);
  const title = cleanDescriptionItemName(fill.title || "");
  const parentIdentity = inferParentIdentity(title, items, collection);
  const sealed = isSealedTradingCardProductFormat(
    productFormat || `${title} ${(fill.extras || []).join(" ")}`
  );
  if (sealed) {
    // Sealed packaging colour / parallel cues are not card attributes.
    delete collectible.parallel;
    delete collectible.parallelColour;
    delete collectible.serialNumber;
    delete collectible.grade;
    delete collectible.grader;
    items = undefined;
    // Bare packaging colour is not a verified product attribute either.
    delete product.colour;
  }

  const location = (fill.location || fill.pickupArea || "").trim() || undefined;
  const sellerEvidence = compactSellerEvidence(
    groupedSellerEvidenceFromExtras(fill.extras, location)
  );

  return {
    domain: (fill.extras || [])
      .map((entry) => String(entry).match(/^domain:\s*(.+)$/i)?.[1]?.trim())
      .find(Boolean),
    objectType: (fill.extras || [])
      .map((entry) => String(entry).match(/^objectType:\s*(.+)$/i)?.[1]?.trim())
      .find(Boolean),
    listingType: fill.listingType || "physical",
    title,
    condition: fill.condition?.trim() || undefined,
    sealed,
    quantity,
    collection,
    items,
    parentIdentity,
    sellerNotes: sellerNotes.length ? [...new Set(sellerNotes)].slice(0, 8) : undefined,
    product: Object.keys(product).length ? product : undefined,
    collectible: Object.keys(collectible).length ? collectible : undefined,
    extras: freeformExtras.slice(0, 20),
    vehicle: Object.keys(vehicle).length ? vehicle : undefined,
    location,
    sellerEvidence: Object.keys(sellerEvidence).length ? sellerEvidence : undefined,
  };
}

function sellerEvidenceCount(facts: DescriptionWriterFacts): number {
  const grouped: GroupedSellerEvidence = {
    modifications: (facts.sellerEvidence?.modifications as string[]) || [],
    maintenance: (facts.sellerEvidence?.maintenance as string[]) || [],
    conditionDetails: (facts.sellerEvidence?.conditionDetails as string[]) || [],
    mechanical: (facts.sellerEvidence?.mechanical as string[]) || [],
    compliance: (facts.sellerEvidence?.compliance as string[]) || [],
    included: (facts.sellerEvidence?.included as string[]) || [],
    notes: (facts.sellerEvidence?.notes as string[]) || [],
    location:
      typeof facts.sellerEvidence?.location === "string"
        ? facts.sellerEvidence.location
        : facts.location,
  };
  return sellerEvidenceItemCount(grouped);
}

function hasMeaningfulFacts(facts: DescriptionWriterFacts): boolean {
  return Boolean(
    facts.condition ||
      facts.quantity ||
      facts.collection ||
      facts.items ||
      facts.sellerNotes?.length ||
      facts.extras.length ||
      facts.sellerEvidence ||
      facts.product ||
      facts.vehicle
  );
}

const EVIDENCE_STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "that",
  "this",
  "have",
  "has",
  "been",
  "used",
  "always",
  "comes",
  "including",
  "known",
  "previous",
]);

function flattenSellerEvidenceAtoms(facts: DescriptionWriterFacts): string[] {
  const atoms: string[] = [
    ...(facts.sellerNotes || []),
    facts.product?.storage,
    facts.product?.colour,
    facts.product?.size,
    facts.product?.variant,
  ].filter((value): value is string => Boolean(value?.trim()));
  const evidence = facts.sellerEvidence || {};
  for (const key of [
    "modifications",
    "maintenance",
    "conditionDetails",
    "mechanical",
    "compliance",
    "included",
    "notes",
  ] as const) {
    const values = evidence[key];
    if (Array.isArray(values)) atoms.push(...values.map(String));
  }
  return [...new Set(atoms.map((item) => item.trim()).filter(Boolean))];
}

function evidenceItemCovered(description: string, item: string): boolean {
  const haystack = description.toLowerCase().replace(/[^a-z0-9%]+/g, " ");
  const tokens = item
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !EVIDENCE_STOPWORDS.has(token));
  if (!tokens.length) return true;
  const distinctive = tokens.filter((token) => token.length > 3 || /\d/.test(token));
  const check = distinctive.length ? distinctive : tokens;
  const needed = Math.max(1, Math.ceil(check.length * 0.5));
  return check.filter((token) => haystack.includes(token)).length >= needed;
}

function isIdentityConditionLocationOnly(
  description: string,
  facts: DescriptionWriterFacts
): boolean {
  let stripped = description.toLowerCase();
  for (const value of [facts.title, facts.condition, facts.location, facts.product?.colour]) {
    if (!value) continue;
    stripped = stripped.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  stripped = stripped
    .replace(/\b(?:in|located|condition|like-new|like new|brand new|good used|fair used|used)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.split(" ").filter((word) => word.length > 2).length < 3;
}

/**
 * Public-copy fact policy:
 * - Required: identity that stops the item becoming generic; collection/item
 *   names for a supplied bundle; stated condition.
 * - Rich seller evidence is not optional decoration. Semantic coverage is required.
 */
function descriptionFactPolicy(facts: DescriptionWriterFacts): {
  requiredFacts: string[];
  optionalFacts: string[];
} {
  const requiredFacts = [facts.title];
  const optionalFacts: string[] = [];
  if (facts.collection) requiredFacts.push(facts.collection);
  if (facts.items) requiredFacts.push(...splitListedItems(facts.items));
  if (facts.product?.brand && !mentionsSupportedValue(facts.title, facts.product.brand)) {
    requiredFacts.push(facts.product.brand);
  }
  if (facts.product?.family && !mentionsSupportedValue(facts.title, facts.product.family)) {
    requiredFacts.push(facts.product.family);
  }
  if (facts.product?.model && !mentionsSupportedValue(facts.title, facts.product.model)) {
    requiredFacts.push(facts.product.model);
  }
  if (facts.vehicle) {
    for (const key of ["make", "model", "generation"] as const) {
      const value = facts.vehicle[key];
      if (value && !mentionsSupportedValue(facts.title, value)) requiredFacts.push(value);
    }
    for (const key of ["year", "odometer", "transmission", "colour", "fuel", "body"] as const) {
      const value = facts.vehicle[key];
      if (value) optionalFacts.push(value);
    }
  }
  optionalFacts.push(
    ...(facts.sellerNotes || []),
    ...Object.values(facts.product || {}).filter(
      (value): value is string => Boolean(value?.trim())
    ),
    ...Object.values(facts.collectible || {}).filter(
      (value): value is string => Boolean(value?.trim())
    )
  );
  return {
    requiredFacts: [...new Set(requiredFacts.filter(Boolean))],
    optionalFacts: [...new Set(optionalFacts.filter(Boolean))].filter(
      (value) => !requiredFacts.includes(value)
    ),
  };
}

export function validateAiListingDescriptionResult(
  proposed: string,
  facts: DescriptionWriterFacts
): DescriptionValidationResult {
  const proposedContainsMarketingFiller = MARKETING_FILLER_RE.test(proposed);
  const description = stripStructuredMetadataLeakage(
    removeStructuredPriceCopy(
      stripUnsupportedPromotionalSentences(orderParentBeforeCollection(proposed, facts))
    )
  )
    .replace(/\s+/g, " ")
    .trim();
  const { requiredFacts, optionalFacts } = descriptionFactPolicy(facts);
  const evidenceCount = sellerEvidenceCount(facts);
  const fail = (reason: DescriptionValidationFailureReason): DescriptionValidationResult => ({
    ok: false,
    reason,
    description,
    requiredFacts,
    optionalFacts,
  });

  if (containsInternalOrchestration(description) || containsInternalOrchestration(proposed)) {
    return fail("orchestration_leak");
  }
  // A removable promotional tail should not discard otherwise grounded prose.
  // When stripping leaves no substantive copy, expose marketing as the cause.
  // When the seller supplied rich evidence, filler is never an acceptable substitute.
  if (
    MARKETING_FILLER_RE.test(description) ||
    (proposedContainsMarketingFiller && (description.length < 24 || evidenceCount >= 3))
  ) {
    return fail("marketing_filler");
  }
  if (
    METADATA_RE.test(description) ||
    /\b(?:bundle[_\s-]?quantity|listing[_\s-]?type|condition[_\s-]?code|field[_\s-]?source|seller[_\s-]?notes?)\s*:/i.test(
      description
    )
  ) {
    return fail("metadata_leak");
  }
  if (CTA_RE.test(description) || SELLER_EDITOR_GUIDANCE_RE.test(description)) {
    return fail("seller_guidance");
  }
  if (BANNED_TEMPLATE_RE.test(description) || IMPLY_CLAIMS_RE.test(description)) {
    return fail("unsupported_claim");
  }
  if (description.length < 24) return fail("too_short");
  if (description.length > 1400) return fail("too_long");
  if (/\b(?:is|are)\s+in\s+(?:brand new|new)\b/i.test(description)) {
    return fail("invalid_condition_grammar");
  }
  if (!describesKnownCondition(description, facts.condition)) {
    return fail("condition_missing");
  }
  if (facts.collection && !mentionsSupportedValue(description, facts.collection)) {
    return fail("collection_missing");
  }
  if (facts.parentIdentity && facts.collection) {
    const prose = description.toLowerCase();
    const parentIndex = prose.indexOf(facts.parentIdentity.toLowerCase());
    const collectionIndex = prose.indexOf(facts.collection.toLowerCase());
    if (parentIndex < 0 || collectionIndex < 0 || parentIndex > collectionIndex) {
      return fail("required_identity_missing");
    }
  }
  const requiredBeyondTitle = requiredFacts.filter(
    (value) => !mentionsSupportedValue(facts.title, value)
  );
  if (requiredBeyondTitle.some((value) => !mentionsSupportedValue(description, value))) {
    return fail("required_identity_missing");
  }
  if (facts.quantity && facts.items) {
    const listedItems = splitListedItems(facts.items);
    if (
      listedItems.some((item) => !description.toLowerCase().includes(item.toLowerCase())) ||
      !/\b(?:set|bundle|sold together|together as)\b/i.test(description)
    ) {
      return fail("required_identity_missing");
    }
  }

  // Asking price never belongs in public copy. Seller-supplied location may.
  if (/\b(?:asking\s+\$|priced at\s+\$)\b/i.test(description)) {
    return fail("price_or_location_leak");
  }
  if (/\bfor sale in\b/i.test(description)) {
    return fail("price_or_location_leak");
  }
  if (
    /\blocated in\b/i.test(description) &&
    !facts.location &&
    typeof facts.sellerEvidence?.location !== "string"
  ) {
    return fail("price_or_location_leak");
  }

  const sentences = splitListingDescriptionSentences(description);
  const hasNamedDetail = Boolean(
    facts.sellerNotes?.length ||
      facts.extras.length ||
      Object.keys(facts.product || {}).length ||
      Object.keys(facts.collectible || {}).length ||
      facts.quantity ||
      facts.collection ||
      facts.items ||
      facts.vehicle
  );
  if (hasMeaningfulFacts(facts) && sentences.length < 2 && !hasNamedDetail) {
    return fail("title_equivalent");
  }
  const titleWords = facts.title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  const proseWords = description
    .toLowerCase()
    .replace(new RegExp(facts.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ")
    .replace(/\b(?:in\s+)?(?:brand new|like-new|good used condition|fair used condition)\b/gi, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  if (
    titleWords.length > 0 &&
    sentences.length < 2 &&
    proseWords.length < 5 &&
    titleWords.some((word) => description.toLowerCase().includes(word))
  ) {
    return fail("title_equivalent");
  }
  if (
    /\b(?:the seller (?:confirms|states)|seller states|details were not provided)\b/i.test(
      description
    )
  ) {
    return fail("seller_guidance");
  }
  const evidenceAtoms = flattenSellerEvidenceAtoms(facts);
  if (evidenceAtoms.length >= 3) {
    const covered = evidenceAtoms.filter((item) => evidenceItemCovered(description, item));
    if (covered.length < Math.ceil(evidenceAtoms.length * 0.5)) {
      return fail("insufficient_seller_evidence");
    }
    if (isIdentityConditionLocationOnly(description, facts)) {
      return fail("insufficient_seller_evidence");
    }
  }
  return { ok: true, description, requiredFacts, optionalFacts };
}

/** Compatibility wrapper for existing callers. */
export function validateAiListingDescription(
  proposed: string,
  facts: DescriptionWriterFacts
): string | null {
  const result = validateAiListingDescriptionResult(proposed, facts);
  return result.ok ? result.description : null;
}

export type DescriptionWriterRunOptions = {
  force?: boolean;
  /** Test/server seam: produces the raw JSON text returned by the writer. */
  generateRawOutput?: (facts: DescriptionWriterFacts) => Promise<string | null>;
};

function logWriterAttempt(attempt: DescriptionWriterAttempt): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[awhina:description-writer]", attempt);
}

export async function runAwhinaListingDescriptionWriter(
  fill: SkyAiListingFill,
  opts?: DescriptionWriterRunOptions
): Promise<DescriptionWriterAttempt> {
  const facts = buildDescriptionWriterFacts(fill);
  if (fill.descriptionSource === "user" && !opts?.force) {
    const attempt: DescriptionWriterAttempt = {
      writer_called: false,
      writer_input: facts,
      writer_validation_result: "not_run",
      writer_validation_failure_reason: "user_owned",
    };
    logWriterAttempt(attempt);
    return attempt;
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!facts.title || !hasMeaningfulFacts(facts)) {
    const attempt: DescriptionWriterAttempt = {
      writer_called: false,
      writer_input: facts,
      writer_validation_result: "not_run",
      writer_validation_failure_reason: "insufficient_facts",
    };
    logWriterAttempt(attempt);
    return attempt;
  }
  if (!apiKey && !opts?.generateRawOutput) {
    const attempt: DescriptionWriterAttempt = {
      writer_called: false,
      writer_input: facts,
      writer_validation_result: "not_run",
      writer_validation_failure_reason: "missing_api_key",
    };
    logWriterAttempt(attempt);
    return attempt;
  }

  try {
    const raw = opts?.generateRawOutput
      ? await opts.generateRawOutput(facts)
      : await (async () => {
          const client = new OpenAI({ apiKey: apiKey! });
          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.25,
            max_tokens: sellerEvidenceCount(facts) >= 5 ? 520 : sellerEvidenceCount(facts) >= 3 ? 420 : 320,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `Write buyer-facing marketplace copy from ONLY the supplied JSON facts.
Return JSON exactly as {"description":"..."}.

Evidence priority:
1. sellerEvidence (explicit seller statements — highest authority)
2. canonical structured facts (vehicle, product, condition, collectible)
3. confidently observed extras
4. grounded domain knowledge
Never let generic marketing prose outrank seller evidence.

Writing rules:
- Spend the word budget on real supplied facts. Sparse facts: 1–3 short sentences. Rich sellerEvidence or sellerNotes: write a fuller factual description (typically 4–8 sentences) covering identity, condition details, modifications, maintenance, mechanical disclosure, compliance, included items, and location when present.
- sellerNotes and sellerEvidence are explicit seller-provided facts and have HIGH authority. Preserve as much useful buyer-relevant substance as possible, paraphrasing naturally instead of copying labels.
- Prefer concrete seller facts (modifications, maintenance, accessories, wear, faults, included items, condition details) over generic product praise.
- Compose relationships; never serialize raw metadata keys or labels.
- Compose facts naturally. Preserve meaning, not exact seller wording.
- Never invent praise, era commentary, or enthusiast filler to pad sparse copy.
- Never mention asking price, contact actions, "for sale", "for sale in", database labels, or unsupported claims.
- Never write "the seller confirms", "seller states", or that details were not provided.
- Never invent product features, benefits, reliability, or "latest features".
- When sellerEvidence.location or location is supplied, you may include it once as a closing fact. Never invent a location.
- For related/bundled items, explain the relationship naturally when facts support it.
- Preserve the most specific supplied collection, group, model, or product-family name; do not replace it with a generic category.
- Treat parentIdentity as a modifier that comes before collection/product: "Parent Collection", never "Collection Parent".
- Format lists as natural prose: "A, B and C", never "A, B, C".
- Let objectType and relationships determine the shape: a bundle should describe its included items; a sealed product should describe its product line/format; a vehicle should foreground confirmed vehicle facts. Do not reuse one sentence skeleton across domains.
- When quantity and multiple related items are supplied, make clear they form one set or bundle, but do not default to the words "featuring", "all ... are in", or "sold together as a set".
- For cards, prioritize set/product, character/player, parallel, numbering, grade, quantity, and condition.
- For sealed card products (box, pack, tin, display), never invent parallels, players, pack counts, or card attributes. A booster product may be described as containing booster packs only when objectType/product format establishes that relationship.
- For electronics, bikes, clothing, vehicles, furniture and tools, prioritise only confirmed useful details.
- Include the supplied condition naturally whenever one is present.
- Condition grammar: "is/are brand new", "is/are new", "is/are in like-new condition", "is/are in good condition", "is/are in good used condition", or "is/are in fair condition". Never write "in brand new".
- Banned phrases: "classic era", "represents a", "standout", "known for its performance and design", "must-have", "perfect for", "great choice", "ideal for enthusiasts", "great addition", "don't miss out", "sure to impress", "rare", "valuable", "iconic", or generic calls to action.
- Never emit raw metadata such as seller_notes:, bundle_quantity:3, listing_type:physical, brand:Nike, modification:exhaust, or any key:value labels.
- Never add facts, specifications, authenticity, working status, or condition not in JSON.`,
              },
              { role: "user", content: JSON.stringify(facts) },
            ],
          });
          return completion.choices[0]?.message?.content || null;
        })();
    if (!raw) {
      const attempt: DescriptionWriterAttempt = {
        writer_called: true,
        writer_input: facts,
        writer_validation_result: "not_run",
        writer_validation_failure_reason: "no_output",
      };
      logWriterAttempt(attempt);
      return attempt;
    }
    const parsed = JSON.parse(raw) as { description?: unknown };
    if (typeof parsed.description !== "string") {
      const attempt: DescriptionWriterAttempt = {
        writer_called: true,
        writer_input: facts,
        writer_raw_output: raw,
        writer_validation_result: "rejected",
        writer_validation_failure_reason: "invalid_json",
      };
      logWriterAttempt(attempt);
      return attempt;
    }
    const validation = validateAiListingDescriptionResult(parsed.description, facts);
    const attempt: DescriptionWriterAttempt = validation.ok
      ? {
          writer_called: true,
          writer_input: facts,
          writer_raw_output: raw,
          writer_validation_result: "accepted",
          description: validation.description,
        }
      : {
          writer_called: true,
          writer_input: facts,
          writer_raw_output: raw,
          writer_validation_result: "rejected",
          writer_validation_failure_reason: validation.reason,
        };
    logWriterAttempt(attempt);
    return attempt;
  } catch (error) {
    const attempt: DescriptionWriterAttempt = {
      writer_called: true,
      writer_input: facts,
      writer_validation_result: "rejected",
      writer_validation_failure_reason: "writer_exception",
      writer_exception: error instanceof Error ? error.message : String(error),
    };
    logWriterAttempt(attempt);
    return attempt;
  }
}

/** Compatibility wrapper for existing direct callers. */
export async function writeAwhinaListingDescription(
  fill: SkyAiListingFill,
  opts?: DescriptionWriterRunOptions
): Promise<string | null> {
  const attempt = await runAwhinaListingDescriptionWriter(fill, opts);
  return attempt.description || null;
}
