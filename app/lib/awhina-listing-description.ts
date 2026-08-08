/**
 * Buyer-facing listing description composer.
 *
 * Pipeline (mandatory):
 *   1. Extract structured DescriptionFacts from draft fill (never raw user text)
 *   2. Type-specific writer (physical / vehicle / service / rental / wanted)
 *   3. Deterministic quality pass (one CTA, semantic dedupe, grounding, caps)
 *
 * No phrase-bank stacking. Controlled structural variation only.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { normalizeServicePricingType } from "./service-pricing";

export type ListingDescriptionQuality = "standard" | "premium" | "premium_plus";

export type ListingDescriptionStyle =
  | "vehicle"
  | "electronics"
  | "gaming"
  | "furniture"
  | "clothing"
  | "home_garden"
  | "sports"
  | "service"
  | "rental"
  | "wanted"
  | "general";

export type DescriptionWriterKind =
  | "physical"
  | "vehicle"
  | "service"
  | "rental"
  | "wanted";

export type DeliveryMode =
  | "pickup_only"
  | "pickup"
  | "pickup_or_shipping"
  | "shipping"
  | null;

export type PriceMode =
  | "asking"
  | "hourly"
  | "fixed_job"
  | "quote"
  | "weekly"
  | "daily"
  | "monthly"
  | null;

/** Structured facts only — writers never see raw user text. */
export type DescriptionFacts = {
  kind: DescriptionWriterKind;
  style: ListingDescriptionStyle;
  item: string;
  conditionPhrase: string | null;
  titleHadCondition: boolean;
  money: string | null;
  priceMode: PriceMode;
  location: string | null;
  delivery: DeliveryMode;
  vehicle: {
    year: string | null;
    make: string | null;
    model: string | null;
    colour: string | null;
    odometer: string | null;
    transmission: string | null;
    fuel: string | null;
    body: string | null;
  } | null;
  serviceDuration: string | null;
  rental: {
    subType: string | null;
    bedrooms: string | null;
    bathrooms: string | null;
    furnished: string | null;
    pets: string | null;
    parking: string | null;
    weekly: string | null;
    monthly: string | null;
    daily: string | null;
    bond: string | null;
    availableFrom: string | null;
  } | null;
  extras: string[];
  quality: ListingDescriptionQuality;
  seed: string;
  factRichness: "sparse" | "normal" | "rich";
};

type SentencePurpose =
  | "opener"
  | "facts"
  | "logistics"
  | "price"
  | "cta"
  | "meta"
  | "unsupported"
  | "other";

/* ─── Shared regex / gates (exported for tests) ─────────────────────────── */

const FIELD_LABEL_RE =
  /\b(Condition|Located in|Odometer|Colour|Color|Transmission|Fuel type|Pickup available|Shipping available)\s*:/i;

const BANNED_TEMPLATE_RE =
  /\bI'm selling this\b|\bThis item\b|\bMessage me with any questions\b|\bFeel free to get in touch if you'd like more information\b|\bIt's based in\b|\b— based in\b|\bLocated in\b|\bCan do pickup\b|\bAvailable around\b|\bPriced at\b/i;

const IMPLEMENTATION_LEAK_RE =
  /\bno guesswork\b|\bbased on (the )?(available|provided|supplied) (details|information)\b|\busing only supplied\b|\bfrom the information provided\b|\bbased on what we know\b|\bverified facts only\b|\bI haven'?t assumed\b|\bI didn'?t invent\b|\bStraightforward listing with the details we have\b|\bdetails we have\b|\bfacts we know\b|\bknown details\b|\bwhat is known\b|\bhere is what we know\b|\bonly the facts\b|\bAI\b|\bgenerated\b|\bassumed\b/i;

/** Seller-editor coaching — must never appear in buyer-facing descriptions. */
export const SELLER_EDITOR_GUIDANCE_RE =
  /\badd the remaining details\b|\bcomplete the listing\b|\bstill need(?:s)?\b|\bprice still needs\b|\b(?:condition|location|price) still need\b|\badd(?:ing)? (?:photos|the remaining)\b|\bpublish when ready\b|\bfill in\b|\bto complete the listing\b|\bmissing (?:price|condition|location)\b/i;

export const IMPLY_CLAIMS_RE =
  /\bready for use\b|\bworks well\b|\bclean upgrade\b|\bready to go\b|\bwell looked after\b|\bready for its next owner\b|\bready for its next home\b|\bready for a new wardrobe\b|\ba clean piece\b|\bclearer photos\b|\banother look at the photos\b|\bcheck the photos\b|\bmore photos\b|\banother photo\b|\bsend another photo\b|\bworks perfectly\b|\bperfect condition\b|\bexcellent condition\b/i;

export const SERVICE_INVENTION_RE =
  /\b(fully\s+)?insured\b|\b\d+\+?\s+years?\s+(of\s+)?experience\b|\blicensed\b|\bcertified\b|\bqualified\b|\bguaranteed?\b|\bwarranty\b|\bfully\s+equipped\b|\bbonded\b|\bcommercial\s+grade\b|\bestablished\s+business\b|\bavailable\s+(7\s*days|weekends?|same[- ]day)\b/i;

const SERVICE_TEMPLATE_SMELL_RE =
  /\bfor local jobs\b|\bPriced at\b|\bavailable for local work\b|\bTell me roughly what you need\b|\bLocal work\s*[—-]\s*message with the job details\b/i;

