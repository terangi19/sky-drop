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
  /** Daily rate (maps to price field on rental form) */
  rentalPriceDaily?: string;
  rentalPriceWeekly?: string;
  rentalPriceMonthly?: string;
  rentalDeposit?: string;
  stockQuantity?: string;
  serviceDuration?: string;
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
  "vehicle",
]);

const RENTAL_CATEGORIES = new Set(["Other", "Vehicles", "Equipment", "Property"]);

const DIGITAL_CATEGORIES = new Set([
  "Templates & Assets",
  "E-books & Guides",
  "Art & Photography",
  "Software & Audio",
  "Gaming & 3D",
]);

const SERVICE_CATEGORIES = new Set([
  "Design & Development",
  "Writing & Translation",
  "Video & Animation",
  "Music & Audio",
  "Marketing & SEO",
  "Consulting & Coaching",
  "Other",
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

function normalizeRentalCategory(raw: string): string {
  const s = raw.trim();
  if (RENTAL_CATEGORIES.has(s)) return s;
  const lower = s.toLowerCase();
  if (/vehicle|car|van|ute|trailer|camper|boat|bike/i.test(lower)) return "Vehicles";
  if (/equipment|tool|camera|drill|machinery|gear/i.test(lower)) return "Equipment";
  if (/property|house|room|apartment|storage/i.test(lower)) return "Property";
  return "Other";
}

function normalizeDigitalCategory(raw: string): string {
  const s = raw.trim();
  if (DIGITAL_CATEGORIES.has(s)) return s;
  const lower = s.toLowerCase();
  if (/template|notion|preset/i.test(lower)) return "Templates & Assets";
  if (/ebook|e-book|guide|pdf/i.test(lower)) return "E-books & Guides";
  if (/photo|art|design asset/i.test(lower)) return "Art & Photography";
  if (/software|app|plugin|audio|music pack/i.test(lower)) return "Software & Audio";
  if (/game|3d|unity|unreal/i.test(lower)) return "Gaming & 3D";
  return "Templates & Assets";
}

function normalizeServiceCategory(raw: string): string {
  const s = raw.trim();
  if (SERVICE_CATEGORIES.has(s)) return s;
  const lower = s.toLowerCase();
  if (/design|logo|ui|ux|dev|web/i.test(lower)) return "Design & Development";
  if (/writ|copy|translat/i.test(lower)) return "Writing & Translation";
  if (/video|animat|edit/i.test(lower)) return "Video & Animation";
  if (/music|audio|sound/i.test(lower)) return "Music & Audio";
  if (/market|seo|social/i.test(lower)) return "Marketing & SEO";
  if (/coach|consult/i.test(lower)) return "Consulting & Coaching";
  return "Other";
}

function normalizeCategory(raw: string, listingType?: string): string | undefined {
  if (listingType === "rental") return normalizeRentalCategory(raw);
  if (listingType === "digital") return normalizeDigitalCategory(raw);
  if (listingType === "service") return normalizeServiceCategory(raw);
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
  if (/rent|hire|lease/.test(lower)) return "rental";
  if (lower === "car" || category === "Cars") return "vehicle";
  return undefined;
}

function inferListingType(
  raw: SkyAiListingFill,
  blob: string
): string | undefined {
  if (raw.listingType) return normalizeListingType(raw.listingType, raw.category);
  const lower = blob.toLowerCase();
  if (/\b(rent|rental|rent out|hire out|for hire|lease)\b/.test(lower)) return "rental";
  if (/\b(per day|daily rate|\/day|a day)\b/.test(lower)) return "rental";
  if (/\b(digital|download|template|ebook|e-book|instant delivery|notion|preset)\b/.test(lower))
    return "digital";
  if (/\b(service|freelance|i will design|logo design|consulting|coaching|per hour)\b/.test(lower))
    return "service";
  if (/\b(car|vehicle|ute|van|truck|motorcycle|gtr|bmw|toyota|nissan|ford|holden|mazda)\b/.test(lower))
    return "vehicle";
  if (raw.vehicleMake || raw.vehicleModel) return "vehicle";
  if (DIGITAL_CATEGORIES.has(raw.category || "")) return "digital";
  if (SERVICE_CATEGORIES.has(raw.category || "")) return "service";
  if (raw.category === "Cars") return "vehicle";
  if (RENTAL_CATEGORIES.has(raw.category || "")) return "rental";
  return undefined;
}

function pickField(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickNumField(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && !Number.isNaN(v)) return String(v);
    if (typeof v === "string" && v.trim()) return v.trim().replace(/[$,]/g, "");
  }
  return "";
}

const BODY_TYPES = new Set([
  "SUV",
  "Sedan",
  "Hatchback",
  "Wagon",
  "Coupe",
  "Convertible",
  "Ute",
  "Van",
  "Truck",
  "Motorcycle",
  "Other",
]);

const FUEL_TYPES = new Set([
  "Petrol",
  "Diesel",
  "Electric",
  "Hybrid",
  "Plug-in Hybrid",
  "Other",
]);

const TRANSMISSION_TYPES = new Set(["Automatic", "Manual", "Other"]);

function normalizeBodyType(raw: string, model?: string): string {
  const s = raw.trim();
  if (BODY_TYPES.has(s)) return s;
  const lower = `${s} ${model || ""}`.toLowerCase();
  if (/suv|4wd|4x4/.test(lower)) return "SUV";
  if (/ute|pickup|truck/.test(lower)) return "Ute";
  if (/van/.test(lower)) return "Van";
  if (/wagon|estate/.test(lower)) return "Wagon";
  if (/hatch/.test(lower)) return "Hatchback";
  if (/sedan|saloon/.test(lower)) return "Sedan";
  if (/convert/.test(lower)) return "Convertible";
  if (/coupe|gtr|911|mustang|sports car/.test(lower)) return "Coupe";
  if (/motorcycle|bike/.test(lower)) return "Motorcycle";
  return "Other";
}

function normalizeFuelType(raw: string): string {
  const s = raw.trim();
  if (FUEL_TYPES.has(s)) return s;
  const lower = s.toLowerCase();
  if (/diesel/.test(lower)) return "Diesel";
  if (/electric|ev\b/.test(lower)) return "Electric";
  if (/plug.in|phev/.test(lower)) return "Plug-in Hybrid";
  if (/hybrid/.test(lower)) return "Hybrid";
  if (/petrol|gasoline|gas\b/.test(lower)) return "Petrol";
  return "Petrol";
}

function normalizeTransmission(raw: string): string {
  const s = raw.trim();
  if (TRANSMISSION_TYPES.has(s)) return s;
  const lower = s.toLowerCase();
  if (/manual|stick/.test(lower)) return "Manual";
  if (/auto|cvt|dct/.test(lower)) return "Automatic";
  return "Automatic";
}

function normalizeColour(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function normalizeSkyAiListingFill(input: unknown): SkyAiListingFill | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const daily = pickNumField(o, ["price", "rentalPriceDaily", "dailyRate", "rentalDaily"]);
  const raw: SkyAiListingFill = {
    title: pickField(o, ["title"]),
    description: pickField(o, ["description"]),
    category: pickField(o, ["category"]),
    condition: pickField(o, ["condition"]),
    price: daily,
    listingType: pickField(o, ["listingType", "type"]),
    location: pickField(o, ["location"]),
    paymentType: pickField(o, ["paymentType"]),
    vehicleMake: pickField(o, ["vehicleMake", "make"]),
    vehicleModel: pickField(o, ["vehicleModel", "model"]),
    vehicleYear: pickNumField(o, ["vehicleYear", "year"]),
    vehicleOdometer: pickNumField(o, ["vehicleOdometer", "odometer", "kms", "km"]).replace(
      /[^\d]/g,
      ""
    ),
    vehicleTransmission: pickField(o, ["vehicleTransmission", "transmission"]),
    vehicleFuelType: pickField(o, ["vehicleFuelType", "fuelType", "fuel"]),
    vehicleBodyType: pickField(o, ["vehicleBodyType", "bodyType", "body"]),
    vehicleColour: pickField(o, ["vehicleColour", "vehicleColor", "colour", "color"]),
    rentalPriceDaily: daily,
    rentalPriceWeekly: pickNumField(o, ["rentalPriceWeekly", "weeklyRate", "rentalWeekly"]),
    rentalPriceMonthly: pickNumField(o, ["rentalPriceMonthly", "monthlyRate", "rentalMonthly"]),
    rentalDeposit: pickNumField(o, ["rentalDeposit", "deposit", "bond"]),
    stockQuantity: pickNumField(o, ["stockQuantity", "quantity"]),
    serviceDuration:
      pickField(o, ["serviceDuration"]) ||
      pickField(o, ["deliveryTime"]) ||
      pickField(o, ["turnaround"]),
  };

  const blob = `${raw.title} ${raw.description} ${raw.listingType} ${raw.vehicleMake} ${raw.vehicleModel}`;
  const hasPrice =
    !!raw.price || !!raw.rentalPriceWeekly || !!raw.rentalPriceMonthly;
  const hasVehicle =
    !!raw.vehicleMake ||
    !!raw.vehicleModel ||
    !!raw.vehicleYear ||
    !!raw.vehicleColour ||
    !!raw.vehicleOdometer;
  if (!raw.title && !raw.description && !hasPrice && !hasVehicle) return null;

  const listingType =
    inferListingType(raw, blob) || (hasVehicle ? "vehicle" : undefined);

  const out: SkyAiListingFill = {};
  if (raw.title) out.title = raw.title.slice(0, 120);
  if (raw.description) out.description = raw.description.slice(0, 8000);
  if (listingType) out.listingType = listingType;

  if (listingType === "rental") {
    if (raw.category) out.category = normalizeRentalCategory(raw.category);
    else out.category = "Other";
    const dailyNum = Number(raw.price || raw.rentalPriceDaily);
    const weeklyNum = Number(raw.rentalPriceWeekly);
    const monthlyNum = Number(raw.rentalPriceMonthly);
    if (dailyNum > 0) {
      out.price = String(Math.round(dailyNum));
      out.rentalPriceDaily = out.price;
      if (!raw.rentalPriceWeekly) out.rentalPriceWeekly = String(Math.round(dailyNum * 7));
      else out.rentalPriceWeekly = raw.rentalPriceWeekly;
      if (!raw.rentalPriceMonthly) {
        const w = Number(out.rentalPriceWeekly);
        if (w > 0) out.rentalPriceMonthly = String(Math.round(w * 4));
      } else out.rentalPriceMonthly = raw.rentalPriceMonthly;
    } else if (weeklyNum > 0) {
      out.rentalPriceWeekly = String(Math.round(weeklyNum));
      out.price = String(Math.round(weeklyNum / 7));
      out.rentalPriceDaily = out.price;
      if (!raw.rentalPriceMonthly) out.rentalPriceMonthly = String(Math.round(weeklyNum * 4));
      else out.rentalPriceMonthly = raw.rentalPriceMonthly;
    } else if (monthlyNum > 0) {
      out.rentalPriceMonthly = String(Math.round(monthlyNum));
      const weekly = Math.round(monthlyNum / 4);
      out.rentalPriceWeekly = String(weekly);
      out.price = String(Math.max(1, Math.round(weekly / 7)));
      out.rentalPriceDaily = out.price;
    }
    if (raw.rentalDeposit) out.rentalDeposit = raw.rentalDeposit;
    if (raw.stockQuantity) out.stockQuantity = raw.stockQuantity;
  } else if (listingType === "digital") {
    if (raw.category) out.category = normalizeDigitalCategory(raw.category);
    else out.category = "Templates & Assets";
    if (raw.price) out.price = raw.price;
  } else if (listingType === "service") {
    if (raw.category) out.category = normalizeServiceCategory(raw.category);
    else out.category = "Design & Development";
    if (raw.price) out.price = raw.price;
    if (raw.serviceDuration) out.serviceDuration = raw.serviceDuration.slice(0, 120);
  } else {
    if (raw.price) out.price = raw.price;
    if (raw.category) out.category = normalizeCategory(raw.category, listingType);
    else if (listingType === "vehicle") out.category = "Cars";
  }

  if (raw.location) out.location = raw.location.slice(0, 80);
  if (raw.condition) out.condition = normalizeCondition(raw.condition);
  if (raw.paymentType) {
    const pt = normalizePaymentType(raw.paymentType);
    if (pt) out.paymentType = pt;
  }
  if (listingType === "vehicle" || raw.vehicleMake || raw.vehicleModel) {
    if (!out.listingType) out.listingType = "vehicle";
    if (!out.category) out.category = "Cars";
    if (raw.vehicleMake) out.vehicleMake = raw.vehicleMake.slice(0, 60);
    if (raw.vehicleModel) out.vehicleModel = raw.vehicleModel.slice(0, 60);
    if (raw.vehicleYear) out.vehicleYear = raw.vehicleYear;
    if (raw.vehicleOdometer) out.vehicleOdometer = raw.vehicleOdometer;
    if (raw.vehicleColour)
      out.vehicleColour = normalizeColour(raw.vehicleColour);
    if (raw.vehicleTransmission)
      out.vehicleTransmission = normalizeTransmission(raw.vehicleTransmission);
    if (raw.vehicleFuelType) out.vehicleFuelType = normalizeFuelType(raw.vehicleFuelType);
    if (raw.vehicleBodyType)
      out.vehicleBodyType = normalizeBodyType(raw.vehicleBodyType, raw.vehicleModel);
    else if (raw.vehicleModel)
      out.vehicleBodyType = normalizeBodyType("", raw.vehicleModel);
  }

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
  setPaymentType?: (v: string) => void;
  setVehicleMake?: (v: string) => void;
  setVehicleModel?: (v: string) => void;
  setVehicleYear?: (v: string) => void;
  setVehicleOdometer?: (v: string) => void;
  setVehicleTransmission?: (v: string) => void;
  setVehicleFuelType?: (v: string) => void;
  setVehicleBodyType?: (v: string) => void;
  setVehicleColour?: (v: string) => void;
  setRentalPriceWeekly?: (v: string) => void;
  setRentalPriceMonthly?: (v: string) => void;
  setRentalDeposit?: (v: string) => void;
  setPickupAvailable?: (v: boolean) => void;
  setShippingAvailable?: (v: boolean) => void;
  setAcceptOffers?: (v: boolean) => void;
  setSaleType?: (v: string) => void;
  setStockQuantity?: (v: string) => void;
  setServiceDuration?: (v: string) => void;
};

export function applySkyAiListingFill(fill: SkyAiListingFill, h: ListingFillHandlers): boolean {
  const normalized = normalizeSkyAiListingFill(fill);
  if (!normalized) return false;

  const type = (normalized.listingType || "physical") as
    | "physical"
    | "digital"
    | "service"
    | "rental"
    | "vehicle";

  h.setListingType(type);

  if (type === "digital") {
    h.setPickupAvailable?.(false);
    h.setShippingAvailable?.(false);
    h.setAcceptOffers?.(false);
    h.setSaleType?.("buy_now");
    if (normalized.category) h.setCategory(normalized.category);
    else h.setCategory("Templates & Assets");
    if (normalized.price) h.setPrice(normalized.price);
    if (normalized.paymentType) h.setPaymentType?.(normalized.paymentType);
  } else if (type === "service") {
    h.setPickupAvailable?.(false);
    h.setShippingAvailable?.(false);
    h.setAcceptOffers?.(true);
    h.setSaleType?.("buy_now");
    if (normalized.category) h.setCategory(normalized.category);
    else h.setCategory("Design & Development");
    if (normalized.price) h.setPrice(normalized.price);
    if (normalized.serviceDuration) h.setServiceDuration?.(normalized.serviceDuration);
    if (normalized.paymentType) h.setPaymentType?.(normalized.paymentType);
  } else if (type === "rental") {
    h.setPickupAvailable?.(true);
    h.setShippingAvailable?.(false);
    h.setAcceptOffers?.(false);
    h.setSaleType?.("buy_now");
    if (normalized.category) h.setCategory(normalized.category);
    else h.setCategory("Other");
    if (normalized.condition) h.setCondition(normalized.condition);
    else h.setCondition("New");
    if (normalized.price) h.setPrice(normalized.price);
    if (normalized.rentalPriceWeekly) h.setRentalPriceWeekly?.(normalized.rentalPriceWeekly);
    if (normalized.rentalPriceMonthly) h.setRentalPriceMonthly?.(normalized.rentalPriceMonthly);
    if (normalized.rentalDeposit) h.setRentalDeposit?.(normalized.rentalDeposit);
    if (normalized.stockQuantity) h.setStockQuantity?.(normalized.stockQuantity);
  } else if (type === "vehicle") {
    h.setCategory("Cars");
    h.setSaleType?.("buy_now");
    h.setAcceptOffers?.(false);
    h.setPickupAvailable?.(true);
    if (normalized.condition) h.setCondition(normalized.condition);
    if (normalized.price) h.setPrice(normalized.price);
    if (normalized.paymentType) h.setPaymentType?.(normalized.paymentType);
    if (normalized.location) h.setLocation(normalized.location);
    if (normalized.vehicleMake) h.setVehicleMake?.(normalized.vehicleMake);
    if (normalized.vehicleModel) h.setVehicleModel?.(normalized.vehicleModel);
    if (normalized.vehicleYear) h.setVehicleYear?.(normalized.vehicleYear);
    if (normalized.vehicleOdometer) h.setVehicleOdometer?.(normalized.vehicleOdometer);
    if (normalized.vehicleTransmission) h.setVehicleTransmission?.(normalized.vehicleTransmission);
    if (normalized.vehicleFuelType) h.setVehicleFuelType?.(normalized.vehicleFuelType);
    if (normalized.vehicleBodyType) h.setVehicleBodyType?.(normalized.vehicleBodyType);
    if (normalized.vehicleColour) h.setVehicleColour?.(normalized.vehicleColour);
  } else {
    h.setPickupAvailable?.(true);
    if (normalized.category) h.setCategory(normalized.category);
    if (normalized.condition) h.setCondition(normalized.condition);
    if (normalized.price) h.setPrice(normalized.price);
    if (normalized.paymentType) h.setPaymentType?.(normalized.paymentType);
  }

  if (normalized.title) h.setTitle(normalized.title);
  if (normalized.description) h.setDescription(normalized.description);
  if (normalized.location) h.setLocation(normalized.location);

  return true;
}
