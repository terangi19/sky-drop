/**
 * Product-quality UX helpers for Āwhina — proactive clarify, compare, education,
 * listing suggestions, search intelligence, progress states. Pure functions;
 * wire from canonical/search/route. Never invent listing facts.
 */

import { extractFindSearchTerm, parseFindBudget, parseFindCity } from "./sky-ai-find-routing";
import { parseConditionFilter } from "./awhina-search-memory";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { PendingClarification, SearchMissingSlot } from "./awhina-task-scope";
import {
  buildListingDescriptionFromFacts,
  isRoboticListingDescription,
  passesListingDescriptionQualityGate,
  resolveListingDescriptionStyle,
  cleanRentalItemName,
  IMPLY_CLAIMS_RE,
  SERVICE_INVENTION_RE,
  type ListingDescriptionQuality,
  type ListingDescriptionStyle,
} from "./awhina-listing-description";

export {
  buildListingDescriptionFromFacts,
  isRoboticListingDescription,
  passesListingDescriptionQualityGate,
  resolveListingDescriptionStyle,
  cleanRentalItemName,
  IMPLY_CLAIMS_RE,
  SERVICE_INVENTION_RE,
};
export type { ListingDescriptionQuality, ListingDescriptionStyle };
import { isClarificationOpen } from "./awhina-task-scope";
import {
  hasExplicitSellSwitch,
  hasListingSellIntent,
  hasRentalOfferingIntent,
  hasSearchIntentLanguage,
  hasServiceOfferingIntent,
} from "./sky-ai-intent";
import {
  buildClarificationCopy,
  inferClarificationSearchType,
  type ClarificationSearchType,
} from "./awhina-clarification-copy";

const NEED_RE =
  /\b(i\s+need\s+(?:a|an|some|someone)|looking for|want to buy|wanna buy|want a|want an|i want a|i want an|need a|need an|need someone|hunting for|anyone selling)\b/i;

const EDITION_RE = /\b(disc|digital|disk|slim|fat|bundle|with\s+games?|no\s+controller)\b/i;
const CONDITION_HINT = /\b(new|used|like new|excellent|good|fair|refurbished|mint)\b/i;
const DELIVERY_HINT = /\b(pickup|pick up|shipping|deliver(?:y|ed)?|postage)\b/i;
const BARE_NZ_CITY_RE =
  /^(only\s+)?(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|new plymouth|rotorua|queenstown|invercargill|nelson|whangarei|gisborne)\s*(only)?$/i;

const CONSOLE_RE = /\b(ps5|ps4|playstation|xbox(?:\s*series)?\s*[sx]?|nintendo\s*switch|switch)\b/i;
const PHONE_RE = /\b(iphone|samsung|pixel|android\s*phone|galaxy)\b/i;

const SAFETY_EDU_RE =
  /\b(scam|scams|sketchy|suspicious|is this (safe|legit)|safe (?:to )?(?:buy|meet|pickup|pick up)|how (?:do i|to) (?:stay )?safe|avoid scams?|meet(?:ing)? (?:safely|in public)|trust (?:this|the )?seller|too good to be true)\b/i;

const COMPARE_RE =
  /\b(compare(?:\s+(?:these|those|the))?(?:\s+two)?|which (?:is |one'?s )?better|difference between|vs\.?|versus)\b/i;

const ACTION_NAV_RE =
  /\b(open|go to|take me to|show me|navigate to|bring me to)\s+(messages?|inbox|sell|profile|search|home|vehicles?|services?|rentals?|digital)\b/i;

const ANSWER_Q_RE =
  /\b(how (?:do|does|can|to)|what (?:is|are|does)|is (?:it|this|sky drop)|why|can i|do you|tell me about|explain)\b/i;

export type ListingFacts = {
  id?: string;
  title?: string;
  price?: string | number | null;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  mileage?: string | number | null;
  condition?: string | null;
  location?: string | null;
  /** Seller reputation only if provided — never invent */
  sellerReputation?: string | null;
  delivery?: string | null;
  listingAge?: string | null;
  category?: string | null;
  createdAtMs?: number | null;
  extras?: string[];
};

export type AwhinaProgressState =
  | "understanding_request"
  | "searching_listings"
  | "comparing_results"
  | "analysing_images"
  | "preparing_answer";

export const AWHINA_PROGRESS_LABELS: Record<AwhinaProgressState, string> = {
  understanding_request: "Understanding your request…",
  searching_listings: "Searching listings…",
  comparing_results: "Comparing results…",
  analysing_images: "Analysing images…",
  preparing_answer: "Preparing answer…",
};

/** Vague shopping need worth one clarifying question before searching. */
export function isVagueShoppingNeed(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 120) return false;
  if (!NEED_RE.test(m) && !/^(ps5|xbox|iphone|switch)\b/i.test(m)) return false;
  if (parseFindBudget(m)) return false;
  if (parseFindCity(m)) return false;
  if (EDITION_RE.test(m)) return false;
  if (CONDITION_HINT.test(m) && DELIVERY_HINT.test(m)) return false;
  if (/\b(under|up to|max|budget|near|in auckland|in wellington)\b/i.test(m)) return false;
  const term = extractFindSearchTerm(m);
  if (term === "what you're after" || term.length < 2) return false;
  if (/\b(bmw|toyota|mazda|honda|ford|nissan|subaru|hyundai|kia|audi|mercedes|volkswagen|vw)\b/i.test(term)) {
    return false;
  }
  if (/\b(find me|show me|search for)\b/i.test(m) && (parseFindBudget(m) || parseFindCity(m))) {
    return false;
  }
  if (/\b(find(?: me)?|show me|search for)\b/i.test(m) && !NEED_RE.test(m)) {
    return false;
  }
  return true;
}

export function extractShoppingItem(message: string): string {
  const term = extractFindSearchTerm(message);
  if (term !== "what you're after") return term;
  const m = message.match(
    /\b(?:need|looking for|want(?:\s+to\s+buy)?)\s+(?:a|an|some)?\s*(.+)$/i
  );
  return (m?.[1] || message).trim().slice(0, 60);
}

/**
 * One concise clarifying question — material only, not an interrogation.
 * Wording comes from awhina-clarification-copy (type × slots), never hardcoded pickup for services.
 */
export function buildProactiveShoppingClarify(message: string): {
  reply: string;
  item: string;
  missingSlots: SearchMissingSlot[];
  searchType: ClarificationSearchType;
} {
  const item = extractShoppingItem(message);
  const lower = item.toLowerCase();
  const searchType = inferClarificationSearchType(message, item);

  if (CONSOLE_RE.test(lower) || CONSOLE_RE.test(message)) {
    const missingSlots: SearchMissingSlot[] = ["edition", "budget"];
    return {
      item,
      missingSlots,
      searchType,
      reply: buildClarificationCopy({
        activeTask: "shopping",
        searchType,
        message,
        item,
        missingSlots,
        phase: "proactive",
      }),
    };
  }
  if (PHONE_RE.test(lower) || PHONE_RE.test(message)) {
    const missingSlots: SearchMissingSlot[] = ["budget", "condition"];
    return {
      item,
      missingSlots,
      searchType,
      reply: buildClarificationCopy({
        activeTask: "shopping",
        searchType,
        message,
        item,
        missingSlots,
        phase: "proactive",
      }),
    };
  }
  const missingSlots: SearchMissingSlot[] = ["budget", "location"];
  return {
    item,
    missingSlots,
    searchType,
    reply: buildClarificationCopy({
      activeTask: "shopping",
      searchType,
      message,
      item,
      missingSlots,
      phase: "proactive",
    }),
  };
}

/**
 * Dialogue acknowledgements are CONTROL TOKENS — never search keywords.
 * yes/yep/yeah/yup/ok/okay/sure/go ahead/sounds good/alright/cool
 */
export function isSearchClarificationAffirmation(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 48) return false;
  return /^(yes|yep|yeah|yup|ya|ok|okay|sure|alright|all right|sounds good|go ahead|please|cool|y|k)([.!?,]*)?(\s+please)?$/i.test(
    m
  );
}

