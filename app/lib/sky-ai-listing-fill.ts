import { GUIDE_DESTINATIONS } from "./guide-assistant";
import { SKY_AI_NAV_TAG } from "./sky-ai-prompt";

function sanitizeNavigateTo(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const allowed = new Set(GUIDE_DESTINATIONS.map((d) => d.path));
  if (allowed.has(path)) return path;
  const base = path.split("#")[0];
  const match = GUIDE_DESTINATIONS.find((d) => d.path === path || d.path.split("#")[0] === base);
  return match?.path;
}

export const SKY_AI_LISTING_FILL_TAG =
  /\[\[LISTING_FILL\]\]\s*([\s\S]*?)\s*\[\[\/LISTING_FILL\]\]/gi;

export const PENDING_LISTING_FILL_KEY = "skyAiListingFillPending";

export type SkyAiListingFill = {
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: string;
  listingType?: string;
  location?: string;
  paymentType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleOdometer?: string;
  vehicleTransmission?: string;
  vehicleFuelType?: string;
  vehicleBodyType?: string;
  vehicleColour?: string;
};

const CATEGORIES = new Set([
  "Tech",
  "Cars",
  "Gaming",
  "Fashion",
  "Home",
  "Sports",
  "Other",
]);

const CONDITIONS = new Set([
  "New",
  "Used - Like New",
  "Used - Good",
  "Used - Fair",
]);

const LISTING_TYPES = new Set([
  "physical",
  "digital",
  "service",
  "rental",
  "event",
  "vehicle",
  "job",
  "property",
]);

export function stripSkyAiMachineTags(text: string): string {
  return text
    .replace(SKY_AI_LISTING_FILL_TAG, "")
    .replace(SKY_AI_NAV_TAG, "")
    .trim();
}

function normalizeCondition(raw: string): string | undefined {
  const s = raw.trim();
  if (CONDITIONS.has(s)) return s;
  const lower = s.toLowerCase();
  if (lower === "new") return "New";
  if (/like new|excellent|mint/i.test(s)) return "Used - Like New";
  if (/good|used/i.test(s)) return "Used - Good";
  if (/fair|rough/i.test(s)) return "Used - Fair";
  return "Used - Good";
}

function normalizeCategory(raw: string, listingType?: string): string | undefined {
  const s = raw.trim();
  if (CATEGORIES.has(s)) return s;
  const lower = s.toLowerCase();
  if (/car|vehicle|auto|bmw|toyota|ford/i.test(lower)) return "Cars";
  if (/tech|phone|laptop|computer/i.test(lower)) return "Tech";
  if (/game|console|playstation|xbox/i.test(lower)) return "Gaming";
  if (/fashion|clothes|shoe/i.test(lower)) return "Fashion";
  if (/home|furniture/i.test(lower)) return "Home";
  if (/sport/i.test(lower)) return "Sports";
  if (listingType === "vehicle") return "Cars";
  return "Other";
}

function normalizePaymentType(raw: string): "stripe" | "contact" | undefined {
  const lower = raw.trim().toLowerCase();
  if (lower === "stripe" || lower === "card") return "stripe";
  if (
    lower === "contact" ||
    lower === "arrange" ||
    lower.includes("arrange") ||
    lower.includes("bank")
  ) {
    return "contact";
  }
  return undefined;
}

function normalizeListingType(raw: string, category?: string): string | undefined {
  const lower = raw.trim().toLowerCase();
  if (LISTING_TYPES.has(lower)) return lower;
  if (lower === "car" || category === "Cars") return "vehicle";
  return undefined;
}

export function normalizeSkyAiListingFill(input: unknown): SkyAiListingFill | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === "string" ? o[k].trim() : "");
  const raw: SkyAiListingFill = {
    title: pick("title"),
    description: pick("description"),
    category: pick("category"),
    condition: pick("condition"),
    price: pick("price").replace(/[$,]/g, ""),
    listingType: pick("listingType"),
    location: pick("location"),
    paymentType: pick("paymentType"),
    vehicleMake: pick("vehicleMake"),
    vehicleModel: pick("vehicleModel"),
    vehicleYear: pick("vehicleYear"),
    vehicleOdometer: pick("vehicleOdometer").replace(/[^\d]/g, ""),
    vehicleTransmission: pick("vehicleTransmission"),
    vehicleFuelType: pick("vehicleFuelType"),
    vehicleBodyType: pick("vehicleBodyType"),
    vehicleColour: pick("vehicleColour"),
  };

  if (!raw.title && !raw.description && !raw.price) return null;

  const listingType = raw.listingType
    ? normalizeListingType(raw.listingType, raw.category)
    : raw.category || raw.vehicleMake
      ? "vehicle"
      : undefined;

  const out: SkyAiListingFill = {};
  if (raw.title) out.title = raw.title.slice(0, 120);
  if (raw.description) out.description = raw.description.slice(0, 8000);
  if (raw.price) out.price = raw.price;
  if (raw.location) out.location = raw.location.slice(0, 80);
  if (listingType) out.listingType = listingType;
  if (raw.category) out.category = normalizeCategory(raw.category, listingType);
  else if (listingType === "vehicle") out.category = "Cars";
  if (raw.condition) out.condition = normalizeCondition(raw.condition);
  if (raw.paymentType) {
    const pt = normalizePaymentType(raw.paymentType);
    if (pt) out.paymentType = pt;
  }
  if (raw.vehicleMake) out.vehicleMake = raw.vehicleMake;
  if (raw.vehicleModel) out.vehicleModel = raw.vehicleModel;
  if (raw.vehicleYear) out.vehicleYear = raw.vehicleYear;
  if (raw.vehicleOdometer) out.vehicleOdometer = raw.vehicleOdometer;
  if (raw.vehicleTransmission) out.vehicleTransmission = raw.vehicleTransmission;
  if (raw.vehicleFuelType) out.vehicleFuelType = raw.vehicleFuelType;
  if (raw.vehicleBodyType) out.vehicleBodyType = raw.vehicleBodyType;
  if (raw.vehicleColour) out.vehicleColour = raw.vehicleColour;

  return out;
}

