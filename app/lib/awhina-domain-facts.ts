/**
 * Domain-scoped field registry + next-best-question engine.
 *
 * CORE RULE: Never ask a listing question merely because a field exists in
 * Sky Drop's listing schema. Questions come from:
 *   CURRENT OBJECT DOMAIN + SUBTYPE + KNOWN FACTS
 *   + REQUIRED LISTING FIELDS + HIGH-VALUE OPTIONAL FIELDS
 *
 * electronics → smartphone | laptop | console | storage_device | keyboard |
 *               gaming_mouse | headphones | monitor | generic_electronics
 * NOT all electronics have storage / RAM / screen / battery.
 */

import type { ListingMissingSlot } from "./awhina-pending-slots";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

/** Coarse fact-domain used by identity / fusion (kept for compatibility). */
export type AwhinaFactDomain =
  | "PHONE"
  | "VEHICLE"
  | "TRADING_CARD"
  | "GAMING"
  | "GENERIC"
  | "SERVICE"
  | "RENTAL";

/** Electronics inheritance tree (parent ≠ shared specialist fields). */
export type ElectronicsSubtype =
  | "smartphone"
  | "tablet"
  | "laptop"
  | "console"
  | "storage_device"
  | "keyboard"
  | "gaming_mouse"
  | "headphones"
  | "monitor"
  | "generic_electronics";

export type ObjectDomainFamily =
  | "electronics"
  | "vehicle"
  | "trading_card"
  | "clothing"
  | "service"
  | "rental"
  | "gaming_accessory"
  | "physical"
  | "unknown";

export type DomainFactField = {
  key: string;
  slot?: ListingMissingSlot;
  /** Required to publish */
  required: boolean;
  /** High-value for better listings — ask only when still useful */
  highValue: boolean;
  /** Ask priority: higher = ask sooner among relevant unknowns (price usually wins) */
  askPriority?: number;
  /** Never invent from vision alone */
  hallucinationRisk?: boolean;
};

export type DomainFactSchema = {
  domain: AwhinaFactDomain;
  subtype?: string;
  family: ObjectDomainFamily;
  fields: DomainFactField[];
};

/** Canonical CURRENT object for field selection (one brain). */
export type CanonicalListingObject = {
  family: ObjectDomainFamily;
  subtype: string;
  factDomain: AwhinaFactDomain;
  brand?: string;
  title: string;
  objectKey: string;
  blob: string;
};