/** Soft location parse — bare NZ city names count as location slots. */
function parseSearchLocationSlot(message: string): string | undefined {
  const city = parseFindCity(message);
  if (city) return city;
  const bare = message.trim().match(BARE_NZ_CITY_RE);
  if (!bare?.[2]) return undefined;
  return bare[2]
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Strip dialogue-only fragments from a search query; keep quoted product text. */
export function sanitizeSearchQueryText(query: string): string {
  if (!query) return query;
  const preserved: string[] = [];
  let q = query.replace(/"([^"]+)"|'([^']+)'/g, (_m, d, s) => {
    const idx = preserved.length;
    preserved.push(d || s || "");
    return `__Q${idx}__`;
  });
  q = q
    .replace(
      /(^|\s)(yes|yep|yeah|yup|ya|ok|okay|sure|alright|all\s+right|sounds\s+good|go\s+ahead|please|cool)(?=\s|$|[.,!?])/gi,
      " "
    )
    .replace(/\b(find|search|show|list)\s+listings?\b/gi, " ")
    .replace(/\blistings?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  q = q.replace(/__Q(\d+)__/g, (_m, i) => {
    const text = preserved[Number(i)] || "";
    return text ? `"${text}"` : "";
  });
  return q.replace(/\s+/g, " ").trim();
}

/** Explicit search execute while a shopping clarify is pending. */
export function isExplicitPendingSearchExecute(
  message: string,
  pendingItem?: string
): boolean {
  const m = message.trim();
  if (!m || isSearchClarificationAffirmation(m)) return false;
  if (hasExplicitSellSwitch(m) || hasListingSellIntent(m)) return false;
  if (hasServiceOfferingIntent(m) || hasRentalOfferingIntent(m)) return false;
  if (/\b(find|search|show|list)\b/i.test(m) && /\blistings?\b/i.test(m)) return true;
  if (pendingItem) {
    const esc = pendingItem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      new RegExp(
        `\\b(find|search(?:\\s+for)?|show)\\b[\\s\\S]*\\b${esc}\\b`,
        "i"
      ).test(m)
    ) {
      return true;
    }
  }
  return false;
}

/** High-confidence intent that must cancel an open clarification (NEW INTENT WINS). */
export function detectPendingClarificationOverride(
  message: string,
  pending?: PendingClarification | null
): null | {
  reason: "sell" | "search" | "service" | "rental" | "new_shop_need";
  toTask: "selling" | "shopping";
} {
  if (!isClarificationOpen(pending)) return null;
  const m = message.trim();
  if (!m) return null;
  if (isSearchClarificationAffirmation(m)) return null;

  // Slot fills continue the pending flow
  if (
    pending.kind === "search_slots" &&
    (parseFindBudget(m) ||
      parseSearchLocationSlot(m) ||
      EDITION_RE.test(m) ||
      CONDITION_HINT.test(m) ||
      DELIVERY_HINT.test(m))
  ) {
    return null;
  }
  if (
    pending.kind === "search_slots" &&
    isExplicitPendingSearchExecute(m, pending.item || pending.knownEntities?.item)
  ) {
    return null;
  }

  if (hasServiceOfferingIntent(m)) return { reason: "service", toTask: "selling" };
  if (hasRentalOfferingIntent(m)) return { reason: "rental", toTask: "selling" };
  if (hasExplicitSellSwitch(m) || hasListingSellIntent(m)) {
    return { reason: "sell", toTask: "selling" };
  }

  if (pending.kind === "search_slots" && isVagueShoppingNeed(m)) {
    const newItem = extractShoppingItem(m).toLowerCase().trim();
    const oldItem = (
      pending.item ||
      pending.knownEntities?.item ||
      ""
    )
      .toLowerCase()
      .trim();
    if (
      newItem &&
      oldItem &&
      newItem !== oldItem &&
      !newItem.includes(oldItem) &&
      !oldItem.includes(newItem)
    ) {
      return { reason: "new_shop_need", toTask: "shopping" };
    }
  }

  // Explicit find/search language for a different product while buy/sell clarify open
  if (
    (pending.kind === "buy_vs_sell" || pending.kind === "listing_type") &&
    hasSearchIntentLanguage(m)
  ) {
    return { reason: "search", toTask: "shopping" };
  }

  return null;
}