export function extractListingFill(reply: string): SkyAiListingFill | null {
  const re = new RegExp(SKY_AI_LISTING_FILL_TAG.source, "i");
  const match = re.exec(reply);
  if (!match?.[1]) return null;
  try {
    return normalizeSkyAiListingFill(JSON.parse(match[1].trim()));
  } catch {
    return null;
  }
}

export function extractSkyAiReply(reply: string): {
  text: string;
  navigateTo?: string;
  listingFill?: SkyAiListingFill;
} {
  const listingFill = extractListingFill(reply) || undefined;
  let navigateTo: string | undefined;
  const text = reply
    .replace(SKY_AI_LISTING_FILL_TAG, "")
    .replace(SKY_AI_NAV_TAG, (_, path: string) => {
      navigateTo = sanitizeNavigateTo(path.trim());
      return "";
    })
    .trim();

  return { text, navigateTo, listingFill };
}

export function queueListingFill(fill: SkyAiListingFill) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_LISTING_FILL_KEY, JSON.stringify(fill));
  } catch {
    /* ignore */
  }
}

export function consumePendingListingFill(): SkyAiListingFill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_LISTING_FILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_LISTING_FILL_KEY);
    return normalizeSkyAiListingFill(JSON.parse(raw));
  } catch {
    return null;
  }
}

export const SKY_AI_LISTING_FILL_EVENT = "sky-ai-listing-fill";

export function dispatchListingFill(fill: SkyAiListingFill) {
  if (typeof window === "undefined") return;
  queueListingFill(fill);
  window.dispatchEvent(
    new CustomEvent<SkyAiListingFill>(SKY_AI_LISTING_FILL_EVENT, { detail: fill })
  );
}

export type ListingFillHandlers = {
  setTitle: (v: string) => void;
  setDescription: (v: string) => void;
  setCategory: (v: string) => void;
  setCondition: (v: string) => void;
  setPrice: (v: string) => void;
  setListingType: (v: "physical" | "digital" | "service" | "rental" | "event" | "vehicle" | "job" | "property") => void;
  setLocation: (v: string) => void;
  setPaymentType: (v: string) => void;
  setVehicleMake: (v: string) => void;
  setVehicleModel: (v: string) => void;
  setVehicleYear: (v: string) => void;
  setVehicleOdometer: (v: string) => void;
  setVehicleTransmission: (v: string) => void;
  setVehicleFuelType: (v: string) => void;
  setVehicleBodyType: (v: string) => void;
  setVehicleColour: (v: string) => void;
};

export function applySkyAiListingFill(fill: SkyAiListingFill, h: ListingFillHandlers): boolean {
  const normalized = normalizeSkyAiListingFill(fill);
  if (!normalized) return false;

  if (normalized.listingType) {
    h.setListingType(
      normalized.listingType as
        | "physical"
        | "digital"
        | "service"
        | "rental"
        | "event"
        | "vehicle"
        | "job"
        | "property"
    );
  }
  if (normalized.title) h.setTitle(normalized.title);
  if (normalized.description) h.setDescription(normalized.description);
  if (normalized.category) h.setCategory(normalized.category);
  if (normalized.condition) h.setCondition(normalized.condition);
  if (normalized.price) h.setPrice(normalized.price);
  if (normalized.location) h.setLocation(normalized.location);
  if (normalized.paymentType) h.setPaymentType(normalized.paymentType);
  if (normalized.vehicleMake) h.setVehicleMake(normalized.vehicleMake);
  if (normalized.vehicleModel) h.setVehicleModel(normalized.vehicleModel);
  if (normalized.vehicleYear) h.setVehicleYear(normalized.vehicleYear);
  if (normalized.vehicleOdometer) h.setVehicleOdometer(normalized.vehicleOdometer);
  if (normalized.vehicleTransmission) h.setVehicleTransmission(normalized.vehicleTransmission);
  if (normalized.vehicleFuelType) h.setVehicleFuelType(normalized.vehicleFuelType);
  if (normalized.vehicleBodyType) h.setVehicleBodyType(normalized.vehicleBodyType);
  if (normalized.vehicleColour) h.setVehicleColour(normalized.vehicleColour);

  return true;
}