/** Soft CTA / contact invite — used for counting and semantic dedupe. */
export const CTA_PURPOSE_RE =
  /\b(message|get in touch|feel free|send me a message|drop me a message|happy to (sort|arrange|chat|answer)|if you'?re (interested|keen)|come take a look|message if|message with|message to|just message|just get in touch)\b/i;

const PICKUP_PURPOSE_RE =
  /\b(pickup|pick[\s-]?up|collection|collect)\b/i;

const SHIP_PURPOSE_RE = /\b(ship(?:ping)?|postage|deliver(?:y|ed)?)\b/i;

const PRICE_PURPOSE_RE =
  /\b(asking|priced at|per (hour|job|day|week|month)|\$\d|\bbond\b|\/week|\/day|\/month)\b/i;

const UNSUPPORTED_CLAIM_RE =
  /\b(warranty|receipt|authenticity|genuine|factory sealed|unopened|battery health|serviced recently|full service history|WOF|rego current|insured|years of experience|guaranteed|fully equipped)\b/i;

/* ─── Tiny helpers ──────────────────────────────────────────────────────── */

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickVariant<T>(seed: string, options: readonly T[]): T {
  return options[hashSeed(seed) % options.length];
}

function formatMoneyPlain(price: string | undefined | null): string | null {
  if (!price?.trim()) return null;
  const n = price.replace(/,/g, "").trim();
  return n ? `$${n}` : null;
}

function conditionShort(condition: string | undefined): string | null {
  if (!condition?.trim()) return null;
  const c = condition.trim();
  if (c === "New") return "brand new";
  if (c === "Used - Like New") return "like-new";
  if (c === "Used - Good") return "good used condition";
  if (c === "Used - Fair") return "fair used condition";
  return c.toLowerCase();
}

function deliveryMode(fill: SkyAiListingFill): DeliveryMode {
  const pickup = fill.pickupAvailable === true;
  const ship = fill.shippingAvailable === true;
  const shipOff = fill.shippingAvailable === false;
  if (pickup && shipOff) return "pickup_only";
  if (pickup && ship) return "pickup_or_shipping";
  if (pickup) return "pickup";
  if (ship) return "shipping";
  return null;
}

function stripTitleConditionPrefix(title: string): string {
  return title
    .replace(/^(brand\s+new|like\s+new)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip rent/hire verb debris from rental item/title labels.
 * "Rent Trailer For" → "Trailer". No brand special-casing.
 */
export function cleanRentalItemName(raw: string): string {
  let s = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return s;

  s = s.replace(
    /^(?:rent(?:ing)?|hire(?:ing)?)\s+(?:out\s+)?(?:my\s+|a\s+|an\s+|the\s+)?/i,
    ""
  );
  // Phrase forms first so "for hire" doesn't leave a dangling "for"
  s = s.replace(/\bfor\s+hire\b/gi, " ");
  s = s.replace(/\b(?:available\s+)?(?:to\s+)?(?:rent|hire)\b/gi, " ");
  s = s.replace(/\brental\b/gi, " ");
  s = s.replace(/^(?:for|out|my|a|an|the)\s+/i, "");
  s = s.replace(/\s+(?:for|out|my|a|an|the)$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s || String(raw || "").trim();
}

function formatOdo(odo: string): string {
  const raw = odo.replace(/,/g, "").trim();
  if (/km/i.test(raw)) return raw.replace(/\s+/g, " ");
  const n = Number(raw.replace(/[^\d]/g, ""));
  if (!Number.isNaN(n) && n > 0) return `${n.toLocaleString("en-NZ")} km`;
  return `${raw} km`;
}

function weaveableExtras(fill: SkyAiListingFill): string[] {
  const raw = fill.extras || [];
  return raw
    .map((e) => String(e || "").trim())
    .filter((e) => e.length >= 3)
    .filter((e) => !/^kw:/i.test(e))
    .filter((e) => !/^visual:/i.test(e))
    .filter((e) => !/^(brand|new|like|console|the|and|for|with)$/i.test(e))
    .filter(
      (e) =>
        e.split(/\s+/).length >= 2 ||
        /servic|tyre|tire|receipt|paperwork|wof|rego|mod|include|controller|charger|box|manual|warranty/i.test(
          e
        )
    )
    .slice(0, 4);
}

function capitalizeSentenceStart(text: string): string {
  return text.replace(/(?:^|[.!?]\s+)([a-z])/g, (m) => m.toUpperCase());
}

function polishParagraph(text: string): string {
  return capitalizeSentenceStart(
    text
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;])/g, "$1")
      .replace(/,\s*,/g, ",")
      .replace(/\.\s*\./g, ".")
      .trim()
  ).replace(/[.!?]?$/, (m) => m || ".");
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function trimToWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return polishParagraph(text);
  return polishParagraph(`${words.slice(0, max).join(" ").replace(/[,:;]+$/, "")}.`);
}

function listingSeed(fill: SkyAiListingFill): string {
  return `${fill.title || ""}|${fill.price || fill.rentalPriceWeekly || fill.rentalPriceDaily || ""}|${fill.location || ""}|${fill.condition || ""}|${fill.listingType || ""}`;
}

function capFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

/* ─── Vehicle draft readiness (seller guidance vs buyer copy) ───────────── */

export type VehicleDraftReadiness = {
  knownFacts: string[];
  importantMissing: string[];
  /** True only when enough meaningful facts exist for publish-ready buyer copy. */
  worthGeneratingBuyerCopy: boolean;
  /** Single next seller question — never baked into buyer description. */
  nextClarification: string | null;
  identityComplete: boolean;
};

const AMBIGUOUS_GENERATION_FAMILIES: ReadonlyArray<{
  family: RegExp;
  resolved: RegExp;
  ask: string;
}> = [
  {
    family: /\bskyline\b/i,
    resolved: /\br[\s-]?3[2-4]\b/i,
    ask: "What generation is it — R32, R33, or R34?",
  },
  {
    family: /\bsupra\b/i,
    resolved: /\b(a80|a90|mk\s?[45]|jza80|gr\s*supra)\b/i,
    ask: "Which Supra generation is it — e.g. A80 (Mk4) or A90?",
  },
];

function vehicleIdentityBlob(fill: SkyAiListingFill): string {
  return [
    fill.vehicleYear,
    fill.vehicleMake,
    fill.vehicleModel,
    fill.vehicleGeneration,
    fill.title,
  ]
    .filter(Boolean)
    .join(" ");
}

function ambiguousGenerationAsk(fill: SkyAiListingFill): string | null {
  // Authoritative: vehicleGeneration set → generation slot complete
  if (fill.vehicleGeneration?.trim()) return null;
  const blob = vehicleIdentityBlob(fill);
  for (const row of AMBIGUOUS_GENERATION_FAMILIES) {
    // Legacy drafts may still embed R34 in model/title — treat as resolved
    if (row.family.test(blob) && !row.resolved.test(blob)) return row.ask;
  }
  return null;
}

/**
 * Vehicle-specific completeness for draft UX.
 * Follow-up priority: generation → year → price → odometer → condition → location → transmission/fuel.
 * One question at a time. Buyer copy only when identity + enough sale facts exist.
 */
export function getVehicleDraftReadiness(fill: SkyAiListingFill): VehicleDraftReadiness {
  const make = fill.vehicleMake?.trim() || null;
  const model = fill.vehicleModel?.trim() || null;
  const generation = fill.vehicleGeneration?.trim() || null;
  const year = fill.vehicleYear?.trim() || null;
  const price = fill.price?.trim() || null;
  const condition = fill.condition?.trim() || null;
  const location = (fill.location || fill.pickupArea)?.trim() || null;
  const odometer = fill.vehicleOdometer?.trim() || null;
  const colour = fill.vehicleColour?.trim() || null;
  const transmission = fill.vehicleTransmission?.trim() || null;
  const fuel = fill.vehicleFuelType?.trim() || null;

  const knownFacts: string[] = [];
  if (make) knownFacts.push(`make:${make}`);
  if (model) knownFacts.push(`model:${model}`);
  if (generation) knownFacts.push(`generation:${generation}`);
  if (year) knownFacts.push(`year:${year}`);
  if (price) knownFacts.push(`price:${price}`);
  if (condition) knownFacts.push(`condition:${condition}`);
  if (location) knownFacts.push(`location:${location}`);
  if (odometer) knownFacts.push(`odometer:${odometer}`);
  if (colour) knownFacts.push(`colour:${colour}`);
  if (transmission) knownFacts.push(`transmission:${transmission}`);
  if (fuel) knownFacts.push(`fuel:${fuel}`);

  const genAsk = ambiguousGenerationAsk(fill);
  const identityComplete = Boolean(make && model) && !genAsk;

  const importantMissing: string[] = [];
  if (genAsk) importantMissing.push("generation");
  else {
    if (!make) importantMissing.push("make");
    if (!model) importantMissing.push("model");
  }
  if (!year) importantMissing.push("year");
  if (!price) importantMissing.push("price");
  if (!odometer) importantMissing.push("odometer");
  if (!condition) importantMissing.push("condition");
  if (!colour) importantMissing.push("colour");
  if (!transmission) importantMissing.push("transmission");
  if (!location) importantMissing.push("location");
  if (!fuel) importantMissing.push("fuel");

  // Meaningful-fact score — not word count. Sparse make/model alone stays pending.
  let score = 0;
  if (make && model) score += 2;
  if (generation) score += 0.5;
  if (year) score += 1;
  if (price) score += 1;
  if (condition) score += 1;
  if (location) score += 1;
  if (odometer) score += 1;
  if (colour) score += 0.5;
  if (transmission || fuel) score += 0.5;

  const worthGeneratingBuyerCopy =
    identityComplete &&
    Boolean(year) &&
    Boolean(price) &&
    Boolean(location) &&
    score >= 5;

  let nextClarification: string | null = null;
  if (genAsk) nextClarification = genAsk;
  else if (!year) nextClarification = "What year is it?";
  else if (!price) nextClarification = "What's the asking price?";
  else if (!odometer) nextClarification = "Roughly how many kilometres are on it?";
  else if (!condition) nextClarification = "What condition is it in?";
  else if (!colour) nextClarification = "What colour is it?";
  else if (!transmission) nextClarification = "Is it manual or automatic?";
  else if (!location) nextClarification = "Where is it located?";
  else if (!fuel) nextClarification = "Petrol, diesel, or hybrid?";

  return {
    knownFacts,
    importantMissing,
    worthGeneratingBuyerCopy,
    nextClarification,
    identityComplete,
  };
}

export function isVehicleListingFill(fill: SkyAiListingFill): boolean {
  const type = (fill.listingType || "").toLowerCase();
  // Explicit non-vehicle type wins (user type switch / override).
  if (type && type !== "vehicle") return false;
  return type === "vehicle" || Boolean(fill.vehicleMake || fill.vehicleModel);
}

/* ─── Style / kind resolution ───────────────────────────────────────────── */

export function resolveListingDescriptionStyle(fill: SkyAiListingFill): ListingDescriptionStyle {
  const type = (fill.listingType || "").toLowerCase();
  if (type === "vehicle") return "vehicle";
  if (type === "service") return "service";
  if (type === "rental") return "rental";
  if (type === "wanted") return "wanted";
  // Explicit physical never uses vehicle copy — leftover make/model in draft is inactive.
  if (type === "physical") {
    // fall through to goods styles below without Cars/vehicle heuristics
  }

  const blob = `${fill.category || ""} ${fill.title || ""}`.toLowerCase();
  if (
    type !== "physical" &&
    (fill.category === "Cars" || /\b(bmw|toyota|mazda|honda|ford|nissan|subaru|ute|car)\b/i.test(blob))
  ) {
    return "vehicle";
  }
  if (fill.category === "Gaming" || /\b(ps5|ps4|playstation|xbox|nintendo|switch|console)\b/i.test(blob)) {
    return "gaming";
  }
  if (
    fill.category === "Tech" ||
    /\b(iphone|ipad|airpods|samsung|pixel|laptop|macbook|tv|phone|tablet|headphones)\b/i.test(blob)
  ) {
    return "electronics";
  }
  if (fill.category === "Fashion" || /\b(jacket|shoe|sneaker|dress|hoodie|jeans|clothing)\b/i.test(blob)) {
    return "clothing";
  }
  if (/\b(couch|sofa|table|chair|mattress|furniture|desk|bookshelf|dresser)\b/i.test(blob)) {
    return "furniture";
  }
  if (
    /home\s*&\s*garden|garden|lawn ?mower|hedge|outdoor|bbq|hose|pot plant|wheelbarrow|shed/i.test(blob) ||
    (fill.category === "Home" && !/\b(couch|sofa|table|chair|mattress|furniture|desk)\b/i.test(blob))
  ) {
    return "home_garden";
  }
  if (fill.category === "Home") return "furniture";
  if (fill.category === "Sports" || /\b(bike|bicycle|golf|tennis|gym|fitness)\b/i.test(blob)) {
    return "sports";
  }
  return "general";
}

function resolveWriterKind(fill: SkyAiListingFill, style: ListingDescriptionStyle): DescriptionWriterKind {
  const type = (fill.listingType || "").toLowerCase();
  if (type === "wanted" || style === "wanted") return "wanted";
  if (type === "vehicle" || style === "vehicle") return "vehicle";
  if (type === "service" || style === "service") return "service";
  if (type === "rental" || style === "rental") return "rental";
  return "physical";
}

/* ─── Step 1: extract facts ─────────────────────────────────────────────── */

export function extractDescriptionFacts(
  fill: SkyAiListingFill,
  opts?: { quality?: ListingDescriptionQuality }
): DescriptionFacts {
  const quality: ListingDescriptionQuality = opts?.quality ?? "premium_plus";
  const style = resolveListingDescriptionStyle(fill);
  const kind = resolveWriterKind(fill, style);
  const title = (fill.title || "").trim();
  const titleHadCondition = /\b(brand\s+new|like\s+new)\b/i.test(title);
  let bare = stripTitleConditionPrefix(title) || (kind === "service" ? "Service" : "Item");
  if (kind === "rental") {
    bare = cleanRentalItemName(bare) || bare;
  }
  const location = (fill.location || fill.pickupArea || "").trim() || null;
  const money = formatMoneyPlain(fill.price);
  const delivery = deliveryMode(fill);
  const extras = weaveableExtras(fill);

  let priceMode: PriceMode = money ? "asking" : null;
  let serviceDuration: string | null = null;
  let vehicle: DescriptionFacts["vehicle"] = null;
  let rental: DescriptionFacts["rental"] = null;

  if (kind === "service") {
    const pricingType = normalizeServicePricingType(
      fill.servicePricingType || fill.pricingType,
      fill.price,
      `${fill.title || ""}`
    );
    if (pricingType === "hourly") priceMode = money ? "hourly" : null;
    else if (pricingType === "fixed") priceMode = money ? "fixed_job" : null;
    else if (pricingType === "request_quote") priceMode = "quote";
    serviceDuration = fill.serviceDuration?.trim() || null;
  }

  if (kind === "vehicle") {
    vehicle = {
      year: fill.vehicleYear?.trim() || null,
      make: fill.vehicleMake?.trim() || null,
      model: fill.vehicleModel?.trim() || null,
      colour: fill.vehicleColour?.trim() || null,
      odometer: fill.vehicleOdometer?.trim() || null,
      transmission: fill.vehicleTransmission?.trim() || null,
      fuel: fill.vehicleFuelType?.trim() || null,
      body: fill.vehicleBodyType?.trim() || null,
    };
    const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
    if (name) {
      // Prefer structured vehicle name over title fluff
    }
  }

  if (kind === "rental") {
    rental = {
      subType: fill.rentalSubType?.trim()?.toLowerCase() || null,
      bedrooms: fill.rentalBedrooms?.trim() || null,
      bathrooms: fill.rentalBathrooms?.trim() || null,
      furnished: fill.rentalFurnishedStatus?.trim() || null,
      pets: fill.rentalPetsPolicy?.trim() || null,
      parking: fill.rentalParkingSpaces?.trim() || null,
      weekly: fill.rentalPriceWeekly?.trim() || null,
      monthly: fill.rentalPriceMonthly?.trim() || null,
      daily: fill.rentalPriceDaily?.trim() || fill.price?.trim() || null,
      bond: fill.rentalDeposit?.trim() || null,
      availableFrom: fill.rentalAvailableDate?.trim() || null,
    };
    if (rental.weekly) priceMode = "weekly";
    else if (rental.monthly) priceMode = "monthly";
    else if (rental.daily) priceMode = "daily";
  }

  if (kind === "wanted" && money) priceMode = "asking";

  const item =
    kind === "vehicle" && vehicle
      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || bare
      : bare;

  const conditionPhrase = conditionShort(fill.condition);

  let knownBits = 0;
  if (item) knownBits++;
  if (conditionPhrase) knownBits++;
  if (money || rental?.weekly || rental?.daily || rental?.monthly) knownBits++;
  if (location) knownBits++;
  if (delivery) knownBits++;
  if (vehicle?.odometer) knownBits++;
  if (vehicle?.colour) knownBits++;
  if (extras.length) knownBits++;
  if (rental?.bedrooms) knownBits++;
  if (serviceDuration) knownBits++;

  const factRichness: DescriptionFacts["factRichness"] =
    knownBits <= 3 ? "sparse" : knownBits >= 6 ? "rich" : "normal";

  return {
    kind,
    style,
    item,
    conditionPhrase,
    titleHadCondition,
    money,
    priceMode,
    location,
    delivery,
    vehicle,
    serviceDuration,
    rental,
    extras,
    quality,
    seed: listingSeed(fill),
    factRichness,
  };
}

/* ─── Sentence classification & semantic keys ───────────────────────────── */

function classifySentence(s: string): SentencePurpose {
  const t = s.trim();
  if (!t) return "other";
  if (
    IMPLEMENTATION_LEAK_RE.test(t) ||
    SELLER_EDITOR_GUIDANCE_RE.test(t) ||
    /\bAI\b|\bgenerated\b/i.test(t)
  ) {
    return "meta";
  }
  if (IMPLY_CLAIMS_RE.test(t) || SERVICE_INVENTION_RE.test(t) || UNSUPPORTED_CLAIM_RE.test(t)) {
    return "unsupported";
  }
  if (CTA_PURPOSE_RE.test(t)) return "cta";
  if (PICKUP_PURPOSE_RE.test(t) || SHIP_PURPOSE_RE.test(t)) return "logistics";
  if (PRICE_PURPOSE_RE.test(t) && wordCount(t) <= 12) return "price";
  if (FIELD_LABEL_RE.test(t) || /^(Condition is|Priced at|Located in)\b/i.test(t)) return "meta";
  return "other";
}

function semanticKey(s: string): string {
  const t = s.toLowerCase().replace(/[^a-z0-9\s$]/g, " ").replace(/\s+/g, " ").trim();
  if (CTA_PURPOSE_RE.test(s)) return "cta";
  if (PICKUP_PURPOSE_RE.test(s) && SHIP_PURPOSE_RE.test(s)) return "logistics:both";
  if (PICKUP_PURPOSE_RE.test(s)) return "logistics:pickup";
  if (SHIP_PURPOSE_RE.test(s)) return "logistics:ship";
  if (PRICE_PURPOSE_RE.test(s)) return "price";
  // Near-duplicate: first 48 chars of normalized text
  return `text:${t.slice(0, 48)}`;
}

function scoreCta(s: string): number {
  // Prefer short, direct CTAs over stacked soft invites
  let score = 40;
  const len = wordCount(s);
  if (len >= 4 && len <= 14) score += 20;
  if (len > 20) score -= 15;
  if (/\bmessage\b/i.test(s)) score += 10;
  if (/feel free to get in touch if you'd like more information/i.test(s)) score -= 50;
  if (/happy to sort a time that works for both/i.test(s)) score -= 20;
  if (/get in touch if you'd like more information/i.test(s)) score -= 30;
  return score;
}

/* ─── Step 3: quality pass ──────────────────────────────────────────────── */

function enforceOneCta(sentences: string[]): string[] {
  const ctas: { i: number; s: string; score: number }[] = [];
  const kept: (string | null)[] = sentences.map((s, i) => {
    if (classifySentence(s) === "cta") {
      ctas.push({ i, s, score: scoreCta(s) });
      return null;
    }
    return s;
  });
  if (ctas.length === 0) return sentences;
  ctas.sort((a, b) => b.score - a.score);
  const best = ctas[0];
  // Place winning CTA at end
  const body = kept.filter((s): s is string => Boolean(s));
  return [...body, best.s];
}

function semanticDedupe(sentences: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sentences) {
    const key = semanticKey(s);
    if (seen.has(key)) continue;
    // Also block near-exact duplicates
    const norm = s.toLowerCase().replace(/\s+/g, " ").trim();
    if (out.some((o) => o.toLowerCase().replace(/\s+/g, " ").trim() === norm)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function stripBadSentences(sentences: string[]): string[] {
  return sentences.filter((s) => {
    const p = classifySentence(s);
    if (p === "meta" || p === "unsupported") return false;
    if (FIELD_LABEL_RE.test(s) || BANNED_TEMPLATE_RE.test(s)) return false;
    if (IMPLEMENTATION_LEAK_RE.test(s) || SELLER_EDITOR_GUIDANCE_RE.test(s)) return false;
    if (IMPLY_CLAIMS_RE.test(s) || SERVICE_INVENTION_RE.test(s)) return false;
    if (SERVICE_TEMPLATE_SMELL_RE.test(s)) return false;
    // Drop robotic field sentences
    if (/^(Condition is|Priced at|Located in|Odometer is|Colour is)\b/i.test(s)) return false;
    return true;
  });
}

function countCtas(text: string): number {
  return splitSentences(text).filter((s) => classifySentence(s) === "cta").length;
}

export function isRoboticListingDescription(text: string | undefined | null): boolean {
  if (!text?.trim()) return true;
  const t = text.trim();
  if (t.length < 20) return true;
  if (FIELD_LABEL_RE.test(t)) return true;
  if (BANNED_TEMPLATE_RE.test(t)) return true;
  if (IMPLEMENTATION_LEAK_RE.test(t)) return true;
  if (SELLER_EDITOR_GUIDANCE_RE.test(t)) return true;
  if (IMPLY_CLAIMS_RE.test(t)) return true;
  if (SERVICE_INVENTION_RE.test(t)) return true;
  if (SERVICE_TEMPLATE_SMELL_RE.test(t)) return true;
  if (/\bOdometer:\s*/i.test(t) && /\bColour:\s*/i.test(t)) return true;
  if (/^Selling .+\.\s*Condition:/i.test(t)) return true;
  if (/^selling my .{1,40}$/i.test(t) && !/\n/.test(t)) return true;
  if (countCtas(t) > 1) return true;
  const sentences = splitSentences(t);
  // Service sell copy must not open with buyer/wanted voice
  if (/^Looking for\b/i.test(sentences[0] || "") && !/\bwanted\b/i.test(t.slice(0, 40))) {
    // Only flag when it looks like a service offer (available / per job / per hour)
    if (/\bavailable\b|\bper (?:job|hour)\b/i.test(t)) return true;
  }
  if (
    sentences.length >= 3 &&
    sentences.filter((s) =>
      /^(Condition:|Located in|Odometer:|Colour:|Pickup available\.|Pickup only\.)/i.test(s.trim())
    ).length >= 2
  ) {
    return true;
  }
  if ((t.match(/\n\n/g) || []).length >= 2 && /Asking \$/.test(t)) return true;
  for (let i = 1; i < sentences.length; i++) {
    if (sentences[i].trim().toLowerCase() === sentences[i - 1].trim().toLowerCase()) return true;
  }
  // Title + soft CTA (never a real vehicle listing)
  if (
    sentences.length <= 2 &&
    /^[A-Z0-9][\w\s-]{1,40}\.\s*Message if you have any questions\.?$/i.test(t)
  ) {
    return true;
  }
  // Semantic CTA stacking across sentences
  const ctaKeys = sentences.filter((s) => classifySentence(s) === "cta");
  if (ctaKeys.length > 1) return true;
  return false;
}

export function passesListingDescriptionQualityGate(
  text: string | undefined | null,
  opts?: { sparse?: boolean }
): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (
    FIELD_LABEL_RE.test(t) ||
    BANNED_TEMPLATE_RE.test(t) ||
    IMPLEMENTATION_LEAK_RE.test(t) ||
    SELLER_EDITOR_GUIDANCE_RE.test(t) ||
    IMPLY_CLAIMS_RE.test(t) ||
    SERVICE_INVENTION_RE.test(t) ||
    SERVICE_TEMPLATE_SMELL_RE.test(t)
  ) {
    return false;
  }
  if (t.includes("\n\n")) return false;
  if (countCtas(t) > 1) return false;
  const n = wordCount(t);
  // Sparse facts → short clean copy is OK; rich copy still stays under 100 words
  const min = opts?.sparse ? 10 : 14;
  if (n < min || n > 100) return false;
  const sentences = splitSentences(t);
  if (sentences.length < 1 || sentences.length > 5) return false;
  return true;
}

function defaultCta(facts: DescriptionFacts): string {
  const seed = facts.seed + ":cta";
  if (facts.kind === "service") {
    return pickVariant(seed, [
      "Message with a few job details and I'll get back to you.",
      "Send me a message with a few details about the job and I'll get back to you.",
      "Drop me a message when you're ready to chat about the job.",
    ]);
  }
  if (facts.kind === "vehicle") {
    return pickVariant(seed, [
      "Message if you're interested.",
      "Message to arrange a viewing.",
      "Happy to arrange a viewing — just message me.",
      "Message if you'd like to come take a look.",
    ]);
  }
  if (facts.kind === "rental") {
    const sub = facts.rental?.subType || "";
    if (sub === "property") {
      return pickVariant(seed, [
        "Message if you'd like to take a look.",
        "Happy to arrange a viewing — just message me.",
      ]);
    }
    return pickVariant(seed, [
      "Message me with the dates you need it and I can confirm availability.",
      "Message with the dates you need and I'll confirm availability.",
      "Message to arrange pickup.",
    ]);
  }
  if (facts.kind === "wanted") {
    return pickVariant(seed, [
      "Message if you have one for sale.",
      "Get in touch if you can help.",
    ]);
  }
  // physical
  return pickVariant(seed, [
    "Message if you're keen.",
    "Happy to answer questions — just message me.",
    "Message if you have any questions.",
  ]);
}

function runQualityPass(draft: string, facts: DescriptionFacts): string {
  if (!draft.trim()) return "";

  let sentences = splitSentences(draft);
  sentences = stripBadSentences(sentences);

  // Sell services must never open with buyer "Looking for…" voice
  if (facts.kind === "service") {
    sentences = sentences.map((s) => {
      const m = s.match(/^Looking for\s+(.+?)\?\s*(.*)$/i);
      if (!m) return s;
      const rest = (m[2] || "").trim();
      const itemBit = capFirst(m[1].trim());
      if (rest) return polishParagraph(`${itemBit}. ${rest}`);
      return polishParagraph(`${itemBit} available.`);
    });
  }

  sentences = semanticDedupe(sentences);
  sentences = enforceOneCta(sentences);

  const allowCta =
    facts.kind !== "vehicle"
      ? true
      : facts.factRichness !== "sparse";

  // CTA: never pad sparse vehicle drafts; other kinds keep one invite
  if (allowCta && facts.quality !== "standard") {
    const hasCta = sentences.some((s) => classifySentence(s) === "cta");
    if (!hasCta) sentences.push(defaultCta(facts));
    sentences = enforceOneCta(sentences);
    sentences = semanticDedupe(sentences);
  } else if (!allowCta) {
    sentences = sentences.filter((s) => classifySentence(s) !== "cta");
  } else {
    // standard + non-sparse vehicle: compact close, still one invite max
    sentences = sentences.filter((s) => classifySentence(s) !== "cta");
    sentences.push("Happy to answer questions.");
  }

  // Cap sentence count: prefer 2–4, allow 5 when extras/vehicle facts need room
  const maxSentences = 5;
  if (sentences.length > maxSentences) {
    const cta = sentences.find((s) => classifySentence(s) === "cta");
    const body = sentences.filter((s) => classifySentence(s) !== "cta").slice(0, maxSentences - 1);
    sentences = cta ? [...body, cta] : body;
  }

  let text = polishParagraph(sentences.join(" "));

  // Strip unsupported tokens that slipped into otherwise-good sentences
  if (!facts.extras.some((e) => /warrant/i.test(e))) {
    text = text.replace(/\s*[^.]*\bwarrant[^.]*\./gi, " ").trim();
  }
  if (!facts.extras.some((e) => /\b(authentic|genuine)\b/i.test(e))) {
    text = text.replace(/\b(authentic|genuine)\b/gi, "").replace(/\s{2,}/g, " ");
  }

  text = polishParagraph(text);

  const sparse = facts.factRichness === "sparse";
  const maxWords = 90;
  text = trimToWords(text, maxWords);

  if (!passesListingDescriptionQualityGate(text, { sparse }) || isRoboticListingDescription(text)) {
    text = safeFallbackDescription(facts);
  }

  // Final invisible re-check
  sentences = splitSentences(text);
  sentences = stripBadSentences(sentences);
  sentences = semanticDedupe(sentences);
  sentences = enforceOneCta(sentences);
  if (
    allowCta &&
    facts.quality !== "standard" &&
    !sentences.some((s) => classifySentence(s) === "cta")
  ) {
    sentences.push(defaultCta(facts));
    sentences = enforceOneCta(sentences);
  } else if (!allowCta) {
    sentences = sentences.filter((s) => classifySentence(s) !== "cta");
  }
  text = polishParagraph(sentences.join(" "));
  text = trimToWords(text, maxWords);

  return text.slice(0, 8000);
}

/** Deterministic safe rewrite — no phrase banks, no stacking, no seller coaching. */
function safeFallbackDescription(facts: DescriptionFacts): string {
  const parts: string[] = [];
  const cond =
    facts.conditionPhrase && !facts.titleHadCondition ? facts.conditionPhrase : null;
  const item = facts.item;

  if (facts.kind === "vehicle") {
    const colour = facts.vehicle?.colour;
    parts.push(
      polishParagraph(
        `${colour ? `${colour} ` : ""}${item} available for sale${facts.location ? ` in ${facts.location}` : ""}.`
      )
    );
    const bits: string[] = [];
    if (facts.vehicle?.odometer) bits.push(`${formatOdo(facts.vehicle.odometer)} on the clock`);
    if (facts.vehicle?.transmission) {
      bits.push(`${facts.vehicle.transmission.toLowerCase()} transmission`);
    }
    if (facts.conditionPhrase) bits.push(facts.conditionPhrase);
    if (bits.length) parts.push(capFirst(`${bits.join(", ")}.`));
    if (facts.money) parts.push(`Asking ${facts.money}.`);
  } else if (facts.kind === "service") {
    const priceBit =
      facts.priceMode === "hourly" && facts.money
        ? ` for ${facts.money} per hour`
        : facts.priceMode === "fixed_job" && facts.money
          ? ` for ${facts.money} per job`
          : "";
    parts.push(
      polishParagraph(
        `${item}${facts.location ? ` available in ${facts.location}` : " available"}${priceBit}.`
      )
    );
    if (facts.priceMode === "quote") {
      parts.push("Happy to discuss the scope and put a quote together once I know a bit more.");
    }
  } else if (facts.kind === "rental") {
    const rate =
      facts.rental?.weekly
        ? `$${facts.rental.weekly} per week`
        : facts.rental?.daily
          ? `$${facts.rental.daily} per day`
          : facts.rental?.monthly
            ? `$${facts.rental.monthly} per month`
            : facts.money || null;
    const cleanItem = cleanRentalItemName(item) || item;
    parts.push(
      polishParagraph(
        `${cleanItem}${facts.location ? ` available to hire in ${facts.location}` : " available to hire"}${rate ? ` for ${rate}` : ""}.`
      )
    );
  } else if (facts.kind === "wanted") {
    parts.push(
      polishParagraph(
        `Looking for ${item.toLowerCase()}${facts.location ? ` in ${facts.location}` : ""}${facts.money ? ` — budget around ${facts.money}` : ""}.`
      )
    );
  } else {
    const display =
      facts.titleHadCondition && facts.conditionPhrase === "brand new"
        ? `brand new ${item}`
        : facts.titleHadCondition && facts.conditionPhrase === "like-new"
          ? `like-new ${item}`
          : item;
    parts.push(polishParagraph(`${capFirst(display)}${cond ? ` in ${cond}` : ""}.`));
    const logistics = logisticsSentence(facts, { includePrice: true });
    if (logistics) parts.push(logistics);
    else if (facts.money) parts.push(`Asking ${facts.money}.`);
  }

  if (facts.quality === "standard") {
    parts.push("Happy to answer questions.");
  } else if (facts.kind !== "vehicle" || facts.factRichness !== "sparse") {
    parts.push(defaultCta(facts));
  }

  return polishParagraph(parts.filter(Boolean).join(" "));
}

/* ─── Logistics / price weaving ─────────────────────────────────────────── */

function logisticsSentence(
  facts: DescriptionFacts,
  opts?: { includePrice?: boolean }
): string | null {
  const loc = facts.location;
  const money = opts?.includePrice ? facts.money : null;
  const d = facts.delivery;

  if (d === "pickup_only" || d === "pickup") {
    if (loc && money) {
      return pickVariant(facts.seed + ":log", [
        `Pickup is available in ${loc}, asking ${money}.`,
        `Pickup is available in ${loc} for ${money}.`,
        `Pickup is available in ${loc}, and I'm asking ${money}.`,
      ]);
    }
    if (loc) return `Pickup is available in ${loc}.`;
    if (money) return `Pickup available — asking ${money}.`;
    return "Pickup is available.";
  }
  if (d === "pickup_or_shipping") {
    if (loc && money) {
      return `Pickup is available in ${loc}, or shipping can be arranged — asking ${money}.`;
    }
    if (loc) {
      return `Pickup is available in ${loc}, or shipping can be arranged.`;
    }
    return money
      ? `Pickup or shipping both fine — asking ${money}.`
      : "Pickup or shipping both fine.";
  }
  if (d === "shipping") {
    if (loc && money) return `Shipping is available from ${loc} — asking ${money}.`;
    if (money) return `Shipping is available — asking ${money}.`;
    return loc ? `Shipping is available from ${loc}.` : "Shipping is available.";
  }
  if (loc && money) {
    return pickVariant(facts.seed + ":locp", [
      `Available in ${loc}, asking ${money}.`,
      `In ${loc}, asking ${money}.`,
      `Asking ${money} in ${loc}.`,
    ]);
  }
  if (loc) return `Available in ${loc}.`;
  if (money) return `Asking ${money}.`;
  return null;
}

/* ─── Step 2: type-specific writers ─────────────────────────────────────── */

function writePhysical(facts: DescriptionFacts): string {
  const seed = facts.seed;
  const cond =
    facts.conditionPhrase && !facts.titleHadCondition ? facts.conditionPhrase : null;
  const item = facts.item;
  const display =
    facts.titleHadCondition && /brand new/i.test(facts.conditionPhrase || "")
      ? `brand new ${item}`
      : facts.titleHadCondition && /like-new/i.test(facts.conditionPhrase || "")
        ? `like-new ${item}`
        : item;

  // Controlled opener variation — structure only, not CTA soup
  const structure = hashSeed(seed + ":struct") % 3;
  let opener: string;
  if (facts.style === "gaming") {
    opener = pickVariant(seed + ":open", [
      `${capFirst(display)}${cond ? `, ${cond}` : ""} available.`,
      `${capFirst(display)} up for grabs${cond ? `, ${cond}` : ""}.`,
      `Got a ${display}${cond ? ` in ${cond}` : ""}.`,
    ]);
  } else if (facts.style === "furniture") {
    opener = pickVariant(seed + ":open", [
      `${item}${cond ? ` in ${cond}` : ""}.`,
      `${item}${cond ? `, ${cond}` : ""} available.`,
      `${capFirst(item)}${cond ? ` in ${cond}` : ""}.`,
    ]);
  } else if (structure === 0) {
    opener = `${capFirst(display)}${cond ? ` in ${cond}` : ""}.`;
  } else if (structure === 1) {
    opener = `${capFirst(display)}${cond ? `, ${cond}` : ""}.`;
  } else {
    opener = `${capFirst(display)}${cond ? ` in ${cond}` : ""} available.`;
  }

  const parts: string[] = [polishParagraph(opener)];

  // Avoid repeating location in opener+logistics when pickup carries location
  const logistics = logisticsSentence(facts, { includePrice: true });
  if (logistics) parts.push(logistics);
  else if (facts.money) parts.push(`Asking ${facts.money}.`);

  if (facts.extras.length) {
    parts.push(`${facts.extras.join("; ")}.`);
  }

  return parts.join(" ");
}

function writeVehicle(facts: DescriptionFacts): string {
  const v = facts.vehicle;
  const name = facts.item;
  const colour = v?.colour;
  const loc = facts.location;
  const seed = facts.seed;

  const detailBits: string[] = [];
  if (v?.odometer) detailBits.push(`${formatOdo(v.odometer)} on the clock`);
  if (v?.transmission) detailBits.push(`${v.transmission.toLowerCase()} transmission`);
  if (v?.fuel) detailBits.push(`${v.fuel.toLowerCase()} fuel`);
  if (v?.body) detailBits.push(`${v.body.toLowerCase()} body`);
  if (facts.conditionPhrase && facts.conditionPhrase !== "brand new") {
    detailBits.push(facts.conditionPhrase);
  }
  if (facts.extras.length) detailBits.push(...facts.extras);

  // Buyer copy only — never seller "still need / complete the listing" coaching
  const opener = pickVariant(seed + ":vopen", [
    colour
      ? `${colour} ${name}${loc ? `, available in ${loc}` : " available for sale"}.`
      : `${name}${loc ? ` available in ${loc}` : " available for sale"}.`,
    colour
      ? `${name} in ${colour.toLowerCase()}${loc ? `, ${loc}` : ""}.`
      : `${name}${loc ? ` in ${loc}` : " available for sale"}.`,
    `${colour ? `${colour} ` : ""}${name}${loc ? ` in ${loc}` : ""}.`,
  ]);

  const parts: string[] = [polishParagraph(opener)];
  if (detailBits.length) parts.push(capFirst(`${detailBits.join(", ")}.`));

  if (facts.money) {
    parts.push(
      pickVariant(seed + ":vp", [`Asking ${facts.money}.`, `I'm asking ${facts.money}.`])
    );
  }

  return parts.join(" ");
}

function writeService(facts: DescriptionFacts): string {
  const item = facts.item;
  const loc = facts.location;
  const seed = facts.seed;
  const priceClause =
    facts.priceMode === "hourly" && facts.money
      ? ` for ${facts.money} per hour`
      : facts.priceMode === "fixed_job" && facts.money
        ? ` for ${facts.money} per job`
        : "";

  // Provider / seller voice only — never open with buyer "Looking for…"
  const opener = pickVariant(seed + ":sopen", [
    loc
      ? `${item} available in ${loc}${priceClause}.`
      : `${item} available${priceClause}.`,
    loc
      ? `${item} in ${loc}${priceClause}.`
      : priceClause
        ? `${item} available${priceClause}.`
        : `${item} available locally.`,
    loc
      ? `${capFirst(item)} available in ${loc}${priceClause}.`
      : `${capFirst(item)} available${priceClause}.`,
  ]);

  const parts: string[] = [polishParagraph(opener)];

  if (facts.priceMode === "quote") {
    parts.push(
      pickVariant(seed + ":sq", [
        "Happy to discuss the scope and put a quote together once I know a bit more about the job.",
        "Scope and pricing depend on the job — happy to put a quote together once I have a few more details.",
      ])
    );
  } else {
    // One mid about discussing needs — NOT a second CTA
    const blob = `${item} ${facts.style}`.toLowerCase();
    if (/lawn|mow/.test(blob)) {
      parts.push(
        pickVariant(seed + ":smid", [
          "Whether it's a one-off tidy-up or regular lawn maintenance, happy to talk through what you need.",
          "Happy to talk through the size of the job and find a time that works.",
        ])
      );
    } else if (/clean/.test(blob)) {
      parts.push(
        pickVariant(seed + ":smid", [
          "Whether it's a one-off clean or regular visits, happy to talk through what you need.",
          "Happy to talk through the space and find a time that works.",
        ])
      );
    } else if (/photo|tutor|lesson|teach/.test(blob)) {
      parts.push(
        pickVariant(seed + ":smid", [
          "Happy to discuss what you're after and arrange a time that suits.",
          "Whether it's a one-off session or ongoing work, happy to talk through what you need.",
        ])
      );
    } else {
      parts.push(
        pickVariant(seed + ":smid", [
          "Happy to discuss what you need and work out the details from there.",
          "Whether it's a one-off job or something more regular, happy to talk through the scope.",
        ])
      );
    }
  }

  if (facts.serviceDuration) {
    parts.push(`Typical jobs run about ${facts.serviceDuration}.`);
  }
  if (facts.extras.length) parts.push(`${facts.extras.join("; ")}.`);

  return parts.join(" ");
}

function writeRental(facts: DescriptionFacts): string {
  const item = cleanRentalItemName(facts.item) || facts.item;
  const loc = facts.location;
  const r = facts.rental;
  const sub = r?.subType || "";
  const seed = facts.seed;
  const isProperty = sub === "property" || Boolean(r?.bedrooms || r?.weekly);

  const dailyRate = r?.daily
    ? `$${r.daily} per day`
    : facts.money
      ? `${facts.money} per day`
      : null;
  const weeklyRate = r?.weekly ? `$${r.weekly} per week` : null;

  let opener: string;
  if (!isProperty && (dailyRate || weeklyRate)) {
    const rate = dailyRate || weeklyRate;
    opener = pickVariant(seed + ":ropen", [
      `${item}${loc ? ` available to hire in ${loc}` : " available to hire"} for ${rate}.`,
      loc
        ? `${item} available to hire in ${loc} for ${rate}.`
        : `${item} available to hire for ${rate}.`,
      `${capFirst(item)} for hire${loc ? ` in ${loc}` : ""} — ${rate}.`,
    ]);
  } else {
    opener = pickVariant(seed + ":ropen", [
      `${item}${loc ? ` in ${loc}` : ""} is available to rent.`,
      loc ? `${item} available to rent in ${loc}.` : `${item} available to rent.`,
      `${item}${loc ? `, ${loc}` : ""} — available to rent.`,
    ]);
  }

  const parts: string[] = [polishParagraph(opener)];
  const bits: string[] = [];
  if (r?.bedrooms) {
    bits.push(`${r.bedrooms} bedroom${r.bedrooms === "1" ? "" : "s"}`);
  }
  if (r?.bathrooms) {
    bits.push(`${r.bathrooms} bathroom${r.bathrooms === "1" ? "" : "s"}`);
  }
  if (r?.furnished) bits.push(r.furnished.toLowerCase());
  if (r?.pets) bits.push(r.pets.toLowerCase());
  if (r?.parking) bits.push(`parking for ${r.parking}`);

  const rates: string[] = [];
  // Property: list rates in facts line. Equipment: rate already in opener.
  if (isProperty) {
    if (r?.weekly) rates.push(`$${r.weekly} per week`);
    if (r?.monthly) rates.push(`$${r.monthly} per month`);
    if (r?.daily) rates.push(`$${r.daily} per day`);
    if (r?.bond) rates.push(`$${r.bond} bond`);
  } else if (r?.bond) {
    rates.push(`$${r.bond} bond`);
  }
  if (rates.length) bits.push(rates.join(", "));
  if (r?.availableFrom) bits.push(`available from ${r.availableFrom}`);
  if (facts.extras.length) bits.push(...facts.extras);

  if (bits.length) parts.push(capFirst(`${bits.join(", ")}.`));

  return parts.join(" ");
}

function writeWanted(facts: DescriptionFacts): string {
  const item = facts.item;
  const loc = facts.location;
  const seed = facts.seed;
  const opener = pickVariant(seed + ":wopen", [
    `Looking for ${item.toLowerCase()}${loc ? ` in ${loc}` : ""}.`,
    `Wanted: ${item}${loc ? ` in ${loc}` : ""}.`,
    `After a ${item.toLowerCase()}${loc ? ` around ${loc}` : ""}.`,
  ]);
  const parts: string[] = [polishParagraph(opener)];
  if (facts.money) {
    parts.push(
      pickVariant(seed + ":wpay", [
        `Budget around ${facts.money}.`,
        `Happy to look at options around ${facts.money}.`,
      ])
    );
  }
  if (facts.conditionPhrase) {
    parts.push(`Prefer ${facts.conditionPhrase}.`);
  }
  return parts.join(" ");
}

function writeFromFacts(facts: DescriptionFacts): string {
  switch (facts.kind) {
    case "vehicle":
      return writeVehicle(facts);
    case "service":
      return writeService(facts);
    case "rental":
      return writeRental(facts);
    case "wanted":
      return writeWanted(facts);
    default:
      return writePhysical(facts);
  }
}

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * Marketplace description from known draft facts only — no hallucinations.
 * Facts → type writer → quality pass. Default quality: Premium Plus.
 * Vehicles: blank until getVehicleDraftReadiness says buyer copy is worth generating,
 * unless the seller explicitly asked to write/improve the description (force).
 */
export function buildListingDescriptionFromFacts(
  fill: SkyAiListingFill,
  opts?: { quality?: ListingDescriptionQuality; force?: boolean }
): string {
  if (
    isVehicleListingFill(fill) &&
    !opts?.force &&
    !getVehicleDraftReadiness(fill).worthGeneratingBuyerCopy
  ) {
    return "";
  }
  const facts = extractDescriptionFacts(fill, opts);
  const draft = writeFromFacts(facts);
  if (!draft.trim()) return "";
  return runQualityPass(draft, facts);
}
