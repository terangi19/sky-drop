/**
 * Product-quality UX helpers for Āwhina — proactive clarify, compare, education,
 * listing suggestions, search intelligence, progress states. Pure functions;
 * wire from canonical/search/route. Never invent listing facts.
 */

import { extractFindSearchTerm, parseFindBudget, parseFindCity } from "./sky-ai-find-routing";
import { parseConditionFilter } from "./awhina-search-memory";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { normalizeServicePricingType } from "./service-pricing";

const NEED_RE =
  /\b(i\s+need\s+(?:a|an|some)|looking for|want to buy|wanna buy|want a|want an|i want a|i want an|need a|need an|hunting for|anyone selling)\b/i;

const EDITION_RE = /\b(disc|digital|disk|slim|fat|bundle|with\s+games?|no\s+controller)\b/i;
const CONDITION_HINT = /\b(new|used|like new|excellent|good|fair|refurbished|mint)\b/i;
const DELIVERY_HINT = /\b(pickup|pick up|shipping|deliver(?:y|ed)?|postage)\b/i;

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
 */
export function buildProactiveShoppingClarify(message: string): {
  reply: string;
  item: string;
} {
  const item = extractShoppingItem(message);
  const lower = item.toLowerCase();

  if (CONSOLE_RE.test(lower) || CONSOLE_RE.test(message)) {
    return {
      item,
      reply: `Happy to help find a **${item}**. Disc or digital — and roughly what budget?`,
    };
  }
  if (PHONE_RE.test(lower) || PHONE_RE.test(message)) {
    return {
      item,
      reply: `I can search for **${item}**. Rough budget, and new or used?`,
    };
  }
  return {
    item,
    reply: `I can search for **${item}**. Rough budget, or a city for pickup?`,
  };
}

/** True when the message answers a pending shopping clarification. */
export function isShoppingClarifyAnswer(
  message: string,
  pendingItem?: string
): boolean {
  if (!pendingItem) return false;
  const m = message.trim();
  if (!m || m.length > 100) return false;
  if (parseFindBudget(m) || parseFindCity(m) || EDITION_RE.test(m) || CONDITION_HINT.test(m)) {
    return true;
  }
  if (DELIVERY_HINT.test(m)) return true;
  if (m.split(/\s+/).length <= 6) return true;
  return false;
}

