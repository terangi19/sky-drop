/**
 * Canonical sell listing-fill tools.
 * AI/user proposes partial updates; app validates enums/prices before any fill.
 * Draft fill is free; publish/delete stay UI-confirmed (never invented here).
 */

import {
  hasFormActionContent,
  parseFormActionsFromMessage,
  mergeFormActionsIntoFill,
  describeFormActions,
  enhanceListingFillFromMessage,
} from "./sky-ai-form-actions";
import {
  normalizeSkyAiListingFill,
  type SkyAiListingFill,
} from "./sky-ai-listing-fill";
import {
  hasActiveListingDraft,
  mergeListingFillWithDraft,
} from "./sky-ai-draft-merge";
import type { SkyAiListingContext } from "./sky-ai-types";
import {
  tryListingPasteShortcut,
} from "./sky-ai-listing-paste";
import {
  tryListingFormActionsShortcut,
} from "./sky-ai-page-intent";
import {
  extractServiceOfferingTitle,
  hasListingSellIntent,
  hasRentalOfferingIntent,
  hasServiceOfferingIntent,
  inferSellListingTypeHint,
  isExplicitNewSellListingMessage,
} from "./sky-ai-intent";
import { normalizeServicePricingType } from "./service-pricing";
import type { AwhinaToolCall } from "./awhina-types";
import { validateToolCall } from "./awhina-tool-registry";
import {
  suggestListingImprovements,
  buildListingDescriptionFromFacts,
  autoImproveListingDraft,
  buildCompleteDraftReply,
  buildIncompleteDraftReply,
  buildDraftUpdateReply,
  isCompleteListingDraft,
  normalizeProductName,
  cleanRentalItemName,
  buildPremiumListingTitle,
  getVehicleDraftReadiness,
  isVehicleListingFill,
} from "./awhina-product-ux";
import { composeListingTitleAndDescription } from "./awhina-listing-composer";
import {
  looksLikeVehicleYearToken,
  parseVehicleYear,
  resolveVehicleIdentity,
} from "./sky-ai-find-routing";
import {
  mergeKnowledgeHintsIntoFill,
  resolveMarketplaceKnowledge,
} from "./marketplace-knowledge";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 400;

export type ListingDraftSession = {
  draft: SkyAiListingFill;
  updatedAt: number;
};

/**
 * Optional in-memory warm cache only.
 * Authoritative draft for multi-turn sell is the client `listingContext`
 * (reconstructed via {@link reconstructListingDraftBase}). A cold Vercel
 * instance must not depend on this Map surviving.
 */
const sessions = new Map<string, ListingDraftSession>();

/** Test-only: simulate process-memory loss (cold serverless instance). */
export function clearAllListingDraftCacheForTests(): void {
  sessions.clear();
}

const ALLOWED_LISTING_TYPES = new Set([
  "physical",
  "digital",
  "service",
  "rental",
  "vehicle",
  "wanted",
]);

const ALLOWED_CONDITIONS = new Set([
  "New",
  "Used - Like New",
  "Used - Good",
  "Used - Fair",
]);

const ALLOWED_PHYSICAL_CATEGORIES = new Set([
  "Tech",
  "Cars",
  "Gaming",
  "Fashion",
  "Home",
  "Sports",
  "Other",
]);

const UNSUPPORTED_CATEGORY_RE =
  /\b(weapons?|guns?|ammunition|drugs?|illegal|counterfeit|stolen)\b/i;

const DESTRUCTIVE_RE =
  /\b(publish|delete|remove|go live|post it now|make it live)\b/i;

const RELATIVE_PRICE_RE =
  /\b(make it cheaper|cheaper|lower the price|reduce (the )?price|drop the price|a bit less|less expensive)\b/i;

