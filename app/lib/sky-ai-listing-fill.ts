import { normalizeServicePricingType } from "./service-pricing";
import { SKY_AI_NAV_TAG, sanitizeNavigateTo } from "./sky-ai-prompt";
import {
  RENTAL_LISTING_CATEGORIES as RENTAL_CATEGORIES,
  SERVICE_LISTING_CATEGORIES as SERVICE_CATEGORIES,
} from "./listing-type-config";
import { isStripeCheckoutProductEnabled } from "./stripe-checkout-flags";

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
  pickupArea?: string;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  acceptOffers?: boolean;
  saleType?: string;
  paymentType?: string;
  /**
   * Explicit NEW sell task — client must clear prior Sky AI draft and apply this
   * fill as source of truth (do not mergeListingFillWithDraft). Follow-ups omit this.
   */
  replaceDraft?: boolean;
  vehicleMake?: string;
  vehicleModel?: string;
  /** Canonical generation token e.g. R34 */
  vehicleGeneration?: string;
  vehicleYear?: string;
  vehicleOdometer?: string;
  vehicleTransmission?: string;
  vehicleFuelType?: string;
  vehicleBodyType?: string;
  vehicleColour?: string;
  pricingType?: string;
  servicePricingType?: string;
  rentalSubType?: string;
  rentalPropertyType?: string;
  /** Daily rate (maps to price field on rental form) */
  rentalPriceDaily?: string;
  rentalPriceWeekly?: string;
  rentalPriceMonthly?: string;
  rentalDeposit?: string;
  rentalBedrooms?: string;
  rentalBathrooms?: string;
  rentalParkingSpaces?: string;
  rentalFurnishedStatus?: string;
  rentalPetsPolicy?: string;
  rentalMinTenancy?: string;
  rentalAvailableDate?: string;
  rentalFeatures?: string[];
  stockQuantity?: string;
  serviceDuration?: string;
  /** Merged add-ons — servicing, tyres, receipts, included items */
  extras?: string[];
  /**
   * Who last wrote the buyer description.
   * When "user", AI must not overwrite on subsequent fills.
   */
  descriptionSource?: "ai" | "user";
  /**
   * Per-field authority stamps from the intelligence merge layer.
   * Client applyFill maps these onto ListingFieldProvenance so USER_CORRECTED
   * survives re-photo / later AI fills.
   */
  fieldAuthority?: Partial<
    Record<
      string,
      | "USER"
      | "USER_CONFIRMED"
      | "USER_CORRECTED"
      | "AWHINA"
      | "IMAGE"
      | "EDITED_EXISTING_LISTING"
    >
  >;
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
  "service",
  "rental",
  "vehicle",
  "wanted",
]);

export function inferPhysicalCategoryFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  // Vehicle signals belong to type=vehicle — never map physical goods to Cars.
  // Use word boundaries so "card" does not match "car".
  if (
    /\b(cars?|vehicles?|auto|bmw|toyota|ford|mazda|honda|nissan|subaru)\b|\d{2,3}[\s,]?\d{3}\s*km/i.test(
      lower
    )
  ) {
    return undefined;
  }
  if (/ps5|ps4|playstation|xbox|nintendo|switch|console|gaming|\bgames?\b/i.test(lower)) {
    return "Gaming";
  }
  if (/iphone|airpods|ipad|samsung|pixel|phone|laptop|macbook|computer|tech/i.test(lower)) {
    return "Tech";
  }
  if (/fashion|clothes|shoe|sneaker|jacket/i.test(lower)) return "Fashion";
  if (/couch|sofa|furniture|home|table|chair|mattress/i.test(lower)) return "Home";
  // Trading cards / collectibles → Sports (existing physical taxonomy; no Collectibles bucket)
  if (
    /trading\s*card|sports?\s*card|football\s*card|soccer\s*card|pokemon|pokémon|yugioh|yu-gi-oh|topps|panini|psa\s*\d|graded\s*card|collectible/i.test(
      lower
    )
  ) {
    return "Sports";
  }
  if (/sport|bike|bicycle|golf|tennis/i.test(lower)) return "Sports";
  return undefined;
}

export function stripSkyAiMachineTags(text: string): string {
  return text
    .replace(SKY_AI_LISTING_FILL_TAG, "")
    .replace(SKY_AI_NAV_TAG, (_, path: string) => formatNavTagForDisplay(path.trim()))
    .trim();
}

