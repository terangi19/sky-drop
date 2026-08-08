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
  inferPhysicalCategoryFromText,
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
import { hasListingSellIntent } from "./sky-ai-intent";
import type { AwhinaToolCall } from "./awhina-types";
import { validateToolCall } from "./awhina-tool-registry";
import { suggestListingImprovements } from "./awhina-product-ux";
import { looksLikeVehicleYearToken, parseVehicleYear } from "./sky-ai-find-routing";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 400;

export type ListingDraftSession = {
  draft: SkyAiListingFill;
  updatedAt: number;
};

const sessions = new Map<string, ListingDraftSession>();

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
  /\b(?:(?:make(?:\s+it)?|set(?:\s+(?:the|it|price))?|price(?:\s+is)?|actually|change(?:\s+(?:it|price|to))?|update(?:\s+price)?|it'?s)\s+)\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:bucks|nzd|dollars?)?\b|\b(?:for|at)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:bucks|nzd|dollars?)?\b|\b\$\s*([\d,]+(?:\.\d{1,2})?)\b/i;

const MALFORMED_PRICE_RE =
  /\b(?:\$\s*[^\d\s,]|price\s*(?:is|=|:)?\s*(?:abc|xyz|freeish|tbd|tba|asap|idk)|price\s+[a-z]{2,})\b/i;

/** Storage / qty / size numbers that must never become listing price. */
const NON_PRICE_NUMBER_RE =
  /\b(\d+)\s*(gb|tb|mb|kg|km|sqm|m2|bed|beds|bedroom|bath|baths|seater|pack|pcs?|x\d)\b/i;

const CONDITION_RE =
  /\b(?:condition(?:\s+is)?|it'?s|its)\s+(new|used(?:\s*[-–]?\s*(?:like\s+new|good|fair))?|like\s+new|excellent|mint|good|fair|rough)\b|\b(new|used|like\s+new|excellent|mint)\b(?!\s+(?:zealand|listing))/i;

const SELL_ITEM_RE =
  /\b(?:selling|sell(?:ing)?|list(?:ing)?|post(?:ing)?)\s+(?:my\s+|a\s+|an\s+|the\s+)?(.+?)(?:\s+for\s+\$|\s+\$|\s+at\s+\$|$)/i;

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
  return { ok: true, fill: normalized || out };
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

function extractPriceFromMessage(message: string): string | null | "malformed" {
  if (MALFORMED_PRICE_RE.test(message) && !/\$?\s*\d/.test(message)) {
    return "malformed";
  }

  // Explicit dollar amounts always win
  const dollar = message.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\b/);
  if (dollar) {
    let n = Number(dollar[1].replace(/,/g, ""));
    if (dollar[2]) n *= 1000;
    const check = validatePriceString(String(n));
    if (!check.ok) return "malformed";
    return check.price;
  }

  const m = message.match(
    /\b(?:(?:make(?:\s+it)?|set(?:\s+(?:the|it|price))?|price(?:\s+is)?|actually|change(?:\s+(?:it|price|to))?|update(?:\s+price)?|it'?s)\s+)\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:bucks|nzd|dollars?)?\b|\b(?:for|at)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:bucks|nzd|dollars?)?\b/i
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
      /\b(?:make(?:\s+it)?|set(?:\s+(?:the|it|price))?|price(?:\s+is)?|change(?:\s+(?:it|price|to))?|update(?:\s+price)?)\s+\$?\s*\d/i.test(
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
  let item = m[1]
    .replace(/\b(for sale|please|thanks)\b/gi, "")
    .replace(/\$[\d,]+.*$/, "")
    .trim();
  // Strip trailing condition/price fragments
  item = item.replace(/\b(new|used|pickup|shipping)\b.*$/i, "").trim();
  if (item.length < 2 || item.length > 80) return undefined;
  return item;
}

function buildTitleAndDescription(item: string): Pick<SkyAiListingFill, "title" | "description" | "category" | "listingType"> {
  const title = item
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .slice(0, 120);
  const category = inferPhysicalCategoryFromText(item) || "Other";
  const listingType = /toyota|mazda|honda|ford|bmw|nissan|subaru|ute|car\b|vehicle/i.test(item)
    ? "vehicle"
    : "physical";
  const description = `Selling my ${item}. Honest NZ seller — message me with any questions.`;
  return { title, description, category, listingType };
}

function contextToFill(ctx: SkyAiListingContext | null | undefined): SkyAiListingFill {
  if (!ctx || !hasActiveListingDraft(ctx)) return {};
  const fill: SkyAiListingFill = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k === "extras" && Array.isArray(v)) {
      fill.extras = v.filter((x): x is string => typeof x === "string");
    } else if (typeof v === "string" && v.trim()) {
      (fill as Record<string, string>)[k] = v.trim();
    }
  }
  return fill;
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
  const sessionDraft = getListingDraftSession(sessionKey)?.draft;
  const fromContext = contextToFill(opts.listingContext);
  const baseDraft: SkyAiListingFill = {
    ...fromContext,
    ...(sessionDraft || {}),
  };
  const hasDraft = hasActiveListingDraft(opts.listingContext) || Object.keys(baseDraft).length > 0;

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
  const priceRaw = extractPriceFromMessage(trimmed);
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

  // Condition
  const condMatch = trimmed.match(CONDITION_RE);
  if (condMatch) {
    const cond = normalizeConditionLocal(condMatch[1] || condMatch[2] || "");
    if (cond) {
      partial.condition = cond;
      notes.push(`condition ${cond}`);
      touched = true;
    }
  }

  // Location
  const locMatch = trimmed.match(LOCATION_RE);
  if (locMatch?.[1] && !/^it$/i.test(locMatch[1])) {
    const loc = locMatch[1]
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
  if (hasFormActionContent(actions)) {
    Object.assign(partial, mergeFormActionsIntoFill({}, actions));
    // Avoid duplicate "location X" + "Location: X"
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
  if (descMatch?.[1] && !hasListingSellIntent(trimmed)) {
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

  // New sell intent — seed draft
  const sellItem = extractSellItem(trimmed);
  const wantsSell =
    hasListingSellIntent(trimmed) ||
    (onSell && sellItem) ||
    (onSell && /^(ps5|xbox|iphone|samsung|laptop|couch)/i.test(trimmed));

  if (wantsSell && (sellItem || /selling|sell |list /i.test(trimmed))) {
    const item =
      sellItem ||
      trimmed
        .replace(/^(i'?m\s+)?(selling|sell|listing|list)\s+(my\s+|a\s+|an\s+)?/i, "")
        .replace(/\$[\d,]+.*$/, "")
        .trim()
        .slice(0, 80);
    if (item.length >= 2) {
      const seeded = buildTitleAndDescription(item);
      // Only seed title/desc if not already set by explicit title/desc above
      if (!partial.title) partial.title = seeded.title;
      if (!partial.description && !hasDraft) partial.description = seeded.description;
      if (!partial.category) partial.category = seeded.category;
      if (!partial.listingType) partial.listingType = seeded.listingType;
      if (!notes.includes("title")) notes.push(`draft for ${partial.title}`);
      touched = true;
    }
  }

  // On sell page: short follow-ups with draft
  if (!touched && onSell && hasDraft) {
    // Missing info / vague
    if (/^(help|what(?:'s| is) missing|missing info|complete it|finish it)\??$/i.test(trimmed)) {
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

  const validated = validateListingFillFields(merged);
  if (!validated.ok) {
    return { handled: true, reply: validated.error, clarify: true, intent: "listing_update" };
  }

  rememberListingDraft(sessionKey, validated.fill);

  const title = validated.fill.title || baseDraft.title || "your listing";
  const changeNote =
    notes.length > 0
      ? notes.length === 1 && notes[0].startsWith("draft")
        ? `Started a draft for **${title}**.`
        : `Updated: **${notes.join("**, **")}**.`
      : `Updated your listing draft.`;

  const follow =
    !validated.fill.price || !validated.fill.condition
      ? ` Tell me price, condition, or pickup/shipping next — or add photos and publish when ready.`
      : ` Add photos, then hit **Publish** when ready.`;

  // At most one useful improvement tip — don't overwhelm
  const suggestion =
    validated.fill.price && validated.fill.condition
      ? suggestListingImprovements(validated.fill)
      : null;
  const tip = suggestion ? ` ${suggestion}` : "";

  return finishFill(`${changeNote}${follow}${tip}`, validated.fill, hasDraft ? "listing_update" : "listing_create");
}

function finishFill(
  reply: string,
  listingFill: SkyAiListingFill,
  intent: string
): ListingFillToolResult {
  const isPartial = intent === "listing_update";
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
