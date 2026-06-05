/**
 * Entity tracking + subject-change detection — prevent draft contamination.
 * Current user message always wins over stale session memory.
 */

import type {
  SkyAiEntityType,
  SkyAiHistoryItem,
  SkyAiListingContext,
  SkyAiListingDraft,
  SkyAiFlow,
  SkyAiStep,
} from "./sky-ai-types";

export type { SkyAiEntityType };
import { parseAuctionParamsFromMessage } from "./sky-ai-listing-draft";

export type SkyAiEntity = {
  entityType: SkyAiEntityType;
  entityName: string;
  entityKey: string;
};

const VEHICLE_MAKES = [
  "bmw",
  "toyota",
  "honda",
  "ford",
  "mazda",
  "nissan",
  "mitsubishi",
  "subaru",
  "holden",
  "mercedes",
  "audi",
  "volkswagen",
  "vw",
  "hyundai",
  "kia",
  "lexus",
  "suzuki",
  "isuzu",
  "jeep",
  "land rover",
  "range rover",
  "porsche",
  "tesla",
];

const GAMING_PATTERNS: { re: RegExp; key: string; label: string }[] = [
  { re: /\bps5\b/i, key: "gaming:ps5", label: "PS5" },
  { re: /\bps4\b/i, key: "gaming:ps4", label: "PS4" },
  { re: /\bplaystation\s*5\b/i, key: "gaming:ps5", label: "PlayStation 5" },
  { re: /\bplaystation\s*4\b/i, key: "gaming:ps4", label: "PlayStation 4" },
  { re: /\bxbox\s*series\b/i, key: "gaming:xbox-series", label: "Xbox Series" },
  { re: /\bxbox\s*one\b/i, key: "gaming:xbox-one", label: "Xbox One" },
  { re: /\bnintendo\s*switch\b/i, key: "gaming:switch", label: "Nintendo Switch" },
  { re: /\bsteam\s*deck\b/i, key: "gaming:steam-deck", label: "Steam Deck" },
];

const SERVICE_PATTERNS: { re: RegExp; key: string; label: string }[] = [
  { re: /\b(website\s*design|web\s*design|website\s*development)\b/i, key: "service:web-design", label: "Website Design" },
  { re: /\blogo\s*design\b/i, key: "service:logo-design", label: "Logo Design" },
  { re: /\b(graphic\s*design|branding)\b/i, key: "service:graphic-design", label: "Graphic Design" },
  { re: /\b(coaching|consulting|freelance)\b/i, key: "service:professional", label: "Professional Service" },
];

function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function detectGaming(text: string): SkyAiEntity | null {
  for (const g of GAMING_PATTERNS) {
    if (g.re.test(text)) {
      return { entityType: "gaming", entityName: g.label, entityKey: g.key };
    }
  }
  return null;
}

