/**
 * Product-quality UX helpers for Āwhina — proactive clarify, compare, education,
 * listing suggestions, delight phrasing. Pure functions; wire from canonical/search.
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

export type ListingFacts = {
  title?: string;
  price?: string | number | null;
  condition?: string | null;
  location?: string | null;
  /** Seller reputation only if provided — never invent */
  sellerReputation?: string | null;
  extras?: string[];
};

/** Vague shopping need worth one clarifying question before searching. */
export function isVagueShoppingNeed(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 120) return false;
  if (!NEED_RE.test(m) && !/^(ps5|xbox|iphone|switch)\b/i.test(m)) return false;
  // Already specific enough — search immediately
  if (parseFindBudget(m)) return false;
  if (parseFindCity(m)) return false;
  if (EDITION_RE.test(m)) return false;
  if (CONDITION_HINT.test(m) && DELIVERY_HINT.test(m)) return false;
  if (/\b(under|up to|max|budget|near|in auckland|in wellington)\b/i.test(m)) return false;
  const term = extractFindSearchTerm(m);
  if (term === "what you're after" || term.length < 2) return false;
  // Vehicle make alone → search immediately (never invent a model like 335i)
  if (/\b(bmw|toyota|mazda|honda|ford|nissan|subaru|hyundai|kia|audi|mercedes|volkswagen|vw)\b/i.test(term)) {
    return false;
  }
  // "find me BMWs in Auckland" handled elsewhere; need-style vague only
  if (/\b(find me|show me|search for)\b/i.test(m) && (parseFindBudget(m) || parseFindCity(m))) {
    return false;
  }
  // "find me a PS5 under 600" not vague; "I need a PS5" is
  if (/\b(find(?: me)?|show me|search for)\b/i.test(m) && !NEED_RE.test(m)) {
    // find without filters can still search — only proactive on need/looking language
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
  // Short answer like "disc" / "used" / "Auckland"
  if (m.split(/\s+/).length <= 6) return true;
  return false;
}

export function mergeClarifyIntoSearchMessage(
  pendingItem: string,
  answer: string
): string {
  return `find ${pendingItem} ${answer}`.trim();
}

/** Marketplace education — messaging-first V1 only. No Buy Now / Stripe / escrow. */
export function tryMarketplaceEducationReply(message: string): string | null {
  if (!SAFETY_EDU_RE.test(message)) return null;
  return [
    "Stay on **Sky Drop Messages** for the deal — don't move to WhatsApp/email for payment.",
    "Agree price, payment method, and pickup/delivery in chat before you pay.",
    "Prefer public pickup spots, verify the item in person, and never send money to 'hold' an item you haven't seen.",
    "If something feels off, don't pay — use **Report** on the listing and message support if needed. [[NAV:/messages]]",
  ].join(" ");
}

export function isCompareRequest(message: string): boolean {
  return COMPARE_RE.test(message.trim());
}

/**
 * Summarize known facts only. Never invent missing price/condition/reputation/location.
 */
export function summarizeListingComparison(
  listings: ListingFacts[],
  opts?: { emptyHint?: string }
): string {
  const usable = listings.filter((l) => l.title && String(l.title).trim().length > 0).slice(0, 4);
  if (usable.length < 2) {
    return (
      opts?.emptyHint ||
      "Open two listings (or paste their titles) and say **compare these** — I'll summarise only what's on the page, never guess missing details."
    );
  }

  const lines = usable.map((l, i) => {
    const bits: string[] = [`**${i + 1}. ${String(l.title).trim()}**`];
    if (l.price != null && String(l.price).trim()) {
      bits.push(`price $${String(l.price).replace(/^\$/, "")}`);
    } else {
      bits.push("price not listed");
    }
    if (l.condition) bits.push(`condition ${l.condition}`);
    else bits.push("condition not listed");
    if (l.location) bits.push(String(l.location));
    else bits.push("location not listed");
    if (l.sellerReputation) bits.push(`seller ${l.sellerReputation}`);
    // deliberately omit reputation when unknown — don't invent
    return bits.join(" · ");
  });

  const diffs: string[] = [];
  const prices = usable
    .map((l) => Number(String(l.price || "").replace(/[^\d.]/g, "")))
    .filter((n) => !Number.isNaN(n) && n > 0);
  if (prices.length >= 2) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min !== max) diffs.push(`Price span $${min.toLocaleString("en-NZ")}–$${max.toLocaleString("en-NZ")}.`);
  }
  const conds = new Set(usable.map((l) => (l.condition || "").toLowerCase()).filter(Boolean));
  if (conds.size >= 2) diffs.push("Conditions differ — check photos and description on each listing.");
  const locs = new Set(usable.map((l) => (l.location || "").toLowerCase()).filter(Boolean));
  if (locs.size >= 2) diffs.push("Different locations — factor in pickup/shipping.");

  return [
    "Here's a side-by-side from the details I have (nothing invented):",
    ...lines,
    diffs.length ? diffs.join(" ") : "Key differences: open each listing for photos and seller history.",
    "Message the seller on the one you prefer to arrange payment and pickup.",
  ].join("\n");
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

/** Delight-style search reply fragments — natural, not chatty. */
export function delightSearchLead(opts: {
  query?: string;
  location?: string;
  sortBy?: string;
  hideSold?: boolean;
  condition?: string;
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

export function delightNoExactMatch(query: string): string {
  return `Nothing matches **${query}** exactly — try a broader term, or drop a filter.`;
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
