import { GUIDE_DESTINATIONS } from "./guide-assistant";
import { normalizeServicePricingType } from "./service-pricing";
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
  pickupArea?: string;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  acceptOffers?: boolean;
  saleType?: string;
  paymentType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
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
  "wanted",
]);

const RENTAL_CATEGORIES = new Set(["Other", "Vehicles", "Equipment", "Property"]);

const DIGITAL_CATEGORIES = new Set([
  "Templates & Assets",
  "E-books & Guides",
  "Art & Photography",
  "Software & Audio",
  "Gaming & 3D",
  "Web & App Development",
  "Graphic Design",
  "SEO & Digital Marketing",
  "Other Digital Services",
]);

const SERVICE_CATEGORIES = new Set([
  "Trades & Repairs",
  "Cleaning & Maintenance",
  "Tutoring & Lessons",
  "Photography",
  "Personal Training",
  "Events & Catering",
  "Other Services",
]);

export function inferPhysicalCategoryFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/car|vehicle|auto|bmw|toyota|ford/i.test(lower)) return "Cars";
  if (/tech|phone|laptop|computer/i.test(lower)) return "Tech";
  if (/game|console|playstation|xbox/i.test(lower)) return "Gaming";
  if (/fashion|clothes|shoe/i.test(lower)) return "Fashion";
  if (/home|furniture/i.test(lower)) return "Home";
  if (/sport/i.test(lower)) return "Sports";
  return undefined;
}

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
  // Templates & Assets — downloadable files, packs, bundles, presets, fonts
  if (/template|notion|preset|asset|font|canva|figma|spreadsheet|planner|overlay|lut|lightroom|mockup|bundle|kit|pack|resource|toolkit|checklist|tracker/i.test(lower)) return "Templates & Assets";
  // E-books & Guides — written/educational digital products
  if (/ebook|e-book|guide|pdf|printable|course|workbook|handbook|lesson plan|study.*guide|recipe|blueprint|playbook/i.test(lower)) return "E-books & Guides";
  // Art & Photography — creative digital assets
  if (/photo|art|procreate|brush|illustration|wallpaper|digital art|stock image|stock photo|clipart|svg|icon set|pattern/i.test(lower)) return "Art & Photography";
  // Software & Audio — apps, plugins, music, sound
  if (/software|app|plugin|extension|script|audio|music|beat|loop|sample|sound pack|stem|midi|sfx|ringtone/i.test(lower)) return "Software & Audio";
  // Gaming & 3D — game assets, mods, 3D models
  if (/game|3d|unity|unreal|mod|skin|texture|map|level|asset pack|blender|maya|obj|fbx/i.test(lower)) return "Gaming & 3D";
  // Web & App Development — custom build services
  if (/web.*dev|website|web app|frontend|backend|fullstack|shopify|wordpress|wix|mobile app|api/i.test(lower)) return "Web & App Development";
  // Graphic Design — custom design services
  if (/graphic design|logo|brand|visual identity|flyer|banner|thumbnail|pitch deck|presentation design/i.test(lower)) return "Graphic Design";
  // SEO & Digital Marketing — marketing services
  if (/seo|marketing|social media|advert|email.*campaign|content.*strateg|copywriting|ppc|google ads/i.test(lower)) return "SEO & Digital Marketing";
  // Smarter fallback: if it sounds like a downloadable product, use Templates & Assets
  if (/download|instant.*access|digital.*product|file|zip|pdf|mp3|mp4|png|psd|ai file/i.test(lower)) return "Templates & Assets";
  return "Other Digital Services";
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

function normalizeDigitalPricingType(raw: string, listingType?: string): "fixed" | "quote" | undefined {
  const lower = raw.trim().toLowerCase();
  if (lower === "hourly" || lower === "hourly rate" || lower === "per hour") return undefined;
  if (lower === "fixed" || lower === "fixed price") return "fixed";
  if (lower === "quote" || lower === "request quote" || lower === "quote required" || lower === "contact for quote") {
    return "quote";
  }
  if (listingType === "digital") {
    if (/website|web.*dev|custom.*software|app.*dev|branding|campaign|bespoke/i.test(lower)) return "quote";
    if (/template|ebook|guide|asset|license|download|package|audit/i.test(lower)) return "fixed";
  }
  return undefined;
}