function detectVehicle(text: string): SkyAiEntity | null {
  const lower = text.toLowerCase();
  for (const make of VEHICLE_MAKES) {
    const re = new RegExp(`\\b${make.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (!re.test(text)) continue;
    const modelMatch = text.match(
      new RegExp(`\\b${make}\\s+([\\w.-]+(?:\\s+[\\w.-]+)?)`, "i")
    );
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    const nameParts = [make.toUpperCase(), modelMatch?.[1], yearMatch?.[0]].filter(Boolean);
    return {
      entityType: "vehicle",
      entityName: nameParts.join(" ").trim() || make.toUpperCase(),
      entityKey: `vehicle:${normalizeKey(make + (modelMatch?.[1] || ""))}`,
    };
  }
  if (/\b(car|ute|truck|suv|van|motorbike|motorcycle)\b/i.test(lower)) {
    return {
      entityType: "vehicle",
      entityName: "Vehicle",
      entityKey: "vehicle:generic",
    };
  }
  return null;
}

export function extractEntityFromText(text: string): SkyAiEntity | null {
  if (!text?.trim()) return null;

  const vehicle = detectVehicle(text);
  if (vehicle) return vehicle;

  const gaming = detectGaming(text);
  if (gaming) return gaming;

  for (const s of SERVICE_PATTERNS) {
    if (s.re.test(text)) {
      return { entityType: "service", entityName: s.label, entityKey: s.key };
    }
  }

  if (/\b(rental\s*property|rent\s*out|for\s*rent|rental)\b/i.test(text)) {
    return { entityType: "rental", entityName: "Rental", entityKey: "rental:property" };
  }

  if (/\b(digital\s*product|e-?book|template|download)\b/i.test(text)) {
    return { entityType: "digital", entityName: "Digital Product", entityKey: "digital:product" };
  }

  if (/\b(laptop|iphone|macbook|ipad|samsung|gpu|graphics card)\b/i.test(text)) {
    const m = text.match(/\b(laptop|iphone\s*\d*|macbook|ipad|samsung|gpu|graphics card)\b/i);
    const label = m?.[0] || "Electronics";
    return {
      entityType: "physical",
      entityName: label,
      entityKey: `physical:${normalizeKey(label)}`,
    };
  }

  return null;
}

export function extractEntityFromMessage(message: string): SkyAiEntity | null {
  return extractEntityFromText(message);
}

export function extractEntityFromDraft(
  draft: Partial<SkyAiListingDraft> | SkyAiListingContext | null | undefined
): SkyAiEntity | null {
  if (!draft) return null;

  const d = draft as Partial<SkyAiListingDraft>;
  if (d.vehicleMake) {
    return {
      entityType: "vehicle",
      entityName: [d.vehicleMake, d.vehicleModel, d.vehicleYear].filter(Boolean).join(" "),
      entityKey: `vehicle:${normalizeKey(`${d.vehicleMake}${d.vehicleModel || ""}`)}`,
    };
  }

  const combined = [d.title, d.description, d.category].filter(Boolean).join(" ");
  if (combined) {
    const fromText = extractEntityFromText(combined);
    if (fromText) return fromText;
  }

  if (d.listingType === "service" || d.servicePricingType) {
    const name = d.title || "Service";
    return {
      entityType: "service",
      entityName: name,
      entityKey: `service:${normalizeKey(name)}`,
    };
  }

  if (d.listingType === "rental") {
    return { entityType: "rental", entityName: d.title || "Rental", entityKey: `rental:${normalizeKey(d.title || "item")}` };
  }

  if (d.title) {
    return {
      entityType: (d.listingType as SkyAiEntityType) || "physical",
      entityName: d.title,
      entityKey: `item:${normalizeKey(d.title)}`,
    };
  }

  return null;
}

function entityTypesConflict(a: SkyAiEntityType, b: SkyAiEntityType): boolean {
  if (a === "unknown" || b === "unknown") return false;
  if (a === b) return false;
  if (a === "gaming" && b === "physical") return false;
  if (a === "physical" && b === "gaming") return false;
  return true;
}

function messageReferencesStoredEntity(message: string, stored: SkyAiEntity): boolean {
  const m = message.toLowerCase();
  const name = stored.entityName.toLowerCase();
  if (name.length >= 3 && m.includes(name)) return true;
  const keyPart = stored.entityKey.split(":")[1];
  if (keyPart && keyPart.length >= 3 && m.includes(keyPart.replace(/-/g, " "))) return true;
  if (stored.entityKey.startsWith("gaming:")) {
    const short = stored.entityKey.replace("gaming:", "");
    if (m.includes(short)) return true;
  }
  if (stored.entityKey.startsWith("vehicle:")) {
    const make = stored.entityKey.replace("vehicle:", "").replace(/-/g, " ");
    if (make && m.includes(make)) return true;
  }
  return false;
}

export function detectSubjectChange(
  message: string,
  sessionDraft: Partial<SkyAiListingDraft> | null | undefined,
  listingContext: SkyAiListingContext | null | undefined
): {
  changed: boolean;
  messageEntity: SkyAiEntity | null;
  storedEntity: SkyAiEntity | null;
  reason?: string;
} {
  const messageEntity = extractEntityFromMessage(message);
  const storedEntity =
    extractEntityFromDraft(sessionDraft) ?? extractEntityFromDraft(listingContext);

  if (!messageEntity) {
    return { changed: false, messageEntity, storedEntity };
  }

  if (!storedEntity && !sessionDraft?.title && !sessionDraft?.startingBid && !listingContext?.title) {
    return { changed: false, messageEntity, storedEntity };
  }

  if (storedEntity && messageEntity.entityKey === storedEntity.entityKey) {
    return { changed: false, messageEntity, storedEntity };
  }

  if (storedEntity && entityTypesConflict(messageEntity.entityType, storedEntity.entityType)) {
    return {
      changed: true,
      messageEntity,
      storedEntity,
      reason: `entity type changed (${storedEntity.entityType} → ${messageEntity.entityType})`,
    };
  }

  if (storedEntity && messageEntity.entityKey !== storedEntity.entityKey) {
    if (!messageReferencesStoredEntity(message, storedEntity)) {
      return {
        changed: true,
        messageEntity,
        storedEntity,
        reason: `entity changed (${storedEntity.entityName} → ${messageEntity.entityName})`,
      };
    }
  }

  if (!storedEntity && (sessionDraft?.title || sessionDraft?.startingBid)) {
    const sessionText = [sessionDraft?.title, sessionDraft?.description].filter(Boolean).join(" ");
    const sessionEntity = extractEntityFromText(sessionText);
    if (sessionEntity && sessionEntity.entityKey !== messageEntity.entityKey) {
      if (!messageReferencesStoredEntity(message, sessionEntity)) {
        return {
          changed: true,
          messageEntity,
          storedEntity: sessionEntity,
          reason: `new subject (${messageEntity.entityName})`,
        };
      }
    }
  }

  return { changed: false, messageEntity, storedEntity };
}

function inferFlowForEntity(
  entity: SkyAiEntity | null,
  message: string,
  isPricing: boolean
): { flow: SkyAiFlow | null; step: SkyAiStep | null } {
  if (isPricing) {
    return { flow: "pricing_estimate", step: "pricing_request" };
  }
  if (entity?.entityType === "vehicle") {
    return { flow: "vehicle_listing", step: "vehicle_details" };
  }
  if (entity?.entityType === "service") {
    return { flow: "service_listing", step: "service_scope" };
  }
  if (/\bauction\b/i.test(message) || /\b(start|starting)\b.*\bbid/i.test(message)) {
    return { flow: "auction_creation", step: "auction_params" };
  }
  return { flow: "listing_creation", step: "describe_item" };
}

export function seedDraftFromMessage(
  message: string,
  entity: SkyAiEntity | null,
  isPricing = false
): Partial<SkyAiListingDraft> {
  const { flow, step } = inferFlowForEntity(entity, message, isPricing);
  const auctionPatch = parseAuctionParamsFromMessage(message);

  const draft: Partial<SkyAiListingDraft> = {
    status: "draft",
    flow,
    step,
    entityType: entity?.entityType,
    entityName: entity?.entityName,
    entityKey: entity?.entityKey,
    ...auctionPatch,
  };

  if (entity?.entityType === "vehicle") {
    draft.listingType = "vehicle";
    draft.category = "Cars";
    const make = entity.entityKey.replace("vehicle:", "").split("-")[0];
    if (make && make !== "generic") {
      draft.vehicleMake = make.charAt(0).toUpperCase() + make.slice(1);
    }
    if (entity.entityName && entity.entityName !== draft.vehicleMake) {
      draft.title = entity.entityName;
    }
  } else if (entity?.entityType === "service") {
    draft.listingType = "service";
    draft.title = entity.entityName;
  } else if (entity?.entityType === "gaming") {
    draft.listingType = "physical";
    draft.category = "Gaming";
    draft.title = entity.entityName;
  } else if (entity?.entityType === "rental") {
    draft.listingType = "rental";
    draft.title = entity.entityName;
  } else if (entity) {
    draft.listingType = entity.entityType === "digital" ? "digital" : "physical";
    draft.title = entity.entityName;
  }

  return draft;
}

export function buildListingContextFromEntity(
  entity: SkyAiEntity | null,
  message: string
): SkyAiListingContext | null {
  if (!entity) return null;

  const ctx: SkyAiListingContext = {
    title: entity.entityName,
    listingType:
      entity.entityType === "vehicle"
        ? "vehicle"
        : entity.entityType === "service"
          ? "service"
          : entity.entityType === "rental"
            ? "rental"
            : entity.entityType === "digital"
              ? "digital"
              : "physical",
  };

  if (entity.entityType === "vehicle") {
    const make = entity.entityKey.replace("vehicle:", "").split("-")[0];
    if (make && make !== "generic") {
      ctx.vehicleMake = make.charAt(0).toUpperCase() + make.slice(1);
    }
    ctx.category = "Cars";
    const year = message.match(/\b(19|20)\d{2}\b/);
    if (year) ctx.vehicleYear = year[0];
    const modelMatch = message.match(
      new RegExp(`\\b${ctx.vehicleMake}\\s+([\\w.-]+)`, "i")
    );
    if (modelMatch?.[1]) ctx.vehicleModel = modelMatch[1];
  }

  if (entity.entityType === "gaming") {
    ctx.category = "Gaming";
  }

  return ctx;
}

export type ResolvedSessionContext = {
  sessionDraft: Partial<SkyAiListingDraft> | null;
  listingContext: SkyAiListingContext | null;
  subjectChanged: boolean;
  messageEntity: SkyAiEntity | null;
  skipHistoryMerge: boolean;
  pricingContext: SkyAiListingContext | null;
  changeReason?: string;
};

export function resolveActiveSessionContext(
  message: string,
  listingContext: SkyAiListingContext | null,
  sessionDraft: Partial<SkyAiListingDraft> | null,
  _history: SkyAiHistoryItem[],
  options?: { isPricingIntent?: boolean }
): ResolvedSessionContext {
  const { changed, messageEntity, reason } = detectSubjectChange(
    message,
    sessionDraft,
    listingContext
  );

  if (changed) {
    const seed = seedDraftFromMessage(message, messageEntity, options?.isPricingIntent);
    const pricingContext = buildListingContextFromEntity(messageEntity, message);
    return {
      sessionDraft: seed,
      listingContext: pricingContext,
      subjectChanged: true,
      messageEntity,
      skipHistoryMerge: true,
      pricingContext,
      changeReason: reason,
    };
  }

  const pricingContext = listingContext;
  return {
    sessionDraft,
    listingContext,
    subjectChanged: false,
    messageEntity,
    skipHistoryMerge: false,
    pricingContext,
  };
}

export function attachEntityToDraft(
  draft: SkyAiListingDraft,
  entity: SkyAiEntity | null
): SkyAiListingDraft {
  if (!entity) return draft;
  return {
    ...draft,
    entityType: entity.entityType,
    entityName: entity.entityName,
    entityKey: entity.entityKey,
  };
}
