/**
 * Semantic listing identity — detect when an incoming message describes a
 * different item than the active draft. Never PATCH identity fields across items.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import { normalizedAwhinaText } from "./awhina-input-normalize";
import { resolveVehicleIdentity } from "./sky-ai-find-routing";
import { composeListingIdentity } from "./awhina-listing-identity";
import {
  hasDigitalOfferingIntent,
  hasRentalOfferingIntent,
  hasServiceOfferingIntent,
  hasWantedListingIntent,
  isEquipmentBrandNotVehicle,
  lastConfirmedOfferingMode,
} from "./sky-ai-intent";

export type ListingIdentity = {
  kind: "vehicle" | "physical" | "service" | "rental" | "digital" | "unknown";
  label: string;
  make?: string;
  model?: string;
  year?: string;
  title?: string;
  listingType?: string;
};

const YEAR_MAKE_RE =
  /\b(19|20)\d{2}\s+(?:toyota|honda|nissan|mazda|ford|bmw|mercedes|holden|hyundai|kia|subaru|mitsubishi|lexus|audi|volkswagen|vw|isuzu|suzuki|volvo|land rover|range rover|jeep|chevrolet|chevy|dodge|ram|tesla|porsche|mini|jaguar)\b/i;

const KM_RE = /\b[\d,]{3,7}\s*(?:km|kms|kilomet(?:er|re)s?)\b/i;

function normToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Identity-rich paste — complete new listing without requiring price or "list my". */
export function isIdentityRichListingPaste(message: string): boolean {
  const m = normalizedAwhinaText(message);
  if (!m) return false;
  const words = m.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;

  if (YEAR_MAKE_RE.test(m) || (KM_RE.test(m) && /\b(toyota|bmw|mazda|honda|ford|nissan|subaru|hilux|335i|corolla|ranger)\b/i.test(m))) {
    return true;
  }
  if (/\b(lawn\s*mow|house\s*clean|photograph|trailer\s*hire|rent(?:al)?|for hire)\b/i.test(m)) {
    return words.length >= 6;
  }
  if (/\b(iphone|galaxy|samsung|pixel|ps5|xbox|couch|sofa|typewriter|pok[eé]mon|charizard)\b/i.test(m)) {
    return words.length >= 5;
  }
  if (/\b(\d+\s*bedroom|\/\s*week|per week|weekly rent)\b/i.test(m)) {
    return words.length >= 5;
  }
  return false;
}

export function extractListingIdentityFromMessage(message: string): ListingIdentity | null {
  const m = normalizedAwhinaText(message);
  if (!m) return null;

  const lastMode = lastConfirmedOfferingMode(m);

  if (hasWantedListingIntent(m) && lastMode !== "sale") {
    const wantedItem =
      m
        .replace(/^(?:looking for|wanted[:\s]*|after a|in the market for|iso|wtb)\s+/i, "")
        .replace(/\b(?:budget|up to|under|around|max|no scams|prefer(?:ably)?|serious only|no time\s*wasters?)\b.*$/i, "")
        .replace(/\b(?:in|around|near)\s+[A-Za-z][\w\s-]{2,30}$/i, "")
        .trim()
        .slice(0, 80) || "Wanted item";
    return {
      kind: "physical",
      label: wantedItem,
      listingType: "wanted",
      title: wantedItem,
    };
  }

  if (hasRentalOfferingIntent(m) || lastMode === "hire") {
    const label =
      m.match(
        /\b(\d+\s*bed(?:room)?s?(?:\s+(?:unit|flat|apartment|house|townhouse))?|trailer(?:\s*hire)?|hilux|ranger|ute|apartment|flat|house)\b/i
      )?.[1] || "Rental listing";
    const cleanedLabel = String(label)
      .replace(/^hire\s+out\s+(?:my\s+)?/i, "")
      .trim();
    return {
      kind: "rental",
      label: cleanedLabel.replace(/\b\w/g, (c) => c.toUpperCase()),
      listingType: "rental",
      title: cleanedLabel,
    };
  }

  if (hasDigitalOfferingIntent(m)) {
    const hit =
      m.match(
        /\b((?:ebook|e-book)[^,.]{0,40}|canva[^,.]{0,40}|template\s+pack[^,.]{0,40}|(?:adobe\s+)?photoshop\s+course[^,.]{0,40}|course\s+videos?)\b/i
      )?.[1] || "Digital download";
    return {
      kind: "digital",
      label: hit.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
      listingType: "digital",
      title: hit.trim(),
    };
  }

  if (hasServiceOfferingIntent(m)) {
    const title =
      m.match(
        /\b(lawn\s*mowing(?:\s+service)?|house\s*clean(?:ing)?(?:\s+service)?|handyman(?:\s+services?)?|tutoring|maths?\s+tutoring|photography|photographer|i\s+mow\s+lawns?)\b/i
      )?.[1] || "Service";
    const label = /mow/i.test(title) ? "Lawn Mowing" : title.replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      kind: "service",
      label,
      listingType: "service",
      title: label,
    };
  }

  const vehicle = resolveVehicleIdentity(m);
  if (
    !isEquipmentBrandNotVehicle(m) &&
    (vehicle.make || vehicle.model || YEAR_MAKE_RE.test(m))
  ) {
    const make = vehicle.make?.trim();
    const model = vehicle.model?.trim();
    const year = vehicle.year?.trim();
    const label =
      composeListingIdentity({ year, brand: make, product: model }) ||
      [year, make, model].filter(Boolean).join(" ") ||
      make ||
      model ||
      "Vehicle";
    return {
      kind: "vehicle",
      label: label.trim(),
      make,
      model,
      year,
      listingType: "vehicle",
    };
  }

  if (
    /\b(iphone|galaxy|samsung|pixel|ps5|ps4|playstation|xbox|switch|couch|sofa|typewriter|charizard|pok[eé]mon)\b/i.test(
      m
    )
  ) {
    const hit =
      m.match(
        /\b(iphone(?:\s+(?:\d+|se|mini|pro|max|plus)){0,4}|galaxy\s+s\d+(?:\s+ultra)?|samsung\s+galaxy[^,.]{0,40}|google\s+pixel\s*\d*\w*|ps5(?:\s+slim)?|playstation\s*[45]|xbox(?:\s*series\s*[sx])?|nintendo\s*switch|charizard[^,.]{0,40}|olivetti[^,.]{0,40}|typewriter|couch|sofa)\b/i
      )?.[1] || m.slice(0, 48);
    return {
      kind: "physical",
      label: hit.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
      listingType: "physical",
      title: hit.trim(),
    };
  }
  return null;
}