const PRICE_SET_RE =
  /\b(?:(?:make(?:\s+it)?|set(?:\s+(?:the|it|price))?|price(?:\s+is)?|actually|change(?:\s+(?:it|price|to))?|update(?:\s+price)?|it'?s)\s+)\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:bucks|nzd|dollars?)?\b|\b(?:for|at)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:bucks|nzd|dollars?)?\b|\b\$\s*([\d,]+(?:\.\d{1,2})?)\b|\b([\d,]+(?:\.\d{1,2})?)\s*(?:bucks|nzd|dollars?)\b/i;

const BUCKS_PRICE_RE =
  /\b([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:bucks|nzd|dollars?)\b/i;

const MALFORMED_PRICE_RE =
  /\b(?:\$\s*[^\d\s,]|price\s*(?:is|=|:)?\s*(?:abc|xyz|freeish|tbd|tba|asap|idk)|price\s+[a-z]{2,})\b/i;

/** Storage / qty / size numbers that must never become listing price. */
const NON_PRICE_NUMBER_RE =
  /\b(\d+)\s*(gb|tb|mb|kg|km|sqm|m2|inch|inches|"|bed|beds|bedroom|bath|baths|seater|pack|pcs?|x\d)\b/i;

/** Bare storage tokens without space: 128gb, 256GB, 1tb */
const STORAGE_GLUED_RE = /\b(\d+)\s*(gb|tb|mb)\b/i;

const CONDITION_RE =
  /\b(?:condition(?:\s+is)?|it'?s|its)\s+(new|used(?:\s*[-–]?\s*(?:like\s+new|good|fair))?|like\s+new|excellent|mint|good|fair|rough)\b|\b(brand\s+new|like\s+new|excellent|mint|good|fair|used)\s+condition\b|\b(new|used|like\s+new|excellent|mint)\b(?!\s+(?:zealand|listing))/i;

const SELL_ITEM_RE =
  /\b(?:want\s+to\s+list|selling|sell(?:ing)?|list(?:ing)?|post(?:ing)?)\s+(?:my\s+|a\s+|an\s+|the\s+)?(.+)$/i;

const SELL_ITEM_STOP_RE =
  /\b(brand\s+new|its|it's|condition|new|used|like\s+new|excellent|mint|good|fair|pickup|pick\s*up|shipping|located|based|in\s+auckland|auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|rotorua|queenstown|nelson|whangarei|for\s+\$|\$\d|\d+\s*(?:bucks|nzd|dollars?)|\d{2,3}[\s,]?\d{3}\s*km)\b/i;

const NZ_CITY_TAIL_RE =
  /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston\s+north|rotorua|queenstown|nelson|whangarei)\b.*$/i;

const KEYWORDS_RE =
  /\b(?:keywords?|tags?)\s*(?:are|:)?\s*(.+)$/i;

const TITLE_SET_RE =
  /\b(?:title(?:\s+is)?|rename(?:\s+it)?|call(?:\s+it)?)\s*[:\-]?\s*["']?([^"'\n]{3,80})["']?\s*$/i;

const DESC_SET_RE =
  /\b(?:description(?:\s+is)?|describe(?:\s+it)?(?:\s+as)?)\s*[:\-]?\s*(.{10,})\s*$/i;

const LOCATION_RE =
  /\b(?:located(?:\s+in)?|based(?:\s+in)?|location(?:\s+is)?|in)\s+(northland|auckland|waikato|bay of plenty|gisborne|hawke'?s bay|taranaki|manawatu|wellington|nelson|marlborough|west coast|canterbury|otago|southland|[A-Za-z][A-Za-z\s'-]{1,30})\b/i;

function pruneSessions(): void {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now - v.updatedAt > SESSION_TTL_MS) sessions.delete(k);
  }
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (let i = 0; i < oldest.length - MAX_SESSIONS; i++) {
      sessions.delete(oldest[i][0]);
    }
  }
}

export function listingDraftSessionKey(opts: {
  conversationId?: string;
  uid?: string | null;
  pathname?: string;
  anonSessionId?: string;
}): string {
  if (opts.conversationId) return `list:c:${opts.conversationId}`;
  if (opts.uid) return `list:u:${opts.uid}`;
  if (opts.anonSessionId) return `list:anon:${opts.anonSessionId}`;
  return `list:anon:${opts.pathname || "/post/ai"}`;
}

export function getListingDraftSession(key: string): ListingDraftSession | null {
  pruneSessions();
  const s = sessions.get(key);
  if (!s) return null;
  if (Date.now() - s.updatedAt > SESSION_TTL_MS) {
    sessions.delete(key);
    return null;
  }
  return s;
}

export function rememberListingDraft(key: string, draft: SkyAiListingFill): SkyAiListingFill {
  pruneSessions();
  const prev = sessions.get(key)?.draft || {};
  const merged = { ...prev, ...draft };
  sessions.set(key, { draft: merged, updatedAt: Date.now() });
  return merged;
}

export function clearListingDraftSession(key: string): void {
  sessions.delete(key);
}

export function validateListingFillFields(
  fill: SkyAiListingFill
): { ok: true; fill: SkyAiListingFill } | { ok: false; error: string } {
  const out: SkyAiListingFill = {};

  if (fill.listingType) {
    const t = fill.listingType.toLowerCase();
    if (!ALLOWED_LISTING_TYPES.has(t)) {
      return { ok: false, error: `Unsupported listing type: ${fill.listingType}` };
    }
    out.listingType = t;
  }

  if (fill.condition) {
    if (!ALLOWED_CONDITIONS.has(fill.condition)) {
      return { ok: false, error: `Invalid condition: ${fill.condition}` };
    }
    out.condition = fill.condition;
  }

  if (fill.category) {
    const cat = fill.category.trim();
    if (
      out.listingType === "physical" ||
      fill.listingType === "physical" ||
      (!fill.listingType && !out.listingType)
    ) {
      if (!ALLOWED_PHYSICAL_CATEGORIES.has(cat) && cat.length > 40) {
        return { ok: false, error: `Unsupported category: ${cat}` };
      }
    }
    out.category = cat.slice(0, 60);
  }

  if (fill.price !== undefined && fill.price !== "") {
    const priceCheck = validatePriceString(fill.price);
    if (!priceCheck.ok) return priceCheck;
    out.price = priceCheck.price;
  }

  if (fill.title) out.title = String(fill.title).trim().slice(0, 120);
  if (fill.description) out.description = String(fill.description).trim().slice(0, 8000);
  if (fill.location) out.location = String(fill.location).trim().slice(0, 80);
  if (fill.pickupArea) out.pickupArea = String(fill.pickupArea).trim().slice(0, 80);
  if (typeof fill.pickupAvailable === "boolean") out.pickupAvailable = fill.pickupAvailable;
  if (typeof fill.shippingAvailable === "boolean") out.shippingAvailable = fill.shippingAvailable;
  if (typeof fill.acceptOffers === "boolean") out.acceptOffers = fill.acceptOffers;
  if (fill.saleType === "buy_now" || fill.saleType === "auction" || fill.saleType === "auction_buy_now") {
    out.saleType = fill.saleType;
  }
  if (fill.paymentType === "stripe" || fill.paymentType === "contact") {
    out.paymentType = fill.paymentType;
  }
  if (Array.isArray(fill.extras)) {
    out.extras = fill.extras
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 24);
  }

  // Pass through remaining already-typed draft fields (vehicle/rental) after scalar sanitize
  for (const key of [
    "vehicleMake",
    "vehicleModel",
    "vehicleYear",
    "vehicleOdometer",
    "vehicleColour",
    "vehicleTransmission",
    "vehicleFuelType",
    "vehicleBodyType",
    "rentalPriceWeekly",
    "rentalPriceMonthly",
    "rentalDeposit",
    "stockQuantity",
    "serviceDuration",
    "servicePricingType",
    "rentalSubType",
  ] as const) {
    const v = fill[key];
    if (typeof v === "string" && v.trim()) {
      (out as Record<string, string>)[key] = v.trim().slice(0, 120);
    }
  }

  const normalized = normalizeSkyAiListingFill(out);
  if (!normalized && !hasFormActionContent(out) && !out.price && !out.condition && !out.title) {
    return { ok: false, error: "No valid listing fields" };
  }
  const fillOut = normalized || out;
  // normalize() preserves an explicit "physical" even with vehicleMake — coerce back
  if (
    fillOut.listingType !== "service" &&
    fillOut.listingType !== "rental" &&
    fillOut.listingType !== "digital" &&
    (fillOut.vehicleMake ||
      fillOut.vehicleModel ||
      fillOut.vehicleYear ||
      (out.vehicleMake || out.vehicleModel || fill.vehicleMake || fill.vehicleModel) ||
      inferSellListingTypeHint(
        `${fillOut.title || ""} ${fillOut.description || ""} ${fill.title || ""} ${fill.description || ""}`
      ) === "vehicle")
  ) {
    fillOut.listingType = "vehicle";
    if (!fillOut.category || fillOut.category === "Other") fillOut.category = "Cars";
    if (!fillOut.vehicleMake && (out.vehicleMake || fill.vehicleMake)) {
      fillOut.vehicleMake = out.vehicleMake || fill.vehicleMake;
    }
    if (!fillOut.vehicleModel && (out.vehicleModel || fill.vehicleModel)) {
      fillOut.vehicleModel = out.vehicleModel || fill.vehicleModel;
    }
    if (!fillOut.vehicleYear && (out.vehicleYear || fill.vehicleYear)) {
      fillOut.vehicleYear = out.vehicleYear || fill.vehicleYear;
    }
  }
  if (fill.replaceDraft === true) fillOut.replaceDraft = true;
  return { ok: true, fill: fillOut };
}

