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
  | "title";

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
const ODO_RE = /^\s*([\d,]+)\s*(k|km|kms|kilometers|kilometres)?\s*$/i;
const SIZE_RE = /^\s*(?:size\s*)?(\d{1,2}(?:\.\d)?|XS|S|M|L|XL|XXL|XXXL)\s*$/i;
const GRADE_RE = /^\s*(psa|bgs|cgc|sgc)\s*([0-9]{1,2}(?:\.\d)?)\s*$/i;
const PRICE_RE = /^\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\s*$/i;
const CONDITION_WORDS =
  /^(new|brand\s*new|like\s*new|used|good|fair|mint|sealed|unopened|excellent|great)\b/i;
const NZ_CITY =
  /^(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|rotorua|queenstown|nelson|whangarei)\b/i;
const TRANS_RE = /^(manual|automatic|auto)\b/i;
const FUEL_RE = /^(petrol|diesel|hybrid|electric|ev)\b/i;

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

  // Odometer: 140k / 128000 km
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

  // Don't treat bare "140k" as price when odometer pending was already handled;
  // if price pending and looks like odo (large k), reject
  if (activeSlot === "price" && /^\s*[\d,]+\s*k\s*$/i.test(t)) {
    const n = Number(t.replace(/[^\d]/g, ""));
    if (n >= 50 && n <= 500) {
      // 140k could be odo — don't put as $140000 without $
      return {
        matched: false,
        partial: {},
        rejectedCorruption: true,
        reason: "odo_like_not_price",
      };
    }
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