/** Which search slots this answer fills. */
export function slotsFilledBySearchAnswer(message: string): SearchMissingSlot[] {
  const m = message.trim();
  const filled: SearchMissingSlot[] = [];
  if (parseFindBudget(m) || /\b(under|up to|max|budget)\b/i.test(m)) {
    filled.push("budget");
  }
  if (parseSearchLocationSlot(m)) filled.push("location");
  if (EDITION_RE.test(m)) filled.push("edition");
  if (CONDITION_HINT.test(m)) filled.push("condition");
  return filled;
}

export function remainingSearchSlots(
  missing: SearchMissingSlot[] | undefined,
  answer: string
): SearchMissingSlot[] {
  const base = missing?.length ? missing : (["budget", "location"] as SearchMissingSlot[]);
  const filled = new Set(slotsFilledBySearchAnswer(answer));
  return base.filter((s) => !filled.has(s));
}

/** Any material slot from the pending set is enough to run search. */
export function hasEnoughSearchSlotInfo(
  missing: SearchMissingSlot[] | undefined,
  answer: string
): boolean {
  const base = missing?.length ? missing : (["budget", "location"] as SearchMissingSlot[]);
  return remainingSearchSlots(base, answer).length < base.length;
}

/** One follow-up for still-missing slots after an affirmation. */
export function buildPendingSearchSlotAsk(
  item: string,
  missing: SearchMissingSlot[] | undefined,
  opts?: {
    message?: string;
    searchType?: ClarificationSearchType | string;
  }
): string {
  const slots = missing?.length ? missing : (["budget", "location"] as SearchMissingSlot[]);
  const label = item || "that";
  const searchType =
    (opts?.searchType as ClarificationSearchType | undefined) ||
    inferClarificationSearchType(opts?.message || "", label);
  return buildClarificationCopy({
    activeTask: "shopping",
    searchType,
    message: opts?.message,
    item: label,
    missingSlots: slots,
    phase: "followup",
  });
}

/**
 * True when the message answers a pending shopping clarification with real slot data.
 * Never treat sell/search/service/rental intent phrases as slot answers.
 */
export function isShoppingClarifyAnswer(
  message: string,
  pendingItem?: string
): boolean {
  if (!pendingItem) return false;
  const m = message.trim();
  if (!m || m.length > 100) return false;
  if (isSearchClarificationAffirmation(m)) return false;
  if (isExplicitPendingSearchExecute(m, pendingItem)) return false;
  if (hasExplicitSellSwitch(m) || hasListingSellIntent(m)) return false;
  if (hasServiceOfferingIntent(m) || hasRentalOfferingIntent(m)) return false;
  if (isVagueShoppingNeed(m)) return false;
  if (hasSearchIntentLanguage(m) && !parseFindBudget(m) && !parseSearchLocationSlot(m)) {
    return false;
  }
  if (parseFindBudget(m) || parseSearchLocationSlot(m) || EDITION_RE.test(m) || CONDITION_HINT.test(m)) {
    return true;
  }
  if (DELIVERY_HINT.test(m)) return true;
  // Short answers only when they look like slot values — not free intent phrases
  if (m.split(/\s+/).length <= 6) {
    if (/^(under|up to|max|budget|in|near|around)\b/i.test(m)) return true;
    if (parseSearchLocationSlot(m) || parseFindBudget(m)) return true;
    if (EDITION_RE.test(m) || CONDITION_HINT.test(m) || DELIVERY_HINT.test(m)) return true;
    // Bare city / budget-ish tokens already covered; reject generic short messages
    return false;
  }
  return false;
}

/**
 * Build a canonical find message from structured pending item + slot answer.
 * Never concatenates acknowledgements or raw prior conversation.
 */
export function mergeClarifyIntoSearchMessage(
  pendingItem: string,
  answer: string
): string {
  const item = sanitizeSearchQueryText(pendingItem).trim() || pendingItem.trim();
  const a = answer.trim();
  if (isSearchClarificationAffirmation(a) || isExplicitPendingSearchExecute(a, pendingItem)) {
    return `find ${item}`.trim();
  }
  const budget = parseFindBudget(a);
  const city = parseSearchLocationSlot(a);
  const parts = [`find ${item}`];
  if (budget) parts.push(`under ${budget}`);
  if (city) parts.push(`in ${city}`);
  const edition = a.match(EDITION_RE)?.[1];
  if (edition) parts.push(edition);
  const condition = a.match(CONDITION_HINT)?.[1];
  if (condition && !edition) parts.push(condition);
  // If structured extract found nothing material, sanitize residual answer text
  if (parts.length === 1) {
    const cleaned = sanitizeSearchQueryText(a);
    if (cleaned && cleaned.toLowerCase() !== item.toLowerCase()) {
      parts.push(cleaned);
    }
  }
  return parts.join(" ").trim();
}

/** Marketplace education — messaging-first V1 only. No Buy Now / Stripe / escrow. Answer in place. */
export function tryMarketplaceEducationReply(message: string): string | null {
  if (!SAFETY_EDU_RE.test(message)) return null;
  return [
    "Stay on **Sky Drop Messages** for the deal — don't move to WhatsApp/email for payment.",
    "Agree price, payment method, and pickup/delivery in chat before you pay.",
    "Prefer public pickup spots, verify the item in person, and never send money to 'hold' an item you haven't seen.",
    "If something feels off, don't pay — use **Report** on the listing. Say **open messages** when you want the inbox.",
  ].join(" ");
}

export function isCompareRequest(message: string): boolean {
  return COMPARE_RE.test(message.trim());
}

/** Explicit ACTION navigation — not informational Qs. */
export function isExplicitNavigationAction(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (ACTION_NAV_RE.test(m)) return true;
  if (/^(messages?|inbox|sell|profile|home|vehicles?|services?|rentals?|digital)$/i.test(m)) {
    return true;
  }
  return false;
}

/**
 * ANSWER vs ACTION: help/safety/marketplace Qs stay in place; navigate only for actions.
 */
export function shouldAutoNavigate(opts: {
  message: string;
  intent?: string;
  hasExplicitNavAction?: boolean;
}): boolean {
  const m = opts.message.trim();
  if (opts.hasExplicitNavAction || isExplicitNavigationAction(m)) return true;
  if (opts.intent === "education" || opts.intent === "general_question") return false;
  if (SAFETY_EDU_RE.test(m)) return false;
  if (ANSWER_Q_RE.test(m) && !ACTION_NAV_RE.test(m)) return false;
  if (/\b(how do i (?:pay|buy|arrange)|contact seller|message seller|bank transfer)\b/i.test(m)) {
    // Explain in place unless they asked to open messages
    return false;
  }
  return true;
}

function parsePriceNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return !Number.isNaN(n) && n > 0 ? n : null;
}

function parseMileageNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return !Number.isNaN(n) && n > 0 ? n : null;
}

function parseYearNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return !Number.isNaN(n) && n >= 1950 && n <= 2100 ? n : null;
}

function formatFactLine(l: ListingFacts, i: number): string {
  const bits: string[] = [`**${i + 1}. ${String(l.title || "Listing").trim()}**`];
  const price = parsePriceNum(l.price);
  bits.push(price != null ? `$${price.toLocaleString("en-NZ")}` : "price not listed");
  const year = parseYearNum(l.year);
  if (year) bits.push(String(year));
  const mm = [l.make, l.model].filter(Boolean).join(" ");
  if (mm) bits.push(mm);
  const miles = parseMileageNum(l.mileage);
  if (miles != null) bits.push(`${miles.toLocaleString("en-NZ")} km`);
  else if (l.mileage) bits.push(String(l.mileage));
  if (l.condition) bits.push(String(l.condition));
  else bits.push("condition not listed");
  if (l.location) bits.push(String(l.location));
  else bits.push("location not listed");
  if (l.delivery) bits.push(l.delivery);
  if (l.listingAge) bits.push(l.listingAge);
  if (l.sellerReputation) bits.push(`seller ${l.sellerReputation}`);
  if (l.category) bits.push(String(l.category));
  return bits.join(" · ");
}

/**
 * Summarize known facts only. Axes (cheapest/newest/etc.) only when real data exists.
 * Never invent missing price/condition/reputation/location. If not enough for "best", say so.
 * Titles alone are not enough — require ≥2 listings with real fields before comparing.
 */
