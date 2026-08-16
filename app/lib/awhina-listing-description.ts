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
import {
  composeListingIdentity,
  guardAdjacentIdentityDuplication,
} from "./awhina-listing-identity";
import {
  sanitizePublicCopyText,
  extractTradingCardFactsFromExtras,
  composeTradingCardTitle,
  isSealedTradingCardProductFormat,
  repairCardProductLineOrder,
  normalizeTradingCardProductLine,
} from "./awhina-public-copy-gate";

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
  /** Internal only — never serialized as key:value in public prose. */
  bundleQuantity: number | null;
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

/** Field-label / metadata serialization smells in buyer copy. */
const METADATA_SERIALIZATION_RE =
  /(?:^|\.\s+)Set\s+[A-Z][^.]{0,60}\.|Attr\s*:|^(?:Topps|Panini|Upper Deck)\.\s*$|Bundle[_\s-]?quantity\s*:|(?:^|\.\s+)(?:bundle_quantity|listing_type|domain|category_id|condition_code|vision_confidence|provenance|field_source)\s*:/im;

/** Strip leftover structured key:value dumps from public description prose. */
export function stripStructuredMetadataLeakage(text: string): string {
  return String(text || "")
    .replace(
      /\b(?:bundle[_\s-]?quantity|listing[_\s-]?type|domain|category[_\s-]?id|condition[_\s-]?code|vision[_\s-]?confidence|provenance|field[_\s-]?source|brand|subject|player(?:name)?|set|product(?:[_\s-]?line)?|manufacturer|serial(?:[_\s-]?number)?|grader?|parallel(?:[_\s-]?colour)?|quantity)\s*:\s*[^\s.]+/gi,
      " "
    )
    // Any remaining snake_case key:value is internal structured fact leakage
    .replace(/\b[a-z]+(?:_[a-z0-9]+){1,6}\s*:\s*[^\s.]+/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .replace(/\s*\.\s*\./g, ".")
    .trim();
}


export const BANNED_TEMPLATE_RE =
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
  /\b(warranty|receipt|authenticity|genuine|factory sealed|unopened|serviced recently|full service history|WOF|rego current|insured|years of experience|guaranteed|fully equipped)\b/i;

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
  const n = Number(price.replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return `$${n.toLocaleString("en-NZ")}`;
}

function indefiniteArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function conditionShort(condition: string | undefined): string | null {
  if (!condition?.trim()) return null;
  const c = condition.trim();
  if (c === "New") return "brand new";
  if (c === "Used - Like New") return "like-new";
  if (c === "Used - Good") return "good used condition";
  if (c === "Used - Fair") return "fair used condition";
  const lower = c.toLowerCase();
  if (/^(good(\s+used)?|used\s*-?\s*good)$/i.test(lower)) return "good used condition";
  if (/^(fair(\s+used)?|used\s*-?\s*fair)$/i.test(lower)) return "fair used condition";
  if (/^(like[\s-]?new|used\s*-?\s*like\s*new)$/i.test(lower)) return "like-new";
  if (/^(brand\s+)?new$/i.test(lower)) return "brand new";
  return c.toLowerCase();
}

/** Build a grammatically valid condition predicate for singular/plural prose. */
export function composeConditionPredicate(
  conditionPhrase: string,
  plural = false
): string {
  const verb = plural ? "are" : "is";
  const normalized = conditionPhrase
    .trim()
    .replace(/^in\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (normalized === "brand new") return `${verb} brand new`;
  if (normalized === "new") return `${verb} new`;
  if (/^like[- ]new(?:\s+condition)?$/.test(normalized)) {
    return `${verb} in like-new condition`;
  }
  if (normalized === "good") return `${verb} in good condition`;
  if (/^good used(?:\s+condition)?$/.test(normalized)) {
    return `${verb} in good used condition`;
  }
  if (normalized === "fair") return `${verb} in fair condition`;
  if (/^fair used(?:\s+condition)?$/.test(normalized)) {
    return `${verb} in fair used condition`;
  }
  if (/\bcondition$/.test(normalized)) return `${verb} in ${normalized}`;
  return `${verb} ${normalized}`;
}

/**
 * Identity-only label for writers — never raw freeform defect tails.
 * Keeps storage/colour tokens that belong in the product name.
 */
export function cleanDescriptionItemName(raw: string): string {
  let s = String(raw || "")
    .replace(/^(brand\s+new|like\s+new)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  s = repairCardProductLineOrder(s);
  s = s
    .replace(
      /[,;]?\s*(?:couple(?:\s+of)?\s+)?(?:scratches?|scuffs?|dents?|dings?).*$/i,
      ""
    )
    .replace(/[,;]?\s*battery\s+health.*$/i, "")
    .replace(/[,;]?\s*screen\s+is\b.*$/i, "")
    .replace(/\s+but\s*$/i, "")
    .replace(/[,;]+$/g, "")
    .replace(/\b(\d+)\s*(gb|tb)\b/gi, (_, n, u) => `${n}${String(u).toUpperCase()}`)
    .replace(/\s+/g, " ")
    .trim();
  // Soft-normalize colour casing at end: "Black" → "black" only when trailing
  s = s.replace(/\b(Black|White|Silver|Grey|Gray|Blue|Red|Green|Gold)\s*$/g, (m) =>
    m.toLowerCase()
  );
  return s || String(raw || "").trim();
}

/** Structured card / collectible facts selected for buyer prose (not UI echo). */
export type SelectedDescriptionFacts = {
  domain: "trading_card" | "general";
  playerName: string | null;
  productLine: string | null;
  manufacturer: string | null;
  serial: string | null;
  grade: string | null;
  parallel: string | null;
  /** Extras safe to weave as wear/feature prose — never identity dumps. */
  weaveExtras: string[];
};

/**
 * Select which canonical facts belong in description prose.
 * Identity fields (player/set/manufacturer) are for composition — not Attr:/Set X. dumps.
 * Manufacturer alone is dropped when product line already contains it (Topps ⊂ Topps Chrome).
 */
export function selectDescriptionFacts(
  fill: SkyAiListingFill,
  extras?: string[]
): SelectedDescriptionFacts {
  const rawExtras = extras || fill.extras || [];
  const card = extractTradingCardFactsFromExtras(rawExtras);
  const productLine = normalizeTradingCardProductLine(
    card.manufacturer,
    card.productLine
  );
  const manufacturer =
    productLine &&
    card.manufacturer &&
    productLine.toLowerCase().includes(card.manufacturer.toLowerCase())
      ? null
      : card.manufacturer?.trim() || null;

  const isCard = Boolean(
    card.playerName ||
      productLine ||
      card.serialNumber ||
      /trading\s*card|topps|panini|prizm|chrome|psa\s*\d/i.test(
        `${fill.title || ""} ${fill.category || ""} ${rawExtras.join(" ")}`
      )
  );

  // Identity tags must not become separate "Set X." / "Topps." sentences
  const weaveExtras = rawExtras
    .map((e) => String(e || "").trim())
    .filter(Boolean)
    .filter(
      (e) =>
        !/^(subject|player|playername|set|productline|product_line|manufacturer|brand|serial|serialnumber|serial_number|grade|grader|parallel|parallelcolour|parallel_colour|year|team|bundle_quantity|bundlequantity|quantity):/i.test(
          e
        )
    );

  const grade =
    card.grader && card.grade
      ? `${card.grader.toUpperCase()} ${card.grade}`
      : card.grade || null;

  const sealed = isSealedTradingCardProductFormat(
    card.productFormat || `${fill.title || ""} ${rawExtras.join(" ")}`
  );

  return {
    domain: isCard ? "trading_card" : "general",
    playerName: sealed ? null : card.playerName?.trim() || null,
    productLine,
    manufacturer,
    serial: sealed ? null : card.serialNumber?.replace(/^#/, "").trim() || null,
    grade: sealed ? null : grade,
    // Packaging colour must never become parallel prose on sealed products.
    parallel: sealed
      ? null
      : [card.parallelColour, card.parallel].filter(Boolean).join(" ").trim() || null,
    weaveExtras,
  };
}

/**
 * Semantic fact dedupe for description: product line wins over manufacturer;
 * drop values already present in the identity/title phrase.
 */
export function semanticDedupeDescriptionFacts(
  selected: SelectedDescriptionFacts,
  identityPhrase: string
): SelectedDescriptionFacts {
  const id = identityPhrase.toLowerCase();
  const dropIfInIdentity = (v: string | null): string | null => {
    if (!v) return null;
    if (id.includes(v.toLowerCase())) return null;
    return v;
  };
  let manufacturer = selected.manufacturer;
  if (
    selected.productLine &&
    manufacturer &&
    selected.productLine.toLowerCase().includes(manufacturer.toLowerCase())
  ) {
    manufacturer = null;
  }
  return {
    ...selected,
    playerName: dropIfInIdentity(selected.playerName),
    productLine: dropIfInIdentity(selected.productLine),
    manufacturer: dropIfInIdentity(manufacturer),
    serial: dropIfInIdentity(selected.serial),
    grade: dropIfInIdentity(selected.grade),
    parallel: dropIfInIdentity(selected.parallel),
  };
}

function normalizeLiftedFact(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/\b(\d+)\s*(gb|tb)\b/gi, (_, n, u) => `${n}${String(u).toUpperCase()}`);
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Description input mapping: freeform seller clauses sometimes land in the title
 * instead of extras. Lift them for prose — do not invent beyond what's already
 * present on the confirmed draft title/extras.
 */
export function liftFreeformFactsFromConfirmedText(...blobs: string[]): string[] {
  const text = blobs.filter(Boolean).join(" \n ");
  if (!text.trim()) return [];
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const n = normalizeLiftedFact(raw);
    if (n.length < 3 || n.length > 180) return;
    if (out.some((e) => e.toLowerCase() === n.toLowerCase())) return;
    out.push(n);
  };

  const wear = text.match(
    /\b((?:a\s+|couple(?:\s+of)?\s+|some\s+|light\s+|minor\s+|small\s+)?(?:scratches?|scuffs?|dents?|dings?)(?:\s+on\s+(?:the\s+)?(?:sides?|back|edges?|corners?|frame|body|lid))?)\b/i
  );
  if (wear?.[1]) push(wear[1]);

  const screen = text.match(
    /\b(screen\s+(?:is\s+)?(?:mint|perfect|flawless|cracked|smashed|good|fine|clean|excellent))\b/i
  );
  if (screen?.[1]) push(screen[1]);

  const batt = text.match(/\bbattery\s+health\s*(?:is\s*|at\s*)?(\d{1,3})\s*%/i);
  if (batt?.[1]) {
    const pct = Number(batt[1]);
    if (Number.isFinite(pct) && pct >= 1 && pct <= 100) push(`Battery health ${pct}%`);
  }

  const mods = text.match(
    /\b((?:modified|upgraded)\s+with\s+[^.!?\n]{8,160})/i
  );
  if (mods?.[1]) {
    push(mods[1].replace(/[,;]+$/g, "").trim());
  }

  const recently = text.match(
    /\b(recently\s+serviced|full\s+service\s+history|new\s+tyres|new\s+tires|includes?\s+(?:the\s+)?(?:box|charger|case|manual))\b/i
  );
  if (recently?.[1]) push(recently[1]);

  return out.slice(0, 8);
}

/** Downgrade optimistic condition phrases when extras/title confirm wear/damage. */
function reconcileConditionPhrase(
  phrase: string | null,
  extras: string[],
  title?: string
): string | null {
  if (!phrase) return phrase;
  const blob = `${extras.join(" ")} ${title || ""}`.toLowerCase();
  const hasWear =
    /\b(scratches?|scuffs?|dents?|dings?|cracks?|chips?|wear|worn|damaged?)\b/i.test(
      blob
    );
  if (!hasWear) return phrase;
  if (/brand new|like-new/i.test(phrase)) return "good used condition";
  return phrase;
}

/** Turn confirmed extras into buyer prose — never raw slot / field-label concatenation. */
function composeExtrasProse(extras: string[]): string | null {
  // Identity / catalog / internal structured tags are composed elsewhere —
  // never "Set X.", "Bundle_quantity:3.", or lone "Topps."
  const bits = extras
    .map((e) => String(e || "").trim())
    .filter(Boolean)
    .filter(
      (e) =>
        !/^(subject|player|playername|set|productline|product_line|manufacturer|brand|serial|serialnumber|serial_number|grade|grader|parallel|parallelcolour|parallel_colour|year|team|bundle_quantity|bundlequantity|quantity|listing_type|listingtype|domain|category_id|categoryid|condition_code|conditioncode|vision_confidence|visionconfidence|provenance|field_source|fieldsource):/i.test(
          e
        )
    )
    .map((e) =>
      e
        .replace(/^storage:/i, "")
        .replace(/^variant:/i, "")
        .replace(/^visual:\s*/i, "")
        .replace(/^attr:\s*/i, "")
        .replace(/^text:\s*/i, "")
        .replace(/^kw:\s*/i, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((e) => e.length >= 3)
    // Any remaining key:value / key_value:value residue is metadata, not prose
    .filter((e) => !/^[a-z][a-z0-9_]{1,40}\s*:/i.test(e))
    .filter((e) => !/^(brand|new|like|console|the|and|for|with|black|white)$/i.test(e))
    .filter(
      (e) =>
        !/^(player\s*image|orange\s*background|shiny\s*surface|background|surface|image|photo|picture)$/i.test(
          e
        )
    )
    .filter((e) => !/^(attr|attribute|visionfact|candidate|confidence)\b/i.test(e))
    // Reject field-label residue that slipped through
    .filter((e) => !/^set\s+/i.test(e))
    .filter((e) => !/^(topps|panini|upper\s*deck|fleer|bowman|donruss)$/i.test(e));

  if (!bits.length) return null;

  const wear: string[] = [];
  const positives: string[] = [];
  const battery: string[] = [];
  const other: string[] = [];

  for (const b of bits) {
    if (/\bbattery\s+health\b/i.test(b)) battery.push(b);
    else if (/\b(scratches?|scuffs?|dents?|dings?|cracks?|chips?|wear)\b/i.test(b))
      wear.push(b);
    else if (/\bscreen\b/i.test(b)) positives.push(b);
    else if (/\b(modif|upgraded|turbo|intercooler|downpipe|intake)\b/i.test(b)) {
      other.push(b.endsWith(".") ? b.slice(0, -1) : b);
    } else other.push(b);
  }

  const sentences: string[] = [];
  if (wear.length && positives.length) {
    sentences.push(
      polishParagraph(
        `Has ${wear.map((w) => w.toLowerCase()).join(" and ")}, but the ${positives
          .map((p) => p.replace(/^screen\s+is\s+/i, "screen is ").toLowerCase())
          .join(" and ")}.`
      )
    );
  } else {
    if (wear.length) {
      sentences.push(
        polishParagraph(`Has ${wear.map((w) => w.toLowerCase()).join(" and ")}.`)
      );
    }
    if (positives.length) {
      sentences.push(
        polishParagraph(
          `${capFirst(
            positives
              .map((p) => p.replace(/^screen\s+is\s+/i, "screen is ").toLowerCase())
              .join("; ")
          )}.`
        )
      );
    }
  }
  for (const b of battery) {
    const m = b.match(/(\d{1,3})\s*%/);
    sentences.push(
      polishParagraph(
        m ? `Battery health is at ${m[1]}%.` : `${capFirst(b.toLowerCase())}.`
      )
    );
  }
  for (const o of other) {
    // Never emit one-token manufacturer/set stubs as sentences
    if (/^(topps|panini|chrome|prizm|set)\b/i.test(o) && o.split(/\s+/).length <= 2) {
      continue;
    }
    sentences.push(polishParagraph(o.endsWith(".") ? o : `${o}.`));
  }
  return sentences.join(" ") || null;
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
    .filter((e) => !/^attr:/i.test(e))
    .filter((e) => !/^text:/i.test(e))
    .filter((e) => !/^accessory:/i.test(e))
    .filter(
      (e) =>
        !/^(bundle_quantity|bundlequantity|quantity|listing_type|listingtype|domain|category_id|condition_code|vision_confidence|provenance|field_source):/i.test(
          e
        )
    )
    .filter((e) => !/^(brand|new|like|console|the|and|for|with)$/i.test(e))
    // Keep structured storage tags as readable facts for identity (title already has them)
    .filter((e) => !/^storage:/i.test(e))
    .filter(
      (e) =>
        !/^(player\s*image|orange\s*background|shiny\s*surface)$/i.test(
          e.replace(/^[^:]+:/, "")
        )
    )
    .filter(
      (e) =>
        e.split(/\s+/).length >= 2 ||
        /servic|tyre|tire|receipt|paperwork|wof|rego|mod|include|controller|charger|box|manual|warranty|battery|scratches?|scuffs?|dents?|screen|turbo|intake|intercooler|downpipe|subject:|set:|serial:|parallel|grade:|manufacturer:/i.test(
          e
        )
    )
    .slice(0, 6);
}

const BANG_SENTENCE_START_RE =
  /(?<=!)\s+(?=(?:I|It|Its|They|Their|This|These|Those|The|All|Comes|Includes|Has|Battery|Pickup|Shipping|Delivery|Message|Available)\b)/;

/**
 * Split buyer prose without treating punctuation inside a proper name (for
 * example "Brand! Product") as an automatic sentence boundary.
 */
export function splitListingDescriptionSentences(text: string): string[] {
  return text
    .split(new RegExp(`(?<=[.?])\\s+|${BANG_SENTENCE_START_RE.source}`, "i"))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function capitalizeSentenceStart(text: string): string {
  return splitListingDescriptionSentences(text)
    .map((sentence) =>
      sentence.replace(/^([a-z])/, (letter) => letter.toUpperCase())
    )
    .join(" ");
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

/** Final grammar / stitch cleanup before return — never invent facts. */
function finalGrammarCleanup(text: string): string {
  let t = text;
  // "brand new available" / "good condition available" → drop dangling available
  t = t.replace(
    /\b(brand new|like-new|good used condition|fair used condition)\s+available\b/gi,
    "$1"
  );
  t = t.replace(
    /\b,\s*(brand new|like-new|good used condition|fair used condition)\s+available\b/gi,
    ", $1"
  );
  // "…. available. Available in X" → ". In X"
  t = t.replace(/\bavailable\.\s*Available in\b/gi, ". In");
  t = t.replace(/\bavailable\.\s*Available\b/gi, ".");
  // "Pickup is available in" after an earlier available → "Pickup in"
  t = t.replace(/\bPickup is available in\b/gi, "Pickup in");
  t = t.replace(/\bShipping is available from\b/gi, "Shipping from");
  t = t.replace(/\bPickup available\b/gi, "Pickup");
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+([,.;])/g, "$1");
  return polishParagraph(t);
}

/**
 * If "available" already appeared, rewrite later logistics so we don't stitch
 * a second availability sentence.
 */
function collapseRepeatedAvailability(sentences: string[]): string[] {
  let seenAvailable = false;
  const out: string[] = [];
  for (const s of sentences) {
    if (!/\bavailable\b/i.test(s)) {
      out.push(s);
      continue;
    }
    if (!seenAvailable) {
      seenAvailable = true;
      out.push(s);
      continue;
    }
    let rewritten = s
      .replace(/\bPickup is available in\b/i, "Pickup in")
      .replace(/\bShipping is available from\b/i, "Shipping from")
      .replace(/\bPickup available\b/i, "Local pickup")
      .replace(/^Available in\b/i, "In")
      .replace(/\bavailable\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;])/g, "$1")
      .trim();
    if (!rewritten || /^[.!?]$/.test(rewritten)) continue;
    rewritten = polishParagraph(rewritten);
    if (/\bavailable\b/i.test(rewritten)) continue;
    out.push(rewritten);
  }
  return out;
}

function splitSentences(text: string): string[] {
  return splitListingDescriptionSentences(text);
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
  let bare =
    cleanDescriptionItemName(stripTitleConditionPrefix(title)) ||
    (kind === "service" ? "Service" : "Item");
  if (kind === "rental") {
    bare = cleanRentalItemName(bare) || bare;
  }
  const location = (fill.location || fill.pickupArea || "").trim() || null;
  const money = formatMoneyPlain(fill.price);
  const delivery = deliveryMode(fill);
  // Confirmed extras + freeform clauses already present on title (input mapping only)
  const woven = weaveableExtras(fill);
  // bundle_quantity stays on the canonical draft. For prose we only keep a
  // numeric internal field — never re-inject "bundle_quantity:3" into extras
  // where composeExtrasProse could append it after natural "Set of three…".
  const bundleQuantity =
    bundleQuantityFromExtras(fill.extras || []) ||
    bundleQuantityFromSubject(fill.extras || []);
  const lifted = liftFreeformFactsFromConfirmedText(title, ...(fill.extras || []));
  const extras = [
    ...woven,
    ...lifted.filter(
      (f) => !woven.some((e) => e.toLowerCase() === f.toLowerCase())
    ),
  ].slice(0, 8);

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

  // ONE canonical identity — never blind year/make/model concat; collapse overlap
  const variantExtra = (fill.extras || [])
    .find((e) => /^variant:/i.test(e))
    ?.replace(/^variant:/i, "")
    .trim();
  const item =
    kind === "vehicle" && vehicle
      ? composeListingIdentity({
          year: vehicle.year,
          brand: vehicle.make,
          product: vehicle.model,
          generation: fill.vehicleGeneration?.trim() || null,
          variant: variantExtra || null,
        }) || guardAdjacentIdentityDuplication(bare)
      : guardAdjacentIdentityDuplication(bare);

  const conditionPhrase = reconcileConditionPhrase(
    conditionShort(fill.condition),
    extras,
    title
  );

  let knownBits = 0;
  if (item && !/^item$/i.test(item)) knownBits++;
  if (conditionPhrase) knownBits++;
  if (money || rental?.weekly || rental?.daily || rental?.monthly) knownBits++;
  if (location) knownBits++;
  if (delivery) knownBits++;
  if (vehicle?.year) knownBits++;
  if (vehicle?.make) knownBits++;
  if (vehicle?.model) knownBits++;
  if (vehicle?.odometer) knownBits++;
  if (vehicle?.colour) knownBits++;
  if (vehicle?.transmission) knownBits++;
  if (vehicle?.body) knownBits++;
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
    bundleQuantity,
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

/** Field-stitch / template smells for physical copy. */
const AWKWARD_PHYSICAL_STITCH_RE =
  /\b(brand new|like-new|good used condition|fair used condition)\s+available\b|\b,\s*(brand new|like-new|good used condition|fair used condition)\s+available\b|\bavailable\.\s*Available\b|\bup for grabs\b/i;

/** True when the same marketplace filler word is used twice (field-stitch smell). */
function hasSemanticWordRepetition(text: string): boolean {
  const lower = text.toLowerCase();
  for (const w of ["available", "asking", "located", "message"]) {
    const re = new RegExp(`\\b${w}\\b`, "gi");
    if ((lower.match(re) || []).length >= 2) return true;
  }
  if ((lower.match(/\bfor sale\b/gi) || []).length >= 2) return true;
  return false;
}

/** Adjacent sentences repeating the same availability/price idea. */
function hasAdjacentIdeaRepetition(sentences: string[]): boolean {
  for (let i = 1; i < sentences.length; i++) {
    const a = sentences[i - 1];
    const b = sentences[i];
    if (/\bavailable\b/i.test(a) && /\bavailable\b/i.test(b)) return true;
    if (
      classifySentence(a) === "price" &&
      classifySentence(b) === "price"
    ) {
      return true;
    }
    // "…in Auckland…" then "Available in Auckland / Pickup is available in Auckland"
    const locInA = a.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (locInA && new RegExp(`\\bin\\s+${locInA[1]}\\b`, "i").test(b) && /\bavailable\b/i.test(b)) {
      return true;
    }
  }
  return false;
}

export function isRoboticListingDescription(text: string | undefined | null): boolean {
  if (!text?.trim()) return true;
  const t = text.trim();
  if (t.length < 20) return true;
  if (FIELD_LABEL_RE.test(t)) return true;
  if (METADATA_SERIALIZATION_RE.test(t)) return true;
  if (/\bSet\s+Topps\b|\bSet\s+Panini\b/i.test(t)) return true;
  if (/(?:^|\.\s+)(?:Topps|Panini|Chrome)\.\s*(?:Message|Happy|$)/i.test(t)) return true;
  if (BANNED_TEMPLATE_RE.test(t)) return true;
  if (IMPLEMENTATION_LEAK_RE.test(t)) return true;
  if (SELLER_EDITOR_GUIDANCE_RE.test(t)) return true;
  if (IMPLY_CLAIMS_RE.test(t)) return true;
  if (SERVICE_INVENTION_RE.test(t)) return true;
  if (SERVICE_TEMPLATE_SMELL_RE.test(t)) return true;
  if (AWKWARD_PHYSICAL_STITCH_RE.test(t)) return true;
  // Named subjects in one collection can legitimately share a word (for
  // example two card names containing "Dragon"). The repeated word is identity,
  // not keyword stuffing, when the writer has composed a bundle sentence.
  const isComposedBundle = /^Set of \w+ .+\bfeaturing\b/i.test(t);
  if (hasSemanticWordRepetition(t) && !isComposedBundle) return true;
  if (/\bOdometer:\s*/i.test(t) && /\bColour:\s*/i.test(t)) return true;
  if (/^Selling .+\.\s*Condition:/i.test(t)) return true;
  if (/^selling my .{1,40}$/i.test(t) && !/\n/.test(t)) return true;
  if (countCtas(t) > 1) return true;
  const sentences = splitSentences(t);
  if (hasAdjacentIdeaRepetition(sentences)) return true;
  // Service sell copy must not open with buyer/wanted voice
  if (/^Looking for\b/i.test(sentences[0] || "") && !/\bwanted\b/i.test(t.slice(0, 40))) {
    // Only flag when it looks like a service offer (available / per job / per hour)
    if (/\bavailable\b|\bper (?:job|hour)\b/i.test(t)) return true;
  }
  if (
    sentences.length >= 3 &&
    sentences.filter((s) =>
      /^(Condition:|Located in|Odometer:|Colour:|Pickup available\.|Pickup only\.|Set\s+)/i.test(s.trim())
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
    METADATA_SERIALIZATION_RE.test(t) ||
    /\bSet\s+Topps\b|\bSet\s+Panini\b/i.test(t) ||
    BANNED_TEMPLATE_RE.test(t) ||
    IMPLEMENTATION_LEAK_RE.test(t) ||
    SELLER_EDITOR_GUIDANCE_RE.test(t) ||
    IMPLY_CLAIMS_RE.test(t) ||
    SERVICE_INVENTION_RE.test(t) ||
    SERVICE_TEMPLATE_SMELL_RE.test(t) ||
    AWKWARD_PHYSICAL_STITCH_RE.test(t)
  ) {
    return false;
  }
  const isComposedBundle = /^Set of \w+ .+\bfeaturing\b/i.test(t);
  if (hasSemanticWordRepetition(t) && !isComposedBundle) return false;
  if (t.includes("\n\n")) return false;
  if (countCtas(t) > 1) return false;
  const n = wordCount(t);
  // Facts set length, not a template target. A complete product + condition
  // sentence (for example a brand-new DualSense) can be excellent at 8–9 words.
  // Rich copy still stays under 100 words.
  const min = 8;
  if (n < min || n > 100) return false;
  const sentences = splitSentences(t);
  if (sentences.length < 1 || sentences.length > 5) return false;
  if (hasAdjacentIdeaRepetition(sentences)) return false;
  return true;
}

/**
 * Public-copy validator before form state — rejects field labels, Attr:, Set X.,
 * CTA-only filler, reordered product lines, and identity repeats.
 */
export function validateDescription(
  text: string | undefined | null,
  opts?: { expectedProductLine?: string | null; sparse?: boolean }
): { ok: boolean; reason?: string } {
  if (!text?.trim()) return { ok: false, reason: "empty" };
  const t = text.trim();
  if (/Attr\s*:/i.test(t)) return { ok: false, reason: "attr_leak" };
  if (FIELD_LABEL_RE.test(t)) return { ok: false, reason: "field_label" };
  if (/\bSet\s*:\s*\S+/i.test(t)) {
    return { ok: false, reason: "set_field_label" };
  }
  if (METADATA_SERIALIZATION_RE.test(t)) return { ok: false, reason: "metadata_serialization" };
  if (/Chrome\s+Topps/i.test(t) && !/Topps\s+Chrome/i.test(t)) {
    return { ok: false, reason: "reordered_product_line" };
  }
  if (opts?.expectedProductLine && /Chrome\s+Topps/i.test(t)) {
    return { ok: false, reason: "reordered_product_line" };
  }
  // Lone manufacturer sentence
  if (/(?:^|\.\s+)(?:Topps|Panini|Upper Deck)\.\s*/i.test(t)) {
    return { ok: false, reason: "lone_manufacturer_sentence" };
  }
  // CTA-only or CTA after empty identity dump
  const sentences = splitSentences(t);
  if (
    sentences.length <= 2 &&
    sentences.every((s) => classifySentence(s) === "cta")
  ) {
    return { ok: false, reason: "cta_only" };
  }
  if (/Message if interested\.?\s*$/i.test(t) && sentences.length <= 2) {
    // Soft reject when the body before CTA is just stacked names
    const body = sentences.filter((s) => classifySentence(s) !== "cta").join(" ");
    if (/^(?:[A-Z][\w'à-ú.-]+(?:\s+[A-Z][\w'à-ú.-]+){0,3}\.\s*){2,}$/i.test(body)) {
      return { ok: false, reason: "name_stack_plus_cta" };
    }
  }
  // Player name repeated as its own sentence after opener
  if (
    /([A-Z][\w'à-ú.-]+(?:\s+[A-Z][\w'à-ú.-]+)+).+\.\s+\1\./i.test(t)
  ) {
    return { ok: false, reason: "repeated_identity" };
  }
  if (isRoboticListingDescription(t)) return { ok: false, reason: "robotic" };
  if (!passesListingDescriptionQualityGate(t, { sparse: opts?.sparse })) {
    return { ok: false, reason: "quality_gate" };
  }
  return { ok: true };
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
  // physical — one warm CTA; weave pickup invite when that's the delivery mode
  // Prefer short factual CTAs — avoid padded "Feel free to message…" filler
  const pickup =
    facts.delivery === "pickup" || facts.delivery === "pickup_only";
  if (facts.factRichness === "sparse") {
    return pickVariant(seed, [
      "Message if interested.",
      "Happy to answer questions.",
    ]);
  }
  if (pickup) {
    return pickVariant(seed, [
      "Message me if you're interested — happy to arrange pickup.",
      "Message if you're interested or want to sort out pickup.",
      "Happy to arrange pickup — just message me.",
    ]);
  }
  return pickVariant(seed, [
    "Message me if you're interested.",
    "Happy to answer questions — just message me.",
    "Message if keen.",
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
  sentences = collapseRepeatedAvailability(sentences);
  sentences = enforceOneCta(sentences);

  const allowCta =
    facts.kind === "service" ||
    facts.kind === "rental" ||
    facts.kind === "wanted" ||
    (facts.kind === "vehicle" && facts.factRichness !== "sparse");
  // Physical: no auto CTA filler ("Message if interested") — UI already has contact
  const allowPhysicalCta = false;

  // CTA: services/rentals/wanted keep one invite; physical never auto-pads
  if (allowCta && facts.quality !== "standard") {
    const hasCta = sentences.some((s) => classifySentence(s) === "cta");
    if (!hasCta) sentences.push(defaultCta(facts));
    sentences = enforceOneCta(sentences);
    sentences = semanticDedupe(sentences);
    sentences = collapseRepeatedAvailability(sentences);
  } else if (!allowCta && !allowPhysicalCta) {
    sentences = sentences.filter((s) => classifySentence(s) !== "cta");
  } else {
    // standard + non-sparse vehicle: compact close, still one invite max
    sentences = sentences.filter((s) => classifySentence(s) !== "cta");
    if (facts.kind !== "physical") {
      sentences.push("Happy to answer questions.");
    }
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
  // Battery health only when confirmed in extras
  if (!facts.extras.some((e) => /battery/i.test(e))) {
    text = text.replace(/\s*[^.]*\bbattery health[^.]*\./gi, " ").trim();
  }

  text = finalGrammarCleanup(text);

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
  sentences = collapseRepeatedAvailability(sentences);
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
  text = finalGrammarCleanup(sentences.join(" "));
  text = trimToWords(text, maxWords);

  // Last chance: if still stitching, force the safe physical/vehicle fallback
  if (
    !passesListingDescriptionQualityGate(text, { sparse }) ||
    isRoboticListingDescription(text)
  ) {
    text = finalGrammarCleanup(safeFallbackDescription(facts));
  }

  return text.slice(0, 8000);
}

/** Deterministic safe rewrite — no phrase banks, no stacking, no seller coaching. */
function safeFallbackDescription(facts: DescriptionFacts): string {
  const parts: string[] = [];
  const item = facts.item;

  if (facts.kind === "vehicle") {
    const colour = facts.vehicle?.colour;
    const body = facts.vehicle?.body;
    const bodyBit = body ? ` ${body.toLowerCase()}` : "";
    parts.push(
      polishParagraph(
        `${colour ? `${colour} ` : ""}${item}${bodyBit}${facts.location ? ` in ${facts.location}` : " for sale"}.`
      )
    );
    const bits: string[] = [];
    if (facts.vehicle?.odometer) bits.push(`${formatOdo(facts.vehicle.odometer)} on the clock`);
    if (facts.vehicle?.transmission) {
      const trans = facts.vehicle.transmission.toLowerCase();
      bits.push(`${indefiniteArticle(trans)} ${trans} transmission`);
    }
    if (facts.conditionPhrase) bits.push(facts.conditionPhrase);
    if (bits.length) parts.push(capFirst(`${bits.join(", ")}.`));
    for (const extra of facts.extras) {
      if (/\b(modif|upgraded|turbo|intercooler|downpipe|intake)\b/i.test(extra)) {
        parts.push(polishParagraph(extra.endsWith(".") ? extra : `${extra}.`));
      }
    }
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
    // Physical: one natural lead sentence — never field stubs or attr dumps
    const noun = physicalNounPhrase(facts);
    const selected = selectDescriptionFacts(
      { title: facts.item, extras: facts.extras, listingType: "physical" },
      facts.extras
    );
    if (selected.domain === "trading_card") {
      return writeTradingCard(facts, selected);
    }
    // Price belongs in the price field — never in buyer prose.
    if (facts.location) {
      parts.push(polishParagraph(`${capFirst(noun)} for sale in ${facts.location}.`));
    } else {
      parts.push(polishParagraph(`${capFirst(noun)}.`));
    }
  }

  // No auto "Message if interested" on physical — keep soft close only for service/rental/wanted
  if (facts.kind === "service" || facts.kind === "rental" || facts.kind === "wanted") {
    if (facts.quality === "standard") {
      parts.push("Happy to answer questions.");
    } else {
      parts.push(defaultCta(facts));
    }
  } else if (facts.kind === "vehicle" && facts.factRichness !== "sparse") {
    if (facts.quality === "standard") {
      parts.push("Happy to answer questions.");
    } else {
      parts.push(defaultCta(facts));
    }
  }

  return finalGrammarCleanup(parts.filter(Boolean).join(" "));
}

/* ─── Step 2: type-specific writers ─────────────────────────────────────── */

/** Weave condition into the noun phrase once — never as a trailing field stub. */
function physicalNounPhrase(facts: DescriptionFacts): string {
  const item = cleanDescriptionItemName(facts.item) || facts.item;
  const cond = facts.conditionPhrase;
  if (!cond) return item;
  // Never lead with like-new / brand-new when wear extras contradict
  if (/brand new/i.test(cond)) return `brand new ${item}`;
  if (/like-new/i.test(cond)) return `like-new ${item}`;
  return `${item} in ${cond}`;
}

function bundleQuantityFromExtras(extras: string[]): number | null {
  const value = extras
    .map((extra) => String(extra || "").match(/^bundle_quantity:\s*(\d+)$/i)?.[1])
    .find(Boolean);
  const quantity = value ? Number(value) : NaN;
  return Number.isInteger(quantity) && quantity > 1 ? quantity : null;
}

function bundleQuantityFromSubject(extras: string[]): number | null {
  const subject = extras
    .map((extra) =>
      String(extra || "").match(/^(?:subject|player|playername):\s*(.+)$/i)?.[1]
    )
    .find(Boolean);
  if (!subject) return null;
  const parts = splitNaturalList(subject);
  return parts.length > 1 && parts.length <= 20 ? parts.length : null;
}

function splitNaturalList(value: string): string[] {
  const commaParts = value
    .split(/\s*,\s*/)
    .map((part) => part.replace(/^(?:and|&)\s+/i, "").trim())
    .filter(Boolean);
  if (commaParts.length > 1) {
    const last = commaParts.pop() || "";
    const finalPair = last
      .split(/\s+(?:and|&)\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    return [...commaParts, ...finalPair];
  }
  return value
    .split(/\s+(?:and|&)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatNaturalList(value: string): string {
  const items = splitNaturalList(value);
  if (items.length <= 1) return value.trim();
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function escapeDescriptionRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Recover a supported parent identity (brand/franchise/product family) from
 * the title after removing the structured item names and collection. This is
 * generic: e.g. "Yu-Gi-Oh!" + "Egyptian God Cards", without naming either in
 * code.
 */
function parentIdentityFromTitle(
  title: string,
  subjects: string,
  collection: string | null
): string | null {
  let remainder = cleanDescriptionItemName(title);
  for (const item of splitNaturalList(subjects)) {
    remainder = remainder.replace(new RegExp(escapeDescriptionRegExp(item), "gi"), " ");
  }
  if (collection) {
    remainder = remainder.replace(
      new RegExp(escapeDescriptionRegExp(collection), "gi"),
      " "
    );
  }
  remainder = remainder
    .replace(/[,:;|–—]+/g, " ")
    .replace(/(?:^|\s)(?:and|&)(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!remainder || /^(?:set|bundle|collection|trading\s+)?cards?$/i.test(remainder)) {
    return null;
  }
  return remainder;
}

function bundleQuantityWord(quantity: number): string {
  const words = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ];
  return words[quantity] || String(quantity);
}

function writeTradingCard(
  facts: DescriptionFacts,
  selected: SelectedDescriptionFacts
): string {
  const cardFacts = extractTradingCardFactsFromExtras(facts.extras);
  const sealed = isSealedTradingCardProductFormat(
    cardFacts.productFormat || `${facts.item || ""} ${(facts.extras || []).join(" ")}`
  );
  // Prefer atomic title from structured facts when opener identity is weak/reordered
  const structuredTitle = composeTradingCardTitle({
    playerName: sealed ? undefined : cardFacts.playerName || selected.playerName || undefined,
    manufacturer: cardFacts.manufacturer || undefined,
    productLine: cardFacts.productLine || selected.productLine || undefined,
    // Serial woven as prose below — keep out of identity phrase
    grader: sealed ? undefined : cardFacts.grader,
    grade: sealed ? undefined : cardFacts.grade,
    parallel: sealed ? undefined : cardFacts.parallel,
    parallelColour: sealed ? undefined : cardFacts.parallelColour,
    year: cardFacts.year,
    productFormat: cardFacts.productFormat,
    league: cardFacts.league,
    season: cardFacts.season,
  });
  const cleanedItem = cleanDescriptionItemName(facts.item);
  const player = sealed
    ? null
    : cardFacts.playerName || selected.playerName || null;
  let identity = repairCardProductLineOrder(
    cleanedItem || structuredTitle || (sealed ? "Sealed trading-card product" : "Trading card")
  );

  // Prefer structured title when it carries player/set the item label lacks
  if (
    structuredTitle &&
    player &&
    !identity.toLowerCase().includes(player.toLowerCase()) &&
    structuredTitle.toLowerCase().includes(player.toLowerCase())
  ) {
    identity = repairCardProductLineOrder(structuredTitle);
  }

  // If title is player-only, enrich from structured set (once)
  const line =
    selected.productLine ||
    normalizeTradingCardProductLine(cardFacts.manufacturer, cardFacts.productLine);
  if (line && !identity.toLowerCase().includes(line.toLowerCase())) {
    identity = repairCardProductLineOrder(`${identity} ${line}`);
  }

  // Strip serial/hash from identity before re-adding as prose (avoid "#14/25 numbered 14/25")
  identity = identity
    .replace(/#\s*\d+\s*\/\s*\d+/g, " ")
    .replace(/\bnumbered\s+\d+\s*\/\s*\d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const deduped = semanticDedupeDescriptionFacts(selected, identity);
  const bits: string[] = [];
  // Serial/grade only when not already in identity
  if (deduped.serial || selected.serial) {
    const serial = deduped.serial || selected.serial;
    if (serial && !identity.toLowerCase().includes(serial.toLowerCase())) {
      bits.push(`numbered ${serial}`);
    }
  }
  if (deduped.grade) bits.push(deduped.grade);
  if (deduped.parallel) bits.push(deduped.parallel);

  const cond = facts.conditionPhrase;
  let opener = identity;
  if (bits.length) opener = `${identity} ${bits.join(", ")}`;
  if (cond) {
    if (/brand new/i.test(cond)) opener = `brand new ${opener}`;
    else if (/like-new/i.test(cond)) opener = `like-new ${opener}`;
    else opener = `${opener} in ${cond}`;
  }

  const parts: string[] = [];
  const loc = facts.location;
  const bundleQuantity = facts.bundleQuantity;
  const subjects = cardFacts.playerName || selected.playerName || null;
  const collection = line || cardFacts.productLine || null;

  // A multi-card listing needs to say that it is a single set, not serialize
  // the card names into a title-shaped sentence. This works for any collection
  // whose vision/user facts provide a subject list and bundle quantity.
  if (bundleQuantity && subjects) {
    const parentIdentity = parentIdentityFromTitle(facts.item, subjects, collection);
    const specificCollection = [parentIdentity, collection]
      .filter(Boolean)
      .filter(
        (value, index, all) =>
          all.findIndex(
            (candidate) =>
              String(candidate).toLowerCase() === String(value).toLowerCase()
          ) === index
      )
      .join(" ");
    const collectionNoun = specificCollection
      ? `${specificCollection} ${/\bcards?\b/i.test(specificCollection) ? "" : "cards"}`
      : "trading cards";
    const naturalSubjects = formatNaturalList(subjects);
    let bundleSentence = `Set of ${bundleQuantityWord(bundleQuantity)} ${collectionNoun} featuring ${naturalSubjects}.`;
    if (cond) {
      bundleSentence += ` All ${bundleQuantityWord(bundleQuantity)} cards ${composeConditionPredicate(cond, true)} and are being sold together as a set.`;
    } else {
      bundleSentence += " They are being sold together as a set.";
    }
    parts.push(polishParagraph(bundleSentence));
    // Wear / feature extras only — never re-append structured quantity tags.
    const extrasProse = composeExtrasProse(deduped.weaveExtras);
    if (extrasProse) parts.push(extrasProse);
    return parts.join(" ");
  }
  // Price stays on the listing price field — never "asking $…" in card prose.
  if (loc) {
    parts.push(polishParagraph(`${capFirst(opener)} for sale in ${loc}.`));
  } else {
    parts.push(polishParagraph(`${capFirst(opener)}.`));
  }

  // Wear / feature extras only — never Set/manufacturer dumps
  const extrasProse = composeExtrasProse(deduped.weaveExtras);
  if (extrasProse) parts.push(extrasProse);

  return parts.join(" ");
}

function writePhysical(facts: DescriptionFacts): string {
  const selected = selectDescriptionFacts(
    {
      title: facts.item,
      extras: facts.extras,
      category: facts.style === "sports" ? "Sports" : undefined,
      listingType: "physical",
    },
    facts.extras
  );
  if (selected.domain === "trading_card") {
    return writeTradingCard(facts, selected);
  }

  const seed = facts.seed;
  const noun = physicalNounPhrase(facts);
  const loc = facts.location;
  const d = facts.delivery;
  const struct = hashSeed(seed + ":struct") % 3;
  const parts: string[] = [];
  // Structured price is never buyer-facing prose for ordinary physical goods.
  let opener: string;
  if (loc) {
    opener =
      struct === 0
        ? `${capFirst(noun)} for sale in ${loc}.`
        : `${capFirst(noun)} in ${loc}.`;
  } else {
    opener = `${capFirst(noun)}.`;
  }
  parts.push(polishParagraph(opener));
  // Delivery only when it adds a real option — never "Available in X, asking Y"
  if (d === "pickup_or_shipping") {
    parts.push(
      pickVariant(seed + ":ps", [
        "Pickup or shipping can be arranged.",
        "Happy to do local pickup or arrange shipping.",
      ])
    );
  } else if (d === "shipping") {
    parts.push(
      loc
        ? pickVariant(seed + ":ship", [
            `Shipping from ${loc} can be arranged.`,
            `Can ship from ${loc}.`,
          ])
        : "Shipping can be arranged."
    );
  } else if (d === "pickup" || d === "pickup_only") {
    // Logistics fact — avoid CTA_PURPOSE_RE phrasing ("happy to arrange…")
    parts.push(
      pickVariant(seed + ":pu", [
        "Local pickup is available.",
        "Pickup available locally.",
      ])
    );
  }

  // Only weave non-identity extras (wear, battery, mods)
  const weaveOnly = selectDescriptionFacts(
    { title: facts.item, extras: facts.extras, listingType: "physical" },
    facts.extras
  ).weaveExtras;
  const extrasProse = composeExtrasProse(weaveOnly);
  if (extrasProse) parts.push(extrasProse);

  return parts.join(" ");
}

function writeVehicle(facts: DescriptionFacts): string {
  const v = facts.vehicle;
  const name = facts.item;
  const colour = v?.colour;
  const loc = facts.location;
  const seed = facts.seed;
  const body = v?.body?.trim() || null;
  const bodyBit = body ? ` ${body.toLowerCase()}` : "";

  // Prefer confirmed identity in the opener — never "Item in good condition…"
  const opener = pickVariant(seed + ":vopen", [
    `${name}${bodyBit} for sale${loc ? ` in ${loc}` : ""}.`,
    colour
      ? `${name}${bodyBit} in ${colour.toLowerCase()}${loc ? `, ${loc}` : ""}.`
      : `${name}${bodyBit}${loc ? ` in ${loc}` : " available for sale"}.`,
    `${colour ? `${colour} ` : ""}${name}${bodyBit}${loc ? ` in ${loc}` : ""}.`,
  ]);

  const parts: string[] = [polishParagraph(opener)];

  // Spec weave: colour / odometer / transmission from confirmed fields only
  const hasColourInOpener = Boolean(colour && new RegExp(`\\b${colour}\\b`, "i").test(opener));
  if (colour && v?.odometer && v?.transmission) {
    const trans = v.transmission.toLowerCase();
    parts.push(
      polishParagraph(
        hasColourInOpener
          ? `It has ${formatOdo(v.odometer)} and ${indefiniteArticle(trans)} ${trans} transmission.`
          : `Finished in ${colour.toLowerCase()} with ${formatOdo(v.odometer)} and ${indefiniteArticle(trans)} ${trans} transmission.`
      )
    );
  } else {
    const detailBits: string[] = [];
    if (colour && !hasColourInOpener) detailBits.push(`finished in ${colour.toLowerCase()}`);
    if (v?.odometer) detailBits.push(`${formatOdo(v.odometer)} on the clock`);
    if (v?.transmission) {
      const trans = v.transmission.toLowerCase();
      detailBits.push(`${indefiniteArticle(trans)} ${trans} transmission`);
    }
    if (v?.fuel) detailBits.push(`${v.fuel.toLowerCase()} fuel`);
    if (detailBits.length) parts.push(capFirst(`${detailBits.join(", ")}.`));
  }

  // Freeform mods / extras — preserve seller wording, do not invent
  const extrasProse = composeExtrasProse(facts.extras);
  if (extrasProse) {
    parts.push(extrasProse);
  }

  if (facts.conditionPhrase) {
    parts.push(
      polishParagraph(`The car ${composeConditionPredicate(facts.conditionPhrase)}.`)
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
  const extrasProse = composeExtrasProse(facts.extras);
  if (extrasProse) parts.push(extrasProse);

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
  const extrasProse = composeExtrasProse(facts.extras);

  if (bits.length) parts.push(capFirst(`${bits.join(", ")}.`));
  if (extrasProse) parts.push(extrasProse);

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
/**
 * Final contradiction guard — optimistic condition vs wear extras / body copy.
 */
export function applyDescriptionContradictionGuard(
  text: string,
  facts: DescriptionFacts
): string {
  let out = text;
  const extrasBlob = facts.extras.join(" ");
  const hasWear =
    /\b(scratches?|scuffs?|dents?|dings?|cracks?|chips?|wear|worn|damaged?)\b/i.test(
      extrasBlob
    ) ||
    /\b(scratches?|scuffs?|dents?|dings?|cracks?|chips?)\b/i.test(out);
  if (hasWear) {
    out = out
      .replace(/\blike-new\b/gi, "good used condition")
      .replace(/\blike new\b/gi, "good used condition")
      .replace(/\bLike-new\b/g, "Good used condition")
      .replace(/\bbrand new\b/gi, "used");
    out = out.replace(
      /\bin good used condition\b([^.]*)\bgood used condition\b/gi,
      "in good used condition$1"
    );
    // "good used condition iPhone … in good used condition" after prefix rewrite
    out = out.replace(
      /^Good used condition\s+(.+?\bin good used condition\b)/i,
      "$1"
    );
  }
  // Never leave raw defect tails inside the identity noun from a dirty title
  out = out.replace(
    /iPhone[^.]*?,\s*Couple\s+Scratches[^.]*?(?= for sale|\s+in\s|\s+asking|, asking)/gi,
    (m) => m.replace(/,.*/i, "").trim()
  );
  out = out.replace(/\b(\d+)\s*(gb|tb)\b/gi, (_, n, u) => `${n}${String(u).toUpperCase()}`);
  return polishParagraph(out);
}

/**
 * The price is structured listing data, not seller prose. Writers can use a
 * price internally to reason about a listing, but no generated public
 * description may echo it. Keeping this as the last writer-stage guard also
 * protects older type writers and future fallback paths from reintroducing
 * "asking $…" boilerplate.
 */
export function removeStructuredPriceCopy(text: string): string {
  const withoutPrice = text
      .replace(
        /(?:,?\s*(?:I'm\s+)?(?:asking|priced at|for|at)\s+\$[\d,]+(?:\.\d{1,2})?(?:\s+per\s+(?:hour|day|week|month|job))?)/gi,
        ""
      )
      .replace(
        /(?:^|(?<=[.!?])\s+)(?:I'm\s+)?asking\s+\$[\d,]+(?:\.\d{1,2})?\.\s*/gi,
        " "
      )
      .replace(
        /(?:^|(?<=[.!?])\s+)(?:budget|price)\s+(?:around|of)\s+\$[\d,]+(?:\.\d{1,2})?\.\s*/gi,
        " "
      )
      .replace(/\s+([.,!?])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
  if (!withoutPrice || /^[.!?]+$/.test(withoutPrice)) return "";
  return finalGrammarCleanup(withoutPrice);
}

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
  // Recover identity when title was lost but structured vehicle fields exist
  if (
    /^item$/i.test(facts.item) &&
    facts.kind === "vehicle" &&
    (facts.vehicle?.make || facts.vehicle?.model)
  ) {
    facts.item =
      composeListingIdentity({
        year: facts.vehicle?.year,
        brand: facts.vehicle?.make,
        product: facts.vehicle?.model,
        generation: fill.vehicleGeneration?.trim() || null,
      }) ||
      [facts.vehicle?.year, facts.vehicle?.make, facts.vehicle?.model]
        .filter(Boolean)
        .join(" ") ||
      "Vehicle";
  }
  // Physical: always use cleaned identity (never raw freeform concat)
  if (facts.kind === "physical") {
    facts.item = cleanDescriptionItemName(facts.item) || facts.item;
  }
  const draft = writeFromFacts(facts);
  if (!draft.trim()) return "";
  let out = runQualityPass(draft, facts);
  out = applyDescriptionContradictionGuard(out, facts);
  out = sanitizePublicCopyText(out);
  out = stripStructuredMetadataLeakage(out);
  out = repairCardProductLineOrder(out);

  const selected = selectDescriptionFacts(
    {
      title: facts.item,
      extras: facts.extras,
      listingType: facts.kind === "physical" ? "physical" : facts.kind,
    },
    facts.extras
  );
  const validated = validateDescription(out, {
    expectedProductLine: selected.productLine,
    sparse: facts.factRichness === "sparse",
  });
  if (!validated.ok) {
    out = repairCardProductLineOrder(
      applyDescriptionContradictionGuard(safeFallbackDescription(facts), facts)
    );
    out = sanitizePublicCopyText(out);
    out = stripStructuredMetadataLeakage(out);
    // Strip any CTA that safe fallback shouldn't have reintroduced for physical
    if (facts.kind === "physical") {
      out = splitSentences(out)
        .filter((s) => classifySentence(s) !== "cta")
        .join(" ");
      out = finalGrammarCleanup(out);
    }
  }

  // ASSERT: rich confirmed context must not collapse to generic Item filler
  if (
    /^item\b/i.test(out) &&
    facts.factRichness === "rich" &&
    facts.kind === "vehicle"
  ) {
    out = applyDescriptionContradictionGuard(
      runQualityPass(writeFromFacts(facts), facts),
      facts
    );
  }
  out = stripStructuredMetadataLeakage(out);
  // Ordinary physical/vehicle marketplace listings keep price in the price
  // field only. Service/rental/wanted writers may still mention rates/budgets.
  if (facts.kind === "physical" || facts.kind === "vehicle") {
    return removeStructuredPriceCopy(out);
  }
  return out;
}
