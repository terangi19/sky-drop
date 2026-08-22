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
import { isVehicleListingFill } from "./awhina-listing-description";
import { composeListingIdentity } from "./awhina-listing-identity";
import {
  computeDomainAwareMissingSlots,
  isFieldRelevant,
  isListingSlotQuestionValid,
  resolveCanonicalListingObject,
  selectNextBestListingSlot,
} from "./awhina-domain-facts";
import { selectDomainKnowledgeQuestions } from "./awhina-domain-knowledge";
import {
  extraKeyIsMultiValue,
  harvestSellerEvidence,
  sellerEvidenceToExtras,
  extractModificationClause,
  sanitizeListingExtras,
  structuredFactContextFromFill,
} from "./awhina-seller-evidence";
import {
  looksLikeColourFinish,
  parseListingCondition,
} from "./awhina-listing-condition";
import { extractSellerAuthoredText } from "./awhina-orchestration-boundary";

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
  | "quantity"
  | "colour"
  | "rental_rate"
  | "service_rate"
  | "title"
  | "generation"
  | "variant";

export const SLOT_QUESTIONS: Record<ListingMissingSlot, string> = {
  price: "What's the asking price?",
  condition: "What condition is it in?",
  location: "Where is it — or keep your usual location?",
  year: "What year is it?",
  odometer: "Roughly how many kilometres are on it?",
  transmission: "Is it manual or automatic?",
  fuel: "Petrol, diesel, or hybrid?",
  storage: "What storage size is it (e.g. 128GB)?",
  size: "What size is it?",
  card_set: "Which set / product line is the card from?",
  card_subject: "Which player or character is on the card?",
  grade: "Which grader and grade (e.g. PSA 10)?",
  quantity: "How many cards are in the bundle?",
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
  // Prefer canonical CURRENT-object family (subtype-aware) over coarse keyword maps.
  const canonical = resolveCanonicalListingObject(fill);
  switch (canonical.family) {
    case "vehicle":
      return "vehicle";
    case "trading_card":
      return "card";
    case "electronics":
      return "electronics";
    case "clothing":
      return "clothing";
    case "rental":
      return "rental";
    case "service":
      return "service";
    default:
      break;
  }
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
  if (
    /card|psa|bgs|cgc|topps|panini|pokemon|yugioh|sports card|trading card|collectibles?/.test(
      blob
    ) ||
    /(?:^|\s)(?:subject|set|grade):/.test(blob)
  ) {
    return "card";
  }
  // Tech category alone ≠ phone. Only route to electronics when product cues exist
  // OR category is Tech/Gaming (subtype resolved later — may be gaming_mouse).
  if (
    /iphone|samsung|pixel|ipad|macbook|laptop|phone|mouse|keyboard|headset|console|ps5|xbox|gb\b|tb\b|storage:/.test(
      blob
    ) ||
    fill.category === "Tech" ||
    fill.category === "Gaming"
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

/** Skyline/Supra families need an explicit generation slot until vehicleGeneration is set. */
export function needsVehicleGenerationSlot(
  fill: Partial<SkyAiListingFill>
): boolean {
  const d = hydrateVehicleGeneration(fill);
  if (d.vehicleGeneration?.trim()) return false;
  const blob = [d.vehicleMake, d.vehicleModel, d.title].filter(Boolean).join(" ");
  return /\b(skyline|supra)\b/i.test(blob);
}

/**
 * Ordered missing slots for CURRENT object (domain + subtype registry).
 * Never asks specialist fields merely because they exist on a sibling schema
 * (e.g. storage on all Tech / electronics).
 */
export function computeMissingListingSlots(
  fill: Partial<SkyAiListingFill>
): ListingMissingSlot[] {
  const hydrated = hydrateVehicleGeneration(fill);
  const knowledgePriorities = selectDomainKnowledgeQuestions(hydrated as SkyAiListingFill);
  const canonical = resolveCanonicalListingObject(hydrated);

  // Vehicle: preserve generation gate + ordered specialist slots via registry,
  // with explicit generation skip when not Skyline/Supra family.
  if (canonical.family === "vehicle") {
    const missing = computeDomainAwareMissingSlots(hydrated).filter((slot) => {
      if (slot === "generation" && !needsVehicleGenerationSlot(hydrated)) {
        return false;
      }
      return isFieldRelevant(slot, canonical) && !isListingSlotComplete(slot, hydrated);
    });
    if (
      !hydrated.title?.trim() &&
      !(hydrated.vehicleMake || hydrated.vehicleModel) &&
      !missing.includes("title")
    ) {
      missing.unshift("title");
    }
    return missing;
  }

  // All other domains: single registry brain (relevance + required/high-value + priority)
  return computeDomainAwareMissingSlots(hydrated)
    .filter((slot) => isListingSlotQuestionValid(slot, hydrated))
    .filter((slot) => {
      // Sealed TCG products do not have a player/grade question.
      if (
        knowledgePriorities.includes("price") &&
        !knowledgePriorities.includes("subject") &&
        (slot === "card_subject" || slot === "grade")
      ) {
        return false;
      }
      return true;
    });
}

export function nextListingSlotQuestion(
  fill: Partial<SkyAiListingFill>
): { slot: ListingMissingSlot; question: string } | null {
  const hydrated = hydrateVehicleGeneration(fill);
  // Next-best = highest-value relevant unknown (not first hole in a giant schema)
  const slot =
    selectNextBestListingSlot(hydrated) ||
    computeMissingListingSlots(hydrated).find((s) =>
      isListingSlotQuestionValid(s, hydrated)
    ) ||
    null;
  if (!slot) return null;
  if (!isListingSlotQuestionValid(slot, hydrated)) return null;
  return { slot, question: SLOT_QUESTIONS[slot] };
}

export type ListingDetailBatch = {
  slots: ListingMissingSlot[];
  question: string;
};

function joinNatural(values: string[]): string {
  if (values.length <= 1) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

/**
 * One seller turn should collect a small related group, while `pendingSlot`
 * remains the first slot for short-answer compatibility and persistence.
 * Domain/object schemas determine the candidate list; this merely groups the
 * high-value unknowns into buyer-friendly language.
 */
export function getListingDetailBatch(
  fill: Partial<SkyAiListingFill>,
  max = 5
): ListingDetailBatch | null {
  const hydrated = hydrateVehicleGeneration(fill);
  const canonical = resolveCanonicalListingObject(hydrated);
  const missing = computeMissingListingSlots(hydrated);
  if (!missing.length) return null;

  const isSealedCardProduct =
    canonical.family === "trading_card" &&
    /\b(?:booster|display|box|pack|etb|tin)\b/i.test(
      [hydrated.title, ...(hydrated.extras || [])].filter(Boolean).join(" ")
    );
  const preferred: ListingMissingSlot[] =
    canonical.family === "vehicle"
      ? ["generation", "year", "odometer", "transmission", "condition", "price", "fuel", "colour"]
      : isSealedCardProduct
        ? ["condition", "price", "location"]
        : canonical.family === "electronics"
          ? ["storage", "condition", "colour", "price", "location"]
          : canonical.family === "clothing"
            ? ["size", "condition", "price", "location"]
            : ["condition", "price", "location", "size", "colour"];
  const slots = [
    ...preferred.filter((slot) => missing.includes(slot)),
    ...missing.filter((slot) => !preferred.includes(slot)),
  ];
  // Colour is a useful seller detail for phones/controllers even when the
  // object schema does not make it publish-blocking. It belongs in the same
  // compact batch, not a separate follow-up.
  if (
    canonical.family === "electronics" &&
    !hasExtra(hydrated, "colour:") &&
    !slots.includes("colour")
  ) {
    const afterCondition = slots.indexOf("condition");
    slots.splice(afterCondition >= 0 ? afterCondition + 1 : 0, 0, "colour");
  }
  slots.splice(max);
  if (!slots.length) return null;

  const identity = hydrated.title || "your item";
  if (canonical.family === "vehicle") {
    const labels: Partial<Record<ListingMissingSlot, string>> = {
      year: "year",
      generation: "generation",
      odometer: "mileage",
      transmission: "transmission",
      condition: "condition",
      price: "asking price",
      fuel: "fuel type",
      colour: "colour",
    };
    return {
      slots,
      question: `What's the ${joinNatural(slots.map((slot) => labels[slot] || slot.replace(/_/g, " ")))}? Mention any modifications or faults too if relevant. You can give me everything in one message.`,
    };
  }
  if (isSealedCardProduct) {
    const includesCondition = slots.includes("condition");
    const includesPrice = slots.includes("price");
    return {
      slots,
      question: `${includesCondition ? "Is it factory sealed, and what condition is the box in?" : ""}${includesPrice ? " What's the asking price?" : ""} You can give me everything in one message.`.replace(/\s+/g, " ").trim(),
    };
  }

  const labels: Partial<Record<ListingMissingSlot, string>> = {
    storage: "storage size",
    condition: "condition",
    colour: "colour",
    size: "size",
    price: "asking price",
    location: "location",
  };
  const followUp =
    canonical.family === "electronics" && canonical.objectType === "phone"
      ? " Include battery health too if you know it."
      : canonical.family === "clothing"
        ? " Mention any wear or marks buyers should know about."
        : /\b(?:bike|cycling)/i.test(`${canonical.objectType} ${identity}`)
          ? " Mention any upgrades, faults, or recent maintenance too."
          : "";
  return {
    slots,
    question: `What's the ${joinNatural(slots.map((slot) => labels[slot] || slot.replace(/_/g, " ")))}?${followUp} You can give me everything in one message.`,
  };
}

export function buildListingSlotPending(
  fill: Partial<SkyAiListingFill>,
  priorMessage: string
): PendingClarification | null {
  const batch = getListingDetailBatch(fill);
  const next = nextListingSlotQuestion(fill);
  if (!next || !batch) return null;
  return buildOpenListingSlotClarification({
    priorMessage,
    missingSlots: batch.slots,
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
  /^(new|brand[\s-]*new|like[\s-]*new|used|good|fair|mint|sealed|unopened|excellent|great)\b/i;
const NZ_CITY =
  /^(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|rotorua|queenstown|nelson|whangarei)\b/i;
const TRANS_RE = /^(manual|automatic|auto)\b/i;
const FUEL_RE = /^(petrol|diesel|hybrid|electric|ev)\b/i;
const GEN_TOKEN_RE = /\b(r[\s-]?3[2-4]|a80|a90|mk\s?[45]|jza80)\b/i;
const VARIANT_GTR_RE = /\b(gt[\s-]?r|gtr)\b/i;
const VARIANT_GTT_RE = /\b(gt[\s-]?t|gtt)\b/i;

/** Local set-like detector — keeps pending-slots free of circular imports. */
const CARD_SET_LIKE_LOCAL =
  /\b(prizm|select|optic|mosaic|donruss|chronicles|phoenix|hoops|chrome|bowman|topps|panini|upper\s*deck|fleer|stadium\s*club|heritage|update|series\s*[12]|base\s*set|evolving\s*skies|vivid\s*voltage|obsidian|national\s*treasures|flawless|immaculate|contenders|score|absolute|certified|finest|refractor|parallel|rookie)\b/i;

function looksLikeCardSetAnswerLocal(message: string): boolean {
  const t = message
    .trim()
    .replace(/^(?:it'?s|its|is|nah(?:\s+bro)?[,.]?|actually[,.]?)\s+/i, "")
    .trim();
  if (!t || t.length > 60) return false;
  if (CARD_SET_LIKE_LOCAL.test(t)) return true;
  if (/\b(?:19|20)\d{2}\b/.test(t) && /topps|panini|bowman|pokemon|yugioh/i.test(t)) {
    return true;
  }
  if (/\b(set|product\s*line|series|collection)\b/i.test(message)) return true;
  // Person-like / "It's Name" identity must never become a set
  if (/^(it'?s|its)\s+/i.test(message.trim())) return false;
  if (/^[A-Za-z]+(?:\s+[A-Za-z]+){1,3}$/.test(t) && !CARD_SET_LIKE_LOCAL.test(t)) {
    return false;
  }
  return false;
}

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
  // "140k miles" / "190k kilometres" as odometer + unit
  if (activeSlot === "odometer") {
    const miles = t.match(
      /^\s*([\d,]+)\s*k\s*(?:miles?|mi|km|kms|kilometers|kilometres)\s*$/i
    );
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
    const condition = parseListingCondition(t) || "Used - Good";
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

  if (
    activeSlot === "colour" &&
    /^(black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|beige|purple|pink|bronze|maroon|navy)\b/i.test(
      t
    )
  ) {
    const c = t.match(
      /^(black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|beige|purple|pink|bronze|maroon|navy)\b/i
    )![1];
    return {
      matched: true,
      filledSlot: "colour",
      partial: {
        vehicleColour: c.charAt(0).toUpperCase() + c.slice(1).toLowerCase(),
      },
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
    // pendingSlot is a HINT — do NOT trap person/identity answers as set names.
    // Semantic validation (awhina-pending-slot-validate) is authoritative; this
    // gate blocks the classic "It's Floyd Samba" → set: trap at parse time too.
    if (!looksLikeCardSetAnswerLocal(t)) {
      return {
        matched: false,
        partial: {},
        rejectedCorruption: false,
        reason: "identity_not_card_set",
      };
    }
    return {
      matched: true,
      filledSlot: "card_set",
      partial: { extras: [`set:${t}`] },
    };
  }

  if (activeSlot === "card_subject" && t.length >= 2 && t.length <= 60) {
    // Reject pure set/product-line answers as subject (apply as set instead upstream)
    if (looksLikeCardSetAnswerLocal(t) && !/\s/.test(t.trim())) {
      return {
        matched: false,
        partial: {},
        reason: "set_not_card_subject",
      };
    }
    return {
      matched: true,
      filledSlot: "card_subject",
      partial: { extras: [`subject:${t}`] },
    };
  }

  if (activeSlot === "quantity") {
    const wordQuantities: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    const m = t.match(
      /^\s*(?:about\s+|around\s+|roughly\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:cards?)?\s*$/i
    );
    if (m) {
      const raw = m[1].toLowerCase();
      const quantity = /^\d+$/.test(raw) ? Number(raw) : wordQuantities[raw];
      if (Number.isInteger(quantity) && quantity >= 2 && quantity <= 500) {
        return {
          matched: true,
          filledSlot: "quantity",
          partial: { extras: [`bundle_quantity:${quantity}`] },
        };
      }
    }
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
  // Prefer first-class typed pendingSlot (persisted across surfaces)
  if (pending.pendingSlot) return pending.pendingSlot as ListingMissingSlot;
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
  for (const raw of incoming) {
    const extra = String(raw || "").trim();
    if (!extra) continue;
    const colon = extra.indexOf(":");
    if (colon <= 0) {
      if (!out.some((item) => item.toLowerCase() === extra.toLowerCase())) out.push(extra);
      continue;
    }
    const key = extra.slice(0, colon);
    if (extraKeyIsMultiValue(key)) {
      const value = extra.slice(colon + 1).trim().toLowerCase();
      const exists = out.some((item) => {
        const itemColon = item.indexOf(":");
        if (itemColon <= 0) return item.toLowerCase() === extra.toLowerCase();
        return (
          extraKeyIsMultiValue(item.slice(0, itemColon)) &&
          item.slice(0, itemColon).toLowerCase().replace(/_/g, "") ===
            key.toLowerCase().replace(/_/g, "") &&
          item.slice(itemColon + 1).trim().toLowerCase() === value
        );
      });
      if (!exists) out.push(extra);
      continue;
    }
    const prefix = extra.slice(0, colon + 1);
    const idx = out.findIndex((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
    if (idx >= 0) out[idx] = extra;
    else out.push(extra);
  }
  return out.slice(0, 48);
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

const GEN_IN_TEXT_RE = /\b(r[\s-]?3[2-4]|a80|a90|mk\s?[45]|jza80)\b/i;

/** Pull generation token out of legacy model/title blobs into vehicleGeneration. */
export function hydrateVehicleGeneration(
  fill: Partial<SkyAiListingFill>
): Partial<SkyAiListingFill> {
  if (fill.vehicleGeneration?.trim()) {
    return {
      ...fill,
      vehicleGeneration: normalizeGenerationToken(fill.vehicleGeneration),
    };
  }
  const blob = `${fill.vehicleModel || ""} ${fill.title || ""}`;
  const m = blob.match(GEN_IN_TEXT_RE);
  if (!m) return fill;
  const gen = normalizeGenerationToken(m[1]);
  const modelFamily = (fill.vehicleModel || "")
    .replace(GEN_IN_TEXT_RE, "")
    .replace(/\bGT[\s-]?R\b/gi, "")
    .replace(/\bGT[\s-]?T\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    ...fill,
    vehicleGeneration: gen,
    ...(modelFamily ? { vehicleModel: modelFamily } : {}),
  };
}

/**
 * Slot completeness from the authoritative draft only — never from title scan,
 * last message, or temporary parser results.
 */
export function isListingSlotComplete(
  slot: ListingMissingSlot,
  draft: Partial<SkyAiListingFill>
): boolean {
  const d = hydrateVehicleGeneration(draft);
  switch (slot) {
    case "generation":
      return Boolean(d.vehicleGeneration?.trim());
    case "year":
      return Boolean(d.vehicleYear?.trim());
    case "price":
      return Boolean(d.price?.trim());
    case "odometer":
      return Boolean(d.vehicleOdometer?.trim());
    case "condition":
      return Boolean(d.condition?.trim());
    case "colour":
      return Boolean(d.vehicleColour?.trim());
    case "transmission":
      return Boolean(d.vehicleTransmission?.trim());
    case "fuel":
      return Boolean(d.vehicleFuelType?.trim());
    case "location":
      return Boolean((d.location || d.pickupArea)?.trim());
    case "title":
      return Boolean(d.title?.trim());
    case "variant":
      return Boolean(getVariantExtra(d));
    case "storage":
      return hasExtra(d, "storage:") || /\d+\s?(gb|tb)\b/i.test([d.title, ...(d.extras || [])].join(" "));
    case "size":
      return hasExtra(d, "size:");
    case "card_set":
      return hasExtra(d, "set:");
    case "card_subject":
      return hasExtra(d, "subject:");
    case "grade": {
      const blob = [d.title, ...(d.extras || [])].join(" ");
      return (
        hasExtra(d, "grade:") ||
        /\b(psa|bgs|cgc|sgc|csg)\s*(10|9\.5|9|8\.5|8|7\.5|7|6|5|4|3|2|1)\b/i.test(
          blob
        )
      );
    }
    case "quantity": {
      const extras = d.extras || [];
      if (
        extras.some((e) =>
          /^(bundle_quantity|quantity|qty):/i.test(String(e || ""))
        )
      ) {
        return true;
      }
      const blob = [d.title, ...extras].join(" ");
      return (
        /\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s*-?\s*cards?\b/i.test(
          blob
        ) ||
        /\bbundle\s+of\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
          blob
        )
      );
    }
    case "rental_rate":
      return Boolean(d.price || d.rentalPriceDaily || d.rentalPriceWeekly);
    case "service_rate":
      return Boolean(d.servicePricingType || d.price);
    default:
      return false;
  }
}

/** year + make + model + generation + variant — each once */
export function composeVehicleIdentityTitle(
  fill: Partial<SkyAiListingFill>
): string {
  const d = hydrateVehicleGeneration(fill);
  const model = (d.vehicleModel || "")
    .replace(GEN_IN_TEXT_RE, "")
    .replace(/\bGT[\s-]?R\b/gi, "")
    .replace(/\bGT[\s-]?T\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const variant = getVariantExtra(d);
  return composeListingIdentity({
    year: d.vehicleYear,
    brand: d.vehicleMake,
    product: model,
    generation: d.vehicleGeneration,
    variant,
  });
}

/**
 * Apply generation token onto an existing vehicle draft.
 * Canonical: vehicleGeneration=R34, vehicleModel stays family (Skyline).
 * Never invents GT-R; variant is separate.
 */
export function applyVehicleGenerationToDraft(
  base: Partial<SkyAiListingFill>,
  generationRaw: string
): Partial<SkyAiListingFill> {
  const gen = normalizeGenerationToken(generationRaw);
  const make = base.vehicleMake || "Nissan";
  const modelBase = (base.vehicleModel || base.title || "")
    .replace(GEN_IN_TEXT_RE, "")
    .replace(/\bGT[\s-]?R\b/gi, "")
    .replace(/\bGT[\s-]?T\b/gi, "")
    .replace(/\bNissan\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const family = /\bskyline\b/i.test(modelBase)
    ? "Skyline"
    : /\bsupra\b/i.test(modelBase)
      ? "Supra"
      : modelBase || "Skyline";
  const vehicleGeneration = /^R3[2-4]$/i.test(gen)
    ? gen.toUpperCase()
    : /^A80|^A90/i.test(gen)
      ? gen.toUpperCase().replace(/[^A0-9]/g, "")
      : gen;
  const withGen: Partial<SkyAiListingFill> = {
    ...base,
    listingType: "vehicle",
    category: base.category || "Cars",
    vehicleMake: make,
    vehicleModel: family,
    vehicleGeneration,
  };
  return {
    listingType: "vehicle",
    category: withGen.category,
    vehicleMake: make,
    vehicleModel: family,
    vehicleGeneration,
    title: composeVehicleIdentityTitle(withGen),
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
  // Only seller-authored text — never orchestration / LISTING_FILL wrappers.
  let residual = extractSellerAuthoredText(message).trim();
  const partial: SkyAiListingFill = {};
  const filledSlots: ListingMissingSlot[] = [];
  const notes: string[] = [];
  const base = opts?.baseDraft || {};
  const domain = detectSellDomain(base.title || base.listingType ? base : { listingType: "physical", title: residual });

  // "100 for all three" is a price answer plus a fact about the object being
  // sold. Preserve that bundle context without mistaking it for stock count.
  // The description composer can use this canonical fact, but price remains a
  // separate field and condition is still the next question.
  if (domain === "card") {
    const wordQuantities: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    const bundleMatch = residual.match(
      /\b(?:for\s+)?all\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i
    );
    if (bundleMatch) {
      const raw = bundleMatch[1].toLowerCase();
      const quantity = /^\d+$/.test(raw) ? Number(raw) : wordQuantities[raw];
      if (Number.isInteger(quantity) && quantity > 1 && quantity <= 100) {
        partial.extras = mergeExtras(partial.extras || base.extras, [
          `bundle_quantity:${quantity}`,
        ]);
        notes.push(`bundle of ${quantity}`);
        residual = residual.replace(bundleMatch[0], " ").replace(/\s+/g, " ").trim();
      }
    }
  }

  // Vehicle generation + variant (USER-stated only)
  if (domain === "vehicle" || isVehicleListingFill(base as SkyAiListingFill) || GEN_TOKEN_RE.test(residual)) {
    const genMatch = residual.match(GEN_TOKEN_RE);
    if (genMatch) {
      const applied = applyVehicleGenerationToDraft(base, genMatch[1]);
      Object.assign(partial, applied);
      filledSlots.push("generation");
      notes.push(`generation ${applied.vehicleGeneration || applied.vehicleModel}`);
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
        partial.title = composeListingIdentity({
          brand: make,
          product: model,
          generation: partial.vehicleGeneration || base.vehicleGeneration,
          variant,
        });
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
        partial.title = composeListingIdentity({
          brand: make,
          product: model,
          generation: partial.vehicleGeneration || base.vehicleGeneration,
          variant,
        });
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

  // Condition — including bare "new" / "used" in compound replies ("200 new auckland")
  const residualForCondition = residual.replace(
    /\bnew\s+(?:chain|tyres?|tires?|brakes?|batter(?:y|ies)|filters?|oil|wheels?|exhaust|pads?|intake|clutch)\b/gi,
    " "
  );
  const conditionHit =
    /\bbrand[\s-]*new\b|\blike[\s-]*new\b|\b(new|used|good|fair|mint|excellent)\s+condition\b|\bcondition\s*(?:is\s*)?(new|used|good|fair|mint)/i.test(
      residualForCondition
    ) ||
    /\b(brand[\s-]*new|like[\s-]*new|excellent|mint)\b/i.test(residualForCondition) ||
    (/\b(new|used|good|fair|mint|excellent|sealed|unopened)\b/i.test(residualForCondition) &&
      !/\bnew\s+zealand\b/i.test(residualForCondition) &&
      !/\blike[\s-]*new\b/i.test(residualForCondition));
  if (conditionHit) {
    const condition = parseListingCondition(residualForCondition) || "Used - Good";
    partial.condition = condition;
    filledSlots.push("condition");
    notes.push(condition === "New" ? "brand new" : condition);
    residual = residual
      .replace(/\bbrand[\s-]*new\b/gi, " ")
      .replace(/\blike[\s-]*new\b/gi, " ")
      .replace(/\b(good|fair|mint|excellent|used|new)\s+condition\b/gi, " ")
      .replace(/\bcondition\s*(?:is\s*)?(new|used|good|fair|mint|excellent)\b/gi, " ")
      .replace(/\b(brand[\s-]*new|like[\s-]*new|excellent|mint)\b/gi, " ")
      .replace(/\b(new|used|good|fair|mint|excellent|sealed|unopened)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Missing-slot awareness: pendingSlot is a hint — still harvest other missing facts
  const missingFromBase = computeMissingListingSlots({
    ...base,
    ...partial,
    extras: mergeExtras(base.extras, partial.extras),
  } as Partial<SkyAiListingFill>);

  // Colour (vehicles / explicit colour words in compound replies)
  const colourMatch = residual.match(
    /\b((?:natural|space|midnight|pearl|matte|metallic|starlight|graphite|alpine|gunmetal|navy|dark|light|forest|racing)\s+)?(black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|beige|purple|pink|bronze|maroon|navy|titanium|graphite|starlight)\b/i
  );
  const colourPhrase = colourMatch
    ? [colourMatch[1], colourMatch[2]].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
    : "";
  if (
    colourMatch &&
    colourPhrase &&
    !partial.vehicleColour &&
    !(base.vehicleColour || "").trim() &&
    (opts?.activeSlot === "colour" ||
      domain === "vehicle" ||
      missingFromBase.includes("colour") ||
      looksLikeColourFinish(colourPhrase))
  ) {
    partial.vehicleColour = colourPhrase
      .split(/\s+/)
      .map((word, index) =>
        index === 0
          ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          : word.toLowerCase()
      )
      .join(" ");
    filledSlots.push("colour");
    notes.push(`colour ${partial.vehicleColour}`);
    partial.extras = mergeExtras(partial.extras || base.extras, [
      `colour:${partial.vehicleColour}`,
    ]);
    residual = residual.replace(colourMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  const priceSlotPending =
    opts?.activeSlot === "price" ||
    opts?.activeSlot === "rental_rate" ||
    opts?.activeSlot === "service_rate";
  const priceNeeded =
    priceSlotPending ||
    missingFromBase.includes("price") ||
    missingFromBase.includes("rental_rate") ||
    missingFromBase.includes("service_rate") ||
    (!base.price && !partial.price);

  // Card "numbered 25" — consume before bare price so 300 remains the price
  const numberedMatch = residual.match(/\bnumbered\s+(\d{1,4})\b/i);
  if (numberedMatch) {
    partial.extras = mergeExtras(partial.extras || base.extras, [
      `numbered:${numberedMatch[1]}`,
    ]);
    notes.push(`numbered ${numberedMatch[1]}`);
    residual = residual.replace(numberedMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Year before price/odo so "1999 190k … 50k" keeps year out of price
  const yearMatch = residual.match(/\b((?:19|20)\d{2})\b/);
  if (
    yearMatch &&
    (domain === "vehicle" ||
      opts?.activeSlot === "year" ||
      missingFromBase.includes("year"))
  ) {
    partial.vehicleYear = yearMatch[1];
    filledSlots.push("year");
    notes.push(`year ${yearMatch[1]}`);
    residual = residual.replace(yearMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Odometer before bare price — prefer explicit km readings over bare "18k" price tokens
  const odoNeeded =
    opts?.activeSlot === "odometer" ||
    missingFromBase.includes("odometer") ||
    (domain === "vehicle" && !base.vehicleOdometer && !partial.vehicleOdometer);
  const odoMiles = residual.match(
    /\b([\d,]+)\s*k\s*(?:miles?|mi|km|kms|kilometers|kilometres)\b/i
  );
  const odoExplicitKm = residual.match(/\b([\d,]{3,7})\s*kms?\b/i);
  if (odoMiles && (odoNeeded || opts?.activeSlot === "odometer")) {
    const n = Number(odoMiles[1].replace(/,/g, "")) * 1000;
    if (n >= 100 && n < 2_000_000) {
      partial.vehicleOdometer = String(Math.round(n));
      filledSlots.push("odometer");
      notes.push(`odometer ${partial.vehicleOdometer}`);
      residual = residual.replace(odoMiles[0], " ").replace(/\s+/g, " ").trim();
    }
  } else if (odoExplicitKm && (odoNeeded || opts?.activeSlot === "odometer")) {
    const n = Number(odoExplicitKm[1].replace(/,/g, ""));
    if (n >= 100 && n < 2_000_000) {
      partial.vehicleOdometer = String(Math.round(n));
      filledSlots.push("odometer");
      notes.push(`odometer ${partial.vehicleOdometer}`);
      residual = residual.replace(odoExplicitKm[0], " ").replace(/\s+/g, " ").trim();
    }
  } else if (odoNeeded && !priceSlotPending) {
    // Prefer the first k-token as odometer when multiple remain (190k … 50k → odo then price)
    // Skip bare "Nk" when it sits in a price phrase ("for 18k", "$18k")
    const odoMatch = residual.match(
      /\b([\d,]+)\s*(k|km|kms|kilometers|kilometres|miles?|mi)\b/i
    );
    if (odoMatch) {
      const unit = String(odoMatch[2]);
      const bareK = /^k$/i.test(unit);
      const distanceUnit = /^(km|kms|kilometers|kilometres|miles?|mi)$/i.test(unit);
      const priceishBareK =
        bareK &&
        new RegExp(
          `(?:for\\s+|\\$)\\s*${odoMatch[1].replace(/,/g, "")}\\s*k\\b`,
          "i"
        ).test(message);
      if (
        (!bareK || distanceUnit || opts?.activeSlot === "odometer") &&
        !priceishBareK
      ) {
        let n = Number(odoMatch[1].replace(/,/g, ""));
        if (bareK) n *= 1000;
        if (n >= 100 && n < 2_000_000) {
          partial.vehicleOdometer = String(Math.round(n));
          filledSlots.push("odometer");
          notes.push(`odometer ${partial.vehicleOdometer}`);
          residual = residual.replace(odoMatch[0], " ").replace(/\s+/g, " ").trim();
        }
      } else if (bareK && odoNeeded && !priceishBareK) {
        let n = Number(odoMatch[1].replace(/,/g, "")) * 1000;
        if (n >= 100 && n < 2_000_000) {
          partial.vehicleOdometer = String(Math.round(n));
          filledSlots.push("odometer");
          notes.push(`odometer ${partial.vehicleOdometer}`);
          residual = residual.replace(odoMatch[0], " ").replace(/\s+/g, " ").trim();
        }
      }
    }
  }

  // Price $900 / 900 bucks / 60 a day / 50 an hour / bare 200 in compound turns
  const priceMatch =
    residual.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?/i) ||
    residual.match(
      /\b([\d,]+(?:\.\d{1,2})?)\s*(k)?\s*(?:bucks|nzd|dollars?)\b/i
    ) ||
    residual.match(
      /\b([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*day|a\s+day|per\s+day|\/day|per\s+lawn|\/lawn|an?\s+hour|per\s+hour|\/\s*hr|\/hr)\b/i
    ) ||
    residual.match(/\bmake\s+(?:it\s+)?\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i) ||
    residual.match(/\b(?:for|at)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i) ||
    // Price needed: bare "50k" / "15k" is asking price (after odo already consumed)
    (priceNeeded
      ? residual.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(k)\b/i)
      : null) ||
    // Compound / missing-price: bare "200" / "900" (not year-like alone)
    (priceNeeded
      ? residual.match(
          /\b([\d,]+(?:\.\d{1,2})?)\b(?!%|\s*(?:%|percent|battery|gb|tb|k\b|km|miles?|mi)\b)/i
        )
      : null);
  if (priceMatch) {
    let n = Number(String(priceMatch[1]).replace(/,/g, ""));
    const kFlag = priceMatch[2];
    if (kFlag && /^k$/i.test(String(kFlag))) n *= 1000;
    // Don't treat a lone year as price when year slot just filled or still pending
    const yearLike =
      !kFlag &&
      n >= 1980 &&
      n <= new Date().getFullYear() + 1 &&
      (filledSlots.includes("year") ||
        missingFromBase.includes("year") ||
        opts?.activeSlot === "year");
    if (!yearLike && Number.isFinite(n) && n >= 1 && n <= 10_000_000) {
      const rateLike =
        domain === "rental" ||
        /\b(?:\/\s*day|a\s+day|per\s+day|\/day)\b/i.test(message);
      const serviceLike =
        domain === "service" ||
        /\bper\s+lawn|\/lawn|an?\s+hour|per\s+hour|\/\s*hr|\/hr\b/i.test(message);
      if (rateLike) {
        partial.rentalPriceDaily = String(Math.round(n));
        partial.price = String(Math.round(n));
        filledSlots.push("rental_rate");
      } else if (serviceLike) {
        partial.price = String(Math.round(n));
        if (!partial.servicePricingType) {
          partial.servicePricingType = /hour|\/\s*hr|\/hr/i.test(message)
            ? "Hourly Rate"
            : "Fixed Price";
        }
        filledSlots.push("service_rate");
      } else {
        partial.price = String(Math.round(n));
        filledSlots.push("price");
      }
      notes.push(`$${Math.round(n)}`);
      residual = residual.replace(priceMatch[0], " ").replace(/\s+/g, " ").trim();
    }
  }

  // Location
  const locMatch = residual.match(
    /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston\s+north|rotorua|queenstown|nelson|whangarei|henderson|manukau|albany|newmarket|takapuna|ponsonby|remuera|howick|botany|papakura|waitakere|north\s+shore)\b/i
  );
  if (locMatch) {
    const city = locMatch[1]
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    partial.location = city;
    filledSlots.push("location");
    notes.push(city);
    residual = residual.replace(locMatch[0], " ").replace(/\s+/g, " ").trim();
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

  // Preserve useful seller statements — harvest per sentence/clause, never the
  // full raw message as one blob. Composite sentences are reduced inside harvest.
  const evidenceCtx = structuredFactContextFromFill({
    ...base,
    ...partial,
    title: partial.title || base.title,
  });
  const modClause =
    extractModificationClause(residual) || extractModificationClause(message);
  const sentenceSources = [
    ...(modClause ? [modClause] : []),
    ...extractSellerAuthoredText(message)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean),
    ...residual
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean),
  ];
  const sellerItems: ReturnType<typeof harvestSellerEvidence> = [];
  const seenEvidence = new Set<string>();
  for (const source of sentenceSources) {
    for (const item of harvestSellerEvidence(source, evidenceCtx)) {
      const key = `${item.kind}:${item.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
      if (seenEvidence.has(key)) continue;
      seenEvidence.add(key);
      sellerItems.push(item);
    }
  }
  if (sellerItems.length) {
    const extras = sellerEvidenceToExtras(sellerItems);
    partial.extras = mergeExtras(partial.extras || base.extras, extras);
    notes.push(...sellerItems.map((item) => item.text));
    if (!partial.vehicleColour && !(base.vehicleColour || "").trim()) {
      const colourItem = sellerItems.find((item) => looksLikeColourFinish(item.text));
      if (colourItem) {
        const colour = colourItem.text
          .split(/\s+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
        partial.vehicleColour = colour;
        partial.extras = mergeExtras(partial.extras, [`colour:${colour}`]);
        filledSlots.push("colour");
      }
    }
    residual = residual
      .replace(
        /\b(?:mostly stock|aftermarket|modified|modifications?|exhaust|wheels?|upgrades?|faults?|issues?|maintenance|serviced?|service history|coilovers?|intake|wof|rego|registration|stone chips?|interior is tidy)[\s\S]*/i,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  // If active slot was generation and we filled it — good.
  // Soft: try classic short parser on leftover for the active slot
  if (opts?.activeSlot && residual) {
    const slotResult = parseShortReplyForPendingSlot(residual, opts.activeSlot);
    if (slotResult.matched) {
      const extractedExtras = partial.extras;
      Object.assign(partial, slotResult.partial);
      if (extractedExtras || slotResult.partial.extras) {
        partial.extras = mergeExtras(extractedExtras, slotResult.partial.extras);
      }
      if (slotResult.filledSlot && !filledSlots.includes(slotResult.filledSlot)) {
        filledSlots.push(slotResult.filledSlot);
      }
      residual = "";
    }
  }

  residual = residual.replace(/\b(?:and|then|also|please|make\s+it)\b/gi, " ").replace(/\s+/g, " ").trim();

  if (partial.extras?.length) {
    partial.extras = sanitizeListingExtras(
      { ...base, ...partial } as SkyAiListingFill,
      partial.extras
    );
  }

  return { partial, filledSlots, residual, notes };
}