/** Turn [[NAV:...]] into visible text — never leave a blank “here's the link” gap. */
export function formatNavTagForDisplay(path: string): string {
  if (path.startsWith("/search")) {
    // Find replies already include a concise "Opening … listings" line; navigateTo handles routing.
    return "";
  }
  if (path === "/vehicles") return "\n\n→ **Opening Vehicles** now.";
  if (path === "/") return "\n\n→ **Opening marketplace** now.";
  return `\n\n→ **Opening ${path}** now.`;
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

function normalizeServiceCategory(raw: string): string {
  const s = raw.trim();
  if (SERVICE_CATEGORIES.has(s)) return s;
  const lower = s.toLowerCase();
  if (/trade|handyman|paint|plumb|electri|carpent|lawn|mow|garden|builder/i.test(lower)) return "Trades & Repairs";
  if (/clean|house|home.*clean|office.*clean/i.test(lower)) return "Cleaning & Maintenance";
  if (/tutor|lesson|teach|music.*lesson|coach.*academic/i.test(lower)) return "Tutoring & Lessons";
  if (/photograph|photo.*shoot|portrait|wedding.*photo/i.test(lower)) return "Photography";
  if (/personal train|fitness|yoga|gym|workout|wellness/i.test(lower)) return "Personal Training";
  if (/event|cater|party|wedding.*plan|dj/i.test(lower)) return "Events & Catering";
  return "Other Services";
}

function inferServicePricingFromText(text: string, price?: string): string | undefined {
  const type = normalizeServicePricingType(undefined, price, text);
  return type;
}

function normalizeCategory(raw: string, listingType?: string): string | undefined {
  if (listingType === "rental") return normalizeRentalCategory(raw);
  if (listingType === "service") return normalizeServiceCategory(raw);
  if (listingType === "vehicle") return "Cars";
  const s = raw.trim();
  // Cars is vehicle-only — never a physical category for new fills.
  if (s === "Cars" && listingType !== "vehicle") {
    return listingType === "physical" ? "Other" : "Cars";
  }
  // Collectibles is not a physical form category — map to Sports
  if (/^collectibles?$/i.test(s)) return "Sports";
  if (CATEGORIES.has(s) && s !== "Cars") return s;
  if (s === "Cars") return "Cars";
  const lower = s.toLowerCase();
  if (/car|vehicle|auto|bmw|toyota|ford/i.test(lower)) {
    return listingType === "physical" ? "Other" : "Cars";
  }
  if (/tech|phone|laptop|computer/i.test(lower)) return "Tech";
  if (/game|console|playstation|xbox/i.test(lower)) return "Gaming";
  if (/fashion|clothes|shoe/i.test(lower)) return "Fashion";
  if (/home|furniture/i.test(lower)) return "Home";
  if (
    /collectible|trading\s*card|sports?\s*card|topps|panini|pokemon|pokémon|psa\b|graded\s*card/i.test(
      lower
    )
  ) {
    return "Sports";
  }
  if (/sport/i.test(lower)) return "Sports";
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

  // Wanted signals — highest priority
  if (/\b(wanted|looking for|seeking|searching for|need|iso|in search of|want to buy)\b/.test(lower)) {
    return "wanted";
  }

  // Explicit sale of a physical good beats hire/rate heuristics
  const sellVerb =
    /\b(sell(?:ing)?|for sale|selling my|get rid of|clearing out)\b/.test(lower) &&
    !/\b(rent|hire|service|freelance)\b/.test(lower);
  if (sellVerb && !/\b(\/day|per day|a day|\/week|per week|\/hr|\/hour|per hour)\b/.test(lower)) {
    // Sell + vehicle signals → vehicle (intent verbs with year/make beat bare physical)
    if (
      raw.vehicleMake ||
      raw.vehicleModel ||
      /\b(19|20)\d{2}\s+(toyota|honda|mazda|ford|holden|nissan|subaru|mitsubishi|hyundai|kia|bmw|mercedes|benz|audi|volkswagen|vw|jeep|tesla|lexus|suzuki)\b/i.test(lower) ||
      (/\b(car|vehicle|ute|van|truck|motorcycle|bmw|toyota|mazda|ford|honda|nissan|holden|subaru)\b/i.test(lower) &&
        /\b(19|20)\d{2}\b/.test(lower))
    ) {
      return "vehicle";
    }
    // Fall through only if strong service nouns appear without sell — else physical
    if (
      !/\b(lawn\s*mowing|photographer|cleaner|tutor|handyman|plumber|electrician)\b/.test(lower)
    ) {
      return "physical";
    }
  }

  // Rental: hire/rent verbs OR day/week rates (not hourly labour)
  if (
    raw.rentalSubType ||
    raw.rentalPriceWeekly ||
    raw.rentalPriceMonthly ||
    raw.rentalDeposit ||
    raw.rentalBedrooms ||
    raw.rentalAvailableDate
  ) {
    return "rental";
  }
  if (/\b(rent|rental|rent out|hire out|for hire|lease|for rent|to rent|renting out)\b/.test(lower)) {
    return "rental";
  }
  if (
    /\b(per day|daily rate|\/day|a day|per night|\/night|per week|\/week|weekly rent)\b/.test(lower) &&
    !/\b(\/hr|\/hour|per hour|an hour|hourly)\b/.test(lower)
  ) {
    return "rental";
  }

  // Service: labour / skills / hourly rates
  if (
    /\b(service|freelance|i will design|logo design|consulting|coaching)\b/.test(lower) ||
    /\b(\/hr|\/hour|per hour|an hour|hourly)\b/.test(lower) ||
    /\b(lawn\s*mowing|mow(?:ing)?(?:\s+lawns?)?|house\s*clean(?:ing)?|cleaner|handyman|plumber|plumbing|electrician|tutor(?:ing)?|photographer|photography|personal\s*train(?:er|ing)?|dog\s*walking|pet\s*sitting|massage|landscap(?:e|ing)|gardening)\b/.test(
      lower
    )
  ) {
    return "service";
  }

  if (/\b(car|vehicle|ute|van|truck|motorcycle|gtr|bmw|toyota|nissan|ford|holden|mazda)\b/.test(lower)) {
    return "vehicle";
  }
  if (raw.vehicleMake || raw.vehicleModel) return "vehicle";
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

function pickBoolField(o: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return undefined;
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

function inferBodyTypeFromText(lower: string): string | undefined {
  if (/suv|4wd|4x4/.test(lower)) return "SUV";
  if (/ute|pickup|truck/.test(lower)) return "Ute";
  if (/\bvan\b/.test(lower)) return "Van";
  if (/wagon|estate/.test(lower)) return "Wagon";
  if (/hatch/.test(lower)) return "Hatchback";
  if (/sedan|saloon/.test(lower)) return "Sedan";
  if (/convert/.test(lower)) return "Convertible";
  if (/coupe|gtr|911|mustang|sports car/.test(lower)) return "Coupe";
  if (/motorcycle|bike/.test(lower)) return "Motorcycle";
  return undefined;
}

function normalizeBodyType(raw: string, model?: string): string | undefined {
  const s = raw.trim();
  if (BODY_TYPES.has(s)) return s;
  const lower = `${s} ${model || ""}`.toLowerCase();
  const inferred = inferBodyTypeFromText(lower);
  if (inferred) return inferred;
  // Unknown stays unknown — never invent "Other" / SUV from an empty select
  if (!s) return undefined;
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

function normalizeRentalMinTenancy(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (/flex|any|no min|open/.test(s)) return "Flexible";
  if (/3.?month|three.?month|quarter/.test(s)) return "3 Months";
  if (/6.?month|six.?month|half.?year/.test(s)) return "6 Months";
  if (/12.?month|one.?year|1.?year|annual/.test(s)) return "12 Months";
  return "Flexible";
}

function normalizeRentalPropertyType(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (/apartment|apt|flat/.test(s)) return "Apartment";
  if (/townhouse|town house/.test(s)) return "Townhouse";
  if (/unit/.test(s)) return "Unit";
  if (/room|bedroom/.test(s)) return "Room";
  if (/house/.test(s)) return "House";
  const titled = raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1);
  return titled || "House";
}

function normalizeRentalFurnishedStatus(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (/partly|partial|semi/.test(s)) return "Partly Furnished";
  if (/unfurnished|un-furnished|not furnished/.test(s)) return "Unfurnished";
  if (/furnished|furniture/.test(s)) return "Furnished";
  return raw.trim() || "Unfurnished";
}

function normalizeRentalPetsPolicy(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (/no pet|no animals|pets not/.test(s)) return "No Pets";
  if (/cat/.test(s)) return "Cats Allowed";
  if (/dog/.test(s)) return "Dogs Allowed";
  if (/negotiat|discuss|consider/.test(s)) return "Pets By Negotiation";
  if (/yes|allow|welcome|ok/.test(s)) return "Pets By Negotiation";
  return "No Pets";
}

export function normalizeSkyAiListingFill(input: unknown): SkyAiListingFill | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const o = input as Record<string, unknown>;
  const daily = pickNumField(o, ["price", "rentalPriceDaily", "dailyRate", "rentalDaily"]);
  const raw: SkyAiListingFill = {
    title: pickField(o, ["title"]),
    description: pickField(o, ["description"]),
    category: pickField(o, ["category"]),
    condition: pickField(o, ["condition"]),
    price: daily,
    listingType: pickField(o, ["listingType", "type"]),
    pricingType: pickField(o, ["pricingType"]),
    servicePricingType: pickField(o, ["servicePricingType", "servicePricing"]),
    location: pickField(o, ["location"]),
    pickupArea: pickField(o, ["pickupArea", "pickup_area", "pickupSuburb", "suburb"]),
    pickupAvailable: pickBoolField(o, ["pickupAvailable", "pickup_available", "pickup"]),
    shippingAvailable: pickBoolField(o, ["shippingAvailable", "shipping_available", "shipping"]),
    acceptOffers: pickBoolField(o, ["acceptOffers", "accept_offers", "offers"]),
    saleType: pickField(o, ["saleType", "sale_type"]),
    paymentType: pickField(o, ["paymentType"]),
    vehicleMake: pickField(o, ["vehicleMake", "make"]),
    vehicleModel: pickField(o, ["vehicleModel", "model"]),
    vehicleGeneration: pickField(o, ["vehicleGeneration", "generation"]),
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
    rentalSubType: pickField(o, ["rentalSubType", "rentalType"]),
    rentalPropertyType: pickField(o, ["rentalPropertyType", "propertyType"]),
    rentalPriceWeekly: pickNumField(o, ["rentalPriceWeekly", "weeklyRate", "rentalWeekly", "weeklyRent"]),
    rentalPriceMonthly: pickNumField(o, ["rentalPriceMonthly", "monthlyRate", "rentalMonthly"]),
    rentalDeposit: pickNumField(o, ["rentalDeposit", "deposit", "bond"]),
    rentalBedrooms: pickNumField(o, ["rentalBedrooms", "bedrooms", "beds"]),
    rentalBathrooms: pickNumField(o, ["rentalBathrooms", "bathrooms", "baths"]),
    rentalParkingSpaces: pickNumField(o, ["rentalParkingSpaces", "parkingSpaces", "parking"]),
    rentalFurnishedStatus: pickField(o, ["rentalFurnishedStatus", "furnishedStatus", "furnished"]),
    rentalPetsPolicy: pickField(o, ["rentalPetsPolicy", "petsPolicy", "pets"]),
    rentalMinTenancy: pickField(o, ["rentalMinTenancy", "minTenancy", "minimumTenancy", "tenancy"]),
    rentalAvailableDate: pickField(o, ["rentalAvailableDate", "availableDate", "availableFrom"]),
    rentalFeatures: Array.isArray(o.rentalFeatures)
      ? (o.rentalFeatures as unknown[]).filter((x): x is string => typeof x === "string").map(s => (s as string).trim()).filter(Boolean)
      : undefined,
    stockQuantity: pickNumField(o, ["stockQuantity", "quantity"]),
    serviceDuration:
      pickField(o, ["serviceDuration"]) ||
      pickField(o, ["deliveryTime"]) ||
      pickField(o, ["turnaround"]),
    extras: Array.isArray(o.extras)
      ? (o.extras as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    replaceDraft: o.replaceDraft === true ? true : undefined,
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
  const hasExtras = !!(raw.extras && raw.extras.length > 0);
  if (!raw.title && !raw.description && !hasPrice && !hasVehicle && !hasExtras) {
    return null;
  }

  const listingType =
    inferListingType(raw, blob) || (hasVehicle ? "vehicle" : "physical");

  const out: SkyAiListingFill = {};
  if (raw.title) out.title = raw.title.slice(0, 120);
  if (raw.description) out.description = raw.description.slice(0, 8000);
  if (raw.extras?.length) out.extras = raw.extras.slice(0, 24);
  if (listingType) out.listingType = listingType;
  const pricingHint = `${raw.title || ""} ${raw.description || ""} ${raw.pricingType || ""} ${raw.servicePricingType || ""}`;
  if (listingType === "service") {
    out.servicePricingType = normalizeServicePricingType(
      raw.servicePricingType || raw.pricingType,
      raw.price,
      pricingHint
    );
  }

  if (listingType === "rental") {
    if (raw.category) out.category = normalizeRentalCategory(raw.category);
    else out.category = normalizeRentalCategory(`${raw.title || ""} ${raw.description || ""}`);
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
    // rentalSubType inference — check explicit field first, then scan blob
    const subRaw = (raw.rentalSubType || "").toLowerCase();
    const subBlob = blob.toLowerCase();
    if (/property|apartment|house|room|flat|unit|townhouse|studio|bedroom|bathroom|furnished|unfurnished|pets/.test(subRaw)) {
      out.rentalSubType = "property";
    } else if (/vehicle|car|van|ute|camper|motorhome|motorcycle|boat|truck/.test(subRaw)) {
      out.rentalSubType = "vehicle";
    } else if (/equipment|gear|tool|trailer|camera|generator|chainsaw|drill|party hire|marquee/.test(subRaw)) {
      out.rentalSubType = "equipment";
    } else if (/\b(apartment|house|flat|room for rent|townhouse|studio|unit|bedrooms?|bathrooms?|per week|weekly rent|bond|furnished|unfurnished|pets allowed|available from)\b/.test(subBlob)) {
      out.rentalSubType = "property";
    } else if (/\b(campervan|motorhome|car hire|van hire|ute hire|vehicle rental|hire car|renting out my|rent out my)\b/.test(subBlob) ||
               /\b(toyota|honda|mazda|ford|holden|nissan|subaru|mitsubishi|hyundai|kia|bmw|mercedes|audi|volkswagen|vw|suzuki|isuzu)\b/.test(subBlob)) {
      out.rentalSubType = "vehicle";
    } else if (raw.rentalBedrooms || raw.rentalBathrooms) {
      out.rentalSubType = "property";
    } else if (raw.vehicleMake || raw.vehicleModel) {
      out.rentalSubType = "vehicle";
    } else {
      out.rentalSubType = "equipment";
    }
    // Property rental fields
    if (raw.rentalBedrooms) out.rentalBedrooms = raw.rentalBedrooms;
    if (raw.rentalBathrooms) out.rentalBathrooms = raw.rentalBathrooms;
    if (raw.rentalParkingSpaces) out.rentalParkingSpaces = raw.rentalParkingSpaces;
    if (raw.rentalPropertyType) out.rentalPropertyType = normalizeRentalPropertyType(raw.rentalPropertyType);
    if (raw.rentalFurnishedStatus) out.rentalFurnishedStatus = normalizeRentalFurnishedStatus(raw.rentalFurnishedStatus);
    if (raw.rentalPetsPolicy) out.rentalPetsPolicy = normalizeRentalPetsPolicy(raw.rentalPetsPolicy);
    if (raw.rentalMinTenancy) out.rentalMinTenancy = normalizeRentalMinTenancy(raw.rentalMinTenancy);
    if (raw.rentalAvailableDate) out.rentalAvailableDate = raw.rentalAvailableDate;
    if (raw.rentalFeatures?.length) out.rentalFeatures = raw.rentalFeatures;
  } else if (listingType === "service") {
    if (raw.category) out.category = normalizeServiceCategory(raw.category);
    else out.category = normalizeServiceCategory(`${raw.title || ""} ${raw.description || ""}`);
    if (!out.servicePricingType) {
      out.servicePricingType = inferServicePricingFromText(pricingHint, raw.price);
    }
    if (out.servicePricingType !== "request_quote" && raw.price) out.price = raw.price;
    if (raw.serviceDuration) out.serviceDuration = raw.serviceDuration.slice(0, 120);
  } else {
    if (raw.price) out.price = raw.price;
    if (raw.category) out.category = normalizeCategory(raw.category, listingType);
    else if (listingType === "vehicle") out.category = "Cars";
  }

  if (raw.location) out.location = raw.location.slice(0, 80);
  if (raw.pickupArea) out.pickupArea = raw.pickupArea.slice(0, 80);
  if (raw.pickupAvailable !== undefined) out.pickupAvailable = raw.pickupAvailable;
  if (raw.shippingAvailable !== undefined) out.shippingAvailable = raw.shippingAvailable;
  if (raw.acceptOffers !== undefined) out.acceptOffers = raw.acceptOffers;
  if (raw.saleType === "buy_now" || raw.saleType === "auction" || raw.saleType === "auction_buy_now") {
    out.saleType = raw.saleType;
  }
  if (raw.condition) out.condition = normalizeCondition(raw.condition);
  if (raw.paymentType) {
    const pt = normalizePaymentType(raw.paymentType);
    if (pt) out.paymentType = pt;
  }
  if (!out.paymentType) {
    out.paymentType = "contact";
  }
  // V1 messaging-first: never emit stripe paymentType when checkout capability is off
  if (!isStripeCheckoutProductEnabled()) {
    out.paymentType = "contact";
  }
  if (listingType === "vehicle" || (raw.vehicleMake || raw.vehicleModel)) {
    // Explicit non-vehicle type (user override) — do not attach vehicle sale fields.
    if (
      listingType === "physical" ||
      listingType === "service" ||
      listingType === "wanted"
    ) {
      // skip vehicle field attach
    } else if (listingType === "rental") {
      if (raw.vehicleMake) out.vehicleMake = raw.vehicleMake.slice(0, 60);
      if (raw.vehicleModel) out.vehicleModel = raw.vehicleModel.slice(0, 60);
      if (raw.vehicleYear) out.vehicleYear = raw.vehicleYear;
      if (raw.vehicleTransmission)
        out.vehicleTransmission = normalizeTransmission(raw.vehicleTransmission);
    } else {
      if (!out.listingType) out.listingType = "vehicle";
      if (!out.category) out.category = "Cars";
      if (raw.vehicleMake) out.vehicleMake = raw.vehicleMake.slice(0, 60);
      if (raw.vehicleModel) out.vehicleModel = raw.vehicleModel.slice(0, 60);
      if (raw.vehicleGeneration) out.vehicleGeneration = raw.vehicleGeneration.slice(0, 24);
      if (raw.vehicleYear) out.vehicleYear = raw.vehicleYear;
      if (raw.vehicleOdometer) out.vehicleOdometer = raw.vehicleOdometer;
      if (raw.vehicleColour)
        out.vehicleColour = normalizeColour(raw.vehicleColour);
      if (raw.vehicleTransmission)
        out.vehicleTransmission = normalizeTransmission(raw.vehicleTransmission);
      if (raw.vehicleFuelType) out.vehicleFuelType = normalizeFuelType(raw.vehicleFuelType);
      if (raw.vehicleBodyType) {
        const body = normalizeBodyType(raw.vehicleBodyType, raw.vehicleModel);
        if (body) out.vehicleBodyType = body;
      } else if (raw.vehicleModel) {
        const inferred = normalizeBodyType("", raw.vehicleModel);
        if (inferred) out.vehicleBodyType = inferred;
      }
    }
  }

  if (raw.replaceDraft === true) out.replaceDraft = true;

  // Preserve intelligence-layer authority stamps (USER_CORRECTED must survive normalize)
  if (o.fieldAuthority && typeof o.fieldAuthority === "object") {
    const allowed = new Set([
      "USER",
      "USER_CONFIRMED",
      "USER_CORRECTED",
      "AWHINA",
      "IMAGE",
      "EDITED_EXISTING_LISTING",
    ]);
    const stamps: NonNullable<SkyAiListingFill["fieldAuthority"]> = {};
    for (const [k, v] of Object.entries(o.fieldAuthority as Record<string, unknown>)) {
      if (typeof v === "string" && allowed.has(v)) {
        stamps[k] = v as NonNullable<SkyAiListingFill["fieldAuthority"]>[string];
      }
    }
    if (Object.keys(stamps).length) out.fieldAuthority = stamps;
  }

  return out;
}

function extractJsonCandidates(text: string): string[] {
  const results: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    let j = i;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) break; }
    }
    if (depth === 0 && j > i) {
      results.push(text.slice(i, j + 1));
      i = j;
    }
  }
  return results;
}