export function validatePriceString(
  raw: string
): { ok: true; price: string } | { ok: false; error: string } {
  const cleaned = String(raw).replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: "Invalid price — use a number like 500 or 450.50" };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Price must be a non-negative number" };
  }
  if (n > 10_000_000) {
    return { ok: false, error: "Price looks unrealistically high — check the amount" };
  }
  return { ok: true, price: n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2) };
}

function normalizeConditionLocal(raw: string): string | undefined {
  const lower = raw.trim().toLowerCase();
  if (lower === "new") return "New";
  if (/like new|excellent|mint/.test(lower)) return "Used - Like New";
  if (/fair|rough/.test(lower)) return "Used - Fair";
  if (/good|used/.test(lower)) return "Used - Good";
  return undefined;
}

function isStorageOrSizeToken(raw: string, message: string): boolean {
  if (!raw) return false;
  const storage = message.match(STORAGE_GLUED_RE);
  if (storage && (storage[1] === raw || Number(storage[1]) === Number(raw))) return true;
  const nonPrice = message.match(NON_PRICE_NUMBER_RE);
  if (nonPrice && (nonPrice[1] === raw || nonPrice[1] === String(Number(raw)))) return true;
  // "iphone 15 128gb 900" — 128 is storage even if another number is price
  if (/\b\d+\s*(gb|tb)\b/i.test(message) && /^(64|128|256|512|1024|1|2|4)$/.test(raw)) {
    const glued = message.match(new RegExp(`\\b${raw}\\s*(gb|tb)\\b`, "i"));
    if (glued) return true;
  }
  return false;
}