export function mergeClarifyIntoSearchMessage(
  pendingItem: string,
  answer: string
): string {
  return `find ${pendingItem} ${answer}`.trim();
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
      if (/^(iPhone|iPad|iPod|AirPods|BMW|USB|HDMI|GB|TB|Pro|Max|Plus)$/i.test(w)) {
        if (/^iphone$/i.test(w)) return "iPhone";
        if (/^ipad$/i.test(w)) return "iPad";
        if (/^airpods$/i.test(w)) return "AirPods";
        if (/^bmw$/i.test(w)) return "BMW";
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
      if (/^playstation$/i.test(w)) return "PlayStation";
      if (/^\d+$/.test(w)) return w;
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

/** Internal copy quality — Āwhina one-shot always uses Premium Plus. */
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
  | "general";

/** Field-label / template smells — reject and rewrite. */
const FIELD_LABEL_RE =
  /\b(Condition|Located in|Odometer|Colour|Color|Transmission|Fuel type|Pickup available|Shipping available)\s*:/i;

const BANNED_TEMPLATE_RE =
  /\bI'm selling this\b|\bThis item\b|\bMessage me with any questions\b|\bFeel free to get in touch if you'd like more information\b|\bIt's based in\b|\b— based in\b|\bLocated in\b|\bCan do pickup\b|\bAvailable around\b/i;

/** Composer / safety voice must never leak into buyer-facing listing copy. */
const IMPLEMENTATION_LEAK_RE =
  /\bno guesswork\b|\bbased on (the )?(available|provided|supplied) (details|information)\b|\busing only supplied\b|\bfrom the information provided\b|\bbased on what we know\b|\bverified facts only\b|\bI haven'?t assumed\b|\bI didn'?t invent\b|\bStraightforward listing with the details we have\b|\bdetails we have\b|\bfacts we know\b|\bknown details\b|\bwhat is known\b|\bhere is what we know\b|\bonly the facts\b|\bAI\b|\bgenerated\b|\bassumed\b/i;

/** Implied quality / functionality / photo claims without supplied facts. */
export const IMPLY_CLAIMS_RE =
  /\bready for use\b|\bworks well\b|\bclean upgrade\b|\bready to go\b|\bwell looked after\b|\bready for its next owner\b|\bready for its next home\b|\bready for a new wardrobe\b|\ba clean piece\b|\bclearer photos\b|\banother look at the photos\b|\bcheck the photos\b|\bmore photos\b|\banother photo\b|\bsend another photo\b|\bworks perfectly\b/i;

/** Service copy must never invent credentials, gear, guarantees, or business status. */
export const SERVICE_INVENTION_RE =
  /\b(fully\s+)?insured\b|\b\d+\+?\s+years?\s+(of\s+)?experience\b|\blicensed\b|\bcertified\b|\bqualified\b|\bguaranteed?\b|\bwarranty\b|\bfully\s+equipped\b|\bbonded\b|\bcommercial\s+grade\b|\bestablished\s+business\b|\bavailable\s+(7\s*days|weekends?|same[- ]day)\b/i;

/** Product-templated service smells — dedicated service writer must never emit these. */
const SERVICE_TEMPLATE_SMELL_RE =
  /\bfor local jobs\b|\bPriced at\b|\bavailable for local work\b|\bTell me roughly what you need\b|\bLocal work\s*[—-]\s*message with the job details\b/i;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function dedupeConsecutiveSentences(text: string): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let prev = "";
  for (const p of parts) {
    const key = p.toLowerCase().replace(/\s+/g, " ");
    if (key && key === prev) continue;
    out.push(p);
    prev = key;
  }
  return out.join(" ");
}

/** Robotic field-restating templates we always rewrite. */
export function isRoboticListingDescription(text: string | undefined | null): boolean {
  if (!text?.trim()) return true;
  const t = text.trim();
  if (t.length < 28) return true;
  if (FIELD_LABEL_RE.test(t)) return true;
  if (BANNED_TEMPLATE_RE.test(t)) return true;
  if (IMPLEMENTATION_LEAK_RE.test(t)) return true;
  if (IMPLY_CLAIMS_RE.test(t)) return true;
  if (SERVICE_INVENTION_RE.test(t)) return true;
  if (SERVICE_TEMPLATE_SMELL_RE.test(t)) return true;
  if (/\bOdometer:\s*/i.test(t) && /\bColour:\s*/i.test(t)) return true;
  if (/^Selling .+\.\s*Condition:/i.test(t)) return true;
  if (/^selling my .{1,40}$/i.test(t) && !/\n/.test(t)) return true;
  const sentences = t.split(/(?<=\.)\s+/).filter(Boolean);
  if (
    sentences.length >= 3 &&
    sentences.filter((s) =>
      /^(Condition:|Located in|Odometer:|Colour:|Pickup available\.|Pickup only\.)/i.test(s.trim())
    ).length >= 2
  ) {
    return true;
  }
  if ((t.match(/\n\n/g) || []).length >= 2 && /Asking \$/.test(t)) return true;
  // Exact sentence duplicated back-to-back
  if (sentences.length >= 2) {
    for (let i = 1; i < sentences.length; i++) {
      if (sentences[i].trim().toLowerCase() === sentences[i - 1].trim().toLowerCase()) return true;
    }
  }
  return false;
}

/** Premium Plus human-prose gate: one paragraph, no field labels, ~40–90 words. */
export function passesListingDescriptionQualityGate(text: string | undefined | null): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (
    FIELD_LABEL_RE.test(t) ||
    BANNED_TEMPLATE_RE.test(t) ||
    IMPLEMENTATION_LEAK_RE.test(t) ||
    IMPLY_CLAIMS_RE.test(t) ||
    SERVICE_INVENTION_RE.test(t) ||
    SERVICE_TEMPLATE_SMELL_RE.test(t)
  ) {
    return false;
  }
  if (t.includes("\n\n")) return false;
  const n = wordCount(t);
  if (n < 35 || n > 100) return false;
  return true;
}

