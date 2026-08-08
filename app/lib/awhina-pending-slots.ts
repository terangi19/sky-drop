/**
 * Generic pending-slot state for ALL sell domains.
 * Short replies resolve THAT pending slot first — never corrupt price/model.
 *
 * Examples: "128gb" → storage (not price), "140k" → odometer, "PSA 10" → grade,
 * "2014" → year (not price), "900" → price when price slot pending.
 */

import type { PendingClarification } from "./awhina-task-scope";
import {
  buildOpenListingSlotClarification,
  isClarificationOpen,
} from "./awhina-task-scope";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { isVehicleListingFill, getVehicleDraftReadiness } from "./awhina-listing-description";

export type ListingMissingSlot =
  | "price"
  | "condition"
  | "location"
  | "year"
  | "odometer"
  | "transmission"
  | "fuel"
  | "storage"
  | "size"
  | "card_set"
  | "card_subject"
  | "grade"
  | "colour"
  | "rental_rate"
  | "service_rate"
  | "title"
  | "generation"
  | "variant";

export const SLOT_QUESTIONS: Record<ListingMissingSlot, string> = {
  price: "What's the asking price?",
  condition: "What condition is it in?",
  location: "Where is it located?",
  year: "What year is it?",
  odometer: "Roughly how many kilometres are on it?",
  transmission: "Is it manual or automatic?",
  fuel: "Petrol, diesel, or hybrid?",
  storage: "What storage size is it (e.g. 128GB)?",
  size: "What size is it?",
  card_set: "Which set / product line is the card from?",
  card_subject: "Which player or character is on the card?",
  grade: "Is it graded? If so, which company and grade (e.g. PSA 10)?",
  colour: "What colour is it?",
  rental_rate: "What's the daily or weekly hire rate?",
  service_rate: "Fixed price, hourly, or quote required?",
  title: "What should we call this listing?",
  generation: "What generation is it — R32, R33, or R34?",
  variant: "Which variant / trim is it?",
};