const PUBLISH_CORE: DomainFactField[] = [
  { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
  { key: "price", slot: "price", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
  { key: "condition", slot: "condition", required: false, highValue: true, askPriority: 70 },
  { key: "location", slot: "location", required: false, highValue: true, askPriority: 60 },
];

const SMARTPHONE_FIELDS: DomainFactField[] = [
  { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
  { key: "storage", slot: "storage", required: false, highValue: true, askPriority: 80 },
  { key: "condition", slot: "condition", required: false, highValue: true, askPriority: 70 },
  { key: "price", slot: "price", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
  { key: "location", slot: "location", required: false, highValue: true, askPriority: 60 },
];

const LAPTOP_FIELDS: DomainFactField[] = [
  { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
  { key: "storage", slot: "storage", required: false, highValue: true, askPriority: 75 },
  { key: "condition", slot: "condition", required: false, highValue: true, askPriority: 70 },
  { key: "price", slot: "price", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
  { key: "location", slot: "location", required: false, highValue: true, askPriority: 60 },
];

const STORAGE_DEVICE_FIELDS: DomainFactField[] = [
  { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
  { key: "storage", slot: "storage", required: false, highValue: true, askPriority: 85 },
  { key: "condition", slot: "condition", required: false, highValue: true, askPriority: 70 },
  { key: "price", slot: "price", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
  { key: "location", slot: "location", required: false, highValue: true, askPriority: 60 },
];

/** Mouse / keyboard / headphones / monitor — NO storage/RAM/screen specialist asks. */
const PERIPHERAL_FIELDS: DomainFactField[] = [...PUBLISH_CORE];

const CONSOLE_FIELDS: DomainFactField[] = [
  { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
  // Console storage is optional low-value — buyers care more about price/condition
  { key: "condition", slot: "condition", required: false, highValue: true, askPriority: 75 },
  { key: "price", slot: "price", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
  { key: "location", slot: "location", required: false, highValue: true, askPriority: 60 },
];

const VEHICLE_SCHEMA: DomainFactSchema = {
  domain: "VEHICLE",
  family: "vehicle",
  subtype: "vehicle",
  fields: [
    { key: "vehicleMake", required: true, highValue: true, askPriority: 100 },
    { key: "vehicleModel", required: true, highValue: true, askPriority: 100 },
    // Order matches established vehicle sell UX: generation → year → price → odo → …
    { key: "vehicleGeneration", slot: "generation", required: false, highValue: true, askPriority: 95 },
    { key: "vehicleYear", slot: "year", required: false, highValue: true, askPriority: 92 },
    { key: "price", slot: "price", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
    { key: "vehicleOdometer", slot: "odometer", required: false, highValue: true, askPriority: 80 },
    { key: "condition", slot: "condition", required: false, highValue: true, askPriority: 70 },
    { key: "vehicleColour", slot: "colour", required: false, highValue: true, askPriority: 65 },
    { key: "vehicleTransmission", slot: "transmission", required: false, highValue: true, askPriority: 62 },
    { key: "location", slot: "location", required: false, highValue: true, askPriority: 55 },
    { key: "vehicleFuelType", slot: "fuel", required: false, highValue: false, askPriority: 20 },
  ],
};

const TRADING_CARD_SCHEMA: DomainFactSchema = {
  domain: "TRADING_CARD",
  family: "trading_card",
  subtype: "trading_card",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
    { key: "cardSubject", slot: "card_subject", required: false, highValue: true, askPriority: 95 },
    { key: "cardSet", slot: "card_set", required: false, highValue: false, askPriority: 10 },
    { key: "grade", slot: "grade", required: false, highValue: false, askPriority: 15, hallucinationRisk: true },
    { key: "condition", slot: "condition", required: false, highValue: true, askPriority: 70 },
    { key: "price", slot: "price", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true, askPriority: 60 },
  ],
};

const CLOTHING_SCHEMA: DomainFactSchema = {
  domain: "GENERIC",
  family: "clothing",
  subtype: "clothing",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
    { key: "size", slot: "size", required: false, highValue: true, askPriority: 80 },
    { key: "condition", slot: "condition", required: false, highValue: true, askPriority: 70 },
    { key: "price", slot: "price", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true, askPriority: 60 },
  ],
};

const SERVICE_SCHEMA: DomainFactSchema = {
  domain: "SERVICE",
  family: "service",
  subtype: "service",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
    { key: "servicePricingType", slot: "service_rate", required: false, highValue: true, askPriority: 85 },
    { key: "price", slot: "price", required: false, highValue: true, askPriority: 80, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true, askPriority: 60 },
  ],
};

const RENTAL_SCHEMA: DomainFactSchema = {
  domain: "RENTAL",
  family: "rental",
  subtype: "rental",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
    { key: "price", slot: "rental_rate", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true, askPriority: 60 },
  ],
};

const GENERIC_SCHEMA: DomainFactSchema = {
  domain: "GENERIC",
  family: "physical",
  subtype: "physical",
  fields: [...PUBLISH_CORE],
};

const UNKNOWN_SCHEMA: DomainFactSchema = {
  domain: "GENERIC",
  family: "unknown",
  subtype: "unknown",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true, askPriority: 100 },
    { key: "condition", slot: "condition", required: false, highValue: true, askPriority: 70 },
    { key: "price", slot: "price", required: true, highValue: true, askPriority: 90, hallucinationRisk: true },
  ],
};

/** Subtype → policy. Useful ≠ mandatory. */
const ELECTRONICS_SUBTYPE_SCHEMAS: Record<ElectronicsSubtype, DomainFactSchema> = {
  smartphone: {
    domain: "PHONE",
    family: "electronics",
    subtype: "smartphone",
    fields: SMARTPHONE_FIELDS,
  },
  tablet: {
    domain: "PHONE",
    family: "electronics",
    subtype: "tablet",
    fields: SMARTPHONE_FIELDS,
  },
  laptop: {
    domain: "PHONE",
    family: "electronics",
    subtype: "laptop",
    fields: LAPTOP_FIELDS,
  },
  storage_device: {
    domain: "PHONE",
    family: "electronics",
    subtype: "storage_device",
    fields: STORAGE_DEVICE_FIELDS,
  },
  console: {
    domain: "GAMING",
    family: "electronics",
    subtype: "console",
    fields: CONSOLE_FIELDS,
  },
  keyboard: {
    domain: "GAMING",
    family: "electronics",
    subtype: "keyboard",
    fields: PERIPHERAL_FIELDS,
  },
  gaming_mouse: {
    domain: "GAMING",
    family: "electronics",
    subtype: "gaming_mouse",
    fields: PERIPHERAL_FIELDS,
  },
  headphones: {
    domain: "GENERIC",
    family: "electronics",
    subtype: "headphones",
    fields: PERIPHERAL_FIELDS,
  },
  monitor: {
    domain: "GENERIC",
    family: "electronics",
    subtype: "monitor",
    fields: PERIPHERAL_FIELDS,
  },
  generic_electronics: {
    domain: "GENERIC",
    family: "electronics",
    subtype: "generic_electronics",
    fields: PERIPHERAL_FIELDS,
  },
};

/** Slots that are never relevant outside their subtype families. */
const SPECIALIST_SLOTS_BY_FAMILY: Partial<
  Record<ObjectDomainFamily, Set<ListingMissingSlot>>
> = {
  electronics: new Set(["storage"]),
  vehicle: new Set([
    "year",
    "odometer",
    "transmission",
    "fuel",
    "colour",
    "generation",
    "variant",
  ]),
  trading_card: new Set(["card_set", "card_subject", "grade"]),
  clothing: new Set(["size"]),
  service: new Set(["service_rate"]),
  rental: new Set(["rental_rate"]),
};

function fillBlob(fill: Partial<SkyAiListingFill>): string {
  return [fill.title, fill.category, fill.listingType, ...(fill.extras || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function detectBrand(blob: string, title: string): string | undefined {
  const m = title.match(
    /\b(razer|logitech|corsair|steelseries|apple|samsung|sony|nintendo|microsoft|bose|jbl|anker|hp|dell|lenovo|asus|msi|gigabyte)\b/i
  );
  if (m) return m[1];
  const fromExtra = blob.match(/\bbrand:([a-z0-9]+)/i);
  return fromExtra?.[1];
}

/**
 * Resolve electronics subtype from CURRENT object text — never from stale schema defaults.
 * category=Tech alone is NOT enough to imply smartphone/storage.
 */
export function resolveElectronicsSubtype(
  fill: Partial<SkyAiListingFill>
): ElectronicsSubtype | null {
  const blob = fillBlob(fill);
  const title = (fill.title || "").toLowerCase();

  if (
    /\b(iphone|pixel|galaxy\s?s\d|smartphone|mobile\s*phone|\bphone\b)/.test(blob) ||
    (/\bsamsung\b/.test(blob) && /\b(galaxy|note|s2[0-9]|s1[0-9])\b/.test(blob))
  ) {
    return "smartphone";
  }
  if (/\b(ipad|tablet)\b/.test(blob)) return "tablet";
  if (/\b(macbook|laptop|chromebook|notebook)\b/.test(blob)) return "laptop";
  if (
    /\b(ssd|hdd|hard\s*drive|usb\s*stick|flash\s*drive|memory\s*card|micro\s*sd|sd\s*card)\b/.test(
      blob
    )
  ) {
    return "storage_device";
  }
  if (
    /\b(ps5|ps4|playstation|xbox|nintendo\s*switch|steam\s*deck|console)\b/.test(blob)
  ) {
    return "console";
  }
  if (/\b(keyboard|keychron|mech\s*board)\b/.test(blob)) return "keyboard";
  // Explicit mouse / Razer mouse — never infer storage
  if (/\b(gaming\s*mouse|\bmouse\b|\bmice\b)\b/.test(blob)) return "gaming_mouse";
  // Bare "Razer" without another product class → gaming mouse (common NZ listing)
  if (
    /\brazer\b/.test(blob) &&
    !/\b(headset|headphone|earbuds|keyboard|laptop|blade|webcam|mic|speaker|chair|mat|pad|dock)\b/.test(
      blob
    )
  ) {
    return "gaming_mouse";
  }
  if (/\b(headphone|headset|earbuds|airpods|earpods)\b/.test(blob)) return "headphones";
  if (/\b(monitor|display)\b/.test(blob)) return "monitor";

  // Tech / Gaming category with no subtype cues → generic electronics (NOT phone)
  if (
    fill.category === "Tech" ||
    fill.category === "Gaming" ||
    /\b(electronics|tech|gadget)\b/.test(blob)
  ) {
    return "generic_electronics";
  }
  return null;
}

function isVehicleFill(fill: Partial<SkyAiListingFill>): boolean {
  const lt = (fill.listingType || "").toLowerCase();
  if (lt === "vehicle") return true;
  return Boolean(fill.vehicleMake || fill.vehicleModel);
}

/**
 * Resolve CURRENT object domain + subtype from the live draft only.
 * Stale phone/console/card fields on a previous object must not influence this.
 */
export function resolveCanonicalListingObject(
  fill: Partial<SkyAiListingFill>
): CanonicalListingObject {
  const blob = fillBlob(fill);
  const title = (fill.title || "").trim();
  const brand = detectBrand(blob, title);
  const objectKey = `${title}|${fill.category || ""}|${fill.listingType || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");

  const lt = (fill.listingType || "").toLowerCase();
  if (lt === "rental") {
    return {
      family: "rental",
      subtype: "rental",
      factDomain: "RENTAL",
      brand,
      title,
      objectKey,
      blob,
    };
  }
  if (lt === "service") {
    return {
      family: "service",
      subtype: "service",
      factDomain: "SERVICE",
      brand,
      title,
      objectKey,
      blob,
    };
  }
  if (isVehicleFill(fill)) {
    return {
      family: "vehicle",
      subtype: "vehicle",
      factDomain: "VEHICLE",
      brand,
      title,
      objectKey,
      blob,
    };
  }

  if (
    /card|psa|bgs|cgc|topps|panini|pokemon|yugioh|sports card|trading card|collectibles?/.test(
      blob
    ) ||
    /(?:^|\s)(?:subject|set|grade):/.test(blob)
  ) {
    return {
      family: "trading_card",
      subtype: "trading_card",
      factDomain: "TRADING_CARD",
      brand,
      title,
      objectKey,
      blob,
    };
  }

  if (
    /nike|adidas|jordan|shoe|sneaker|size:|clothing|fashion|hoodie|jacket/.test(blob) ||
    fill.category === "Fashion"
  ) {
    return {
      family: "clothing",
      subtype: "clothing",
      factDomain: "GENERIC",
      brand,
      title,
      objectKey,
      blob,
    };
  }

  const electronicsSubtype = resolveElectronicsSubtype(fill);
  if (electronicsSubtype) {
    const schema = ELECTRONICS_SUBTYPE_SCHEMAS[electronicsSubtype];
    return {
      family: "electronics",
      subtype: electronicsSubtype,
      factDomain: schema.domain,
      brand,
      title,
      objectKey,
      blob,
    };
  }

  // Gaming cues that aren't electronics peripherals (e.g. "gaming chair")
  if (/\b(ps5|ps4|xbox|switch|nintendo|steam\s*deck|console|controller)\b/.test(blob)) {
    return {
      family: "electronics",
      subtype: "console",
      factDomain: "GAMING",
      brand,
      title,
      objectKey,
      blob,
    };
  }

  if (!title && !fill.category) {
    return {
      family: "unknown",
      subtype: "unknown",
      factDomain: "GENERIC",
      brand,
      title,
      objectKey,
      blob,
    };
  }

  return {
    family: "physical",
    subtype: "physical",
    factDomain: "GENERIC",
    brand,
    title,
    objectKey,
    blob,
  };
}

export function resolveFactDomain(
  fill: Partial<SkyAiListingFill>
): AwhinaFactDomain {
  return resolveCanonicalListingObject(fill).factDomain;
}

export function getDomainFactSchema(
  fill: Partial<SkyAiListingFill>
): DomainFactSchema {
  const obj = resolveCanonicalListingObject(fill);
  if (obj.family === "electronics") {
    return (
      ELECTRONICS_SUBTYPE_SCHEMAS[obj.subtype as ElectronicsSubtype] ||
      ELECTRONICS_SUBTYPE_SCHEMAS.generic_electronics
    );
  }
  switch (obj.family) {
    case "vehicle":
      return VEHICLE_SCHEMA;
    case "trading_card":
      return TRADING_CARD_SCHEMA;
    case "clothing":
      return CLOTHING_SCHEMA;
    case "service":
      return SERVICE_SCHEMA;
    case "rental":
      return RENTAL_SCHEMA;
    case "unknown":
      return UNKNOWN_SCHEMA;
    default:
      return GENERIC_SCHEMA;
  }
}

function hasFact(fill: Partial<SkyAiListingFill>, key: string): boolean {
  switch (key) {
    case "cardSubject":
      return (fill.extras || []).some((e) =>
        e.toLowerCase().startsWith("subject:")
      );
    case "cardSet":
      return (fill.extras || []).some((e) => e.toLowerCase().startsWith("set:"));
    case "storage":
      return (
        (fill.extras || []).some((e) => e.toLowerCase().startsWith("storage:")) ||
        /\d+\s?(gb|tb)\b/i.test([fill.title, ...(fill.extras || [])].join(" "))
      );
    case "size":
      return (
        (fill.extras || []).some((e) => e.toLowerCase().startsWith("size:")) ||
        /\b(size|uk|us|eu)\s*\d/i.test(fill.title || "")
      );
    case "grade":
      return (fill.extras || []).some((e) => e.toLowerCase().startsWith("grade:"));
    case "servicePricingType":
      return Boolean(fill.servicePricingType || fill.price);
    case "location":
      return Boolean((fill.location || fill.pickupArea || "").trim());
    default: {
      const v = (fill as Record<string, unknown>)[key];
      return typeof v === "string" ? Boolean(v.trim()) : Boolean(v);
    }
  }
}

export function isFieldAlreadyKnown(
  field: DomainFactField,
  fill: Partial<SkyAiListingFill>
): boolean {
  if (!field.slot && !field.key) return false;
  return hasFact(fill, field.key);
}

/**
 * Relevance gate: specialist slots only for matching family/subtype.
 * storage for gaming_mouse → false immediately.
 */
export function isFieldRelevant(
  field: DomainFactField | ListingMissingSlot,
  canonical: CanonicalListingObject | Partial<SkyAiListingFill>
): boolean {
  const obj =
    "family" in canonical && "subtype" in canonical && "factDomain" in canonical
      ? (canonical as CanonicalListingObject)
      : resolveCanonicalListingObject(canonical as Partial<SkyAiListingFill>);

  const slot: ListingMissingSlot | undefined =
    typeof field === "string" ? field : field.slot;
  if (!slot) return true;

  // Unknown domain: only generic questions (title / condition / price)
  if (obj.family === "unknown") {
    return slot === "title" || slot === "condition" || slot === "price";
  }

  // Cross-family specialist contamination
  for (const [family, slots] of Object.entries(SPECIALIST_SLOTS_BY_FAMILY)) {
    if (slots.has(slot) && obj.family !== family) {
      // colour is vehicle-oriented in our slot list; allow generic colour skips
      return false;
    }
  }

  // Electronics inheritance: storage only for storage-bearing subtypes
  if (slot === "storage") {
    return (
      obj.family === "electronics" &&
      (obj.subtype === "smartphone" ||
        obj.subtype === "tablet" ||
        obj.subtype === "laptop" ||
        obj.subtype === "storage_device")
    );
  }

  if (slot === "size") return obj.family === "clothing";
  if (slot === "card_set" || slot === "card_subject" || slot === "grade") {
    return obj.family === "trading_card";
  }
  if (
    slot === "year" ||
    slot === "odometer" ||
    slot === "transmission" ||
    slot === "fuel" ||
    slot === "generation" ||
    slot === "variant"
  ) {
    return obj.family === "vehicle";
  }
  if (slot === "colour") return obj.family === "vehicle";
  if (slot === "service_rate") return obj.family === "service";
  if (slot === "rental_rate") return obj.family === "rental";

  return true;
}

export function isFieldNecessaryOrHighValue(
  field: DomainFactField,
  opts?: { includeOptionalHighValue?: boolean; draftSufficient?: boolean }
): boolean {
  if (field.required) return true;
  if (opts?.draftSufficient) return false;
  if (opts?.includeOptionalHighValue === false) return false;
  return Boolean(field.highValue);
}

/**
 * Photo + brand/type + price + location may be enough — skip remaining optionals.
 */
export function isDraftSufficientToSkipOptional(
  fill: Partial<SkyAiListingFill>,
  canonical?: CanonicalListingObject
): boolean {
  const obj = canonical || resolveCanonicalListingObject(fill);
  const hasIdentity = Boolean(
    (fill.title || "").trim() ||
      (obj.family === "vehicle" && (fill.vehicleMake || fill.vehicleModel))
  );
  const hasPrice = Boolean(
    (fill.price || "").trim() ||
      fill.rentalPriceDaily ||
      fill.rentalPriceWeekly ||
      (obj.family === "service" && fill.servicePricingType)
  );
  const hasLocation = Boolean((fill.location || fill.pickupArea || "").trim());
  if (!hasIdentity || !hasPrice) return false;

  // Vehicles still need year/odo as high-value before skipping
  if (obj.family === "vehicle") {
    return Boolean(fill.vehicleYear?.trim()) && hasLocation;
  }
  // Cards: subject needed for identity
  if (obj.family === "trading_card") {
    const hasSubject = (fill.extras || []).some((e) =>
      e.toLowerCase().startsWith("subject:")
    );
    return hasSubject && hasLocation;
  }
  // Peripherals / generic: identity + price (+ location preferred) is enough
  if (
    obj.subtype === "gaming_mouse" ||
    obj.subtype === "keyboard" ||
    obj.subtype === "headphones" ||
    obj.subtype === "monitor" ||
    obj.subtype === "generic_electronics" ||
    obj.family === "physical"
  ) {
    return hasLocation || Boolean(fill.condition?.trim());
  }
  return hasLocation && Boolean(fill.condition?.trim());
}

/**
 * Ask ONLY relevant required + high-value missing fields for CURRENT object.
 */
export function computeDomainAwareMissingSlots(
  fill: Partial<SkyAiListingFill>,
  opts?: { includeOptionalHighValue?: boolean; skipped?: string[] }
): ListingMissingSlot[] {
  const canonical = resolveCanonicalListingObject(fill);
  const schema = getDomainFactSchema(fill);
  const skipped = new Set(opts?.skipped || []);
  const includeHv = opts?.includeOptionalHighValue !== false;
  const draftSufficient = isDraftSufficientToSkipOptional(fill, canonical);
  const missing: ListingMissingSlot[] = [];

  const title = (fill.title || "").trim();
  const titleLooksAttrOnly =
    /\b(psa|bgs|cgc|sgc)\b/i.test(title) ||
    (/\b(panini|topps|prizm|select)\b/i.test(title) &&
      !/\b[A-Z][a-z]+\s+[A-Z][a-z]+/.test(title));
  const cardIdentityWeak =
    schema.domain === "TRADING_CARD" &&
    (!hasFact(fill, "cardSubject") ||
      (!title && !hasFact(fill, "cardSubject")) ||
      (titleLooksAttrOnly && !hasFact(fill, "cardSubject")));

  const ranked: { slot: ListingMissingSlot; priority: number }[] = [];

  for (const field of schema.fields) {
    if (!field.slot) continue;
    if (skipped.has(field.slot)) continue;
    if (!isFieldRelevant(field, canonical)) continue;
    if (isFieldAlreadyKnown(field, fill)) continue;
    if (
      !isFieldNecessaryOrHighValue(field, {
        includeOptionalHighValue: includeHv,
        draftSufficient,
      })
    ) {
      continue;
    }

    if (field.slot === "card_set") continue;
    if (field.slot === "card_subject" && !cardIdentityWeak) continue;

    ranked.push({
      slot: field.slot,
      priority: field.askPriority ?? (field.required ? 90 : 50),
    });
  }

  ranked.sort((a, b) => b.priority - a.priority);
  for (const r of ranked) {
    if (!missing.includes(r.slot)) missing.push(r.slot);
  }
  return missing;
}

/**
 * Next-best-question: highest-value relevant unknown — not first schema hole.
 */
export function selectNextBestListingSlot(
  fill: Partial<SkyAiListingFill>,
  opts?: { skipped?: string[]; includeOptionalHighValue?: boolean }
): ListingMissingSlot | null {
  const missing = computeDomainAwareMissingSlots(fill, opts);
  for (const slot of missing) {
    if (isListingSlotQuestionValid(slot, fill)) return slot;
  }
  return null;
}

/**
 * Safety net: reject questions that fail relevance for CURRENT object.
 * e.g. "What storage size?" + subtype gaming_mouse → REJECT
 */
export function isListingSlotQuestionValid(
  slot: ListingMissingSlot,
  fill: Partial<SkyAiListingFill>
): boolean {
  const canonical = resolveCanonicalListingObject(fill);
  if (!isFieldRelevant(slot, canonical)) return false;
  // Don't ask optional specialist noise when draft is already listable
  if (
    isDraftSufficientToSkipOptional(fill, canonical) &&
    slot !== "price" &&
    slot !== "title" &&
    slot !== "rental_rate" &&
    slot !== "service_rate"
  ) {
    const schema = getDomainFactSchema(fill);
    const field = schema.fields.find((f) => f.slot === slot);
    if (field && !field.required) return false;
  }
  return true;
}

/** Targeted knowledge retrieval keys for a domain (normalize only — never override USER). */
export function knowledgeRetrievalHints(domain: AwhinaFactDomain): string[] {
  switch (domain) {
    case "VEHICLE":
      return ["make", "model", "generation", "year_range"];
    case "PHONE":
      return ["storage_options", "model_aliases"];
    case "TRADING_CARD":
      return ["subject_aliases", "set_aliases"];
    case "GAMING":
      return ["platform_aliases", "edition_aliases"];
    default:
      return [];
  }
}

/** Relevant field keys for CURRENT object (useful list — not ask list). */
export function listRelevantFieldKeys(
  fill: Partial<SkyAiListingFill>
): string[] {
  return getDomainFactSchema(fill).fields.map((f) => f.key);
}