function extractPriceFromMessage(message: string): string | null | "malformed" {
  if (MALFORMED_PRICE_RE.test(message) && !/\$?\s*\d/.test(message)) {
    return "malformed";
  }

  const finalize = (rawDigits: string, kSuffix?: string | null): string | null | "malformed" => {
    if (!rawDigits) return null;
    let n = Number(rawDigits.replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    if (kSuffix) n *= 1000;
    const raw = String(Math.round(n));
    if (isStorageOrSizeToken(raw, message) || isStorageOrSizeToken(rawDigits.replace(/,/g, ""), message)) {
      return null;
    }
    const check = validatePriceString(raw);
    if (!check.ok) return "malformed";
    return check.price;
  };

  // Explicit dollar amounts always win (still reject storage-as-price)
  const dollar = message.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\b/);
  if (dollar) {
    return finalize(dollar[1], dollar[2]);
  }

  // "200 bucks" / "280 dollars" / "200 nzd" — currency words beat history years
  const bucks = message.match(BUCKS_PRICE_RE);
  if (bucks) {
    const raw = finalize(bucks[1], bucks[2]);
    if (raw === "malformed") return "malformed";
    if (raw === null) return null;
    if (
      raw &&
      looksLikeVehicleYearToken(raw, message) &&
      !/\b(bucks|dollars?|nzd)\b/i.test(message)
    ) {
      return null;
    }
    return raw;
  }

  // "200 ono" / "200 o.n.o"
  const ono = message.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:ono|o\.n\.o\.?)\b/i);
  if (ono) {
    const raw = finalize(ono[1], ono[2]);
    if (raw === "malformed") return "malformed";
    if (raw && looksLikeVehicleYearToken(raw, message)) return null;
    return raw;
  }

  // "asking 200" / "asking price 200" / "asking for 200"
  const asking = message.match(
    /\basking(?:\s+(?:price|for))?\s+(?:of\s+)?\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:bucks|nzd|dollars?)?\b/i
  );
  if (asking) {
    return finalize(asking[1], asking[2]);
  }

  // "want 200 for it" / "want $200 for it"
  const wantForIt = message.match(
    /\b(?:want|wants|wanted)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:bucks|nzd|dollars?)?\s+for\s+it\b/i
  );
  if (wantForIt) {
    return finalize(wantForIt[1], wantForIt[2]);
  }

  // "sell it for 200" / "selling it for 200" (also covered by for/at below)
  const sellFor = message.match(
    /\b(?:sell(?:ing)?\s+it\s+for|sell\s+for)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:bucks|nzd|dollars?)?\b/i
  );
  if (sellFor) {
    return finalize(sellFor[1], sellFor[2]);
  }

  // Bare price after storage capacity: "128gb 900" / "256GB 900 Hamilton"
  const afterStorage = message.match(
    /\b\d+\s*(?:gb|tb)\b[\s,]*(?:(?:brand\s+)?(?:like\s+)?new|used|good|fair|mint|excellent)?[\s,]*\$?\s*([\d,]{2,8}(?:\.\d{1,2})?)\s*(k|K)?\b/i
  );
  if (afterStorage) {
    const raw = finalize(afterStorage[1], afterStorage[2]);
    if (raw === "malformed") return "malformed";
    if (raw && !looksLikeVehicleYearToken(raw, message)) return raw;
  }

  // Bare amount before NZ city: "900 Hamilton" / "450 Auckland"
  // Skip search budgets: "under 15k Auckland" / "below 10k Wellington"
  const beforeCity = message.match(
    /\b([\d,]{2,8}(?:\.\d{1,2})?)\s*(k|K)?\s+(?:in\s+)?(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston\s+north|new\s+plymouth|rotorua|queenstown|invercargill|nelson|whangarei)\b/i
  );
  if (beforeCity) {
    const idx = beforeCity.index ?? -1;
    const prefix = idx >= 0 ? message.slice(Math.max(0, idx - 24), idx) : "";
    const isBudget =
      /\b(under|below|max(?:imum)?|budget|up\s+to|less\s+than|no\s+more\s+than)\s*$/i.test(
        prefix
      ) || /\b(find|looking for|search(?:ing)?|want to buy|need a)\b/i.test(message);
    if (!isBudget) {
      const raw = finalize(beforeCity[1], beforeCity[2]);
      if (raw === "malformed") return "malformed";
      if (raw && !looksLikeVehicleYearToken(raw, message) && !isStorageOrSizeToken(raw, message)) {
        return raw;
      }
    }
  }

  const m = message.match(
    /\b(?:(?:make(?:\s+it)?|set(?:\s+(?:the|it|price))?|price(?:\s+is)?|actually|change(?:\s+(?:it|price|to))?|update(?:\s+price)?|it'?s)\s+)\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:bucks|nzd|dollars?|ono|o\.n\.o\.?)?\b|\b(?:for|at)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:bucks|nzd|dollars?|ono|o\.n\.o\.?)?\b/i
  );
  const rawDigits = (m?.[1] || m?.[3] || "").replace(/,/g, "");
  const kSuffix = m?.[2] || m?.[4];
  if (!rawDigits) {
    if (/\$\s*[^\d]|\bprice\s*[:=]?\s*[a-z]/i.test(message)) return "malformed";
    return null;
  }
  let num = Number(rawDigits);
  if (kSuffix) num *= 1000;
  const raw = String(Math.round(num));

  // Bare vehicle years are never prices ("bmw 335i 2007")
  if (looksLikeVehicleYearToken(raw, message) || looksLikeVehicleYearToken(rawDigits, message)) {
    const explicitPriceVerb =
      /\b(?:make(?:\s+it)?|set(?:\s+(?:the|it|price))?|price(?:\s+is)?|change(?:\s+(?:it|price|to))?|update(?:\s+price)?|asking|want\s+\$?\d+\s+for\s+it|sell(?:ing)?\s+it\s+for)\s+\$?\s*\d/i.test(
        message
      );
    if (!explicitPriceVerb) return null;
    const year = parseVehicleYear(message);
    if ((year === raw || year === rawDigits) && !/\$/.test(message) && !/\bprice\b/i.test(message)) {
      return null;
    }
  }

  // Storage / qty / size
  if (NON_PRICE_NUMBER_RE.test(message)) {
    const nonPrice = message.match(NON_PRICE_NUMBER_RE);
    if (nonPrice && (nonPrice[1] === raw || nonPrice[1] === rawDigits)) return null;
  }

  const check = validatePriceString(raw);
  if (!check.ok) return "malformed";
  return check.price;
}

/** Exported for regression tests. */
export function parseListingPriceFromMessage(message: string): string | null | "malformed" {
  return extractPriceFromMessage(message);
}

function extractSellItem(message: string): string | undefined {
  const m = message.match(SELL_ITEM_RE);
  if (!m?.[1]) return undefined;
  let item = m[1].replace(/\b(for sale|please|thanks)\b/gi, "").trim();
  const stop = item.search(SELL_ITEM_STOP_RE);
  if (stop > 0) item = item.slice(0, stop).trim();
  item = item
    .replace(/\$[\d,]+.*$/i, "")
    .replace(/\b\d+\s*(?:bucks|nzd|dollars?).*$/i, "")
    .replace(NZ_CITY_TAIL_RE, "")
    .replace(/\s+(\d{2,7}(?:\.\d{1,2})?)\s*(k|K)?\s*$/i, (full, digits) => {
      if (isStorageOrSizeToken(String(digits), message)) return full;
      if (looksLikeVehicleYearToken(String(digits), message)) return full;
      return "";
    })
    .replace(/\b(brand\s+new|its|it's)\b.*$/i, "")
    .trim();
  // Keep known product tokens even if stop ate too much
  if (item.length < 2) {
    const known = message.match(
      /\b(ps5|ps4|playstation\s*[45]|xbox(?:\s*series\s*[sx])?|iphone(?:\s*\d+\s*pro)?|airpods(?:\s*pro)?(?:\s*\d+)?|couch|sofa|skyline(?:\s*r[\s-]?3[2-4])?|r[\s-]?3[2-4]|supra|rx[\s-]?[78]|ranger|hilux|[1-8]\d{2}[a-z]?|bmw|toyota|mazda|honda|ford|nissan)\b/i
    );
    if (known) item = known[0];
  }
  if (item.length < 2 || item.length > 80) return undefined;
  return item.replace(/\s+/g, " ").trim();
}

/** Rental offer item seed — strips rent/hire verb debris and price/location tails. */
function extractRentalOfferItem(message: string): string | undefined {
  const m = message.match(
    /\b(?:rent(?:ing)?|hire(?:ing)?)\s+(?:out\s+)?(?:my\s+|a\s+|an\s+|the\s+)?(.+)$/i
  );
  if (!m?.[1]) return undefined;
  let item = m[1].trim();
  const stop = item.search(
    /\b(?:for\s+\$|\$\d|\d+\s*(?:\/\s*day|a\s+day|per\s+day|\/day|bucks|nzd|dollars?)|auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|rotorua|queenstown|nelson|whangarei)\b/i
  );
  if (stop > 0) item = item.slice(0, stop).trim();
  item = item
    .replace(/\$[\d,]+.*$/i, "")
    .replace(NZ_CITY_TAIL_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  item = cleanRentalItemName(item);
  if (item.length < 2 || item.length > 80) return undefined;
  return item;
}

function buildTitleAndDescription(
  item: string,
  extras?: {
    condition?: string;
    price?: string;
    location?: string;
    pickupAvailable?: boolean;
    listingType?: string;
  }
): Pick<SkyAiListingFill, "title" | "description" | "category" | "listingType" | "vehicleMake" | "vehicleModel" | "vehicleYear"> {
  const composed = composeListingTitleAndDescription({
    item,
    condition: extras?.condition,
    price: extras?.price,
    location: extras?.location,
    pickupAvailable: extras?.pickupAvailable,
    listingType: extras?.listingType,
  });
  return {
    title: composed.title,
    description: composed.description,
    category: composed.category || "Other",
    listingType: composed.listingType,
    vehicleMake: composed.vehicleMake,
    vehicleModel: composed.vehicleModel,
    vehicleYear: composed.vehicleYear,
  };
}

function contextToFill(ctx: SkyAiListingContext | null | undefined): SkyAiListingFill {
  if (!ctx || !hasActiveListingDraft(ctx)) return {};
  const fill: SkyAiListingFill = {};
  const src = ctx as SkyAiListingContext & SkyAiListingFill;
  for (const [k, v] of Object.entries(src)) {
    if (k === "extras" && Array.isArray(v)) {
      fill.extras = v.filter((x): x is string => typeof x === "string");
    } else if (typeof v === "string" && v.trim()) {
      (fill as Record<string, string>)[k] = v.trim();
    } else if (typeof v === "boolean") {
      (fill as Record<string, boolean>)[k] = v;
    }
  }
  return fill;
}

/**
 * Reconstruct the current draft base for this turn.
 * Client listingContext is authoritative; the module Map is an optional warm cache
 * used only to fill gaps when the client omitted a field.
 */
export function reconstructListingDraftBase(opts: {
  listingContext?: SkyAiListingContext | null;
  sessionKey?: string;
  /** When true, ignore both cache and client prior draft. */
  freshStart?: boolean;
}): SkyAiListingFill {
  if (opts.freshStart) return {};
  const fromContext = contextToFill(opts.listingContext);
  const cacheDraft =
    opts.sessionKey != null ? getListingDraftSession(opts.sessionKey)?.draft : undefined;
  if (!cacheDraft || Object.keys(cacheDraft).length === 0) return fromContext;
  if (Object.keys(fromContext).length === 0) return { ...cacheDraft };
  // Client wins on every set field; cache only supplies missing keys
  const base: SkyAiListingFill = { ...cacheDraft, ...fromContext };
  for (const [k, v] of Object.entries(fromContext)) {
    if (v !== undefined && v !== null && v !== "") {
      (base as Record<string, unknown>)[k] = v;
    }
  }
  return base;
}

export type ListingFillToolResult =
  | {
      handled: true;
      reply: string;
      listingFill?: SkyAiListingFill;
      clarify?: boolean;
      toolCall?: AwhinaToolCall;
      intent: string;
    }
  | { handled: false };

/**
 * Process sell / listing-draft messages into validated partial fills.
 */
export function processListingFillMessage(
  message: string,
  opts: {
    pathname?: string;
    listingContext?: SkyAiListingContext | null;
    sessionKey?: string;
    /** Hard reset — ignore SEARCH/old draft leakage on explicit SELL switch */
    freshStart?: boolean;
  } = {}
): ListingFillToolResult {
  const pathname = opts.pathname || "/";
  const onSell = pathname.startsWith("/post/ai");
  const trimmed = message.trim();
  if (!trimmed) return { handled: false };

  // Destructive: never invent publish/delete — UI confirms
  if (DESTRUCTIVE_RE.test(trimmed) && !hasListingSellIntent(trimmed)) {
    if (/\b(publish|go live|make it live|post it now)\b/i.test(trimmed)) {
      return {
        handled: true,
        reply:
          "I can fill the draft for you, but **Publish** stays on the form — add photos, then tap Publish when you're ready.",
        clarify: true,
        intent: "listing_confirm",
      };
    }
    if (/\b(delete|remove)\b/i.test(trimmed) && /\b(listing|draft|post)\b/i.test(trimmed)) {
      return {
        handled: true,
        reply:
          "I won't delete listings from chat. Use the listing controls on the page if you want to remove a draft or listing.",
        clarify: true,
        intent: "listing_confirm",
      };
    }
  }

  if (UNSUPPORTED_CATEGORY_RE.test(trimmed)) {
    return {
      handled: true,
      reply:
        "That category isn't supported on Sky Drop. Stick to everyday goods, vehicles, services, rentals, or digital — what else are you selling?",
      clarify: true,
      intent: "listing_create",
    };
  }

  const sessionKey = opts.sessionKey || listingDraftSessionKey({ pathname });
  const sellItemEarly = extractSellItem(trimmed);
  const serviceTitleEarly = extractServiceOfferingTitle(trimmed);
  const serviceOffer = hasServiceOfferingIntent(trimmed);
  const rentalOffer = hasRentalOfferingIntent(trimmed);
  // New NL sell request (has item seed) — never inherit SEARCH/old unrelated draft
  const isNewSellSeed =
    opts.freshStart === true ||
    isExplicitNewSellListingMessage(trimmed) ||
    serviceOffer ||
    rentalOffer ||
    (Boolean(sellItemEarly || serviceTitleEarly) &&
      (hasListingSellIntent(trimmed) ||
        /\b(want\s+to\s+list|list(?:ing)?\s+my|sell(?:ing)?\s+my|create\s+(?:a\s+)?listing)\b/i.test(
          trimmed
        )));

  if (isNewSellSeed) {
    clearListingDraftSession(sessionKey);
  }

  const baseDraft: SkyAiListingFill = reconstructListingDraftBase({
    listingContext: opts.listingContext,
    sessionKey,
    freshStart: isNewSellSeed,
  });
  const hasDraft =
    !isNewSellSeed &&
    (hasActiveListingDraft(opts.listingContext) || Object.keys(baseDraft).length > 0);

  // Structured paste shortcut
  const paste = tryListingPasteShortcut(trimmed, pathname, opts.listingContext || null);
  if (paste) {
    const validated = validateListingFillFields(paste.listingFill);
    if (!validated.ok) {
      return { handled: true, reply: validated.error, clarify: true, intent: "listing_create" };
    }
    rememberListingDraft(sessionKey, validated.fill);
    return finishFill(paste.reply, validated.fill, "listing_create");
  }

  // Form toggle tweaks (pickup only, etc.)
  const formShortcut = tryListingFormActionsShortcut(
    trimmed,
    onSell ? "/post/ai" : pathname,
    opts.listingContext || (hasDraft ? (baseDraft as SkyAiListingContext) : null)
  );
  if (formShortcut) {
    const merged = mergeListingFillWithDraft(
      hasDraft ? ({ ...baseDraft } as SkyAiListingContext) : opts.listingContext,
      formShortcut.listingFill
    );
    const validated = validateListingFillFields(merged);
    if (!validated.ok) {
      return { handled: true, reply: validated.error, clarify: true, intent: "listing_update" };
    }
    rememberListingDraft(sessionKey, validated.fill);
    return finishFill(formShortcut.reply, validated.fill, "listing_update");
  }

  // Relative price without amount — clarify (no silent guess)
  if (RELATIVE_PRICE_RE.test(trimmed) && !extractPriceFromMessage(trimmed)) {
    const current = baseDraft.price;
    if (current) {
      return {
        handled: true,
        reply: `Your draft is currently **$${current}**. What price should I set? (e.g. "make it $450")`,
        clarify: true,
        intent: "listing_update",
      };
    }
    return {
      handled: true,
      reply: `What price should I set? Give me a dollar amount (e.g. "$450").`,
      clarify: true,
      intent: "listing_update",
    };
  }

  const partial: SkyAiListingFill = {};
  let touched = false;
  const notes: string[] = [];

  // Price
  let priceRaw = extractPriceFromMessage(trimmed);
  // Draft follow-up: bare amount alone ("12000" / "$450") is a price update
  if (!priceRaw && hasDraft && /^\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*$/i.test(trimmed)) {
    const bare = trimmed.match(/^\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*$/i);
    if (bare) {
      let n = Number(bare[1].replace(/,/g, ""));
      if (bare[2]) n *= 1000;
      if (
        Number.isFinite(n) &&
        n >= 1 &&
        !looksLikeVehicleYearToken(String(Math.round(n)), trimmed)
      ) {
        const check = validatePriceString(String(Math.round(n)));
        if (check.ok) priceRaw = check.price;
      }
    }
  }
  if (priceRaw === "malformed") {
    return {
      handled: true,
      reply: "That price doesn't look valid — use a number like **$500** or **450**.",
      clarify: true,
      intent: "listing_update",
    };
  }
  if (priceRaw) {
    partial.price = priceRaw;
    notes.push(`price $${priceRaw}`);
    touched = true;
  }

  // Condition — "brand new" / "its brand new" → New (current message wins)
  if (/\bbrand\s+new\b/i.test(trimmed)) {
    partial.condition = "New";
    notes.push("condition New");
    touched = true;
  } else {
    const condMatch = trimmed.match(CONDITION_RE);
    if (condMatch) {
      const cond = normalizeConditionLocal(
        condMatch[1] || condMatch[2] || condMatch[3] || ""
      );
      if (cond) {
        partial.condition = cond;
        notes.push(`condition ${cond}`);
        touched = true;
      }
    }
  }

  // Location — "in Auckland" or bare NZ city after pickup
  const locMatch = trimmed.match(LOCATION_RE);
  const bareCity = trimmed.match(
    /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|rotorua|queenstown|nelson|whangarei)\b/i
  );
  const locRaw = locMatch?.[1] && !/^it$/i.test(locMatch[1]) ? locMatch[1] : bareCity?.[1];
  if (locRaw) {
    const loc = locRaw
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
      .slice(0, 80);
    partial.location = loc;
    notes.push(`location ${loc}`);
    touched = true;
  }

  // Pickup / shipping from free text even when not "tweak only"
  const actions = parseFormActionsFromMessage(trimmed);
  if (/\b(pick\s*up|pickup)\b/i.test(trimmed) && actions.pickupAvailable === undefined) {
    actions.pickupAvailable = true;
  }
  if (hasFormActionContent(actions)) {
    Object.assign(partial, mergeFormActionsIntoFill({}, actions));
    const actionNotes = describeFormActions(actions).filter((n) => {
      if (!partial.location) return true;
      return !new RegExp(`^Location:\\s*${partial.location}$`, "i").test(n);
    });
    notes.push(...actionNotes);
    touched = true;
  }

  // Title / description / keywords
  const titleMatch = trimmed.match(TITLE_SET_RE);
  if (titleMatch?.[1]) {
    partial.title = titleMatch[1].trim().slice(0, 120);
    notes.push("title");
    touched = true;
  }
  const descMatch = trimmed.match(DESC_SET_RE);
  if (descMatch?.[1] && !hasListingSellIntent(trimmed) && !isNewSellSeed) {
    partial.description = descMatch[1].trim().slice(0, 8000);
    notes.push("description");
    touched = true;
  }
  const kwMatch = trimmed.match(KEYWORDS_RE);
  if (kwMatch?.[1]) {
    const tags = kwMatch[1]
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (tags.length) {
      partial.extras = tags;
      notes.push("keywords");
      touched = true;
    }
  }

  // Vehicle draft follow-ups: generation / year / odometer (seller path only)
  if (hasDraft && isVehicleListingFill(baseDraft)) {
    const identity = resolveVehicleIdentity(trimmed);
    const genOrModel =
      Boolean(identity.model) &&
      (identity.confidence === "high" ||
        /\br[\s-]?3[2-4]\b|\b(a80|a90|mk\s?[45])\b/i.test(trimmed));
    if (genOrModel && identity.model) {
      if (identity.make) partial.vehicleMake = identity.make;
      else if (baseDraft.vehicleMake) partial.vehicleMake = baseDraft.vehicleMake;
      partial.vehicleModel = identity.model;
      if (identity.year) partial.vehicleYear = identity.year;
      notes.push(`model ${identity.model}`);
      touched = true;
    }

    const yearOnly = trimmed.match(/^\s*((?:19|20)\d{2})\s*$/);
    if (yearOnly && looksLikeVehicleYearToken(yearOnly[1], trimmed)) {
      partial.vehicleYear = yearOnly[1];
      notes.push(`year ${yearOnly[1]}`);
      touched = true;
    } else if (!partial.vehicleYear) {
      const yearInText = parseVehicleYear(trimmed);
      if (
        yearInText &&
        looksLikeVehicleYearToken(yearInText, trimmed) &&
        !partial.price &&
        trimmed.split(/\s+/).length <= 6
      ) {
        partial.vehicleYear = yearInText;
        notes.push(`year ${yearInText}`);
        touched = true;
      }
    }

    const odoMatch = trimmed.match(
      /^\s*([\d,]+)\s*(km|kms|kilometers|kilometres)\s*$/i
    );
    if (odoMatch) {
      const n = Number(odoMatch[1].replace(/,/g, ""));
      if (Number.isFinite(n) && n >= 100 && n <= 2_000_000) {
        partial.vehicleOdometer = String(Math.round(n));
        notes.push(`odometer ${partial.vehicleOdometer}`);
        touched = true;
      }
    }
  }

  // New sell intent — one-pass seed (current message facts only)
  const sellItem = sellItemEarly || extractSellItem(trimmed);
  const serviceTitle = serviceTitleEarly || extractServiceOfferingTitle(trimmed);
  const wantsSell =
    isNewSellSeed ||
    hasListingSellIntent(trimmed) ||
    serviceOffer ||
    rentalOffer ||
    (onSell && sellItem) ||
    (onSell && /^(ps5|xbox|iphone|samsung|laptop|couch)/i.test(trimmed));

  if (
    wantsSell &&
    (sellItem ||
      serviceTitle ||
      serviceOffer ||
      rentalOffer ||
      /selling|sell |list /i.test(trimmed))
  ) {
    const itemRaw =
      serviceTitle ||
      (rentalOffer ? extractRentalOfferItem(trimmed) : undefined) ||
      sellItem ||
      trimmed
        .replace(/^(i'?m\s+)?(want\s+to\s+)?(selling|sell|listing|list)\s+(my\s+|a\s+|an\s+)?/i, "")
        .replace(/\$[\d,]+.*$/, "")
        .trim()
        .slice(0, 80);
    const item = rentalOffer && itemRaw ? cleanRentalItemName(itemRaw) || itemRaw : itemRaw;
    if (item.length >= 2) {
      const typeHint =
        (serviceOffer || serviceTitle ? "service" : undefined) ||
        (rentalOffer ? "rental" : undefined) ||
        inferSellListingTypeHint(trimmed);
      const seeded = buildTitleAndDescription(item, {
        condition: partial.condition,
        price: partial.price,
        location: partial.location,
        pickupAvailable: partial.pickupAvailable,
        listingType: typeHint,
      });
      if (!partial.title) partial.title = seeded.title;
      if (!partial.description) partial.description = seeded.description;
      if (!partial.category && seeded.category) partial.category = seeded.category;
      if (!partial.listingType) partial.listingType = seeded.listingType || typeHint;
      // Prefer explicit vehicle inference / seeded make over a soft physical default
      if (typeHint === "vehicle" || seeded.listingType === "vehicle" || seeded.vehicleMake) {
        partial.listingType = "vehicle";
      }
      if (partial.listingType === "service" && !partial.servicePricingType) {
        partial.servicePricingType = normalizeServicePricingType(
          undefined,
          partial.price,
          trimmed
        );
      }
      if (seeded.vehicleMake) partial.vehicleMake = seeded.vehicleMake;
      if (seeded.vehicleModel) partial.vehicleModel = seeded.vehicleModel;
      if (seeded.vehicleYear) partial.vehicleYear = seeded.vehicleYear;

      // Marketplace knowledge hints — never overwrite USER / already-seeded fields.
      // Fresh sell / new seed: no sticky conversation context (avoids rental→sell bleed).
      const mk = resolveMarketplaceKnowledge(trimmed, {
        conversationKey:
          opts.freshStart || isNewSellSeed ? undefined : opts.sessionKey,
      });
      if (mk.entity && mk.entity.confidence !== "low") {
        const hints = { ...mk.listingHints };
        // Only keep extras the user actually said this turn
        if (hints.extras?.length) {
          hints.extras = hints.extras.filter((e) => {
            const token = String(e).replace(/^[^:]+:/, "").trim();
            if (!token) return false;
            return new RegExp(
              token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              "i"
            ).test(trimmed);
          });
          if (!hints.extras.length) delete hints.extras;
        }
        Object.assign(partial, mergeKnowledgeHintsIntoFill(partial, hints));
        // Prefer knowledge display name for item title core when seed was vague
        if (
          hints.titleHint &&
          partial.title &&
          item.length < 12 &&
          hints.titleHint.length > item.length
        ) {
          const reseed = buildTitleAndDescription(hints.titleHint, {
            condition: partial.condition,
            price: partial.price,
            location: partial.location,
            pickupAvailable: partial.pickupAvailable,
            listingType: partial.listingType || typeHint,
          });
          partial.title = reseed.title;
          if (!partial.description) partial.description = reseed.description;
          if (reseed.vehicleMake) partial.vehicleMake = reseed.vehicleMake;
          if (reseed.vehicleModel) partial.vehicleModel = reseed.vehicleModel;
          if (reseed.vehicleYear) partial.vehicleYear = reseed.vehicleYear;
        }
      }

      if (!notes.some((n) => n.startsWith("title"))) notes.push(`title ${partial.title}`);
      touched = true;
    }
  }

  // On sell page: short follow-ups with draft
  if (!touched && onSell && hasDraft) {
    // Missing info / vague
    if (/^(help|what(?:'s| is) missing|missing info|complete it|finish it)\??$/i.test(trimmed)) {
      if (isVehicleListingFill(baseDraft)) {
        const readiness = getVehicleDraftReadiness(baseDraft);
        return {
          handled: true,
          reply: readiness.nextClarification
            ? readiness.nextClarification
            : `Your draft looks ready — add photos, then tap **Publish** when you're happy.`,
          clarify: Boolean(readiness.nextClarification),
          intent: "listing_update",
        };
      }
      const missing: string[] = [];
      if (!baseDraft.price) missing.push("price");
      if (!baseDraft.condition) missing.push("condition");
      if (!baseDraft.location) missing.push("location");
      if (baseDraft.pickupAvailable === undefined && baseDraft.shippingAvailable === undefined) {
        missing.push("pickup or shipping");
      }
      return {
        handled: true,
        reply:
          missing.length > 0
            ? `Still need: **${missing.join("**, **")}**. Tell me each one and I'll update the draft.`
            : `Your draft looks ready — add photos, then tap **Publish** when you're happy.`,
        clarify: missing.length > 0,
        intent: "listing_update",
      };
    }
  }

  if (!touched) {
    // On sell page with sell-ish short message without parseable fields
    if (onSell && hasListingSellIntent(trimmed) && trimmed.split(/\s+/).length < 4 && !hasDraft) {
      return {
        handled: true,
        reply: `What are you selling? e.g. "selling PS5" or paste the full details.`,
        clarify: true,
        intent: "listing_create",
      };
    }
    return { handled: false };
  }

  // Partial merge — preserve draft; only change requested fields
  let merged = mergeListingFillWithDraft(
    hasDraft ? ({ ...baseDraft } as SkyAiListingContext) : opts.listingContext,
    partial
  );
  // If no prior draft, start from partial alone
  if (!hasDraft) {
    merged = { ...partial };
  } else {
    // Ensure partial fields win even when merge prefers empty incoming skip — they are set
    merged = { ...baseDraft, ...partial };
    // Re-apply context merge for fields we didn't touch
    merged = mergeListingFillWithDraft(
      opts.listingContext || ({ ...baseDraft } as SkyAiListingContext),
      merged
    );
    // Force partial overrides again after merge
    merged = { ...merged, ...partial };
  }

  merged = enhanceListingFillFromMessage(trimmed, merged) || merged;

  // Auto-improve on new seeds / incomplete drafts — never pull SEARCH entities
  if (isNewSellSeed || !hasDraft) {
    merged = autoImproveListingDraft(merged);
  } else if (
    partial.price ||
    partial.condition ||
    partial.location ||
    partial.pickupAvailable !== undefined ||
    partial.shippingAvailable !== undefined ||
    partial.vehicleOdometer ||
    partial.vehicleColour ||
    partial.vehicleTransmission ||
    partial.vehicleModel ||
    partial.vehicleYear ||
    !merged.description ||
    merged.description.length < 40
  ) {
    // Field updates recompose description so sparse vehicle copy grows naturally
    if (merged.listingType === "vehicle" || merged.vehicleMake || merged.vehicleModel) {
      const titleCore = [merged.vehicleYear, merged.vehicleMake, merged.vehicleModel]
        .filter(Boolean)
        .join(" ");
      if (titleCore) {
        merged.title = buildPremiumListingTitle({
          item: titleCore,
          condition: merged.condition,
          listingType: "vehicle",
          vehicleYear: merged.vehicleYear,
        });
      }
    }
    merged.description = buildListingDescriptionFromFacts(merged);
  }
  if (merged.title) merged.title = normalizeProductName(merged.title).slice(0, 120);

  // Strip any leaked vehicle-year-as-price when current message has explicit bucks/$ price
  if (partial.price) merged.price = partial.price;
  if (partial.condition) merged.condition = partial.condition;

  const validated = validateListingFillFields(merged);
  if (!validated.ok) {
    return { handled: true, reply: validated.error, clarify: true, intent: "listing_update" };
  }

  rememberListingDraft(sessionKey, validated.fill);

  const intent = hasDraft && !isNewSellSeed ? "listing_update" : "listing_create";
  if (isNewSellSeed || intent === "listing_create") {
    validated.fill.replaceDraft = true;
  }
  let reply: string;
  if (isCompleteListingDraft(validated.fill)) {
    reply = buildCompleteDraftReply(validated.fill);
  } else if (isNewSellSeed || !hasDraft) {
    const missing: string[] = [];
    if (isVehicleListingFill(validated.fill)) {
      missing.push(...getVehicleDraftReadiness(validated.fill).importantMissing.slice(0, 3));
    } else {
      if (!validated.fill.price) missing.push("price");
      if (!validated.fill.condition) missing.push("condition");
      if (!validated.fill.location) missing.push("location");
    }
    reply = buildIncompleteDraftReply(validated.fill, missing);
  } else {
    const suggestion =
      validated.fill.price && validated.fill.condition
        ? suggestListingImprovements(validated.fill)
        : null;
    reply = buildDraftUpdateReply(validated.fill, notes, { suggestion });
  }

  return finishFill(reply, validated.fill, intent);
}

function finishFill(
  reply: string,
  listingFill: SkyAiListingFill,
  intent: string
): ListingFillToolResult {
  const isPartial = intent === "listing_update";
  if (!isPartial) {
    listingFill = { ...listingFill, replaceDraft: true };
  }
  const toolCall: AwhinaToolCall = isPartial
    ? {
        tool: "updateListingDraft",
        args: {
          updateListingDraft: {
            title: listingFill.title,
            description: listingFill.description,
            category: listingFill.category,
            price: listingFill.price,
            condition: listingFill.condition,
            location: listingFill.location,
            pickupAvailable: listingFill.pickupAvailable,
            shippingAvailable: listingFill.shippingAvailable,
            keywords: listingFill.extras,
          },
        },
        confidence: 0.9,
      }
    : {
        tool: "createListing",
        args: {
          createListing: {
            listingType: listingFill.listingType || "physical",
            title: listingFill.title,
            description: listingFill.description,
            price: listingFill.price,
            category: listingFill.category,
            condition: listingFill.condition,
            location: listingFill.location,
          },
        },
        confidence: 0.9,
      };
  const validated = validateToolCall(toolCall);
  return {
    handled: true,
    reply,
    listingFill,
    intent,
    toolCall: validated.ok ? toolCall : undefined,
  };
}

export function isListingFollowUp(message: string, hasDraft: boolean): boolean {
  if (!hasDraft) return false;
  const t = message.trim();
  if (t.length > 200) return false;
  if (RELATIVE_PRICE_RE.test(t)) return true;
  if (PRICE_SET_RE.test(t) || CONDITION_RE.test(t)) return true;
  if (/\b(pickup|shipping|condition|price|title|description|keywords?|tags?|location)\b/i.test(t)) {
    return true;
  }
  if (/^(actually|make it|set|change|update)\b/i.test(t)) return true;
  return false;
}
