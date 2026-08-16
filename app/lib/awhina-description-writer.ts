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
  stripStructuredMetadataLeakage,
} from "./awhina-listing-description";

const MODEL = process.env.OPENAI_DESCRIPTION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const CTA_RE =
  /\b(message|get in touch|feel free|send me a message|happy to|don't miss|great opportunity)\b/i;
const METADATA_RE = /\battr\s*:|\b(?:condition|location|price|title)\s*:/i;

export type DescriptionWriterFacts = {
  listingType: string;
  title: string;
  condition?: string;
  quantity?: number;
  collection?: string;
  items?: string;
  parentIdentity?: string;
  /** Named, grounded attributes the model may turn into prose. */
  product?: {
    brand?: string;
    colour?: string;
    storage?: string;
    variant?: string;
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
const MARKETING_FILLER_RE =
  /\b(?:great addition|valuable addition|perfect opportunity|enhance your|showcase these|step (?:into|up)|experience .{0,45}(?:like never before|gaming)|vibrant design|standout player|legendary (?:figures|status)|perfect for|ideal for|sleek design|sneaker game|(?:unique|notable) collectible|fans? and collectors?|seamless gaming|reliable controller|any .* collection)\b/i;

function removeUnsupportedMarketingTail(proposed: string): string {
  return proposed
    .split(/(?<=[.!?])\s+/)
    .map((sentence) =>
      sentence
        .replace(
          /,?\s*making (?:it|this) (?:a|an)\s+(?:unique|notable|great)\s+collectible(?:\s+for\s+(?:fans?|collectors?)(?:\s+and\s+collectors?)?)?\s*(?:alike)?\.?$/i,
          "."
        )
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter(
      (sentence) =>
        !/\b(?:enjoy seamless gaming|step up your sneaker game|experience gaming like never before)\b/i.test(
          sentence
        )
    )
    .join(" ")
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

  return {
    listingType: fill.listingType || "physical",
    title,
    condition: fill.condition?.trim() || undefined,
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

export function validateAiListingDescription(
  proposed: string,
  facts: DescriptionWriterFacts
): string | null {
  const description = stripStructuredMetadataLeakage(
    removeStructuredPriceCopy(removeUnsupportedMarketingTail(proposed))
  )
    .replace(/\s+/g, " ")
    .trim();
  if (
    description.length < 24 ||
    description.length > 900 ||
    CTA_RE.test(description) ||
    MARKETING_FILLER_RE.test(description) ||
    METADATA_RE.test(description) ||
    BANNED_TEMPLATE_RE.test(description) ||
    SELLER_EDITOR_GUIDANCE_RE.test(description) ||
    IMPLY_CLAIMS_RE.test(description) ||
    /\b(?:is|are)\s+in\s+(?:brand new|new)\b/i.test(description) ||
    /\b(?:bundle[_\s-]?quantity|listing[_\s-]?type|condition[_\s-]?code|field[_\s-]?source)\s*:/i.test(
      description
    )
  ) {
    return null;
  }
  if (!describesKnownCondition(description, facts.condition)) return null;
  if (
    facts.collection &&
    !description.toLowerCase().includes(facts.collection.toLowerCase())
  ) {
    return null;
  }
  if (facts.parentIdentity && facts.collection) {
    const prose = description.toLowerCase();
    const parentIndex = prose.indexOf(facts.parentIdentity.toLowerCase());
    const collectionIndex = prose.indexOf(facts.collection.toLowerCase());
    if (parentIndex < 0 || collectionIndex < 0 || parentIndex > collectionIndex) {
      return null;
    }
  }
  const supportedNamedValues = [
    ...Object.values(facts.product || {}),
    ...Object.values(facts.collectible || {}),
    ...Object.values(facts.vehicle || {}),
  ].filter((value): value is string => Boolean(value?.trim()));
  if (
    supportedNamedValues.some(
      (value) => !mentionsSupportedValue(description, value)
    )
  ) {
    return null;
  }
  if (facts.quantity && facts.items) {
    const listedItems = splitListedItems(facts.items);
    if (
      listedItems.some(
        (item) => !description.toLowerCase().includes(item.toLowerCase())
      ) ||
      !/\b(?:set|bundle|sold together|together as)\b/i.test(description)
    ) {
      return null;
    }
  }

  // Location and price are UI data for ordinary sale listings, not writing
  // material. Service/rental rates are intentionally handled elsewhere.
  if (
    facts.listingType === "physical" &&
    /\b(?:for sale in|located in|asking\s+\$|priced at\s+\$)\b/i.test(description)
  ) {
    return null;
  }

  // A title with a condition/location tail is exactly the field-stitching this
  // writer exists to prevent. Require a second meaningful sentence when rich
  // facts are available, unless the first sentence already carries a confirmed
  // product/card detail beyond the title and condition.
  const sentences = description.split(/(?<=[.!?])\s+/).filter(Boolean);
  const hasNamedDetail = Boolean(
    facts.extras.length ||
      Object.keys(facts.product || {}).length ||
      Object.keys(facts.collectible || {}).length ||
      facts.quantity ||
      facts.collection ||
      facts.items ||
      facts.vehicle
  );
  if (hasMeaningfulFacts(facts) && sentences.length < 2 && !hasNamedDetail) return null;
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
    proseWords.length < 5 &&
    titleWords.some((word) => description.toLowerCase().includes(word))
  ) {
    return null;
  }
  return description;
}

export async function writeAwhinaListingDescription(
  fill: SkyAiListingFill,
  opts?: { force?: boolean }
): Promise<string | null> {
  if (fill.descriptionSource === "user" && !opts?.force) return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const facts = buildDescriptionWriterFacts(fill);
  if (!apiKey || !facts.title || !hasMeaningfulFacts(facts)) return null;

  const client = new OpenAI({ apiKey });
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
- When quantity and multiple related items are supplied, make clear they are being sold together as one set or bundle.
- For cards, prioritize set/product, character/player, parallel, numbering, grade, quantity, and condition.
- For electronics, bikes, clothing, and vehicles, prioritise only confirmed useful details.
- Never mention price, location, contact actions, "for sale", marketing filler, database labels, or unsupported claims.
- Include the supplied condition naturally whenever one is present.
- Condition grammar: "is/are brand new", "is/are new", "is/are in like-new condition", "is/are in good condition", "is/are in good used condition", or "is/are in fair condition". Never write "in brand new".
- Do not use generic selling language such as "great addition", "perfect opportunity", "enhance your", "showcase", "ideal for", "perfect for", "legendary", or "vibrant design".
- Never emit raw metadata such as bundle_quantity:3, listing_type:physical, brand:Nike, or any key:value labels.
- Never add facts, specifications, authenticity, working status, or condition not in JSON.`,
      },
      { role: "user", content: JSON.stringify(facts) },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { description?: unknown };
    return typeof parsed.description === "string"
      ? validateAiListingDescription(parsed.description, facts)
      : null;
  } catch {
    return null;
  }
}