export function summarizeListingComparison(
  listings: ListingFacts[],
  opts?: { emptyHint?: string }
): string {
  const withTitle = listings.filter((l) => l.title && String(l.title).trim().length > 0).slice(0, 4);
  const usable = withTitle.filter(listingHasRealFacts);
  if (usable.length < 2) {
    return (
      opts?.emptyHint ||
      "Open or select two listings so I can compare real fields (price, condition, location, mileage) — I won't rank winners from titles alone."
    );
  }

  const lines = usable.map((l, i) => formatFactLine(l, i));

  const axes: string[] = [];
  const prices = usable
    .map((l, i) => ({ i, n: parsePriceNum(l.price) }))
    .filter((x): x is { i: number; n: number } => x.n != null);
  if (prices.length >= 2) {
    const cheapest = prices.reduce((a, b) => (b.n < a.n ? b : a));
    axes.push(`**Cheapest:** ${usable[cheapest.i].title} ($${cheapest.n.toLocaleString("en-NZ")})`);
  }

  const ages = usable
    .map((l, i) => ({ i, n: l.createdAtMs }))
    .filter((x): x is { i: number; n: number } => typeof x.n === "number" && x.n > 0);
  if (ages.length >= 2) {
    const newest = ages.reduce((a, b) => (b.n > a.n ? b : a));
    axes.push(`**Newest:** ${usable[newest.i].title}`);
  }

  const locs = usable.map((l) => (l.location || "").trim()).filter(Boolean);
  if (locs.length >= 2 && new Set(locs.map((x) => x.toLowerCase())).size >= 2) {
    axes.push(`**Closest:** depends where you are — locations differ (${[...new Set(locs)].slice(0, 3).join(", ")}).`);
  }

  const miles = usable
    .map((l, i) => ({ i, n: parseMileageNum(l.mileage) }))
    .filter((x): x is { i: number; n: number } => x.n != null);
  if (miles.length >= 2) {
    const low = miles.reduce((a, b) => (b.n < a.n ? b : a));
    axes.push(`**Lower mileage:** ${usable[low.i].title} (${low.n.toLocaleString("en-NZ")} km)`);
  }

  const reps = usable
    .map((l, i) => {
      const m = String(l.sellerReputation || "").match(/([\d.]+)\s*★/);
      const rating = m ? Number(m[1]) : null;
      return { i, rating, raw: l.sellerReputation };
    })
    .filter((x) => x.rating != null && !Number.isNaN(x.rating!));
  if (reps.length >= 2) {
    const best = reps.reduce((a, b) => ((b.rating || 0) > (a.rating || 0) ? b : a));
    axes.push(`**Stronger reputation:** ${usable[best.i].title} (${best.raw})`);
  }

  const tradeOffs: string[] = [];
  if (prices.length >= 2) {
    const min = Math.min(...prices.map((p) => p.n));
    const max = Math.max(...prices.map((p) => p.n));
    if (min !== max) {
      tradeOffs.push(`Price span $${min.toLocaleString("en-NZ")}–$${max.toLocaleString("en-NZ")}.`);
    }
  }
  const conds = new Set(usable.map((l) => (l.condition || "").toLowerCase()).filter(Boolean));
  if (conds.size >= 2) tradeOffs.push("Conditions differ — check photos and description.");
  if (miles.length >= 1 && prices.length >= 2) {
    tradeOffs.push("Trade-off: cheaper isn't always lower km — weigh both.");
  }

  const knownAxes = prices.length + ages.length + miles.length + reps.length;
  const enoughForBest = knownAxes >= 4 && prices.length >= 2;
  const bestLine = enoughForBest
    ? "Enough shared fields to spot clear leaders on price/age/km — still check photos before you message."
    : "Not enough shared fields to declare an overall **best** — use the axes above and open each listing for photos.";

  return [
    "Side-by-side from listing fields only (nothing invented):",
    ...lines,
    axes.length ? axes.join("\n") : null,
    tradeOffs.length ? `Trade-offs: ${tradeOffs.join(" ")}` : null,
    bestLine,
    "Message the seller on the one you prefer to arrange payment and pickup.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Extract up to two listing titles from user text like "compare A and B". */
export function parseCompareTitlesFromMessage(message: string): string[] {
  const m = message.trim();
  const vs = m.match(
    /compare\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)(?:\?|$)/i
  );
  if (vs) {
    return [vs[1].trim().slice(0, 80), vs[2].trim().slice(0, 80)].filter(Boolean);
  }
  return [];
}

function titleMatchScore(needle: string, hay: string): number {
  const a = needle.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const b = hay.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 80;
  const aw = new Set(a.split(" ").filter((w) => w.length > 1));
  const bw = b.split(" ").filter((w) => w.length > 1);
  let hit = 0;
  for (const w of bw) if (aw.has(w)) hit++;
  if (!aw.size) return 0;
  return Math.round((hit / aw.size) * 60);
}

/** Match compare titles against client-visible listings — facts only. */
export function pickCompareFactsFromPage(
  titles: string[],
  pageListings: ListingFacts[]
): ListingFacts[] {
  if (!titles.length) {
    return pageListings.filter((l) => l.title).slice(0, 4);
  }
  if (!pageListings.length) return titles.map((title) => ({ title }));
  const used = new Set<number>();
  const out: ListingFacts[] = [];
  for (const needle of titles) {
    let bestIdx = -1;
    let bestScore = 0;
    pageListings.forEach((l, i) => {
      if (used.has(i)) return;
      const score = titleMatchScore(needle, String(l.title || ""));
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && bestScore >= 40) {
      used.add(bestIdx);
      out.push(pageListings[bestIdx]);
    } else {
      out.push({ title: needle });
    }
  }
  return out;
}

function listingHasRealFacts(l: ListingFacts): boolean {
  return Boolean(
    l.price ||
      l.condition ||
      l.location ||
      l.mileage ||
      l.year ||
      l.sellerReputation ||
      l.delivery ||
      l.make
  );
}

/**
 * Single grounded compare pathway — resolve facts once from page listings
 * (and optional pre-fetched docs). Never invent; never title-only-then-patch.
 */
export function resolveGroundedCompare(opts: {
  message: string;
  pageListings?: ListingFacts[];
  compareCandidates?: string[];
}): {
  titles: string[];
  facts: ListingFacts[];
  grounded: boolean;
  needsEnrichment: boolean;
} {
  const page = opts.pageListings || [];
  const titlesFromMsg = parseCompareTitlesFromMessage(opts.message);
  const titles =
    titlesFromMsg.length >= 2
      ? titlesFromMsg
      : (opts.compareCandidates || []).filter(Boolean).slice(0, 4);

  let facts: ListingFacts[];
  if (page.length >= 2 && titles.length < 2) {
    facts = page.slice(0, 4);
  } else if (titles.length || page.length) {
    facts = pickCompareFactsFromPage(
      titles.length ? titles : page.map((p) => String(p.title || "")).filter(Boolean).slice(0, 2),
      page
    );
  } else {
    facts = [];
  }

  const grounded = facts.filter(listingHasRealFacts).length >= 2;
  const needsEnrichment =
    !grounded &&
    (titles.length >= 2 || (opts.compareCandidates || []).length >= 2) &&
    page.filter(listingHasRealFacts).length < 2;

  return {
    titles: titles.length ? titles : facts.map((f) => String(f.title || "")).filter(Boolean),
    facts,
    grounded,
    needsEnrichment,
  };
}

/** Build compare reply from one grounded resolution (no second pass). */
export function buildGroundedCompareReply(opts: {
  message: string;
  pageListings?: ListingFacts[];
  compareCandidates?: string[];
}): { reply: string; facts: ListingFacts[]; titles: string[]; grounded: boolean } {
  const resolved = resolveGroundedCompare(opts);
  if (!resolved.grounded) {
    return {
      reply:
        "Open or select two listings so I can compare real fields (price, condition, location, mileage) — I won't rank winners from titles alone.",
      facts: resolved.facts,
      titles: resolved.titles,
      grounded: false,
    };
  }
  return {
    reply: summarizeListingComparison(resolved.facts),
    facts: resolved.facts,
    titles: resolved.titles,
    grounded: resolved.grounded,
  };
}

/**
 * After draft fill — at most 1–2 useful suggestions. Don't overwhelm.
 */
export function suggestListingImprovements(fill: SkyAiListingFill): string | null {
  const tips: string[] = [];
  const title = (fill.title || "").trim();
  const price = Number(String(fill.price || "").replace(/[^\d.]/g, ""));
  const desc = (fill.description || "").toLowerCase();

  if (title && title.split(/\s+/).length <= 2 && !/\d/.test(title)) {
    tips.push("a clearer title (model + key detail)");
  }
  if (!Number.isNaN(price) && price > 0) {
    if (price < 5) tips.push("double-checking that price — it looks unusually low");
    if (/\b(ps5|playstation\s*5)\b/i.test(title) && (price < 150 || price > 1200)) {
      tips.push("checking the price against recent NZ listings");
    }
  }
  if (fill.category === "Cars" && fill.listingType === "physical") {
    tips.push("confirming category — this may belong under Vehicles");
  }

  if (!tips.length) return null;
  const shown = tips.slice(0, 2);
  return `Quick tip: consider ${shown.join(" and ")}.`;
}

/** Normalize common product shorthand — no invented editions/accessories. */
export function normalizeProductName(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  s = s.replace(/\bps\s*5\b/gi, "PlayStation 5");
  s = s.replace(/\bps\s*4\b/gi, "PlayStation 4");
  s = s.replace(/\bplaystation\s*5\b/gi, "PlayStation 5");
  s = s.replace(/\bplaystation\s*4\b/gi, "PlayStation 4");
  s = s.replace(/\bxbox\s*series\s*x\b/gi, "Xbox Series X");
  s = s.replace(/\bxbox\s*series\s*s\b/gi, "Xbox Series S");
  s = s.replace(/\biphone\b/gi, "iPhone");
  s = s.replace(/\bairpods\b/gi, "AirPods");
  s = s.replace(/\bbmw\b/gi, "BMW");
  return s;
}

function titleCaseProduct(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => {
      if (/^(iPhone|iPad|iPod|AirPods|BMW|USB|HDMI|GB|TB|Pro|Max|Plus|WRX)$/i.test(w)) {
        if (/^iphone$/i.test(w)) return "iPhone";
        if (/^ipad$/i.test(w)) return "iPad";
        if (/^airpods$/i.test(w)) return "AirPods";
        if (/^bmw$/i.test(w)) return "BMW";
        if (/^wrx$/i.test(w)) return "WRX";
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
      if (/^rx-?[78]$/i.test(w)) return w.replace(/rx-?/i, "RX-");
      if (/^cx-?[35]$/i.test(w)) return w.replace(/cx-?/i, "CX-");
      if (/^r\d{2}$/i.test(w)) return w.toUpperCase();
      if (/^playstation$/i.test(w)) return "PlayStation";
      if (/^\d+$/.test(w)) return w;
      if (/^[1-8]\d{2}[a-z]$/i.test(w)) return w.toLowerCase();
      if (w.length <= 2 && /[a-z]/i.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Premium listing title from known item + condition only.
 * Target ~40–70 chars. Never invent editions/accessories.
 */
export function buildPremiumListingTitle(opts: {
  item: string;
  condition?: string;
  listingType?: string;
  vehicleYear?: string;
}): string {
  let core = normalizeProductName(opts.item)
    .replace(/\b(brand\s+new|its|it's|my|the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!core) core = normalizeProductName(opts.item);

  if (opts.listingType === "rental") {
    core = cleanRentalItemName(core) || core;
  }

  if (/^playstation\s*5$/i.test(core)) core = "PlayStation 5 Console";
  if (/^playstation\s*4$/i.test(core)) core = "PlayStation 4 Console";

  core = titleCaseProduct(core);

  if (opts.listingType === "vehicle" && opts.vehicleYear && !core.startsWith(opts.vehicleYear)) {
    core = `${opts.vehicleYear} ${core}`;
  }

  let prefix = "";
  if (opts.condition === "New" && !/\bbrand\s+new\b/i.test(core)) {
    prefix = "Brand New ";
  } else if (opts.condition === "Used - Like New" && !/\blike\s+new\b/i.test(core)) {
    prefix = "Like New ";
  }

  let title = `${prefix}${core}`.replace(/\s+/g, " ").trim();
  if (title.length > 70) title = title.slice(0, 70).replace(/\s+\S*$/, "").trim();
  if (title.length < 12 && opts.condition === "New") {
    title = `Brand New ${core}`.slice(0, 70);
  }
  return title.slice(0, 120);
}

/** Listing descriptions: see awhina-listing-description.ts (facts → type writer → quality pass). */

export function isCompleteListingDraft(fill: SkyAiListingFill): boolean {
  const hasTitle = Boolean(fill.title?.trim());
  const hasPrice = Boolean(fill.price && String(fill.price).trim());
  const hasCondition = Boolean(fill.condition?.trim());
  const hasLocation = Boolean(fill.location?.trim() || fill.pickupArea?.trim());
  return hasTitle && hasPrice && hasCondition && hasLocation;
}

/** Normalize title/desc/category/keywords from extracted facts. */
export function autoImproveListingDraft(fill: SkyAiListingFill): SkyAiListingFill {
  const out: SkyAiListingFill = { ...fill };
  const seed = (out.title || "").trim();
  if (seed) {
    const polished = buildPremiumListingTitle({
      item: seed
        .replace(/^(brand\s+new|like\s+new)\s+/i, "")
        .replace(/\bconsole\b/gi, "")
        .trim() || seed,
      condition: out.condition,
      listingType: out.listingType,
      vehicleYear: out.vehicleYear,
    });
    // Prefer polished when seed looks raw (short / slang / "Its Brand")
    if (
      /ps5|ps4|its brand|iphone|airpods/i.test(seed) ||
      seed.split(/\s+/).length <= 4 ||
      (out.condition === "New" && !/^brand\s+new/i.test(seed))
    ) {
      out.title = polished;
    } else {
      out.title = normalizeProductName(seed).slice(0, 120);
    }
  }
  if (isRoboticListingDescription(out.description)) {
    out.description = buildListingDescriptionFromFacts(out);
  } else if (out.description) {
    // Normalize product tokens but preserve paragraph breaks
    out.description = out.description
      .split(/\n{2,}/)
      .map((para) => normalizeProductName(para))
      .join("\n\n")
      .slice(0, 8000);
  }
  if (out.title && (!out.extras || out.extras.length === 0)) {
    const kw = out.title
      .replace(/\b(brand new|like new|console)\b/gi, "")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !/^(the|and|for|with)$/i.test(w))
      .slice(0, 8);
    if (kw.length) out.extras = kw;
  }
  return out;
}

/** Complete-draft outcome copy — not "Updated: condition…". */
export function buildCompleteDraftReply(fill: SkyAiListingFill): string {
  const title = fill.title || "your item";
  const lines = [
    "Your listing is ready.",
    "",
    `**Title:** ${title}`,
  ];
  if (fill.price) lines.push(`**Price:** $${fill.price}`);
  if (fill.condition) lines.push(`**Condition:** ${fill.condition}`);
  if (fill.category) lines.push(`**Category:** ${fill.category}`);
  if (fill.location) lines.push(`**Location:** ${fill.location}`);
  if (fill.pickupAvailable === true) {
    lines.push(
      fill.shippingAvailable === false ? "**Pickup:** Yes (pickup only)" : "**Pickup:** Yes"
    );
  }
  const desc = (fill.description || "").trim();
  if (desc) {
    const preview = desc.length > 160 ? `${desc.slice(0, 157)}…` : desc;
    lines.push("", "**Description preview:**", preview);
  }
  lines.push("", "Tip: add clear photos (item + any box/accessories), then hit **Publish** when you're ready.");
  return lines.join("\n");
}

/** Incomplete new listing — never "Started a draft for…". */
export function buildIncompleteDraftReply(fill: SkyAiListingFill, missing: string[]): string {
  const title = fill.title || "your item";
  if (missing.length > 0) {
    return `I've put **${title}** on the form. Still need: **${missing.join("**, **")}**.`;
  }
  return `I've put **${title}** on the form. Add photos, then hit **Publish** when you're ready.`;
}

/**
 * Natural follow-up after field changes — never "Updated: price, condition".
 */
export function buildDraftUpdateReply(
  fill: SkyAiListingFill,
  notes: string[],
  opts?: { suggestion?: string | null }
): string {
  if (isCompleteListingDraft(fill)) {
    return buildCompleteDraftReply(fill);
  }
  const cleaned = notes
    .map((n) => n.trim())
    .filter((n) => n && !/^draft\b/i.test(n));
  let lead: string;
  if (cleaned.length === 1) {
    const n = cleaned[0];
    if (/^price\s+\$/i.test(n)) lead = `Set ${n.replace(/^price\s+/i, "price to ")}.`;
    else if (/^condition\b/i.test(n)) lead = `Noted — ${n}.`;
    else if (/^location\b/i.test(n)) lead = `Location set to ${n.replace(/^location\s+/i, "")}.`;
    else if (/^pickup\b/i.test(n)) lead = `Marked as ${n}.`;
    else lead = `Got it — ${n}.`;
  } else if (cleaned.length > 1) {
    lead = `Got it — ${cleaned.join(", ")}.`;
  } else {
    lead = "Got those details on the form.";
  }
  const missing: string[] = [];
  if (!fill.price) missing.push("price");
  if (!fill.condition) missing.push("condition");
  if (!fill.location) missing.push("location");
  const follow =
    missing.length > 0
      ? ` Still need **${missing.join("**, **")}**.`
      : " Add photos, then hit **Publish** when you're ready.";
  const tip = opts?.suggestion ? ` ${opts.suggestion}` : "";
  return `${lead}${follow}${tip}`.replace(/\s+/g, " ").trim();
}

/**
 * Replace giant post_listing chatbot menu with 1–2 contextual next actions.
 * No Facebook / Trade Me export.
 */
export function buildPostListingNextActions(
  fill?: SkyAiListingFill | null,
  opts?: { hasPhotos?: boolean; vagueFollowUp?: boolean }
): string {
  const actions: string[] = [];
  const desc = (fill?.description || "").trim();
  const title = (fill?.title || "").trim();
  const hasPhotos = opts?.hasPhotos === true;

  if (!hasPhotos) {
    actions.push("Add photos above, then hit **Publish** when you're ready.");
  } else {
    actions.push("Hit **Publish** below to go live.");
  }

  if (!desc || desc.length < 40) {
    actions.push("Want a tighter description? Tell me what to emphasise.");
  } else if (title && title.split(/\s+/).length <= 2) {
    actions.push("I can sharpen the title if you like.");
  } else {
    const tip = fill ? suggestListingImprovements(fill) : null;
    if (tip) actions.push(tip);
  }

  const shown = actions.slice(0, 2);
  if (opts?.vagueFollowUp) {
    return shown.join(" ");
  }
  return shown.join(" ");
}

/** Delight-style search reply fragments — natural, not chatty. Never invent counts. */
export function delightSearchLead(opts: {
  query?: string;
  location?: string;
  sortBy?: string;
  hideSold?: boolean;
  condition?: string;
  /** Only pass when you have a real result count */
  countHint?: number;
}): string {
  const q = opts.query || "listings";
  const bits: string[] = [];

  if (typeof opts.countHint === "number" && opts.countHint > 0) {
    if (opts.location) {
      bits.push(
        opts.countHint === 1
          ? `1 match near ${opts.location}`
          : `${opts.countHint} near ${opts.location}`
      );
    } else {
      bits.push(opts.countHint === 1 ? "1 match" : `${opts.countHint} matches`);
    }
  } else if (opts.location && opts.sortBy === "distance") {
    bits.push(`Closest **${q}** near **${opts.location}**`);
  } else if (opts.sortBy === "price-low") {
    bits.push(`Cheapest **${q}** first`);
  } else if (opts.sortBy === "newest") {
    bits.push(`Newest **${q}** first`);
  } else if (opts.location) {
    bits.push(`**${q}** in **${opts.location}**`);
  } else {
    bits.push(`**${q}** listings`);
  }

  if (opts.condition) bits.push(`${opts.condition} only`);
  if (opts.hideSold) bits.push("hiding sold");

  return bits.join(" · ");
}

/**
 * Premium search summary — real counts/cheapest/newest only when provided. Never invent.
 */
export function buildPremiumSearchSummary(opts: {
  query: string;
  location?: string;
  sortBy?: string;
  hideSold?: boolean;
  condition?: string;
  /** Real count from search results — omit until known */
  count?: number;
  cheapestPrice?: number;
  newestTitle?: string;
}): string {
  const lead = delightSearchLead({
    query: opts.query,
    location: opts.location,
    sortBy: opts.sortBy,
    hideSold: opts.hideSold,
    condition: opts.condition,
    countHint: typeof opts.count === "number" ? opts.count : undefined,
  });

  const extras: string[] = [];
  if (typeof opts.count === "number" && opts.count > 0) {
    if (typeof opts.cheapestPrice === "number" && opts.cheapestPrice > 0) {
      extras.push(`from $${opts.cheapestPrice.toLocaleString("en-NZ")}`);
    }
    if (opts.newestTitle) {
      extras.push(`newest: ${opts.newestTitle.slice(0, 48)}`);
    }
  }

  if (typeof opts.count === "number" && opts.count === 0) {
    return `No listings matched **${opts.query}** with those filters.`;
  }

  return extras.length ? `${lead} — ${extras.join(" · ")}.` : `${lead}.`;
}

export type SearchRelaxation = {
  whatChanged: string;
  filters: {
    maxPrice?: string;
    location?: string;
    minYear?: string;
    maxYear?: string;
    year?: string;
    condition?: string;
    query?: string;
  };
};

/**
 * Propose one grounded filter relaxation for no-result follow-up.
 * Caller must run a real search and report what changed — never invent counts.
 */
export function proposeSearchRelaxation(filters: {
  query?: string;
  maxPrice?: string;
  location?: string;
  year?: string;
  minYear?: string;
  maxYear?: string;
  condition?: string;
}): SearchRelaxation | null {
  if (filters.maxPrice) {
    const n = Number(filters.maxPrice);
    if (!Number.isNaN(n) && n > 0) {
      const bumped = Math.round(n * 1.25);
      return {
        whatChanged: `raised budget from $${n.toLocaleString("en-NZ")} to $${bumped.toLocaleString("en-NZ")}`,
        filters: { ...filters, maxPrice: String(bumped) },
      };
    }
  }
  if (filters.location) {
    return {
      whatChanged: `dropped location filter (${filters.location})`,
      filters: { ...filters, location: undefined },
    };
  }
  if (filters.year || filters.minYear || filters.maxYear) {
    return {
      whatChanged: "widened year range",
      filters: {
        ...filters,
        year: undefined,
        minYear: filters.minYear
          ? String(Math.max(1990, Number(filters.minYear) - 3))
          : undefined,
        maxYear: filters.maxYear
          ? String(Number(filters.maxYear) + 3)
          : undefined,
      },
    };
  }
  if (filters.condition) {
    return {
      whatChanged: `dropped condition filter (${filters.condition})`,
      filters: { ...filters, condition: undefined },
    };
  }
  return null;
}

export function buildNoResultReply(opts: {
  query: string;
  whatChanged?: string;
  followUpCount?: number;
}): string {
  if (opts.whatChanged && typeof opts.followUpCount === "number") {
    if (opts.followUpCount > 0) {
      return `Nothing exact for **${opts.query}**. I ${opts.whatChanged} — now **${opts.followUpCount}** match${opts.followUpCount === 1 ? "" : "es"}.`;
    }
    return `Nothing exact for **${opts.query}**. I ${opts.whatChanged}, still no matches — try a broader term.`;
  }
  if (opts.whatChanged) {
    return `Nothing matched **${opts.query}**. I ${opts.whatChanged} — check the updated results.`;
  }
  return `Nothing matches **${opts.query}** with those filters. I can raise the budget, drop location, or widen the year — say which.`;
}

export function delightNoExactMatch(query: string): string {
  return buildNoResultReply({ query });
}

/** User reports empty results / asks to broaden. */
export function isNoResultFollowUp(message: string): boolean {
  return /\b(no results?|nothing (came up|showed|found|matches)|empty|try (broader|wider|again)|broaden|relax (the )?filters?|widen)\b/i.test(
    message.trim()
  );
}

/**
 * At most one contextual suggestion when evidence is strong — not every turn.
 */
export function maybeOneProactiveSuggestion(opts: {
  turnIndex?: number;
  lastSuggestedAt?: number;
  now?: number;
  evidence:
    | { kind: "listing_tip"; fill: SkyAiListingFill }
    | { kind: "search_refine"; hasBudget: boolean; hasLocation: boolean; query?: string }
    | { kind: "none" };
}): string | null {
  const now = opts.now ?? Date.now();
  if (opts.lastSuggestedAt && now - opts.lastSuggestedAt < 60_000) return null;
  if ((opts.turnIndex ?? 0) > 0 && (opts.turnIndex ?? 0) % 3 !== 0) {
    // throttle: only occasional turns unless strong
  }

  if (opts.evidence.kind === "listing_tip") {
    return suggestListingImprovements(opts.evidence.fill);
  }
  if (opts.evidence.kind === "search_refine") {
    const { hasBudget, hasLocation, query } = opts.evidence;
    if (query && !hasBudget && !hasLocation) {
      return `Tip: add a budget or city to narrow **${query}**.`;
    }
  }
  return null;
}

export function gracefulUncertaintyReply(topic?: string): string {
  if (topic) {
    return `I'm not sure about ${topic}. One quick detail and I can help — or say what you'd like to do next.`;
  }
  return "I'm not sure I follow. One short clarification and I'll take it from there.";
}

export function hasEnoughSearchSpecificity(message: string): boolean {
  return Boolean(
    parseFindBudget(message) ||
      parseFindCity(message) ||
      parseConditionFilter(message) ||
      EDITION_RE.test(message) ||
      DELIVERY_HINT.test(message)
  );
}

/** Polish reply style: trim Navigating spam / fake enthusiasm leftovers. */
export function polishAwhinaReplyStyle(reply: string): string {
  let r = reply.trim();
  r = r.replace(/\b(Navigating…|Navigating\.\.\.)/gi, "");
  r = r.replace(/\bOpening\s+(?=\*\*)/gi, "Showing ");
  r = r.replace(/\n{3,}/g, "\n\n");
  r = r.replace(/^(Awesome!|Amazing!|Fantastic!|So excited!)\s*/i, "");
  // Legacy field-mutation bot openers → premium operator tone
  r = r.replace(/^Updated:\s*/i, "");
  r = r.replace(/^Started a draft for\s+/i, "I've put ");
  r = r.replace(/\bdraft for\b/gi, "listing for");
  // Only collapse giant export menus (Facebook / Trade Me), not normal capability lists
  if (/Facebook Marketplace|Trade Me listing/i.test(r)) {
    if (/create listings for Facebook|Trade Me/i.test(r) || /What would you like to do next/i.test(r)) {
      r =
        "Your listing is ready. Add clear photos, then hit **Publish** when you're ready. Tell me if you want the title or description tightened.";
    } else {
      const lines = r.split("\n");
      const bullets = lines.filter((l) => /^[•\-\*]\s/.test(l.trim()));
      if (bullets.length > 4) {
        const kept = lines.filter((l) => !/^[•\-\*]\s/.test(l.trim()));
        r = [...kept.slice(0, 2), ...bullets.slice(0, 2)].join("\n").trim();
      }
    }
  }
  return r.replace(/ {2,}/g, " ").trim();
}

export function progressStatesForRoute(
  kind: "search" | "compare" | "vision" | "freeform" | "local" | "sell"
): AwhinaProgressState[] {
  if (kind === "local") return [];
  if (kind === "search") return ["understanding_request", "searching_listings", "preparing_answer"];
  if (kind === "compare") return ["understanding_request", "comparing_results", "preparing_answer"];
  if (kind === "vision") return ["understanding_request", "analysing_images", "preparing_answer"];
  if (kind === "sell") return ["understanding_request", "preparing_answer"];
  return ["understanding_request", "preparing_answer"];
}

/** Map canonical intent/tool → honest SSE phases (not fake Navigating spam). */
export function progressStatesForCanonical(opts: {
  intent?: string;
  tool?: string;
}): AwhinaProgressState[] {
  const intent = (opts.intent || "").toLowerCase();
  const tool = (opts.tool || "").toLowerCase();
  if (intent === "compare" || tool.includes("compare")) {
    return progressStatesForRoute("compare");
  }
  if (
    intent === "marketplace_search" ||
    tool === "searchlistings" ||
    intent.includes("search")
  ) {
    return progressStatesForRoute("search");
  }
  if (
    intent === "listing_create" ||
    intent === "listing_update" ||
    tool === "createlisting" ||
    tool === "updatelistingdraft"
  ) {
    return progressStatesForRoute("sell");
  }
  // Instant local nav / education — no fake progress
  return progressStatesForRoute("local");
}