export function extractListingIdentityFromDraft(
  draft: SkyAiListingContext | SkyAiListingFill | null | undefined
): ListingIdentity | null {
  if (!draft) return null;
  const listingType = String(draft.listingType || "").toLowerCase();
  if (listingType === "vehicle" || draft.vehicleMake || draft.vehicleModel) {
    const label =
      draft.title?.trim() ||
      composeListingIdentity({
        year: draft.vehicleYear,
        brand: draft.vehicleMake,
        product: draft.vehicleModel,
        generation: draft.vehicleGeneration,
      }) ||
      [draft.vehicleYear, draft.vehicleMake, draft.vehicleModel].filter(Boolean).join(" ");
    if (!label) return null;
    return {
      kind: "vehicle",
      label,
      make: draft.vehicleMake,
      model: draft.vehicleModel,
      year: draft.vehicleYear,
      listingType: "vehicle",
    };
  }
  if (listingType === "service") {
    return { kind: "service", label: draft.title?.trim() || "Service", title: draft.title, listingType: "service" };
  }
  if (listingType === "rental") {
    return { kind: "rental", label: draft.title?.trim() || "Rental", title: draft.title, listingType: "rental" };
  }
  if (draft.title?.trim()) {
    return { kind: "physical", label: draft.title.trim(), title: draft.title, listingType: listingType || "physical" };
  }
  return null;
}

function makesConflict(a?: string, b?: string): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return normToken(a) !== normToken(b);
}

function modelsConflict(a?: string, b?: string): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = normToken(a);
  const nb = normToken(b);
  if (na === nb) return false;
  if (na.includes(nb) || nb.includes(na)) return false;
  return true;
}

/** True when incoming message cannot be the same listing as the active draft. */
export function listingIdentitiesConflict(
  prior: SkyAiListingContext | SkyAiListingFill | null | undefined,
  message: string
): boolean {
  const current = extractListingIdentityFromDraft(prior);
  const incoming = extractListingIdentityFromMessage(message);
  if (!current || !incoming) return false;

  if (current.kind !== incoming.kind) return true;

  if (current.kind === "vehicle" && incoming.kind === "vehicle") {
    if (makesConflict(current.make, incoming.make)) return true;
    if (modelsConflict(current.model, incoming.model)) return true;
    const currentLabel = normToken(current.label);
    const incomingLabel = normToken(incoming.label);
    if (
      currentLabel &&
      incomingLabel &&
      currentLabel !== incomingLabel &&
      !incomingLabel.includes(currentLabel) &&
      !currentLabel.includes(incomingLabel) &&
      isIdentityRichListingPaste(message)
    ) {
      return true;
    }
  }

  if (current.kind === "physical" && incoming.kind === "physical") {
    const a = normToken(current.title || current.label);
    const b = normToken(incoming.title || incoming.label);
    if (a && b && a !== b && !a.includes(b) && !b.includes(a) && isIdentityRichListingPaste(message)) {
      return true;
    }
  }

  if (current.kind === "service" && incoming.kind === "service") {
    const a = normToken(current.title || current.label);
    const b = normToken(incoming.title || incoming.label);
    if (a && b && a !== b && !/mow|clean/i.test(a) === !/mow|clean/i.test(b)) return true;
  }

  return false;
}

export function formatActiveListingLabel(
  draft: SkyAiListingContext | SkyAiListingFill | null | undefined
): string | null {
  const identity = extractListingIdentityFromDraft(draft);
  return identity?.label?.trim() || draft?.title?.trim() || null;
}

export function buildNewListingTransitionReply(incoming: ListingIdentity): string {
  const name = incoming.label.trim();
  const needsPrice =
    incoming.kind === "vehicle" || incoming.kind === "physical" || incoming.kind === "rental";
  if (needsPrice) {
    return `Got it — I've started a new listing for your **${name}**. What's the asking price?`;
  }
  return `Got it — I've started a new listing for **${name}**. Tell me anything else buyers should know.`;
}

/** Empty canonical shell for atomic REPLACE — never inherit prior listing fields. */
export function emptyListingDraftShell(incoming?: Partial<SkyAiListingFill>): SkyAiListingFill {
  return {
    listingType: incoming?.listingType || "physical",
    replaceDraft: true,
    extras: [],
    description: "",
    descriptionSource: "ai",
  };
}
