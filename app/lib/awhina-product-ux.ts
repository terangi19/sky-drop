/**
 * Product-quality UX helpers for Āwhina — proactive clarify, compare, education,
 * listing suggestions, search intelligence, progress states. Pure functions;
 * wire from canonical/search/route. Never invent listing facts.
 */

import { extractFindSearchTerm, parseFindBudget, parseFindCity } from "./sky-ai-find-routing";
import { parseConditionFilter } from "./awhina-search-memory";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

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
 */
export function summarizeListingComparison(
  listings: ListingFacts[],
  opts?: { emptyHint?: string }
): string {
  const usable = listings.filter((l) => l.title && String(l.title).trim().length > 0).slice(0, 4);
  if (usable.length < 2) {
    return (
      opts?.emptyHint ||
      "Open two listings (or paste their titles) and say **compare these** — I'll use only real listing fields, never guess."
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
  if (
    fill.category === "Gaming" &&
    /\bps5|xbox|switch|playstation\b/i.test(title) &&
    !/\b(controller|game|hdmi|stand|disc|digital)\b/i.test(`${title} ${desc}`)
  ) {
    tips.push("mentioning included accessories (controllers, games, cables)");
  }
  if (!Number.isNaN(price) && price > 0) {
    if (price < 5) tips.push("double-checking that price — it looks unusually low");
    if (/\bps5\b/i.test(title) && (price < 150 || price > 1200)) {
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
  // Only collapse giant export menus (Facebook / Trade Me), not normal capability lists
  if (/Facebook Marketplace|Trade Me listing/i.test(r)) {
    const lines = r.split("\n");
    const bullets = lines.filter((l) => /^[•\-\*]\s/.test(l.trim()));
    if (bullets.length > 4) {
      const kept = lines.filter((l) => !/^[•\-\*]\s/.test(l.trim()));
      r = [...kept.slice(0, 2), ...bullets.slice(0, 2)].join("\n").trim();
    }
  }
  return r.replace(/ {2,}/g, " ").trim();
}

export function progressStatesForRoute(kind: "search" | "compare" | "vision" | "freeform" | "local"): AwhinaProgressState[] {
  if (kind === "local") return [];
  if (kind === "search") return ["understanding_request", "searching_listings", "preparing_answer"];
  if (kind === "compare") return ["understanding_request", "comparing_results", "preparing_answer"];
  if (kind === "vision") return ["understanding_request", "analysing_images", "preparing_answer"];
  return ["understanding_request", "preparing_answer"];
}
