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

const MODEL = process.env.OPENAI_DESCRIPTION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const CTA_RE =
  /\b(message|get in touch|feel free|send me a message|happy to|don't miss|great opportunity)\b/i;
const METADATA_RE = /\battr\s*:|\b(?:condition|location|price|title)\s*:/i;

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
};

const STRUCTURED_EXTRA_KEY_RE =
  /^(subject|player|playername|set|productline|product_line|manufacturer|brand|serial|serialnumber|serial_number|grade|grader|parallel|parallelcolour|parallel_colour|year|team|bundle_quantity|bundlequantity|quantity|listing_type|listingtype|domain|category_id|categoryid|condition_code|conditioncode|vision_confidence|visionconfidence|provenance|field_source|fieldsource)$/i;
export const MARKETING_FILLER_RE =
  /\b(?:must[- ]have|perfect(?:\s+(?:for|addition))?|great addition|valuable addition|perfect opportunity|enhance your|showcase these|step (?:into|up)|experience .{0,45}(?:like never before|gaming)|vibrant design|standout(?:\s+(?:vehicle|car|item|product|player))?|known for (?:its )?(?:performance|design)|performance and design|legendary (?:figures|status)|ideal for|sleek design|sneaker game|(?:unique|notable) collectible|fans? and collectors?|seamless gaming|reliable controller|reliable performance|reliable choice|any .* collection|don'?t miss out|highly sought[- ]after|rare|valuable|iconic|grab a bargain|sure to impress)\b/i;

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
  | "price_or_location_leak";

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
    .filter(
      (sentence) =>
        !MARKETING_FILLER_RE.test(sentence)
    )
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
      new RegExp(
        `(${parent}\\s+${collection})\\s+(Featuring|Including)(?=\\s)`,
        "gi"
      ),
      (_match, identity: string, connector: string) =>
        `${identity} ${connector.toLowerCase()}`
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
    remainder = remainder.replace(
      new RegExp(escapeWriterRegExp(collection), "gi"),
      " "
    );
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

  for (const raw of fill.extras || []) {
    const extra = String(raw || "").trim();
    if (!extra) continue;
    const match = extra.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
    if (match) {
      const key = match[1].toLowerCase();
      const value = match[2].trim();
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
    product: Object.keys(product).length ? product : undefined,
    collectible: Object.keys(collectible).length ? collectible : undefined,
    extras: freeformExtras.slice(0, 20),
    vehicle: Object.keys(vehicle).length ? vehicle : undefined,
  };
}

function hasMeaningfulFacts(facts: DescriptionWriterFacts): boolean {
  return Boolean(
    facts.condition ||
      facts.quantity ||
      facts.collection ||
      facts.items ||
      facts.extras.length ||
      facts.vehicle ||
      facts.title.split(/\s+/).length >= 3
  );
}

/**
 * Public-copy fact policy:
 * - Required: identity that stops the item becoming generic; collection/item
 *   names for a supplied bundle; stated condition.
 * - Optional: colour, storage, secondary variants and most other enrichment.
 *   Those facts ground the writer but need not be repeated verbatim.
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
  const fail = (reason: DescriptionValidationFailureReason): DescriptionValidationResult => ({
    ok: false,
    reason,
    description,
    requiredFacts,
    optionalFacts,
  });

  // A removable promotional tail should not discard otherwise grounded prose.
  // When stripping leaves no substantive copy, expose marketing as the cause.
  if (
    MARKETING_FILLER_RE.test(description) ||
    (proposedContainsMarketingFiller && description.length < 24)
  ) {
    return fail("marketing_filler");
  }
  if (METADATA_RE.test(description) || /\b(?:bundle[_\s-]?quantity|listing[_\s-]?type|condition[_\s-]?code|field[_\s-]?source)\s*:/i.test(description)) {
    return fail("metadata_leak");
  }
  if (CTA_RE.test(description) || SELLER_EDITOR_GUIDANCE_RE.test(description)) {
    return fail("seller_guidance");
  }
  if (BANNED_TEMPLATE_RE.test(description) || IMPLY_CLAIMS_RE.test(description)) {
    return fail("unsupported_claim");
  }
  if (description.length < 24) return fail("too_short");
  if (description.length > 900) return fail("too_long");
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
  // Optional enrichment grounds the writer but never forces word-for-word
  // serialization. Only identity absent from the title is mandatory.
  const requiredBeyondTitle = requiredFacts.filter(
    (value) => !mentionsSupportedValue(facts.title, value)
  );
  if (requiredBeyondTitle.some((value) => !mentionsSupportedValue(description, value))) {
    return fail("required_identity_missing");
  }
  if (facts.quantity && facts.items) {
    const listedItems = splitListedItems(facts.items);
    if (
      listedItems.some(
        (item) => !description.toLowerCase().includes(item.toLowerCase())
      ) ||
      !/\b(?:set|bundle|sold together|together as)\b/i.test(description)
    ) {
      return fail("required_identity_missing");
    }
  }

  // Location and price are UI data for ordinary sale listings, not writing
  // material. Service/rental rates are intentionally handled elsewhere.
  if (
    facts.listingType === "physical" &&
    /\b(?:for sale in|located in|asking\s+\$|priced at\s+\$)\b/i.test(description)
  ) {
    return fail("price_or_location_leak");
  }

  // A title with a condition/location tail is exactly the field-stitching this
  // writer exists to prevent. Require a second meaningful sentence when rich
  // facts are available, unless the first sentence already carries a confirmed
  // product/card detail beyond the title and condition.
  const sentences = splitListingDescriptionSentences(description);
  const hasNamedDetail = Boolean(
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
  // Reject `TITLE. CONDITION.` and close variants: it adds no buyer meaning.
  if (
    titleWords.length > 0 &&
    sentences.length < 2 &&
    proseWords.length < 5 &&
    titleWords.some((word) => description.toLowerCase().includes(word))
  ) {
    return fail("title_equivalent");
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
            temperature: 0.35,
            max_tokens: 260,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `Write concise buyer-facing marketplace copy from ONLY the supplied JSON facts.
Return JSON exactly as {"description":"..."}.

Writing rules:
- Use 1–4 useful sentences based on fact richness.
- Compose relationships; never serialize title, condition, price, or location.
- For related/bundled items, explain the relationship naturally when facts support it.
- Preserve the most specific supplied collection, group, model, or product-family name; do not replace it with a generic category.
- Treat parentIdentity as a modifier that comes before collection/product: "Parent Collection", never "Collection Parent".
- Format lists as natural prose: "A, B and C", never "A, B, C".
- Let objectType and relationships determine the shape: a bundle should describe its included items; a sealed product should describe its product line/format; a vehicle should foreground confirmed vehicle facts. Do not reuse one sentence skeleton across domains.
- When quantity and multiple related items are supplied, make clear they form one set or bundle, but do not default to the words "featuring", "all ... are in", or "sold together as a set".
- For cards, prioritize set/product, character/player, parallel, numbering, grade, quantity, and condition.
- For sealed card products (box, pack, tin, display), never invent parallels, players, pack counts, or card attributes. A booster product may be described as containing booster packs only when objectType/product format establishes that relationship.
- For electronics, bikes, clothing, and vehicles, prioritise only confirmed useful details.
- Never mention price, location, contact actions, "for sale", marketing filler, database labels, or unsupported claims.
- Include the supplied condition naturally whenever one is present.
- Condition grammar: "is/are brand new", "is/are new", "is/are in like-new condition", "is/are in good condition", "is/are in good used condition", or "is/are in fair condition". Never write "in brand new".
- Stop once the supported useful facts are covered. Sparse facts deserve short factual copy, not praise. Never use phrases such as "standout", "known for its performance and design", "must-have", "perfect for collectors", "great addition", "don't miss out", "ideal for enthusiasts", "sure to impress", "rare", "valuable", "iconic", or generic calls to action.
- Never emit raw metadata such as bundle_quantity:3, listing_type:physical, brand:Nike, or any key:value labels.
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