function inferDigitalPricingFromText(text: string): "fixed" | "quote" | undefined {
  const lower = text.toLowerCase();
  if (/quote|price varies|depends on|custom project|bespoke|contact.*quote/i.test(lower)) return "quote";
  // Service-type digital work → quote
  if (/web.*dev|website.*design|website.*build|app.*dev|mobile.*app|seo|branding|logo.*design|graphic.*design|social.*media.*manage|advert|marketing.*campaign|email.*campaign|copywriting|ppc|google.*ads/i.test(lower)) return "quote";
  // Downloadable product keywords → fixed
  if (/template|preset|ebook|e-book|guide|pdf|course|bundle|kit|pack|font|plugin|software|beat|loop|sample|asset|printable|workbook|overlay|lut|lightroom|canva|figma|notion/i.test(lower)) return "fixed";
  if (/\$?\d+/.test(lower)) return "fixed";
  return undefined;
}

function inferServicePricingFromText(text: string, price?: string): string | undefined {
  const type = normalizeServicePricingType(undefined, price, text);
  return type;
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
  // Wanted signals — highest priority check
  const lower = blob.toLowerCase();
  if (/\b(wanted|looking for|seeking|searching for|need|iso|in search of|want to buy)\b/.test(lower)) return "wanted";
  // Rental signals — checked before vehicle brand detection
  if (raw.rentalSubType || raw.rentalPriceWeekly || raw.rentalPriceMonthly || raw.rentalDeposit ||
      raw.rentalBedrooms || raw.rentalAvailableDate) return "rental";
  if (/\b(rent|rental|rent out|hire out|for hire|lease|for rent|to rent|renting out)\b/.test(lower)) return "rental";
  if (/\b(per day|daily rate|\/day|a day|per night|\/night)\b/.test(lower)) return "rental";
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
  console.log('[Awhina normalizeSkyAiListingFill] Input:', input);
  if (!input || typeof input !== "object") {
    console.error('[Awhina normalizeSkyAiListingFill] Input is not an object:', input);
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
  console.log('[Awhina normalizeSkyAiListingFill] Validation check:', { title: raw.title, description: raw.description, hasPrice, hasVehicle, hasExtras });
  if (!raw.title && !raw.description && !hasPrice && !hasVehicle && !hasExtras) {
    console.error('[Awhina normalizeSkyAiListingFill] Validation failed - no data');
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
  if (listingType === "digital" && raw.pricingType) {
    out.pricingType = normalizeDigitalPricingType(raw.pricingType, listingType);
  } else if (listingType === "digital") {
    out.pricingType = inferDigitalPricingFromText(pricingHint);
  }
  if (listingType === "service") {
    out.servicePricingType = normalizeServicePricingType(
      raw.servicePricingType || raw.pricingType,
      raw.price,
      pricingHint
    );
  }

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
  } else if (listingType === "digital") {
    if (raw.category) out.category = normalizeDigitalCategory(raw.category);
    else {
      const inferredCat = inferDigitalPricingFromText(pricingHint) === "quote"
        ? "Other Digital Services"
        : normalizeDigitalCategory(pricingHint);
      out.category = inferredCat || "Other Digital Services";
    }
    if (!out.pricingType && raw.pricingType) {
      out.pricingType = normalizeDigitalPricingType(raw.pricingType, "digital");
    }
    if (!out.pricingType) {
      out.pricingType = inferDigitalPricingFromText(pricingHint) || (raw.price ? "fixed" : undefined);
    }
    if (out.pricingType === "quote") { /* no price needed */ }
    else if (raw.price) out.price = raw.price;
  } else if (listingType === "service") {
    if (raw.category) out.category = normalizeServiceCategory(raw.category);
    else out.category = "Other Services";
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
  if (listingType === "vehicle" || raw.vehicleMake || raw.vehicleModel) {
    if (!out.listingType && listingType !== "rental") out.listingType = "vehicle";
    if (!out.category && listingType !== "rental") out.category = "Cars";
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
  setListingType: (v: "physical" | "digital" | "service" | "rental" | "event" | "vehicle" | "job" | "property" | "wanted") => void;
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
    else h.setCategory("Other Digital Services");
    if (normalized.pricingType) h.setPricingType?.(normalized.pricingType);
    if (normalized.price) h.setPrice(normalized.price);
    if (normalized.paymentType) h.setPaymentType?.(normalized.paymentType);
  } else if (type === "service") {
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
    h.setSaleType?.("buy_now");
    h.setAcceptOffers?.(false);
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
    if (normalized.pickupAvailable !== undefined) h.setPickupAvailable?.(normalized.pickupAvailable);
    else if (normalized.location) h.setPickupAvailable?.(true);
    if (normalized.shippingAvailable !== undefined) h.setShippingAvailable?.(normalized.shippingAvailable);
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
  }

  if (normalized.title) h.setTitle(normalized.title);
  if (normalized.description) h.setDescription(normalized.description);
  if (normalized.location) h.setLocation(normalized.location);
  if (normalized.pricingType && type !== "digital" && type !== "service") h.setPricingType?.(normalized.pricingType);

  return true;
}