export function resolveListingDescriptionStyle(fill: SkyAiListingFill): ListingDescriptionStyle {
  const type = (fill.listingType || "").toLowerCase();
  if (type === "vehicle") return "vehicle";
  if (type === "service") return "service";
  if (type === "rental") return "rental";

  const blob = `${fill.category || ""} ${fill.title || ""}`.toLowerCase();
  if (fill.category === "Cars" || /\b(bmw|toyota|mazda|honda|ford|nissan|subaru|ute|car)\b/i.test(blob)) {
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

function formatMoneyPlain(price: string | undefined): string | null {
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

function deliveryShort(fill: SkyAiListingFill): string | null {
  const pickup = fill.pickupAvailable === true;
  const ship = fill.shippingAvailable === true;
  const shipOff = fill.shippingAvailable === false;
  if (pickup && shipOff) return "pickup only";
  if (pickup && ship) return "pickup or shipping";
  if (pickup) return "pickup";
  if (ship) return "shipping";
  return null;
}

/** User-stated extras only — skip SEO keyword tags auto-derived from titles. */
function weaveableExtras(fill: SkyAiListingFill): string[] {
  const raw = fill.extras || [];
  return raw
    .map((e) => String(e || "").trim())
    .filter((e) => e.length >= 3)
    .filter((e) => !/^kw:/i.test(e))
    .filter((e) => !/^visual:/i.test(e))
    .filter((e) => !/^(brand|new|like|console|the|and|for|with)$/i.test(e))
    .filter((e) =>
      e.split(/\s+/).length >= 2 ||
      /servic|tyre|tire|receipt|paperwork|wof|rego|mod|include|controller|charger|box|manual|warranty/i.test(e)
    )
    .slice(0, 4);
}

function stripTitleConditionPrefix(title: string): string {
  return title
    .replace(/^(brand\s+new|like\s+new)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatOdo(odo: string): string {
  const raw = odo.replace(/,/g, "").trim();
  if (/km/i.test(raw)) return raw.replace(/\s+/g, " ");
  const n = Number(raw.replace(/[^\d]/g, ""));
  if (!Number.isNaN(n) && n > 0) return `${n.toLocaleString("en-NZ")} km`;
  return `${raw} km`;
}

function listingSeed(fill: SkyAiListingFill): string {
  return `${fill.title || ""}|${fill.price || fill.rentalPriceWeekly || ""}|${fill.location || ""}|${fill.condition || ""}`;
}

function polishParagraph(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/(?:^|[.!?]\s+)([a-z])/g, (m) => m.toUpperCase())
    .trim()
    .replace(/[.!?]?$/, (m) => m || ".");
}

function trimToWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return polishParagraph(text);
  return polishParagraph(`${words.slice(0, max).join(" ").replace(/[,:;]+$/, "")}.`);
}

/** Natural seller bridges — warm + neutral; never invent quality, function, or photos. */
const BRIDGE_BANK: Record<ListingDescriptionStyle, readonly string[]> = {
  electronics: [
    "Get in touch if you'd like more information.",
    "Available for pickup once we arrange a time.",
    "Message to arrange collection.",
  ],
  gaming: [
    "Happy to sort a time that works for both of us.",
    "Message to arrange collection.",
    "Get in touch if you'd like more information.",
  ],
  furniture: [
    "Available for pickup when it suits.",
    "Message to arrange collection.",
    "Get in touch if you'd like more information.",
  ],
  clothing: [
    "Get in touch if you'd like more information.",
    "Message to arrange collection.",
    "Happy to chat if you have any questions.",
  ],
  home_garden: [
    "Available for pickup once we arrange a time.",
    "Happy to time collection around what works for both of us.",
    "Get in touch if you'd like more information.",
  ],
  vehicle: [
    "Happy to arrange a viewing so you can inspect it properly.",
    "Worth a look if the numbers and location already sound right for you.",
    "Message with any questions before you come and see it.",
  ],
  sports: [
    "Available for pickup once we arrange a time.",
    "Happy to arrange a time once you are keen.",
    "Get in touch if you'd like more information.",
  ],
  service: [
    "Happy to discuss what you need and arrange a suitable time.",
    "One-off or regular work — happy to talk through the details.",
    "Local service — get in touch with a few job details when you're ready.",
  ],
  rental: [
    "Happy to arrange a viewing at a time that suits.",
    "Message with practical questions about the place before you visit.",
    "Come take a look if the layout and rates already feel right.",
  ],
  general: [
    "Happy to arrange a time that works for both of us.",
    "Message to arrange collection.",
    "Get in touch if you'd like more information.",
  ],
};

const CTA_BANK: Record<ListingDescriptionStyle, readonly string[]> = {
  electronics: [
    "If you're interested or would like more information, feel free to send me a message.",
    "Happy to answer questions — just send me a message.",
    "Message me if you'd like to know more.",
  ],
  gaming: [
    "If you're interested, feel free to send me a message.",
    "Happy to sort a pickup time — just message me.",
    "Message if you are keen.",
  ],
  furniture: [
    "If you're interested, feel free to send me a message.",
    "Message if you want it.",
    "Happy to arrange collection — just get in touch.",
  ],
  clothing: [
    "If you're interested or would like more information, feel free to send me a message.",
    "Message if it fits what you need.",
    "Happy to chat — just send a message.",
  ],
  home_garden: [
    "If you're interested, feel free to send me a message.",
    "Happy to arrange pickup — just message me.",
    "Message if you have any questions.",
  ],
  vehicle: [
    "If you're interested or would like more information, feel free to send me a message.",
    "Happy to arrange a viewing — just message me.",
    "Come take a look if it sounds right.",
  ],
  sports: [
    "If you're interested, feel free to send me a message.",
    "Happy to arrange pickup — just message me.",
    "Message if you have any questions.",
  ],
  service: [
    "Send me a message with a few details about the job and I'll get back to you.",
    "Message with a few job details and I'll get back to you.",
    "Drop me a message when you're ready to chat about the job.",
  ],
  rental: [
    "If you're interested or would like more information, feel free to send me a message.",
    "Happy to arrange a viewing — just message me.",
    "Message if you would like to take a look.",
  ],
  general: [
    "If you're interested or would like more information, feel free to send me a message.",
    "Happy to chat — just send me a message.",
    "Message if you have any questions.",
  ],
};

function locationInText(text: string, location: string): boolean {
  if (!location) return false;
  const esc = location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "i").test(text);
}

function deliveryPhrase(fill: SkyAiListingFill, seed: string): string | null {
  const d = deliveryShort(fill);
  if (!d) return null;
  const location = (fill.location || fill.pickupArea || "").trim();
  if (d === "pickup only") {
    if (location) return `Pickup is available in ${location}`;
    return pickVariant(seed + ":d", ["Local pickup only", "Pickup only"]);
  }
  if (d === "pickup or shipping") {
    if (location) {
      return `Pickup is available in ${location}, or shipping can be arranged`;
    }
    return pickVariant(seed + ":d", [
      "Pickup or shipping both fine",
      "Happy with pickup or shipping",
    ]);
  }
  if (d === "pickup") {
    if (location) return `Pickup is available in ${location}`;
    return pickVariant(seed + ":d", ["Pickup is available", "Happy to arrange pickup"]);
  }
  return location
    ? pickVariant(seed + ":d", [`Shipping is available from ${location}`, "Shipping is available"])
    : "Shipping is available";
}

function pricePhrase(fill: SkyAiListingFill, seed: string, hourly?: boolean): string | null {
  const money = formatMoneyPlain(fill.price);
  if (!money) return null;
  if (hourly) {
    return pickVariant(seed + ":ph", [
      `I'm asking ${money} per hour`,
      `Asking ${money} per hour`,
      `${money} an hour`,
    ]);
  }
  return pickVariant(seed + ":p", [
    `I'm asking ${money}`,
    `Asking ${money}`,
    `Priced at ${money}`,
  ]);
}

function unusedPhrases(text: string, phrases: readonly string[]): string[] {
  return phrases.filter((p) => p && !text.toLowerCase().includes(p.slice(0, 28).toLowerCase()));
}

function padDescriptionToMinWords(
  text: string,
  minWords: number,
  pads: readonly string[]
): string {
  let out = text.trim();
  for (const pad of unusedPhrases(out, pads)) {
    if (wordCount(out) >= minWords) break;
    out = `${out} ${pad}`.trim();
  }
  return out;
}

function assemblePremiumPlus(opts: {
  fill: SkyAiListingFill;
  style: ListingDescriptionStyle;
  openers: readonly string[];
  factBits: string[];
  quality: ListingDescriptionQuality;
}): string {
  const seed = listingSeed(opts.fill);
  const open = pickVariant(seed + ":open", opts.openers);
  const location = (opts.fill.location || opts.fill.pickupArea || "").trim();
  const delivery = deliveryPhrase(opts.fill, seed);
  const price = pricePhrase(
    opts.fill,
    seed,
    /hour/i.test(String(opts.fill.servicePricingType || opts.fill.pricingType || ""))
  );
  const extras = weaveableExtras(opts.fill);

  // Prefer delivery phrase for location; only add a plain location bit if neither opener nor delivery has it
  const facts = [...opts.factBits].filter(Boolean);
  const locCovered =
    locationInText(open, location) ||
    locationInText(delivery || "", location) ||
    facts.some((f) => locationInText(f, location));
  if (location && !locCovered) {
    facts.push(`in ${location}`);
  }

  const mid: string[] = [];
  if (facts.length) mid.push(facts.join(", "));
  if (delivery && price) {
    mid.push(`${delivery}, and ${price.replace(/^I'm asking /i, "I'm asking ").replace(/^Asking /i, "I'm asking ").replace(/^Priced at /i, "I'm asking ")}`);
  } else if (delivery) {
    mid.push(delivery);
  } else if (price) {
    mid.push(price);
  }
  if (extras.length) mid.push(extras.join("; "));

  let text = open.replace(/[.!?]?$/, ".");
  if (mid.length) text += ` ${mid.join(". ").replace(/\.+$/, "")}.`;

  const bridges = BRIDGE_BANK[opts.style] || BRIDGE_BANK.general;
  const ctas = CTA_BANK[opts.style] || CTA_BANK.general;

  if (opts.quality === "standard") {
    text += " Happy to answer questions.";
  } else {
    const cta = pickVariant(seed + ":cta", ctas);
    if (cta && wordCount(text) < 70) text += ` ${cta}`;
    // Pad once with unused bridges only — never append the same sentence twice
    if (wordCount(text) < 40) {
      text = padDescriptionToMinWords(text, 40, bridges);
    }
  }

  text = polishParagraph(dedupeConsecutiveSentences(text));
  if (opts.quality !== "standard") text = trimToWords(text, 90);
  return text;
}

function buildVehicleDescription(fill: SkyAiListingFill, quality: ListingDescriptionQuality): string {
  const year = fill.vehicleYear?.trim();
  const make = fill.vehicleMake?.trim();
  const model = fill.vehicleModel?.trim();
  const colour = fill.vehicleColour?.trim();
  const odo = fill.vehicleOdometer?.trim();
  const trans = fill.vehicleTransmission?.trim();
  const fuel = fill.vehicleFuelType?.trim();
  const body = fill.vehicleBodyType?.trim();
  const location = (fill.location || fill.pickupArea || "").trim();
  const cond = conditionShort(fill.condition);
  const name = [year, make, model].filter(Boolean).join(" ") || stripTitleConditionPrefix(fill.title || "vehicle");

  const openers = [
    colour ? `${colour} ${name}.` : `${name}.`,
    colour
      ? `${name} in ${colour.toLowerCase()}${location ? `, available in ${location}` : ""}.`
      : `${name}${location ? ` available in ${location}` : " available"}.`,
    `${name}${colour ? ` in ${colour.toLowerCase()}` : ""}${location ? ` in ${location}` : ""}.`,
  ];

  const factBits: string[] = [];
  if (odo) factBits.push(`${formatOdo(odo)} on the clock`);
  if (trans) factBits.push(`${trans.toLowerCase()} transmission`);
  if (fuel) factBits.push(`${fuel.toLowerCase()} fuel`);
  if (body) factBits.push(`${body.toLowerCase()} body`);
  if (cond && fill.condition !== "New") factBits.push(cond);

  return assemblePremiumPlus({ fill, style: "vehicle", openers, factBits, quality });
}

/**
 * Dedicated SERVICE writer — separate from physical product assemblePremiumPlus.
 * Sounds like a real local provider: natural service mention, integrated pricing
 * ("$50 per job" / "$50 per hour"), one soft CTA max, facts only.
 */
function buildServiceDescription(fill: SkyAiListingFill, quality: ListingDescriptionQuality): string {
  const seed = listingSeed(fill);
  const rawTitle = stripTitleConditionPrefix(fill.title || "service").trim() || "Service";
  const serviceLower = rawTitle.toLowerCase();
  const location = (fill.location || fill.pickupArea || "").trim();
  const pricingType = normalizeServicePricingType(
    fill.servicePricingType || fill.pricingType,
    fill.price,
    `${fill.title || ""} ${fill.description || ""}`
  );
  const money = formatMoneyPlain(fill.price);
  const duration = fill.serviceDuration?.trim();
  const extras = weaveableExtras(fill);

  const priceClause =
    money && pricingType === "hourly"
      ? ` for ${money} per hour`
      : money && pricingType === "fixed"
        ? ` for ${money} per job`
        : "";

  const openers = [
    location
      ? `${rawTitle} available in ${location}${priceClause}.`
      : `${rawTitle} available${priceClause}.`,
    location
      ? `${rawTitle} in ${location}${priceClause || ""}.`.replace(/\.\.$/, ".")
      : priceClause
        ? `${rawTitle} available${priceClause}.`
        : `${rawTitle} available locally.`,
    location
      ? `Looking for ${serviceLower}? Available in ${location}${priceClause}.`
      : `Looking for ${serviceLower}?${priceClause ? ` Available${priceClause}.` : " Available locally."}`,
  ];

  // Soft mid — service-category flavour only, never invent credentials/gear/availability
  const blob = `${rawTitle} ${fill.category || ""}`.toLowerCase();
  let midBank: readonly string[];
  if (/lawn|mow/.test(blob)) {
    midBank = [
      "Whether it's a one-off tidy-up or regular lawn maintenance, I'm happy to discuss what you need and arrange a suitable time.",
      "Happy to talk through the size of the job and find a time that works for both of us.",
    ];
  } else if (/clean/.test(blob)) {
    midBank = [
      "Whether it's a one-off clean or regular visits, I'm happy to discuss what you need and arrange a suitable time.",
      "Happy to talk through the space and find a time that works for both of us.",
    ];
  } else if (/tutor|lesson|teach/.test(blob)) {
    midBank = [
      "Happy to discuss what you're after and arrange a time that suits.",
      "Whether it's a one-off session or ongoing lessons, I'm happy to talk through what you need.",
    ];
  } else {
    midBank = [
      "Whether it's a one-off job or something more regular, I'm happy to discuss what you need and arrange a suitable time.",
      "Happy to talk through the scope and find a time that works for both of us.",
      "I'm happy to discuss what you need and work out the details from there.",
    ];
  }

  const quoteMids: readonly string[] = [
    "Happy to discuss the scope and put a quote together once I know a bit more about the job.",
    "Scope and pricing depend on the job — happy to put a quote together once I have a few more details.",
  ];

  const ctas: readonly string[] = [
    "Send me a message with a few details about the job and I'll get back to you.",
    "Message with a few job details and I'll get back to you.",
    "Drop me a message when you're ready to chat about the job.",
  ];

  const open = pickVariant(seed + ":svc-open", openers);
  const mid =
    pricingType === "request_quote"
      ? pickVariant(seed + ":svc-mid", quoteMids)
      : pickVariant(seed + ":svc-mid", midBank);
  const cta = pickVariant(seed + ":svc-cta", ctas);

  const factBits: string[] = [];
  if (duration) factBits.push(`Typical jobs run about ${duration}`);
  if (extras.length) factBits.push(extras.join("; "));

  if (quality === "standard") {
    return polishParagraph(
      dedupeConsecutiveSentences(
        [open, "Happy to answer questions."].filter(Boolean).join(" ")
      )
    );
  }

  let text = polishParagraph(
    dedupeConsecutiveSentences([open, mid, ...factBits.map((f) => `${f}.`), cta].join(" "))
  );

  // One CTA max — if word count is short, expand mid slightly rather than stacking invites
  if (wordCount(text) < 40) {
    const softPads = unusedPhrases(text, [
      "Happy to work around a time that suits once we've sorted the details.",
      "Just share what you need and we can take it from there.",
    ]);
    text = padDescriptionToMinWords(text, 40, softPads);
    text = polishParagraph(dedupeConsecutiveSentences(text));
  }

  return trimToWords(text, 90);
}

function buildRentalDescription(fill: SkyAiListingFill, quality: ListingDescriptionQuality): string {
  const title = stripTitleConditionPrefix(fill.title || "rental");
  const location = (fill.location || fill.pickupArea || "").trim();
  const openers = [
    `${title}${location ? ` in ${location}` : ""} is available to rent.`,
    location ? `Renting out ${title.toLowerCase()} in ${location}.` : `Renting out ${title.toLowerCase()}.`,
    `${title}${location ? `, ${location}` : ""} — up for rent with the details below.`,
  ];
  const factBits: string[] = [];
  if (fill.rentalBedrooms) {
    factBits.push(`${fill.rentalBedrooms} bedroom${fill.rentalBedrooms === "1" ? "" : "s"}`);
  }
  if (fill.rentalBathrooms) {
    factBits.push(`${fill.rentalBathrooms} bathroom${fill.rentalBathrooms === "1" ? "" : "s"}`);
  }
  if (fill.rentalFurnishedStatus) factBits.push(fill.rentalFurnishedStatus.toLowerCase());
  if (fill.rentalPetsPolicy) factBits.push(fill.rentalPetsPolicy.toLowerCase());
  if (fill.rentalParkingSpaces) factBits.push(`parking for ${fill.rentalParkingSpaces}`);

  const rates: string[] = [];
  if (fill.rentalPriceWeekly) rates.push(`$${fill.rentalPriceWeekly}/week`);
  if (fill.rentalPriceMonthly) rates.push(`$${fill.rentalPriceMonthly}/month`);
  if (fill.rentalPriceDaily) rates.push(`$${fill.rentalPriceDaily}/day`);
  if (fill.rentalDeposit) rates.push(`$${fill.rentalDeposit} bond`);
  if (rates.length) factBits.push(rates.join(", "));
  if (fill.rentalAvailableDate) factBits.push(`available from ${fill.rentalAvailableDate}`);

  // Bypass normal pricePhrase when weekly/monthly already set
  const fillForAssemble = rates.length ? { ...fill, price: undefined } : fill;
  return assemblePremiumPlus({
    fill: fillForAssemble,
    style: "rental",
    openers,
    factBits,
    quality,
  });
}

function buildPhysicalDescription(
  fill: SkyAiListingFill,
  style: ListingDescriptionStyle,
  quality: ListingDescriptionQuality
): string {
  const title = (fill.title || "item").trim();
  const bare = stripTitleConditionPrefix(title);
  const cond = conditionShort(fill.condition);
  const location = (fill.location || fill.pickupArea || "").trim();
  const titleHasCond = /\b(brand\s+new|like\s+new)\b/i.test(title);
  const display = titleHasCond
    ? title.replace(/^Brand New\s+/i, "brand new ").replace(/^Like New\s+/i, "like-new ")
    : bare;
  const condBit = cond && !titleHasCond ? cond : null;
  const hasPickup = fill.pickupAvailable === true;
  // When pickup is set, keep location for the delivery phrase instead of stuffing openers
  const locForOpen = hasPickup ? "" : location;

  let openers: string[];
  if (style === "electronics") {
    openers = [
      `${display[0].toUpperCase()}${display.slice(1)}${condBit ? ` in ${condBit}` : ""}.`,
      `${display[0].toUpperCase()}${display.slice(1)}${condBit ? `, ${condBit}` : ""}.`,
      `${display[0].toUpperCase()}${display.slice(1)}${condBit ? ` in ${condBit}` : ""}${locForOpen ? ` in ${locForOpen}` : ""}.`,
    ];
  } else if (style === "gaming") {
    openers = [
      `${display[0].toUpperCase()}${display.slice(1)}${locForOpen ? ` available in ${locForOpen}` : " available"}.`,
      `Got a ${display}${locForOpen ? ` here in ${locForOpen}` : ""}.`,
      `${display[0].toUpperCase()}${display.slice(1)} up for grabs${condBit ? `, ${condBit}` : ""}.`,
    ];
  } else if (style === "furniture") {
    openers = [
      `${bare}${location ? ` available for collection in ${location}` : " available for collection"}${condBit ? `, ${condBit}` : ""}.`,
      `${bare}${location ? ` available for collection in ${location}` : ""}${condBit ? `, ${condBit}` : ""}.`,
      `${bare}${condBit ? ` in ${condBit}` : ""}${location ? `, collection in ${location}` : ""}.`,
    ];
  } else if (style === "clothing") {
    openers = [
      `${bare}${condBit ? `, ${condBit}` : ""}${locForOpen ? ` from ${locForOpen}` : ""}.`,
      `${bare}${locForOpen ? ` available in ${locForOpen}` : " available"}${condBit ? `, ${condBit}` : ""}.`,
      `${bare}${condBit ? ` in ${condBit}` : ""}${locForOpen ? ` from ${locForOpen}` : ""}.`,
    ];
  } else if (style === "home_garden") {
    openers = [
      `${bare}${condBit ? `, ${condBit}` : ""}${locForOpen ? ` in ${locForOpen}` : ""}.`,
      `${bare}${locForOpen ? ` available in ${locForOpen}` : " available"}${condBit ? `, ${condBit}` : ""}.`,
      `${bare}${condBit ? ` in ${condBit}` : ""}${locForOpen ? `, ${locForOpen}` : ""}.`,
    ];
  } else if (style === "sports") {
    openers = [
      `${bare}${condBit ? `, ${condBit}` : ""}${locForOpen ? ` in ${locForOpen}` : ""}.`,
      `${bare}${locForOpen ? ` available in ${locForOpen}` : " available"}${condBit ? ` — ${condBit}` : ""}.`,
      `${bare}${locForOpen ? ` from ${locForOpen}` : ""}${condBit ? `, ${condBit}` : ""}.`,
    ];
  } else {
    openers = [
      `${bare}${condBit ? `, ${condBit}` : ""}${locForOpen ? ` in ${locForOpen}` : ""}.`,
      `${bare} available${condBit ? ` in ${condBit}` : ""}.`,
      `${bare}${locForOpen ? ` from ${locForOpen}` : ""}${condBit ? `, ${condBit}` : ""}.`,
    ];
  }

  const factBits: string[] = [];

  return assemblePremiumPlus({ fill, style, openers, factBits, quality });
}

/**
 * Marketplace description from known draft facts only — no hallucinations.
 * Premium Plus: one natural paragraph (~40–90 words), category-aware phrase banks.
 */
export function buildListingDescriptionFromFacts(
  fill: SkyAiListingFill,
  opts?: { quality?: ListingDescriptionQuality }
): string {
  const quality: ListingDescriptionQuality = opts?.quality ?? "premium_plus";
  const style = resolveListingDescriptionStyle(fill);

  let text: string;
  if (style === "vehicle") text = buildVehicleDescription(fill, quality);
  else if (style === "service") text = buildServiceDescription(fill, quality);
  else if (style === "rental") text = buildRentalDescription(fill, quality);
  else text = buildPhysicalDescription(fill, style, quality);

  text = polishParagraph(text);

  // Never invent warranty / authenticity / accessory claims
  const extrasBlob = (fill.extras || []).join(" ").toLowerCase();
  if (/\b(authentic|genuine|warranty|factory sealed|unopened)\b/i.test(text)) {
    if (!/\bwarrant/i.test(extrasBlob) && /\bwarrant/i.test(text)) {
      text = text.replace(/\s*[^.]*\bwarrant[^.]*\./gi, "").trim();
    }
    if (!/\b(authentic|genuine)\b/i.test(extrasBlob)) {
      text = text.replace(/\b(authentic|genuine)\b/gi, "").replace(/\s{2,}/g, " ");
    }
    if (!/\b(factory sealed|unopened)\b/i.test(extrasBlob)) {
      text = text.replace(/\b(factory sealed|unopened)\b/gi, "").replace(/\s{2,}/g, " ");
    }
    text = polishParagraph(text);
  }

  if (quality === "premium_plus") {
    if (wordCount(text) < 40 && style !== "service") {
      const bridges = BRIDGE_BANK[style] || BRIDGE_BANK.general;
      const ctas = CTA_BANK[style] || CTA_BANK.general;
      text = padDescriptionToMinWords(text, 40, [...ctas, ...bridges]);
      text = polishParagraph(dedupeConsecutiveSentences(text));
    }
    text = trimToWords(text, 90);
    if (!passesListingDescriptionQualityGate(text) || isRoboticListingDescription(text)) {
      if (style === "service") {
        // Never fall back to physical product templates for services
        text = buildServiceDescription(fill, "premium_plus");
        text = polishParagraph(dedupeConsecutiveSentences(text));
        text = trimToWords(text, 90);
      } else {
        const bare = stripTitleConditionPrefix(fill.title || "Item");
        const loc = (fill.location || fill.pickupArea || "").trim();
        const cond = conditionShort(fill.condition);
        const money = formatMoneyPlain(fill.price);
        const delivery = deliveryPhrase(fill, listingSeed(fill));
        const cta = pickVariant(
          listingSeed(fill) + ":cta",
          CTA_BANK[style] || CTA_BANK.general
        );
        const bridge = unusedPhrases(
          `${delivery || ""} ${cta}`,
          BRIDGE_BANK[style] || BRIDGE_BANK.general
        )[0];
        text = polishParagraph(
          dedupeConsecutiveSentences(
            [
              `${bare}${cond ? ` in ${cond}` : ""}.`,
              delivery
                ? money
                  ? `${delivery}, and I'm asking ${money}`
                  : delivery
                : money
                  ? `I'm asking ${money}`
                  : loc
                    ? `Located for pickup in ${loc}`
                    : "",
              cta,
              wordCount([bare, delivery, money, cta].filter(Boolean).join(" ")) < 40 ? bridge : "",
            ]
              .filter(Boolean)
              .join(". ")
              .replace(/\.\s*\./g, ".")
          )
        );
        if (wordCount(text) < 40) {
          text = padDescriptionToMinWords(
            text,
            40,
            BRIDGE_BANK[style] || BRIDGE_BANK.general
          );
        }
        text = polishParagraph(dedupeConsecutiveSentences(text));
        text = trimToWords(text, 90);
      }
    }
  }

  return text.slice(0, 8000);
}

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
