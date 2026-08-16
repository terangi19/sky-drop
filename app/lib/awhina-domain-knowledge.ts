/**
 * Compact ontology for Āwhina listing facts.
 * Product families, not individual SKUs: it determines which facts make sense.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";

export type AwhinaObjectType =
  | "individual_card" | "graded_card" | "booster_pack" | "booster_box"
  | "booster_display" | "hobby_box" | "blaster_box" | "mega_box" | "starter_pack" | "tin" | "etb"
  | "sealed_set" | "card_bundle" | "phone" | "phone_case" | "console"
  | "controller" | "headphones" | "charger" | "gaming_mouse" | "game"
  | "boxed_hardware" | "vehicle" | "toy_vehicle" | "vehicle_part"
  | "shoes" | "clothing" | "lego_sealed_set" | "lego_loose_set"
  | "minifigure" | "toy" | "mountain_bike" | "road_bike" | "bmx"
  | "e_bike" | "bike_part" | "power_tool" | "furniture" | "unknown";

export type DomainKnowledgeRule = {
  domain: string;
  objectType: AwhinaObjectType;
  aliases: string[];
  allowedAttributes: string[];
  forbiddenAttributes: string[];
  importantListingFacts: string[];
  sellerOnlyFacts: string[];
  descriptionPriorities: string[];
  identityHints: string[];
};

const TCG_COMMON = ["brand", "franchise", "set", "season", "productFormat", "language", "edition", "sealed"];
const CARD_ONLY = [
  "subject",
  "player",
  "character",
  "parallelColor",
  "parallel",
  "serialNumber",
  "autograph",
  "grade",
];

export const AWHINA_DOMAIN_KNOWLEDGE: readonly DomainKnowledgeRule[] = [
  { domain: "trading_cards", objectType: "individual_card", aliases: ["individual card", "raw card", "single card"], allowedAttributes: [...TCG_COMMON, ...CARD_ONLY, "subject", "condition"], forbiddenAttributes: ["packsPerBox", "cardsPerPack"], importantListingFacts: ["price", "condition", "subject", "set"], sellerOnlyFacts: [], descriptionPriorities: ["subject", "set", "condition"], identityHints: ["card", "trading card"] },
  { domain: "trading_cards", objectType: "graded_card", aliases: ["graded", "slab", "psa", "bgs", "cgc"], allowedAttributes: [...TCG_COMMON, ...CARD_ONLY, "subject", "condition"], forbiddenAttributes: ["packsPerBox", "cardsPerPack"], importantListingFacts: ["price", "grade", "subject"], sellerOnlyFacts: [], descriptionPriorities: ["subject", "grade", "set"], identityHints: ["graded card", "slab"] },
  ...(["booster_pack", "booster_box", "booster_display", "hobby_box", "blaster_box", "mega_box", "starter_pack", "tin", "etb", "sealed_set"] as const).map((objectType) => ({
    domain: "trading_cards",
    objectType,
    aliases: objectType === "etb"
      ? ["etb", "elite trainer box"]
      : objectType === "booster_display"
        ? ["booster display", "display box"]
        : [objectType.replace(/_/g, " ")],
    allowedAttributes: [...TCG_COMMON, "packsPerBox", "cardsPerPack", "quantity"],
    forbiddenAttributes: CARD_ONLY,
    importantListingFacts: ["price", "condition", "location"],
    sellerOnlyFacts: ["packsPerBox", "cardsPerPack"],
    descriptionPriorities: ["brand", "franchise", "set", "season", "productFormat", "sealed"],
    identityHints: ["sealed product", objectType.replace(/_/g, " ")],
  })),
  { domain: "trading_cards", objectType: "card_bundle", aliases: ["bundle", "collection", "loose collection"], allowedAttributes: [...TCG_COMMON, "quantity", "condition"], forbiddenAttributes: ["packsPerBox", "cardsPerPack"], importantListingFacts: ["price", "condition", "quantity"], sellerOnlyFacts: [], descriptionPriorities: ["quantity", "set", "condition"], identityHints: ["card bundle"] },
  { domain: "electronics", objectType: "phone", aliases: ["iphone", "smartphone", "android"], allowedAttributes: ["brand", "model", "storage", "batteryHealth", "colour", "condition"], forbiddenAttributes: [], importantListingFacts: ["price", "condition", "storage"], sellerOnlyFacts: ["batteryHealth"], descriptionPriorities: ["brand", "model", "storage", "condition"], identityHints: ["phone"] },
  { domain: "electronics", objectType: "phone_case", aliases: ["phone case", "case cover"], allowedAttributes: ["brand", "model", "colour", "material", "condition"], forbiddenAttributes: ["storage", "batteryHealth"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["model", "material", "condition"], identityHints: ["case"] },
  { domain: "gaming", objectType: "controller", aliases: ["dualsense", "controller", "gamepad"], allowedAttributes: ["brand", "model", "colour", "condition"], forbiddenAttributes: ["storage", "batteryHealth"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["controller"] },
  { domain: "electronics", objectType: "gaming_mouse", aliases: ["gaming mouse", "mouse"], allowedAttributes: ["brand", "model", "colour", "condition"], forbiddenAttributes: ["storage", "batteryHealth"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["mouse"] },
  { domain: "vehicles", objectType: "vehicle", aliases: ["car", "vehicle"], allowedAttributes: ["make", "model", "year", "bodyStyle", "engine", "transmission", "mileage", "condition"], forbiddenAttributes: ["grade", "parallelColor"], importantListingFacts: ["price", "year", "mileage", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["year", "make", "model", "mileage"], identityHints: ["vehicle"] },
  { domain: "vehicles", objectType: "toy_vehicle", aliases: ["model car", "diecast", "toy car"], allowedAttributes: ["brand", "model", "scale", "condition"], forbiddenAttributes: ["mileage", "transmission", "engine"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "scale"], identityHints: ["toy vehicle"] },
  { domain: "fashion", objectType: "shoes", aliases: ["shoes", "sneakers"], allowedAttributes: ["brand", "model", "size", "colour", "material", "condition"], forbiddenAttributes: ["storage"], importantListingFacts: ["price", "size", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "size", "condition"], identityHints: ["shoes"] },
  { domain: "toys", objectType: "lego_sealed_set", aliases: ["lego sealed set", "boxed lego"], allowedAttributes: ["brand", "set", "sealed", "edition", "condition"], forbiddenAttributes: ["grade", "parallelColor"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "set", "sealed"], identityHints: ["boxed set"] },
  { domain: "bikes", objectType: "mountain_bike", aliases: ["mountain bike", "mtb"], allowedAttributes: ["brand", "model", "size", "condition"], forbiddenAttributes: ["storage", "mileage"], importantListingFacts: ["price", "condition", "size"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "size", "condition"], identityHints: ["mountain bike"] },
  { domain: "gaming", objectType: "console", aliases: ["console", "playstation", "ps5", "ps4", "xbox", "nintendo switch"], allowedAttributes: ["brand", "model", "condition"], forbiddenAttributes: ["storage", "batteryHealth"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["console"] },
  { domain: "electronics", objectType: "headphones", aliases: ["headphones", "headset", "earbuds"], allowedAttributes: ["brand", "model", "condition"], forbiddenAttributes: ["storage"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["headphones"] },
  { domain: "electronics", objectType: "charger", aliases: ["charger", "charging cable"], allowedAttributes: ["brand", "model", "condition"], forbiddenAttributes: ["storage"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["charger"] },
  { domain: "gaming", objectType: "game", aliases: ["video game", "game disc", "game cartridge"], allowedAttributes: ["platform", "edition", "condition"], forbiddenAttributes: ["storage"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["platform", "edition", "condition"], identityHints: ["game"] },
  { domain: "electronics", objectType: "boxed_hardware", aliases: ["boxed hardware", "computer hardware"], allowedAttributes: ["brand", "model", "condition"], forbiddenAttributes: ["storage"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["hardware"] },
  { domain: "vehicles", objectType: "vehicle_part", aliases: ["car part", "vehicle part", "bumper", "wheel"], allowedAttributes: ["brand", "model", "condition"], forbiddenAttributes: ["mileage", "transmission"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["vehicle part"] },
  { domain: "fashion", objectType: "clothing", aliases: ["clothing", "hoodie", "jacket", "t-shirt", "shirt"], allowedAttributes: ["brand", "size", "colour", "condition"], forbiddenAttributes: ["storage"], importantListingFacts: ["price", "size", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "size", "condition"], identityHints: ["clothing"] },
  { domain: "toys", objectType: "lego_loose_set", aliases: ["loose lego", "used lego"], allowedAttributes: ["brand", "set", "condition"], forbiddenAttributes: ["grade", "parallelColor"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "set", "condition"], identityHints: ["lego set"] },
  { domain: "toys", objectType: "minifigure", aliases: ["minifigure", "minifig"], allowedAttributes: ["brand", "set", "condition"], forbiddenAttributes: ["storage"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "set", "condition"], identityHints: ["minifigure"] },
  { domain: "toys", objectType: "toy", aliases: ["toy", "action figure", "figure"], allowedAttributes: ["brand", "model", "condition"], forbiddenAttributes: ["storage"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["toy"] },
  { domain: "bikes", objectType: "road_bike", aliases: ["road bike"], allowedAttributes: ["brand", "model", "size", "condition"], forbiddenAttributes: ["storage", "mileage"], importantListingFacts: ["price", "condition", "size"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "size", "condition"], identityHints: ["road bike"] },
  { domain: "bikes", objectType: "bmx", aliases: ["bmx"], allowedAttributes: ["brand", "model", "size", "condition"], forbiddenAttributes: ["storage", "mileage"], importantListingFacts: ["price", "condition", "size"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "size", "condition"], identityHints: ["bmx"] },
  { domain: "bikes", objectType: "e_bike", aliases: ["e-bike", "ebike", "electric bike"], allowedAttributes: ["brand", "model", "size", "condition"], forbiddenAttributes: ["storage", "mileage"], importantListingFacts: ["price", "condition", "size"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "size", "condition"], identityHints: ["electric bike"] },
  { domain: "bikes", objectType: "bike_part", aliases: ["bike part", "bicycle part"], allowedAttributes: ["brand", "model", "condition"], forbiddenAttributes: ["storage", "mileage"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["bike part"] },
  { domain: "tools", objectType: "power_tool", aliases: ["power tool", "drill", "circular saw", "impact driver"], allowedAttributes: ["brand", "model", "condition"], forbiddenAttributes: ["storage", "mileage"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["brand", "model", "condition"], identityHints: ["tool"] },
  { domain: "furniture", objectType: "furniture", aliases: ["furniture", "chair", "table", "sofa", "couch", "cabinet"], allowedAttributes: ["material", "style", "condition"], forbiddenAttributes: ["storage", "mileage"], importantListingFacts: ["price", "condition"], sellerOnlyFacts: [], descriptionPriorities: ["material", "style", "condition"], identityHints: ["furniture"] },
] as const;

const CATEGORY_BY_OBJECT_TYPE: Partial<Record<AwhinaObjectType, string>> = {
  individual_card: "Collectibles",
  graded_card: "Collectibles",
  booster_pack: "Collectibles",
  booster_box: "Collectibles",
  booster_display: "Collectibles",
  hobby_box: "Collectibles",
  blaster_box: "Collectibles",
  mega_box: "Collectibles",
  starter_pack: "Collectibles",
  tin: "Collectibles",
  etb: "Collectibles",
  sealed_set: "Collectibles",
  card_bundle: "Collectibles",
  lego_sealed_set: "Collectibles",
  lego_loose_set: "Collectibles",
  minifigure: "Collectibles",
  toy: "Collectibles",
  toy_vehicle: "Collectibles",
  vehicle: "Cars",
  phone: "Tech",
  phone_case: "Tech",
  headphones: "Tech",
  charger: "Tech",
  boxed_hardware: "Tech",
  gaming_mouse: "Gaming",
  console: "Gaming",
  controller: "Gaming",
  game: "Gaming",
  shoes: "Fashion",
  clothing: "Fashion",
  mountain_bike: "Sports",
  road_bike: "Sports",
  bmx: "Sports",
  e_bike: "Sports",
  bike_part: "Sports",
  power_tool: "Home",
  furniture: "Home",
};

export function categoryForAwhinaObjectType(
  objectType: AwhinaObjectType
): string | undefined {
  return CATEGORY_BY_OBJECT_TYPE[objectType];
}

export function normalizeAwhinaObjectType(text: string): AwhinaObjectType {
  const source = String(text || "").toLowerCase();
  const explicit = source.match(/\bobjecttype\s*:\s*([a-z0-9_]+)/i)?.[1]
    ?.trim()
    .replace(/-/g, "_");
  if (
    explicit &&
    AWHINA_DOMAIN_KNOWLEDGE.some((rule) => rule.objectType === explicit)
  ) {
    return explicit as AwhinaObjectType;
  }
  if (/\bphone\s+case\b/.test(source)) return "phone_case";
  const rules = [...AWHINA_DOMAIN_KNOWLEDGE].sort(
    (a, b) =>
      Math.max(...b.aliases.map((alias) => alias.length)) -
      Math.max(...a.aliases.map((alias) => alias.length))
  );
  for (const rule of rules) {
    if (
      rule.aliases.some((alias) => {
        if (!alias) return false;
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
        return new RegExp(`\\b${escaped}\\b`, "i").test(source);
      })
    ) {
      return rule.objectType;
    }
  }
  if (/\bbooster\s*display\b/.test(source)) return "booster_display";
  if (/\bbooster\s*box\b/.test(source)) return "booster_box";
  if (/\b(?:hobby|blaster|mega)\s*box\b/.test(source)) return source.includes("hobby") ? "hobby_box" : source.includes("blaster") ? "blaster_box" : "mega_box";
  if (/\b(?:elite trainer box|etb)\b/.test(source)) return "etb";
  if (/\b(?:psa|bgs|cgc|sgc)\b/.test(source)) return "graded_card";
  if (/\blego\b.*\b(?:boxed|sealed)\b/.test(source)) return "lego_sealed_set";
  if (/\b(?:bmw|toyota|mazda|ford|honda|nissan|audi|mercedes)\b/.test(source)) return "vehicle";
  return "unknown";
}

export function getAwhinaDomainRule(objectType: AwhinaObjectType): DomainKnowledgeRule | undefined {
  return AWHINA_DOMAIN_KNOWLEDGE.find((rule) => rule.objectType === objectType);
}

/** Remove impossible internal fact tags before title/description/public-copy composition. */
export function applyAwhinaDomainKnowledge(fill: SkyAiListingFill): SkyAiListingFill {
  const objectType = normalizeAwhinaObjectType(
    `${fill.title || ""} ${(fill.extras || []).join(" ")}`
  );
  const rule = getAwhinaDomainRule(objectType);
  if (!rule) return fill;
  const forbidden = new Set(rule.forbiddenAttributes.map((key) => key.toLowerCase()));
  const extras = (fill.extras || []).filter((entry) => {
    const rawKey = String(entry).split(":", 1)[0].replace(/[_\s-]/g, "").toLowerCase();
    const key =
      rawKey === "serial" ? "serialnumber" :
      rawKey === "parallelcolour" ? "parallelcolor" :
      rawKey;
    return !forbidden.has(key);
  });
  return extras.length === (fill.extras || []).length ? fill : { ...fill, extras };
}

export function selectDomainKnowledgeQuestions(fill: SkyAiListingFill): string[] {
  const rule = getAwhinaDomainRule(
    normalizeAwhinaObjectType(`${fill.title || ""} ${(fill.extras || []).join(" ")}`)
  );
  return rule?.importantListingFacts || ["price", "condition", "location"];
}