/** Detect domain from draft for slot priority. */
export function detectSellDomain(
  fill: Partial<SkyAiListingFill>
): "vehicle" | "card" | "electronics" | "clothing" | "rental" | "service" | "physical" {
  const lt = (fill.listingType || "").toLowerCase();
  if (lt === "vehicle" || isVehicleListingFill(fill as SkyAiListingFill)) return "vehicle";
  if (lt === "rental") return "rental";
  if (lt === "service") return "service";
  const blob = [
    fill.title,
    fill.category,
    ...(fill.extras || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/card|psa|bgs|cgc|topps|panini|pokemon|yugioh|sports card|trading card/.test(blob)) {
    return "card";
  }
  if (
    /iphone|samsung|pixel|ipad|macbook|laptop|phone|gb\b|tb\b|storage:/.test(blob) ||
    fill.category === "Tech"
  ) {
    return "electronics";
  }
  if (
    /nike|adidas|jordan|shoe|sneaker|size:|clothing|fashion|hoodie|jacket/.test(blob) ||
    fill.category === "Fashion"
  ) {
    return "clothing";
  }
  return "physical";
}

function hasExtra(fill: Partial<SkyAiListingFill>, prefix: string): boolean {
  return (fill.extras || []).some((e) =>
    e.toLowerCase().startsWith(prefix.toLowerCase())
  );
}

/** Ordered missing slots for this draft (domain-smart, one follow-up at a time). */
export function computeMissingListingSlots(
  fill: Partial<SkyAiListingFill>
): ListingMissingSlot[] {
  const domain = detectSellDomain(fill);
  const missing: ListingMissingSlot[] = [];

  if (!fill.title?.trim()) missing.push("title");

  if (domain === "vehicle") {
    const r = getVehicleDraftReadiness(fill as SkyAiListingFill);
    for (const m of r.importantMissing) {
      const map: Record<string, ListingMissingSlot | undefined> = {
        generation: "generation",
        year: "year",
        price: "price",
        odometer: "odometer",
        condition: "condition",
        location: "location",
        transmission: "transmission",
        fuel: "fuel",
      };
      const slot = map[m];
      if (slot && !missing.includes(slot)) missing.push(slot);
    }
    return missing;
  }

  if (domain === "card") {
    if (!hasExtra(fill, "set:")) missing.push("card_set");
    if (!hasExtra(fill, "subject:") && !/\bmessi|ronaldo|lebron|jordan|pikachu\b/i.test(fill.title || "")) {
      missing.push("card_subject");
    }
    if (!fill.condition) missing.push("condition");
    if (!fill.price) missing.push("price");
    if (!fill.location) missing.push("location");
    return missing;
  }

  if (domain === "electronics") {
    if (!hasExtra(fill, "storage:") && !/\d+\s?(gb|tb)\b/i.test([fill.title, ...(fill.extras || [])].join(" "))) {
      missing.push("storage");
    }
    if (!fill.condition) missing.push("condition");
    if (!fill.price) missing.push("price");
    if (!fill.location) missing.push("location");
    return missing;
  }

  if (domain === "clothing") {
    if (!hasExtra(fill, "size:") && !/\b(size|uk|us|eu)\s*\d/i.test(fill.title || "")) {
      missing.push("size");
    }
    if (!fill.condition) missing.push("condition");
    if (!fill.price) missing.push("price");
    if (!fill.location) missing.push("location");
    return missing;
  }

  if (domain === "rental") {
    if (!fill.price && !fill.rentalPriceDaily && !fill.rentalPriceWeekly) {
      missing.push("rental_rate");
    }
    if (!fill.location) missing.push("location");
    return missing;
  }

  if (domain === "service") {
    if (!fill.servicePricingType && !fill.price) missing.push("service_rate");
    if (!fill.location) missing.push("location");
    return missing;
  }

  // physical default
  if (!fill.condition) missing.push("condition");
  if (!fill.price) missing.push("price");
  if (!fill.location) missing.push("location");
  return missing;
}

export function nextListingSlotQuestion(
  fill: Partial<SkyAiListingFill>
): { slot: ListingMissingSlot; question: string } | null {
  const slots = computeMissingListingSlots(fill);
  if (!slots.length) return null;
  const slot = slots[0];
  return { slot, question: SLOT_QUESTIONS[slot] };
}

export function buildListingSlotPending(
  fill: Partial<SkyAiListingFill>,
  priorMessage: string
): PendingClarification | null {
  const next = nextListingSlotQuestion(fill);
  if (!next) return null;
  return buildOpenListingSlotClarification({
    priorMessage,
    missingSlots: computeMissingListingSlots(fill).slice(0, 4),
    activeSlot: next.slot,
    item: fill.title || "item",
    domain: detectSellDomain(fill),
  });
}

export type SlotParseResult = {
  /** Matched the active pending slot */
  matched: boolean;
  /** Partial fill to apply */
  partial: SkyAiListingFill;
  /** Slot that was filled */
  filledSlot?: ListingMissingSlot;
  /** True when message looks like a slot answer but wrong type for active slot */
  rejectedCorruption?: boolean;
  reason?: string;
};

const STORAGE_RE = /^\s*(\d+)\s?(gb|tb)\s*$/i;
const YEAR_RE = /^\s*((?:19|20)\d{2})\s*$/;
const ODO_RE =
  /^\s*([\d,]+)\s*(k|km|kms|kilometers|kilometres|miles?|mi)?\s*$/i;
const SIZE_RE = /^\s*(?:size\s*)?(\d{1,2}(?:\.\d)?|XS|S|M|L|XL|XXL|XXXL)\s*$/i;
const GRADE_RE = /^\s*(psa|bgs|cgc|sgc)\s*([0-9]{1,2}(?:\.\d)?)\s*$/i;
const PRICE_RE = /^\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\s*$/i;
const CONDITION_WORDS =
  /^(new|brand\s*new|like\s*new|used|good|fair|mint|sealed|unopened|excellent|great)\b/i;
const NZ_CITY =
  /^(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|rotorua|queenstown|nelson|whangarei)\b/i;
const TRANS_RE = /^(manual|automatic|auto)\b/i;
const FUEL_RE = /^(petrol|diesel|hybrid|electric|ev)\b/i;
const GEN_TOKEN_RE = /\b(r[\s-]?3[2-4]|a80|a90|mk\s?[45]|jza80)\b/i;
const VARIANT_GTR_RE = /\b(gt[\s-]?r|gtr)\b/i;
const VARIANT_GTT_RE = /\b(gt[\s-]?t|gtt)\b/i;

/**
 * Parse short reply against the ACTIVE pending slot only.
 * Prevents: 128gb→price, 140k→model, PSA 10→price, 2014→price.
 */
export function parseShortReplyForPendingSlot(
  message: string,
  activeSlot: ListingMissingSlot
): SlotParseResult {
  const t = message.trim();
  if (!t || t.length > 80) {
    return { matched: false, partial: {} };
  }

  // Storage never becomes price
  if (STORAGE_RE.test(t)) {
    if (activeSlot === "storage") {
      const m = t.match(STORAGE_RE)!;
      return {
        matched: true,
        filledSlot: "storage",
        partial: { extras: [`storage:${m[1]}${m[2].toUpperCase()}`] },
      };
    }
    if (activeSlot === "price" || activeSlot === "year" || activeSlot === "odometer") {
      return {
        matched: false,
        partial: {},
        rejectedCorruption: true,
        reason: "storage_not_price",
      };
    }
    // Soft accept storage even if another slot pending (useful free text)
    {
      const m = t.match(STORAGE_RE)!;
      return {
        matched: true,
        filledSlot: "storage",
        partial: { extras: [`storage:${m[1]}${m[2].toUpperCase()}`] },
      };
    }
  }

  // Grade never becomes price
  if (GRADE_RE.test(t)) {
    if (activeSlot === "grade" || activeSlot === "condition") {
      const m = t.match(GRADE_RE)!;
      return {
        matched: true,
        filledSlot: "grade",
        partial: {
          extras: [`grade:${m[1].toUpperCase()} ${m[2]}`],
          condition: "Used - Like New",
        },
      };
    }
    if (activeSlot === "price") {
      return {
        matched: false,
        partial: {},
        rejectedCorruption: true,
        reason: "grade_not_price",
      };
    }
  }

  // Year slot
  if (YEAR_RE.test(t)) {
    const year = t.match(YEAR_RE)![1];
    if (activeSlot === "year") {
      return {
        matched: true,
        filledSlot: "year",
        partial: { vehicleYear: year },
      };
    }
    if (activeSlot === "price") {
      // 2014 as bare year while asking price — reject corruption
      const n = Number(year);
      if (n >= 1980 && n <= new Date().getFullYear() + 1) {
        return {
          matched: false,
          partial: {},
          rejectedCorruption: true,
          reason: "year_not_price",
        };
      }
    }
  }

  // Odometer: 140k / 128000 km / 140k miles
  if (activeSlot === "odometer" && ODO_RE.test(t) && !STORAGE_RE.test(t)) {
    const m = t.match(ODO_RE)!;
    let n = Number(m[1].replace(/,/g, ""));
    if (m[2] && /^k$/i.test(m[2])) n *= 1000;
    if (n >= 100 && n < 2_000_000) {
      return {
        matched: true,
        filledSlot: "odometer",
        partial: { vehicleOdometer: String(Math.round(n)) },
      };
    }
  }
  // "140k miles" as two-token odometer answer
  if (activeSlot === "odometer") {
    const miles = t.match(/^\s*([\d,]+)\s*k\s*(?:miles?|mi|km|kms)\s*$/i);
    if (miles) {
      const n = Number(miles[1].replace(/,/g, "")) * 1000;
      if (n >= 100 && n < 2_000_000) {
        return {
          matched: true,
          filledSlot: "odometer",
          partial: { vehicleOdometer: String(Math.round(n)) },
        };
      }
    }
  }

  // Price — only when price/rental/service rate pending
  if (
    (activeSlot === "price" ||
      activeSlot === "rental_rate" ||
      activeSlot === "service_rate") &&
    PRICE_RE.test(t) &&
    !STORAGE_RE.test(t) &&
    !GRADE_RE.test(t) &&
    !YEAR_RE.test(t)
  ) {
    const m = t.match(PRICE_RE)!;
    let n = Number(m[1].replace(/,/g, ""));
    if (m[2]) n *= 1000;
    // Reject year-like and storage-like
    if (n >= 1980 && n <= 2030 && !m[0].includes("$") && !m[2]) {
      return {
        matched: false,
        partial: {},
        rejectedCorruption: true,
        reason: "ambiguous_year_like",
      };
    }
    if (n >= 1 && n <= 10_000_000) {
      return {
        matched: true,
        filledSlot: "price",
        partial: { price: String(Math.round(n)) },
      };
    }
  }

  // When price is pending, bare "50k" / "15k" IS asking price.
  // Only reject when explicitly odometer-shaped ("140k km", "140k miles").
  if (
    activeSlot === "price" &&
    /^\s*[\d,]+\s*k\s*(km|kms|kilometers|kilometres|miles?|mi)\s*$/i.test(t)
  ) {
    return {
      matched: false,
      partial: {},
      rejectedCorruption: true,
      reason: "odo_not_price",
    };
  }

  if (activeSlot === "condition" && CONDITION_WORDS.test(t)) {
    const raw = t.toLowerCase();
    let condition = "Used - Good";
    if (/brand\s*new|sealed|unopened|^new\b/.test(raw)) condition = "New";
    else if (/like\s*new|mint|excellent/.test(raw)) condition = "Used - Like New";
    else if (/fair/.test(raw)) condition = "Used - Fair";
    return { matched: true, filledSlot: "condition", partial: { condition } };
  }

  if (activeSlot === "location" && NZ_CITY.test(t)) {
    const city = t.match(NZ_CITY)![1];
    const loc = city
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    return { matched: true, filledSlot: "location", partial: { location: loc } };
  }

  if (activeSlot === "size" && SIZE_RE.test(t)) {
    const m = t.match(SIZE_RE)!;
    return {
      matched: true,
      filledSlot: "size",
      partial: { extras: [`size:${m[1].toUpperCase()}`] },
    };
  }

  if (activeSlot === "transmission" && TRANS_RE.test(t)) {
    const auto = /auto/i.test(t);
    return {
      matched: true,
      filledSlot: "transmission",
      partial: { vehicleTransmission: auto ? "Automatic" : "Manual" },
    };
  }

  if (activeSlot === "fuel" && FUEL_RE.test(t)) {
    const m = t.match(FUEL_RE)![1];
    const map: Record<string, string> = {
      petrol: "Petrol",
      diesel: "Diesel",
      hybrid: "Hybrid",
      electric: "Electric",
      ev: "Electric",
    };
    return {
      matched: true,
      filledSlot: "fuel",
      partial: { vehicleFuelType: map[m.toLowerCase()] || m },
    };
  }

  if (activeSlot === "card_set" && t.length >= 2 && t.length <= 60) {
    return {
      matched: true,
      filledSlot: "card_set",
      partial: { extras: [`set:${t}`] },
    };
  }

  if (activeSlot === "card_subject" && t.length >= 2 && t.length <= 60) {
    return {
      matched: true,
      filledSlot: "card_subject",
      partial: { extras: [`subject:${t}`] },
    };
  }

  if (
    (activeSlot === "service_rate" || activeSlot === "rental_rate") &&
    /quote|hourly|fixed|daily|weekly/i.test(t)
  ) {
    if (/quote/i.test(t)) {
      return {
        matched: true,
        filledSlot: "service_rate",
        partial: { servicePricingType: "Quote Required" },
      };
    }
    if (/hourly/i.test(t)) {
      return {
        matched: true,
        filledSlot: "service_rate",
        partial: { servicePricingType: "Hourly Rate" },
      };
    }
  }

  if (activeSlot === "title" && t.length >= 2 && t.length <= 100) {
    return { matched: true, filledSlot: "title", partial: { title: t } };
  }

  // Generation short answers: R34 / R33 / A80
  if (activeSlot === "generation" && GEN_TOKEN_RE.test(t)) {
    const m = t.match(GEN_TOKEN_RE)!;
    return {
      matched: true,
      filledSlot: "generation",
      partial: applyVehicleGenerationToDraft({}, m[1]),
    };
  }

  // Variant short answers
  if (activeSlot === "variant") {
    if (VARIANT_GTR_RE.test(t)) {
      return {
        matched: true,
        filledSlot: "variant",
        partial: { extras: ["variant:GT-R"] },
      };
    }
    if (VARIANT_GTT_RE.test(t)) {
      return {
        matched: true,
        filledSlot: "variant",
        partial: { extras: ["variant:GTT"] },
      };
    }
  }

  return { matched: false, partial: {} };
}

/** Active slot from open listing_slots clarification. */
export function getActiveListingSlot(
  pending?: PendingClarification | null
): ListingMissingSlot | null {
  if (!isClarificationOpen(pending) || pending.kind !== "listing_slots") return null;
  const active = pending.knownEntities?.activeSlot as ListingMissingSlot | undefined;
  if (active) return active;
  const first = pending.missingListingSlots?.[0] || pending.missingSlots?.[0];
  return (first as ListingMissingSlot) || null;
}

export function mergeExtras(
  existing: string[] | undefined,
  incoming: string[] | undefined
): string[] | undefined {
  if (!incoming?.length) return existing;
  const out = [...(existing || [])];
  for (const e of incoming) {
    const prefix = e.split(":")[0] + ":";
    const idx = out.findIndex((x) => x.toLowerCase().startsWith(prefix.toLowerCase()));
    if (idx >= 0) out[idx] = e;
    else out.push(e);
  }
  return out.slice(0, 24);
}

export type CompoundFactExtract = {
  partial: SkyAiListingFill;
  filledSlots: ListingMissingSlot[];
  /** Text after removing consumed fact tokens (commands already stripped upstream). */
  residual: string;
  notes: string[];
};

function normalizeGenerationToken(raw: string): string {
  const t = raw.replace(/\s+/g, "").toUpperCase();
  if (/^R[\s-]?3[2-4]$/i.test(raw) || /^R3[2-4]$/i.test(t)) {
    return t.replace(/[^R0-9]/gi, "").toUpperCase();
  }
  if (/^A80$/i.test(t) || /^JZA80$/i.test(t) || /^MK4$/i.test(t)) return "A80";
  if (/^A90$/i.test(t) || /^MK5$/i.test(t)) return "A90";
  return raw.trim();
}

/**
 * Apply generation token onto an existing vehicle draft (Skyline → Skyline R34).
 * Never invents GT-R; variant is separate.
 */
export function applyVehicleGenerationToDraft(
  base: Partial<SkyAiListingFill>,
  generationRaw: string
): Partial<SkyAiListingFill> {
  const gen = normalizeGenerationToken(generationRaw);
  const make = base.vehicleMake || "Nissan";
  const modelBase = (base.vehicleModel || base.title || "")
    .replace(/\bR[\s-]?3[2-4]\b/gi, "")
    .replace(/\bGT[\s-]?R\b/gi, "")
    .replace(/\bGT[\s-]?T\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const family = /\bskyline\b/i.test(modelBase)
    ? "Skyline"
    : /\bsupra\b/i.test(modelBase)
      ? "Supra"
      : modelBase || "Skyline";
  let vehicleModel = family;
  if (/^R3[2-4]$/i.test(gen)) {
    vehicleModel = `${family} ${gen.toUpperCase()}`;
  } else if (/^A80|^A90/i.test(gen)) {
    vehicleModel = `${family} ${gen}`;
  }
  const variant = getVariantExtra(base);
  const titleParts = [make, vehicleModel, variant].filter(Boolean);
  return {
    listingType: "vehicle",
    category: base.category || "Cars",
    vehicleMake: make,
    vehicleModel,
    title: titleParts.join(" "),
  };
}

export function getVariantExtra(fill: Partial<SkyAiListingFill>): string | undefined {
  const fromExtras = (fill.extras || []).find((e) =>
    e.toLowerCase().startsWith("variant:")
  );
  if (fromExtras) return fromExtras.slice("variant:".length).trim();
  const blob = `${fill.vehicleModel || ""} ${fill.title || ""}`;
  if (/\bGT[\s-]?R\b/i.test(blob)) return "GT-R";
  if (/\bGT[\s-]?T\b/i.test(blob)) return "GTT";
  return undefined;
}

/** Append / replace variant: extra without inventing. */
export function withVariantExtra(
  extras: string[] | undefined,
  variant: string
): string[] {
  return mergeExtras(extras, [`variant:${variant}`]) || [`variant:${variant}`];
}

/**
 * Extract domain facts from a (possibly compound) follow-up.
 * Pending slot is a HINT — we still harvest generation/variant/storage/etc. from free text.
 */
export function extractCompoundListingFacts(
  message: string,
  opts?: {
    activeSlot?: ListingMissingSlot | null;
    baseDraft?: Partial<SkyAiListingFill> | null;
  }
): CompoundFactExtract {
  let residual = message.trim();
  const partial: SkyAiListingFill = {};
  const filledSlots: ListingMissingSlot[] = [];
  const notes: string[] = [];
  const base = opts?.baseDraft || {};
  const domain = detectSellDomain(base.title || base.listingType ? base : { listingType: "physical", title: residual });

  // Vehicle generation + variant (USER-stated only)
  if (domain === "vehicle" || isVehicleListingFill(base as SkyAiListingFill) || GEN_TOKEN_RE.test(residual)) {
    const genMatch = residual.match(GEN_TOKEN_RE);
    if (genMatch) {
      const applied = applyVehicleGenerationToDraft(base, genMatch[1]);
      Object.assign(partial, applied);
      filledSlots.push("generation");
      notes.push(`model ${applied.vehicleModel}`);
      residual = residual.replace(genMatch[0], " ").replace(/\s+/g, " ").trim();
    }
    if (VARIANT_GTR_RE.test(residual)) {
      const variant = "GT-R";
      partial.extras = withVariantExtra(
        mergeExtras(base.extras, partial.extras),
        variant
      );
      // Keep model generation-clean; title gains variant
      if (partial.vehicleModel || base.vehicleModel) {
        const model = partial.vehicleModel || base.vehicleModel || "";
        const make = partial.vehicleMake || base.vehicleMake || "";
        partial.title = [make, model, variant].filter(Boolean).join(" ");
      }
      filledSlots.push("variant");
      notes.push("variant GT-R");
      residual = residual.replace(VARIANT_GTR_RE, " ").replace(/\s+/g, " ").trim();
    } else if (VARIANT_GTT_RE.test(residual)) {
      const variant = "GTT";
      partial.extras = withVariantExtra(
        mergeExtras(base.extras, partial.extras),
        variant
      );
      if (partial.vehicleModel || base.vehicleModel) {
        const model = partial.vehicleModel || base.vehicleModel || "";
        const make = partial.vehicleMake || base.vehicleMake || "";
        partial.title = [make, model, variant].filter(Boolean).join(" ");
      }
      filledSlots.push("variant");
      notes.push("variant GTT");
      residual = residual.replace(VARIANT_GTT_RE, " ").replace(/\s+/g, " ").trim();
    }
  }

  // Electronics storage
  const storageMatch = residual.match(/\b(\d+)\s?(gb|tb)\b/i);
  if (storageMatch) {
    partial.extras = mergeExtras(partial.extras || base.extras, [
      `storage:${storageMatch[1]}${storageMatch[2].toUpperCase()}`,
    ]);
    filledSlots.push("storage");
    notes.push(`storage ${storageMatch[1]}${storageMatch[2].toUpperCase()}`);
    residual = residual.replace(storageMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Card grade
  const gradeMatch = residual.match(/\b(psa|bgs|cgc|sgc)\s*([0-9]{1,2}(?:\.\d)?)\b/i);
  if (gradeMatch) {
    partial.extras = mergeExtras(partial.extras || base.extras, [
      `grade:${gradeMatch[1].toUpperCase()} ${gradeMatch[2]}`,
    ]);
    partial.condition = partial.condition || "Used - Like New";
    filledSlots.push("grade");
    notes.push(`grade ${gradeMatch[1].toUpperCase()} ${gradeMatch[2]}`);
    residual = residual.replace(gradeMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Clothing size
  const sizeMatch = residual.match(/\b(?:size\s*)?(\d{1,2}(?:\.\d)?|XS|S|M|L|XL|XXL)\b/i);
  if (
    sizeMatch &&
    (opts?.activeSlot === "size" ||
      domain === "clothing" ||
      /\b(size|uk|us|eu)\b/i.test(message))
  ) {
    partial.extras = mergeExtras(partial.extras || base.extras, [
      `size:${sizeMatch[1].toUpperCase()}`,
    ]);
    filledSlots.push("size");
    notes.push(`size ${sizeMatch[1]}`);
    residual = residual.replace(sizeMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Condition
  if (
    /\bbrand\s*new\b|\blike\s*new\b|\b(new|used|good|fair|mint|excellent)\s+condition\b|\bcondition\s*(?:is\s*)?(new|used|good|fair|mint)/i.test(
      residual
    ) ||
    /\b(brand\s*new|like\s*new|excellent|mint)\b/i.test(residual)
  ) {
    const raw = residual.toLowerCase();
    let condition = "Used - Good";
    if (/brand\s*new|sealed|unopened|(?:^|[^\w])new(?:\s+condition)?\b/.test(raw) && !/new\s+zealand/.test(raw)) {
      condition = "New";
    } else if (/like\s*new|mint|excellent/.test(raw)) {
      condition = "Used - Like New";
    } else if (/\bfair\b/.test(raw)) {
      condition = "Used - Fair";
    } else if (/\b(used|good)\b/.test(raw)) {
      condition = "Used - Good";
    }
    partial.condition = condition;
    filledSlots.push("condition");
    notes.push(`condition ${condition}`);
    residual = residual
      .replace(/\bbrand\s*new\b/gi, " ")
      .replace(/\blike\s*new\b/gi, " ")
      .replace(/\b(good|fair|mint|excellent|used|new)\s+condition\b/gi, " ")
      .replace(/\bcondition\s*(?:is\s*)?(new|used|good|fair|mint|excellent)\b/gi, " ")
      .replace(/\b(brand\s*new|like\s*new|excellent|mint)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Price $900 / 900 bucks / 60 a day / 50 per lawn / bare 50k when price slot pending
  const priceSlotPending =
    opts?.activeSlot === "price" ||
    opts?.activeSlot === "rental_rate" ||
    opts?.activeSlot === "service_rate";
  const priceMatch =
    residual.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?/i) ||
    residual.match(
      /\b([\d,]+(?:\.\d{1,2})?)\s*(k)?\s*(?:bucks|nzd|dollars?)\b/i
    ) ||
    residual.match(
      /\b([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*day|a\s+day|per\s+day|\/day|per\s+lawn|\/lawn)\b/i
    ) ||
    residual.match(/\bmake\s+(?:it\s+)?\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i) ||
    residual.match(/\b(?:for|at)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i) ||
    // Pending price slot: bare "50k" / "15k" is asking price, not odometer
    (priceSlotPending
      ? residual.match(/^\s*([\d,]+(?:\.\d{1,2})?)\s*(k)\s*$/i)
      : null);
  if (priceMatch) {
    let n = Number(String(priceMatch[1]).replace(/,/g, ""));
    const kFlag = priceMatch[2];
    if (kFlag && /^k$/i.test(String(kFlag))) n *= 1000;
    if (Number.isFinite(n) && n >= 1 && n <= 10_000_000) {
      const rateLike =
        domain === "rental" ||
        /\b(?:\/\s*day|a\s+day|per\s+day|\/day)\b/i.test(message);
      const serviceLike =
        domain === "service" || /\bper\s+lawn|\/lawn\b/i.test(message);
      if (rateLike) {
        partial.rentalPriceDaily = String(Math.round(n));
        partial.price = String(Math.round(n));
        filledSlots.push("rental_rate");
      } else if (serviceLike) {
        partial.price = String(Math.round(n));
        filledSlots.push("service_rate");
      } else {
        partial.price = String(Math.round(n));
        filledSlots.push("price");
      }
      notes.push(`price $${Math.round(n)}`);
      residual = residual.replace(priceMatch[0], " ").replace(/\s+/g, " ").trim();
    }
  }

  // Location
  const locMatch = residual.match(
    /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston\s+north|rotorua|queenstown|nelson|whangarei)\b/i
  );
  if (locMatch) {
    const city = locMatch[1]
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    partial.location = city;
    filledSlots.push("location");
    notes.push(`location ${city}`);
    residual = residual.replace(locMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Year
  const yearMatch = residual.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) {
    partial.vehicleYear = yearMatch[1];
    filledSlots.push("year");
    notes.push(`year ${yearMatch[1]}`);
    residual = residual.replace(yearMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Odometer — never steal bare "50k" while asking price.
  // Accept: explicit distance units, odometer slot, or "140k miles"
  const odoMiles = residual.match(
    /^\s*([\d,]+)\s*k\s*(?:miles?|mi|km|kms|kilometers|kilometres)\s*$/i
  );
  if (odoMiles) {
    const n = Number(odoMiles[1].replace(/,/g, "")) * 1000;
    if (n >= 100 && n < 2_000_000) {
      partial.vehicleOdometer = String(Math.round(n));
      filledSlots.push("odometer");
      notes.push(`odometer ${partial.vehicleOdometer}`);
      residual = residual.replace(odoMiles[0], " ").replace(/\s+/g, " ").trim();
    }
  } else {
    const odoMatch = residual.match(
      /\b([\d,]+)\s*(k|km|kms|kilometers|kilometres|miles?|mi)\b/i
    );
    if (odoMatch && !priceSlotPending) {
      const unit = String(odoMatch[2]);
      const bareK = /^k$/i.test(unit);
      const distanceUnit = /^(km|kms|kilometers|kilometres|miles?|mi)$/i.test(unit);
      if (!bareK || distanceUnit || opts?.activeSlot === "odometer") {
        let n = Number(odoMatch[1].replace(/,/g, ""));
        if (bareK) n *= 1000;
        if (n >= 100 && n < 2_000_000) {
          partial.vehicleOdometer = String(Math.round(n));
          filledSlots.push("odometer");
          notes.push(`odometer ${partial.vehicleOdometer}`);
          residual = residual.replace(odoMatch[0], " ").replace(/\s+/g, " ").trim();
        }
      }
    }
  }

  // Transmission / fuel
  if (/\b(manual|automatic|auto)\b/i.test(residual)) {
    const auto = /\bauto/i.test(residual);
    partial.vehicleTransmission = auto ? "Automatic" : "Manual";
    filledSlots.push("transmission");
    notes.push(`transmission ${partial.vehicleTransmission}`);
    residual = residual
      .replace(/\b(manual|automatic|auto)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (/\b(petrol|diesel|hybrid|electric|ev)\b/i.test(residual)) {
    const m = residual.match(/\b(petrol|diesel|hybrid|electric|ev)\b/i)![1];
    const map: Record<string, string> = {
      petrol: "Petrol",
      diesel: "Diesel",
      hybrid: "Hybrid",
      electric: "Electric",
      ev: "Electric",
    };
    partial.vehicleFuelType = map[m.toLowerCase()] || m;
    filledSlots.push("fuel");
    notes.push(`fuel ${partial.vehicleFuelType}`);
    residual = residual
      .replace(/\b(petrol|diesel|hybrid|electric|ev)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // If active slot was generation and we filled it — good.
  // Soft: try classic short parser on leftover for the active slot
  if (opts?.activeSlot && residual) {
    const slotResult = parseShortReplyForPendingSlot(residual, opts.activeSlot);
    if (slotResult.matched) {
      Object.assign(partial, slotResult.partial);
      if (slotResult.partial.extras) {
        partial.extras = mergeExtras(partial.extras, slotResult.partial.extras);
      }
      if (slotResult.filledSlot && !filledSlots.includes(slotResult.filledSlot)) {
        filledSlots.push(slotResult.filledSlot);
      }
      residual = "";
    }
  }

  residual = residual.replace(/\b(?:and|then|also|please|make\s+it)\b/gi, " ").replace(/\s+/g, " ").trim();

  return { partial, filledSlots, residual, notes };
}