export function extractListingFill(reply: string): SkyAiListingFill | null {
  const re = new RegExp(SKY_AI_LISTING_FILL_TAG.source, "i");
  const match = re.exec(reply);
  if (match?.[1]) {
    try {
      return normalizeSkyAiListingFill(JSON.parse(match[1].trim()));
    } catch {
      return null;
    }
  }

  // Fallback: scan for JSON objects in the reply using balanced-brace extraction
  // (AI sometimes outputs raw JSON without the [[LISTING_FILL]] wrapper tags)
  const candidates = extractJsonCandidates(reply);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        (parsed.listingType || (parsed.title && parsed.description))
      ) {
        const normalized = normalizeSkyAiListingFill(parsed);
        if (normalized) return normalized;
      }
    } catch {
      continue;
    }
  }
  return null;
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
      return formatNavTagForDisplay(path.trim());
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
  setListingType: (v: "physical" | "service" | "rental" | "event" | "vehicle" | "job" | "property" | "wanted") => void;
  setLocation: (v: string) => void;
  setPaymentType?: (v: string) => void;
  setVehicleMake?: (v: string) => void;
  setVehicleModel?: (v: string) => void;
  setVehicleGeneration?: (v: string) => void;
  setVehicleYear?: (v: string) => void;
  setVehicleOdometer?: (v: string) => void;
  setVehicleTransmission?: (v: string) => void;
  setVehicleFuelType?: (v: string) => void;
  setVehicleBodyType?: (v: string) => void;
  setVehicleColour?: (v: string) => void;
  setRentalSubType?: (v: "property" | "equipment" | "vehicle") => void;
  setRentalPropertyType?: (v: string) => void;
  setRentalPriceWeekly?: (v: string) => void;
  setRentalPriceMonthly?: (v: string) => void;
  setRentalDeposit?: (v: string) => void;
  setRentalBedrooms?: (v: string) => void;
  setRentalBathrooms?: (v: string) => void;
  setRentalParkingSpaces?: (v: string) => void;
  setRentalFurnishedStatus?: (v: string) => void;
  setRentalPetsPolicy?: (v: string) => void;
  setRentalMinTenancy?: (v: string) => void;
  setRentalAvailableDate?: (v: string) => void;
  setRentalFeatures?: (v: string[]) => void;
  setPricingType?: (v: string) => void;
  setServicePricingType?: (v: string) => void;
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

  let type = (normalized.listingType || "physical") as
    | "physical"
    | "service"
    | "rental"
    | "vehicle"
    | "wanted";

  const hasVehicleDetails = Boolean(
    normalized.vehicleMake ||
      normalized.vehicleModel ||
      normalized.vehicleYear ||
      normalized.vehicleOdometer
  );

  // Canonical: vehicle identity → type=vehicle (never physical + Cars).
  // Explicit physical/service/wanted/rental from the fill is respected (user type switch).
  const respectExplicitNonVehicle =
    type === "physical" || type === "service" || type === "wanted" || type === "rental";
  if (type === "vehicle" || (hasVehicleDetails && !respectExplicitNonVehicle)) {
    type = "vehicle";
    normalized.category = "Cars";
  } else if (type === "physical" && normalized.category === "Cars") {
    // New physical path never uses Cars — fall back until user picks a goods category.
    normalized.category = "Other";
  }

  h.setListingType(type);

  const applyVehicleFields = () => {
    if (normalized.vehicleMake) h.setVehicleMake?.(normalized.vehicleMake);
    if (normalized.vehicleModel) h.setVehicleModel?.(normalized.vehicleModel);
    if (normalized.vehicleGeneration) h.setVehicleGeneration?.(normalized.vehicleGeneration);
    if (normalized.vehicleYear) h.setVehicleYear?.(normalized.vehicleYear);
    if (normalized.vehicleOdometer) h.setVehicleOdometer?.(normalized.vehicleOdometer);
    if (normalized.vehicleTransmission) h.setVehicleTransmission?.(normalized.vehicleTransmission);
    if (normalized.vehicleFuelType) h.setVehicleFuelType?.(normalized.vehicleFuelType);
    if (normalized.vehicleBodyType) h.setVehicleBodyType?.(normalized.vehicleBodyType);
    if (normalized.vehicleColour) h.setVehicleColour?.(normalized.vehicleColour);
    h.setAcceptOffers?.(false);
    h.setSaleType?.("buy_now");
  };

  if (type === "service") {
    h.setPickupAvailable?.(true);
    h.setShippingAvailable?.(false);
    h.setSaleType?.("buy_now");
    if (normalized.category) h.setCategory(normalized.category);
    else h.setCategory("Other Services");
    if (normalized.servicePricingType) {
      h.setServicePricingType?.(normalized.servicePricingType);
      if (normalized.servicePricingType === "request_quote") {
        h.setAcceptOffers?.(false);
        h.setPrice("");
      } else {
        h.setAcceptOffers?.(true);
        if (normalized.price) h.setPrice(normalized.price);
      }
    } else if (normalized.price) {
      h.setPrice(normalized.price);
      h.setAcceptOffers?.(true);
    }
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
    const sub = normalized.rentalSubType as "property" | "equipment" | "vehicle" | undefined;
    if (sub) h.setRentalSubType?.(sub);
    if (normalized.rentalBedrooms) h.setRentalBedrooms?.(normalized.rentalBedrooms);
    if (normalized.rentalBathrooms) h.setRentalBathrooms?.(normalized.rentalBathrooms);
    if (normalized.rentalParkingSpaces) h.setRentalParkingSpaces?.(normalized.rentalParkingSpaces);
    if (normalized.rentalPropertyType) h.setRentalPropertyType?.(normalized.rentalPropertyType);
    if (normalized.rentalFurnishedStatus) h.setRentalFurnishedStatus?.(normalized.rentalFurnishedStatus);
    if (normalized.rentalPetsPolicy) h.setRentalPetsPolicy?.(normalized.rentalPetsPolicy);
    if (normalized.rentalMinTenancy) h.setRentalMinTenancy?.(normalized.rentalMinTenancy);
    if (normalized.rentalAvailableDate) h.setRentalAvailableDate?.(normalized.rentalAvailableDate);
    if (normalized.rentalFeatures?.length) h.setRentalFeatures?.(normalized.rentalFeatures);
    if (sub === "vehicle") {
      if (normalized.vehicleMake) h.setVehicleMake?.(normalized.vehicleMake);
      if (normalized.vehicleModel) h.setVehicleModel?.(normalized.vehicleModel);
      if (normalized.vehicleYear) h.setVehicleYear?.(normalized.vehicleYear);
      if (normalized.vehicleTransmission) h.setVehicleTransmission?.(normalized.vehicleTransmission);
      if (normalized.stockQuantity) h.setStockQuantity?.(normalized.stockQuantity);
    }
  } else if (type === "vehicle") {
    h.setCategory("Cars");
    if (normalized.condition) h.setCondition(normalized.condition);
    if (normalized.price) h.setPrice(normalized.price);
    if (normalized.paymentType) h.setPaymentType?.(normalized.paymentType);
    if (normalized.pickupAvailable !== undefined) h.setPickupAvailable?.(normalized.pickupAvailable);
    else if (normalized.location) h.setPickupAvailable?.(true);
    if (normalized.shippingAvailable !== undefined) h.setShippingAvailable?.(normalized.shippingAvailable);
    if (normalized.saleType) h.setSaleType?.(normalized.saleType);
    applyVehicleFields();
  } else {
    if (normalized.category) h.setCategory(normalized.category);
    if (normalized.condition) h.setCondition(normalized.condition);
    if (normalized.price) h.setPrice(normalized.price);
    if (normalized.paymentType) h.setPaymentType?.(normalized.paymentType);
    if (normalized.pickupAvailable !== undefined) h.setPickupAvailable?.(normalized.pickupAvailable);
    else if (normalized.location) h.setPickupAvailable?.(true);
    if (normalized.shippingAvailable !== undefined) h.setShippingAvailable?.(normalized.shippingAvailable);
    if (normalized.acceptOffers !== undefined) h.setAcceptOffers?.(normalized.acceptOffers);
    if (normalized.saleType) h.setSaleType?.(normalized.saleType);
    // Physical never applies vehicle sale fields — even if draft memory still has them.
  }

  if (normalized.title) h.setTitle(normalized.title);
  if (normalized.description) h.setDescription(normalized.description);
  if (normalized.location) h.setLocation(normalized.location);
  if (normalized.pricingType && type !== "service") h.setPricingType?.(normalized.pricingType);

  return true;
}
