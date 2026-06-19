import type { SkyAiListingFill } from "./sky-ai-listing-fill";

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
  /\b(pickup|shipping|ship only|deliver|delivery|offers?|quantity|stock|qty|auction|buy\s+now|fixed\s+price|located\s+in|based\s+in)\b/i;

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

  if (/\bno\s+pickup\b/.test(n)) out.pickupAvailable = false;
  if (/\bno\s+shipping\b/.test(n)) out.shippingAvailable = false;
  if (/\bpickup\s+available\b/.test(n)) out.pickupAvailable = true;
  if (/\bpickup\s+preferred\b/.test(n)) out.pickupAvailable = true;
  if (/\bshipping\s+available\b/.test(n)) out.shippingAvailable = true;

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
  return hasListingFillOrFormActions(combined) ? combined : fill;
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
