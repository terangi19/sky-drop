import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  harvestSellerEvidence,
  sellerEvidenceToExtras,
} from "./awhina-seller-evidence";
import { parseListingCondition } from "./awhina-listing-condition";

const NZ_REGIONS = [
  "Northland",
  "Auckland",
  "Waikato",
  "Bay of Plenty",
  "Gisborne",
  "Hawke's Bay",
  "Taranaki",
  "Manawatu",
  "Wellington",
  "Nelson",
  "Marlborough",
  "West Coast",
  "Canterbury",
  "Otago",
  "Southland",
] as const;

export type SkyAiFormActions = {
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  acceptOffers?: boolean;
  saleType?: "buy_now" | "auction" | "auction_buy_now";
  stockQuantity?: string;
  location?: string;
  pickupArea?: string;
};

export type SkyAiListingFormActionIntent = keyof SkyAiFormActions;

const FORM_ACTION_INTENT =
  /\b(pick\s*up|pickup|shipping|ship only|deliver|delivery|offers?|quantity|stock|qty|auction|buy\s+now|fixed\s+price|located\s+in|based\s+in)\b/i;

export function isListingFormActionIntent(message: string): boolean {
  return FORM_ACTION_INTENT.test(message);
}

function extractRegion(text: string): string | undefined {
  const n = text.toLowerCase();
  for (const region of NZ_REGIONS) {
    if (n.includes(region.toLowerCase())) return region;
  }
  const located = text.match(/\b(?:located|based)\s+in\s+([A-Za-z][A-Za-z\s'-]{1,30})/i);
  if (located?.[1]) {
    const candidate = located[1].trim();
    const match = NZ_REGIONS.find((r) => r.toLowerCase() === candidate.toLowerCase());
    if (match) return match;
  }
  return undefined;
}

function parsePickupShipping(message: string): Pick<SkyAiFormActions, "pickupAvailable" | "shippingAvailable"> {
  const n = message.toLowerCase();
  const out: Pick<SkyAiFormActions, "pickupAvailable" | "shippingAvailable"> = {};

  if (/\b(pickup\s+and\s+shipping|shipping\s+and\s+pickup|pickup\s*(?:,|&|\+)\s*shipping|both\s+pickup)\b/.test(n)) {
    out.pickupAvailable = true;
    out.shippingAvailable = true;
    return out;
  }

  if (/\b(pickup\s+only|only\s+pickup|pickup-only|local\s+pickup\s+only)\b/.test(n)) {
    out.pickupAvailable = true;
    out.shippingAvailable = false;
    return out;
  }

  if (/\b(shipping\s+only|only\s+shipping|ship\s+only|delivery\s+only)\b/.test(n)) {
    out.pickupAvailable = false;
    out.shippingAvailable = true;
    return out;
  }

  if (/\bno\s+pick\s*up\b/.test(n)) out.pickupAvailable = false;
  if (/\bno\s+shipping\b/.test(n)) out.shippingAvailable = false;
  if (/\bpick\s*up\s+available\b/.test(n)) out.pickupAvailable = true;
  if (/\bpick\s*up\s+preferred\b/.test(n)) out.pickupAvailable = true;
  if (/\bshipping\s+available\b/.test(n)) out.shippingAvailable = true;
  if (out.pickupAvailable === undefined && /\b(pick\s*up|pickup)\b/.test(n)) {
    out.pickupAvailable = true;
  }

  return out;
}

function parseOffers(message: string): Pick<SkyAiFormActions, "acceptOffers"> {
  const n = message.toLowerCase();
  if (/\b(no\s+offers?|offers?\s+off|don't\s+accept\s+offers?|do\s+not\s+accept\s+offers?|offers?\s+disabled)\b/.test(n)) {
    return { acceptOffers: false };
  }
  if (/\b(accept\s+offers?|offers?\s+on|offers?\s+enabled|open\s+to\s+offers?)\b/.test(n)) {
    return { acceptOffers: true };
  }
  return {};
}

function parseQuantity(message: string): Pick<SkyAiFormActions, "stockQuantity"> {
  const m = message.match(/\b(?:quantity|stock|qty)\s*[:\-]?\s*(\d+)\b/i);
  if (m?.[1]) return { stockQuantity: m[1] };
  const inStock = message.match(/\b(\d+)\s+in\s+stock\b/i);
  if (inStock?.[1]) return { stockQuantity: inStock[1] };
  return {};
}

function parseSaleType(message: string): Pick<SkyAiFormActions, "saleType"> {
  const n = message.toLowerCase();
  if (/\bauction\s+buy\s+now\b/.test(n) || /\bbuy\s+now\s+auction\b/.test(n)) {
    return { saleType: "auction_buy_now" };
  }
  if (/\b(buy\s+now|fixed\s+price|fixed\s+price\s+listing)\b/.test(n)) {
    return { saleType: "buy_now" };
  }
  if (/\bauction\b/.test(n)) {
    return { saleType: "auction" };
  }
  return {};
}

/** Rule-based form actions from natural language (pickup only, no offers, etc.) */
export function parseFormActionsFromMessage(message: string): SkyAiFormActions {
  const actions: SkyAiFormActions = {
    ...parsePickupShipping(message),
    ...parseOffers(message),
    ...parseQuantity(message),
    ...parseSaleType(message),
  };

  const region = extractRegion(message);
  if (region) actions.location = region;

  return actions;
}

export function hasFormActionContent(actions: SkyAiFormActions | SkyAiListingFill | null | undefined): boolean {
  if (!actions) return false;
  return (
    actions.pickupAvailable !== undefined ||
    actions.shippingAvailable !== undefined ||
    actions.acceptOffers !== undefined ||
    actions.saleType !== undefined ||
    !!actions.stockQuantity ||
    !!actions.location ||
    !!actions.pickupArea
  );
}

/** Pull nested `actions` object or top-level boolean fields from LISTING_FILL JSON */
export function extractFormActionsFromObject(input: unknown): SkyAiFormActions {
  if (!input || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  const nested =
    o.actions && typeof o.actions === "object" ? (o.actions as Record<string, unknown>) : o;

  const actions: SkyAiFormActions = {};

  if (typeof nested.pickupAvailable === "boolean") actions.pickupAvailable = nested.pickupAvailable;
  if (typeof nested.shippingAvailable === "boolean") actions.shippingAvailable = nested.shippingAvailable;
  if (typeof nested.acceptOffers === "boolean") actions.acceptOffers = nested.acceptOffers;

  const saleRaw = nested.saleType ?? nested.listingMode;
  if (typeof saleRaw === "string") {
    const lower = saleRaw.trim().toLowerCase();
    if (lower === "auction") actions.saleType = "auction";
    else if (lower === "auction_buy_now" || lower === "auction + buy now") actions.saleType = "auction_buy_now";
    else if (lower === "buy_now" || lower === "fixed price" || lower === "fixed_price" || lower === "buy now") {
      actions.saleType = "buy_now";
    }
  }

  const qty = nested.stockQuantity ?? nested.quantity;
  if (typeof qty === "number" && !Number.isNaN(qty)) actions.stockQuantity = String(qty);
  else if (typeof qty === "string" && qty.trim()) actions.stockQuantity = qty.trim().replace(/[^\d]/g, "");

  const loc = nested.location ?? nested.region;
  if (typeof loc === "string" && loc.trim()) {
    const region = extractRegion(loc) || loc.trim().slice(0, 80);
    actions.location = region;
  }

  const area = nested.pickupArea ?? nested.pickup_area ?? nested.pickupSuburb ?? nested.suburb;
  if (typeof area === "string" && area.trim()) {
    actions.pickupArea = area.trim().slice(0, 80);
  }

  return actions;
}

/** When a listing has a location, default pickup on + pickup area for physical/rental/vehicle. */
export function applyDeliveryDefaultsFromLocation(fill: SkyAiListingFill): SkyAiListingFill {
  const type = (fill.listingType || "physical").toLowerCase();
  if (type === "digital" || type === "service") return fill;

  const location = (fill.location || "").trim();
  const pickupArea = (fill.pickupArea || "").trim();
  const loc = location || pickupArea;
  if (!loc) return fill;

  const out: SkyAiListingFill = { ...fill };
  if (!out.location) out.location = loc.slice(0, 80);

  if (out.pickupAvailable === false) {
    if (!out.pickupArea && location) out.pickupArea = location.slice(0, 80);
    return out;
  }

  out.pickupAvailable = true;
  if (!out.pickupArea) out.pickupArea = loc.slice(0, 80);
  return out;
}

export function mergeFormActionsIntoFill(
  fill: SkyAiListingFill,
  actions: SkyAiFormActions
): SkyAiListingFill {
  const merged: SkyAiListingFill = { ...fill };
  if (hasFormActionContent(actions)) {
    if (actions.pickupAvailable !== undefined) merged.pickupAvailable = actions.pickupAvailable;
    if (actions.shippingAvailable !== undefined) merged.shippingAvailable = actions.shippingAvailable;
    if (actions.acceptOffers !== undefined) merged.acceptOffers = actions.acceptOffers;
    if (actions.saleType) merged.saleType = actions.saleType;
    if (actions.stockQuantity) merged.stockQuantity = actions.stockQuantity;
    if (actions.location && !merged.location) merged.location = actions.location;
    if (actions.pickupArea) merged.pickupArea = actions.pickupArea;
  }
  return applyDeliveryDefaultsFromLocation(merged);
}

function mergeListingExtras(existing: string[] | undefined, incoming: string[]): string[] | undefined {
  if (!incoming.length) return existing;
  const out = [...(existing || [])];
  for (const raw of incoming) {
    const extra = raw.trim();
    if (!extra) continue;
    const colon = extra.indexOf(":");
    const key = colon > 0 ? extra.slice(0, colon).toLowerCase().replace(/_/g, "") : "";
    const value = colon > 0 ? extra.slice(colon + 1).trim() : extra;
    const multi = new Set(["modification", "maintenance", "conditiondetail", "mechanical", "compliance", "included", "note"]);
    if (key && !multi.has(key)) {
      const idx = out.findIndex((item) => item.toLowerCase().replace(/_/g, "").startsWith(`${key}:`));
      if (idx >= 0) out[idx] = extra;
      else out.push(extra);
      continue;
    }
    if (!out.some((item) => item.toLowerCase() === extra.toLowerCase())) out.push(extra);
  }
  return out.slice(0, 48);
}

function parseExplicitCondition(message: string): SkyAiListingFill["condition"] | undefined {
  return parseListingCondition(message.replace(/[–—]/g, "-"));
}

function parseGenericProductColour(message: string): string | undefined {
  const parts = message
    .split(/[,.;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const colourWord = /\b(black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|beige|purple|pink|bronze|maroon|navy|titanium|graphite|starlight|cream|natural)\b/i;
  for (const part of parts) {
    if (!colourWord.test(part)) continue;
    if (/\b(condition|fault|damage|repair|battery|box|cable|controller|price|asking|located)\b/i.test(part)) continue;
    if (/\$|\d+\s?(?:gb|tb|km|%)/i.test(part)) continue;
    const words = part.split(/\s+/).filter(Boolean);
    if (words.length >= 1 && words.length <= 4) {
      return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
    }
  }
  return undefined;
}

function supplementalSellerExtras(message: string, fill: SkyAiListingFill): string[] {
  const extras: string[] = [];
  const storage = message.match(/\b(\d+)\s?(gb|tb)\b/i);
  if (storage) extras.push(`storage:${storage[1]}${storage[2].toUpperCase()}`);

  const colour = parseGenericProductColour(message);
  if (colour && !fill.vehicleColour) extras.push(`colour:${colour}`);

  const battery = message.match(/\bbattery(?:\s+health)?\s*(?:is|at|:)?\s*(\d{1,3})\s*%/i) ||
    message.match(/\b(\d{1,3})\s*%\s*battery(?:\s+health)?\b/i);
  if (battery) extras.push(`mechanical:${battery[1]}% battery health`);

  const included = message.match(/\bcomes\s+with\s+([^.!?]+)/i);
  if (included?.[1]) extras.push(`included:Comes with ${included[1].trim()}`);

  const protectedUse = message.match(/\b(?:always|only)\s+used\s+with\s+([^.!?]+)/i);
  if (protectedUse?.[1]) extras.push(`note:Always used with ${protectedUse[1].trim()}`);

  return extras;
}

function enrichSellerFactsFromMessage(message: string, fill: SkyAiListingFill): SkyAiListingFill {
  const out: SkyAiListingFill = { ...fill };
  const explicitCondition = parseExplicitCondition(message);
  if (explicitCondition) out.condition = explicitCondition;

  const harvested = harvestSellerEvidence(message, {
    title: out.title,
    colour: out.vehicleColour,
    location: out.location || out.pickupArea,
    condition: out.condition,
  });
  const harvestedExtras = sellerEvidenceToExtras(harvested);
  const supplemental = supplementalSellerExtras(message, out);
  out.extras = mergeListingExtras(out.extras, [...harvestedExtras, ...supplemental]);

  // Any genuinely new seller facts make the old AI description stale. The
  // async writer will rebuild it from the enriched canonical evidence.
  if (
    out.descriptionSource !== "user" &&
    [...harvestedExtras, ...supplemental].some((extra) =>
      !(fill.extras || []).some((existing) => existing.toLowerCase() === extra.toLowerCase())
    )
  ) {
    out.description = "";
    out.descriptionSource = "ai";
  }
  return out;
}

/** Merge rule-parsed actions + AI JSON actions + optional existing fill */
export function enhanceListingFillFromMessage(
  message: string,
  fill: SkyAiListingFill | undefined
): SkyAiListingFill | undefined {
  if (!fill) return undefined;
  const fromRules = parseFormActionsFromMessage(message);
  const fromJson = extractFormActionsFromObject(fill || {});
  const combined = applyDeliveryDefaultsFromLocation(
    mergeFormActionsIntoFill(mergeFormActionsIntoFill(fill, fromJson), fromRules)
  );
  const enriched = enrichSellerFactsFromMessage(message, combined);
  return hasListingFillOrFormActions(enriched) ? enriched : fill;
}

export function hasListingFillOrFormActions(fill: SkyAiListingFill | null | undefined): boolean {
  if (!fill) return false;
  if (hasFormActionContent(fill)) return true;
  return (
    !!fill.title ||
    !!fill.description ||
    !!fill.price ||
    !!fill.rentalPriceWeekly ||
    !!fill.rentalPriceMonthly ||
    !!fill.vehicleMake ||
    !!fill.vehicleModel ||
    !!(fill.extras && fill.extras.length > 0)
  );
}

/** True when the message is mainly a form toggle tweak (not a new listing description). */
export function isFormTweakOnlyMessage(message: string, hasDraft: boolean): boolean {
  if (!isListingFormActionIntent(message)) return false;
  const trimmed = message.trim();
  if (!trimmed) return false;

  const hasListingContent =
    /\b(sell|selling|listing|bmw|toyota|nissan|ford|iphone|ps5|xbox|laptop|car|vehicle|ute|van)\b/i.test(
      trimmed
    ) || trimmed.length > 140;

  if (hasListingContent && !hasDraft) return false;
  if (hasDraft && trimmed.length <= 160 && isListingFormActionIntent(trimmed)) return true;

  return /^(pickup|shipping|no offers|accept offers|quantity|stock|qty|auction|buy now|fixed price|located in|based in)\b/i.test(
    trimmed
  );
}

export function describeFormActions(actions: SkyAiFormActions): string[] {
  const lines: string[] = [];
  if (actions.pickupAvailable === true && actions.shippingAvailable === false) {
    lines.push("Pickup only");
  } else if (actions.shippingAvailable === true && actions.pickupAvailable === false) {
    lines.push("Shipping only");
  } else if (actions.pickupAvailable === true && actions.shippingAvailable === true) {
    lines.push("Pickup and shipping");
  } else {
    if (actions.pickupAvailable === true) lines.push("Pickup enabled");
    if (actions.pickupAvailable === false) lines.push("Pickup off");
    if (actions.shippingAvailable === true) lines.push("Shipping enabled");
    if (actions.shippingAvailable === false) lines.push("Shipping off");
  }
  if (actions.acceptOffers === false) lines.push("Offers off");
  if (actions.acceptOffers === true) lines.push("Offers on");
  if (actions.saleType === "auction") lines.push("Auction mode");
  if (actions.saleType === "buy_now") lines.push("Fixed price (Buy now)");
  if (actions.saleType === "auction_buy_now") lines.push("Auction + Buy now");
  if (actions.stockQuantity) lines.push(`Stock quantity: ${actions.stockQuantity}`);
  if (actions.location) lines.push(`Location: ${actions.location}`);
  return lines;
}
