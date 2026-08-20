/**
 * Structured listing composer — premium title + category-aware human description.
 * Description path: facts → type writer → quality pass (awhina-listing-description).
 */

import {
  buildPremiumListingTitle,
  normalizeProductName,
  resolveListingDescriptionStyle,
  type ListingDescriptionQuality,
} from "./awhina-product-ux";
import {
  buildListingDescriptionFromFacts,
  removeStructuredPriceCopy,
  splitListingDescriptionSentences,
  stripStructuredMetadataLeakage,
} from "./awhina-listing-description";
import {
  buildDescriptionWriterFacts,
  runAwhinaListingDescriptionWriter,
  validateAiListingDescription,
  type DescriptionWriterAttempt,
  type DescriptionWriterRunOptions,
} from "./awhina-description-writer";
import {
  composeListingIdentity,
  guardAdjacentIdentityDuplication,
} from "./awhina-listing-identity";
import {
  inferPhysicalCategoryFromText,
  type SkyAiListingFill,
} from "./sky-ai-listing-fill";
import {
  parseVehicleMake,
  parseVehicleModel,
  parseVehicleYear,
  resolveVehicleIdentity,
} from "./sky-ai-find-routing";
import { extractServiceOfferingTitle, hasServiceOfferingIntent } from "./sky-ai-intent";
import { SERVICE_LISTING_CATEGORY_LIST } from "./listing-type-config";
import {
  groupedSellerEvidenceFromExtras,
  sellerEvidenceItemCount,
} from "./awhina-seller-evidence";
import { hasCategoryIncompatibleDescription } from "./awhina-category-copy-guard";
import { isSealedTradingCardProductFormat } from "./awhina-public-copy-gate";
import {
  containsInternalOrchestration,
  sanitizePublicListingCopy,
} from "./awhina-orchestration-boundary";

export type ListingComposeSeed = {
  item: string;
  condition?: string;
  price?: string;
  location?: string;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  extras?: string[];
  listingType?: string;
  category?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleColour?: string;
  vehicleOdometer?: string;
  vehicleTransmission?: string;
  vehicleFuelType?: string;
  vehicleBodyType?: string;
  servicePricingType?: string;
  serviceDuration?: string;
  quality?: ListingDescriptionQuality;
};

export type ComposedListingCopy = Pick<
  SkyAiListingFill,
  | "title"
  | "description"
  | "category"
  | "listingType"
  | "vehicleMake"
  | "vehicleModel"
  | "vehicleYear"
> & {
  style: ReturnType<typeof resolveListingDescriptionStyle>;
};

function detectVehicle(item: string): boolean {
  const identity = resolveVehicleIdentity(item);
  return (
    identity.confidence === "high" ||
    Boolean(identity.make && identity.model) ||
    /toyota|mazda|honda|ford|bmw|nissan|subaru|ute|car\b|vehicle|\d{2,3}[\s,]?\d{3}\s*km/i.test(item) ||
    Boolean(parseVehicleMake(item))
  );
}

function detectService(item: string): boolean {
  return (
    hasServiceOfferingIntent(item) ||
    Boolean(extractServiceOfferingTitle(item)) ||
    /\b(lawn\s*mowing|house\s*clean|photographer|tutor|plumbing|handyman|dog\s*walking)\b/i.test(item)
  );
}

function inferServiceCategory(item: string): string {
  const lower = item.toLowerCase();
  if (/photo/.test(lower)) return "Photography";
  if (/tutor|lesson|teach/.test(lower)) return "Tutoring & Lessons";
  if (/clean/.test(lower)) return "Cleaning & Maintenance";
  if (/train/.test(lower)) return "Personal Training";
  if (/mow|lawn|plumb|handyman|paint|deck|fix|electr|garden|landscap/.test(lower)) return "Trades & Repairs";
  return SERVICE_LISTING_CATEGORY_LIST.includes("Other Services") ? "Other Services" : "Trades & Repairs";
}

/**
 * A listing title is product identity, never the user's command sentence.
 * Keep this generic so "sell my PS5", "I want to list a couch", etc. all
 * converge on the actual item name before public copy reaches the form.
 */
function stripListingCommandPrefix(raw: string): string {
  return raw
    .replace(
      /^\s*(?:please\s+)?(?:i\s+(?:want|wanna|would\s+like)\s+to\s+)?(?:sell|list|post|advertise)(?:ing)?\s+(?:my\s+|a\s+|an\s+|the\s+)?/i,
      ""
    )
    .replace(/^\s*i\s+am\s+selling\s+(?:my\s+|a\s+|an\s+|the\s+)?/i, "")
    .replace(/^\s*i'?m\s+selling\s+(?:my\s+|a\s+|an\s+|the\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAwhinaListingTitle(fill: SkyAiListingFill): SkyAiListingFill {
  const original = fill.title?.trim();
  if (!original) return fill;

  const stripped = stripListingCommandPrefix(original);
  let raw = normalizeProductName(stripped || original)
    .replace(/\s+/g, " ")
    .trim();

  const vehicleLike =
    fill.listingType === "vehicle" ||
    Boolean(fill.vehicleMake || fill.vehicleModel || fill.vehicleGeneration) ||
    /\b(?:r\s*3[2-4]|gt[\s-]?[tr])\b/i.test(raw);

  let title = raw;
  if (vehicleLike) {
    title = title
      .replace(/\bgt[\s-]?t\b/gi, "GTT")
      .replace(/\bgt[\s-]?r\b/gi, "GT-R")
      .replace(/\br\s*([3][2-4])\b/gi, "R$1")
      .replace(/\s+/g, " ")
      .trim();
    title = guardAdjacentIdentityDuplication(title)
      .replace(/\bgt[\s-]?t\b/gi, "GTT")
      .replace(/\bgt[\s-]?r\b/gi, "GT-R")
      .replace(/\br\s*([3][2-4])\b/gi, "R$1")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    title = guardAdjacentIdentityDuplication(title);
  }

  return title === original ? fill : { ...fill, title: title.slice(0, 120) };
}

/** Generic AI filler is never acceptable public copy. Keep this at the final boundary so stale/model/template prose cannot re-enter later. */
const GENERIC_PUBLIC_COPY_RE = /\b(?:standout(?:\s+(?:vehicle|car|item|product))?|known for (?:its )?(?:performance|design)|performance and design|classic era|represents a|notable (?:example|model)|example of .{0,45}engineering|engineering from that era|era of .{0,45}performance|great choice|solid choice|perfect for|ideal for|must-have|great addition|don'?t miss out|enthusiasts?(?:\s+and\s+collectors?)?|collectors? alike|enthusiasts? and collectors? alike|from .{0,30}(?:lineup|range)|the seller confirms?|seller confirms?|seller states?|according to the seller|ensur(?:e|es|ing) (?:a )?(?:reliable|smooth|great|better) (?:gaming )?experience|provid(?:e|es|ing) peace of mind|making (?:it|this) (?:a )?(?:reliable|great|solid) choice|latest features?|performance enhancements?|advanced capabilities?|versatile (?:smartphone|device|item|product)|designed for a range of uses|from photography to gaming|enjoy (?:the )?(?:advanced|latest)|offers? (?:the )?latest)\b/i;

/**
 * Missing information must stay missing. Never turn absence of a fact into a
 * buyer-facing claim such as "not sealed" or padding like "details were not
 * provided". Āwhina should ask the seller for those facts instead.
 */
const UNSUPPORTED_ABSENCE_COPY_RE = /\b(?:not\s+sealed|non[-\s]?sealed|not\s+unopened|previously\s+opened\s+or\s+used|indicat(?:e|es|ing)\s+it\s+has\s+been\s+previously\s+opened|details?\s+(?:are|were|was)\s+not\s+provided|information\s+(?:is|was)\s+not\s+provided|no\s+(?:further\s+)?details?\s+(?:are|were)\s+provided|unknown\s+whether|condition\s+is\s+unknown|accessories\s+(?:are|were)\s+not\s+specified)\b/i;

function isGenericPublicCopy(description: string | undefined | null): boolean {
  return Boolean(description?.trim() && GENERIC_PUBLIC_COPY_RE.test(description));
}

function isRejectedPublicCopy(description: string | undefined | null, fill: SkyAiListingFill): boolean {
  return Boolean(
    description?.trim() &&
      (isGenericPublicCopy(description) ||
        UNSUPPORTED_ABSENCE_COPY_RE.test(description) ||
        containsInternalOrchestration(description) ||
        hasCategoryIncompatibleDescription(description, fill))
  );
}

function shouldDeferSparseAiDescription(fill: SkyAiListingFill): boolean {
  if (fill.descriptionSource === "user") return false;
  const listingType = String(fill.listingType || "").toLowerCase();
  if (listingType === "service" || listingType === "rental" || listingType === "wanted") {
    return false;
  }
  if (
    isSealedTradingCardProductFormat(fill.title) ||
    isSealedTradingCardProductFormat((fill.extras || []).join(" "))
  ) {
    return false;
  }
  const evidence = groupedSellerEvidenceFromExtras(fill.extras, undefined);
  const evidenceCount = sellerEvidenceItemCount(evidence);
  const structuredExtras = (fill.extras || []).filter((extra) =>
    /^(?:storage|colour|color|size|grade|set|subject|variant|parallel|serial|product|brand|model|generation):/i.test(extra)
  ).length;
  const vehicleDetailCount = [
    fill.vehicleYear,
    fill.vehicleGeneration,
    fill.vehicleColour,
    fill.vehicleOdometer,
    fill.vehicleTransmission,
    fill.vehicleFuelType,
    fill.vehicleBodyType,
  ].filter((value) => Boolean(String(value || "").trim())).length;

  // Identity alone is not enough reason to fabricate prose. Wait until the
  // seller has given at least one real descriptive fact such as condition,
  // a product attribute, vehicle detail, or seller evidence.
  return !fill.condition?.trim() && evidenceCount === 0 && structuredExtras === 0 && vehicleDetailCount === 0;
}

export function composeListingTitleAndDescription(seed: ListingComposeSeed): ComposedListingCopy {
  const item = seed.item.trim();
  const service = seed.listingType === "service" || detectService(item);
  const identity = resolveVehicleIdentity(item);
  const vehicle = !service && (seed.listingType === "vehicle" || detectVehicle(item) || Boolean(seed.vehicleMake || seed.vehicleModel));
  const listingType = service ? "service" : vehicle ? "vehicle" : seed.listingType || "physical";
  const make = seed.vehicleMake || identity.make || parseVehicleMake(item);
  const model = seed.vehicleModel || identity.model || parseVehicleModel(item);
  const year = seed.vehicleYear || identity.year || parseVehicleYear(item);
  const titleCore = vehicle && (make || model) ? composeListingIdentity({ year, brand: make, product: model }) || item : extractServiceOfferingTitle(item) || item;
  const title = buildPremiumListingTitle({ item: titleCore, condition: seed.condition, listingType, vehicleYear: year, brand: make, model: vehicle ? undefined : model });
  const category = seed.category || (listingType === "vehicle" ? "Cars" : listingType === "service" ? inferServiceCategory(`${item} ${title}`) : inferPhysicalCategoryFromText(`${item} ${title}`) || "Other");
  const fill: SkyAiListingFill = {
    title, condition: seed.condition, price: seed.price, location: seed.location,
    pickupAvailable: seed.pickupAvailable, shippingAvailable: seed.shippingAvailable,
    extras: seed.extras, listingType, category, vehicleMake: make, vehicleModel: model,
    vehicleYear: year, vehicleColour: seed.vehicleColour, vehicleOdometer: seed.vehicleOdometer,
    vehicleTransmission: seed.vehicleTransmission, vehicleFuelType: seed.vehicleFuelType,
    vehicleBodyType: seed.vehicleBodyType, servicePricingType: seed.servicePricingType,
    serviceDuration: seed.serviceDuration,
  };
  const normalizedFill = normalizeAwhinaListingTitle(fill);
  const quality = seed.quality ?? "premium_plus";
  const description = finalizeAwhinaListingDescription(normalizedFill, { quality }).description;
  const style = resolveListingDescriptionStyle(normalizedFill);
  return { title: normalizedFill.title || title, description, category, listingType, vehicleMake: make, vehicleModel: model, vehicleYear: year, style };
}

export function recomposeListingDescription(fill: SkyAiListingFill, opts?: { quality?: ListingDescriptionQuality; force?: boolean }): string {
  return buildListingDescriptionFromFacts(fill, { quality: opts?.quality ?? "premium_plus", force: opts?.force });
}

export function finalizeAwhinaListingDescription(fill: SkyAiListingFill, opts?: { quality?: ListingDescriptionQuality; force?: boolean }): SkyAiListingFill {
  fill = normalizeAwhinaListingTitle(fill);
  if (fill.descriptionSource === "user" && fill.description?.trim() && !opts?.force) return { ...fill, description: fill.description.trim() };
  if (shouldDeferSparseAiDescription(fill) && !opts?.force) {
    return { ...fill, description: "", descriptionSource: "ai" };
  }
  if (!opts?.force && fill.description?.trim() && !isRejectedPublicCopy(fill.description, fill)) {
    const facts = buildDescriptionWriterFacts(fill);
    const kept = validateAiListingDescription(fill.description, facts);
    const conditionPhrase = fill.condition?.trim()
      ? fill.condition.replace(/^Used\s*-\s*/i, "").toLowerCase()
      : "";
    // Like New must appear as like-new; bare "new" matching inside "condition"
    // is not enough. Good/Fair similarly need their own phrase.
    let reflectsCondition = true;
    if (conditionPhrase) {
      if (/like\s*new/.test(conditionPhrase)) {
        reflectsCondition = /like[- ]new/i.test(kept || "");
      } else if (/^new$/.test(conditionPhrase)) {
        reflectsCondition = /\bbrand\s+new\b|\bnew\b/i.test(kept || "") && !/like[- ]new/i.test(kept || "");
      } else if (/good/.test(conditionPhrase)) {
        reflectsCondition = /good used|good condition/i.test(kept || "");
      } else if (/fair/.test(conditionPhrase)) {
        reflectsCondition = /fair/i.test(kept || "");
      } else {
        const tokens = conditionPhrase.split(/\s+/).filter((word) => word.length > 2);
        reflectsCondition = tokens.length === 0 || new RegExp(tokens.join("|"), "i").test(kept || "");
      }
    }
    if (kept && reflectsCondition && !isRejectedPublicCopy(kept, fill)) return { ...fill, description: kept, descriptionSource: "ai" };
  }
  let description = recomposeListingDescription(fill, { ...opts, force: opts?.force || Boolean(fill.description?.trim()) });
  description = removeStructuredPriceCopy(description);
  description = stripStructuredMetadataLeakage(description);
  description = splitListingDescriptionSentences(description)
    .filter((sentence) => !/\b(message|get in touch|feel free|send me a message|drop me a message|happy to (sort|arrange|chat|answer)|if you'?re (interested|keen)|come take a look|just message)\b/i.test(sentence))
    .filter((sentence) => !isRejectedPublicCopy(sentence, fill))
    .join(" ").trim();
  if (isRejectedPublicCopy(description, fill)) description = "";
  description = sanitizePublicListingCopy(description);
  if (containsInternalOrchestration(description)) description = "";
  return { ...fill, description, descriptionSource: "ai" };
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function removePhysicalFallbackLocation(description: string, fill: SkyAiListingFill): string {
  if (fill.listingType && fill.listingType !== "physical") return description;
  if (sellerEvidenceItemCount(groupedSellerEvidenceFromExtras(fill.extras, fill.location)) >= 2) return description;
  const location = (fill.location || fill.pickupArea || "").trim();
  if (!location) return description;
  return description
    .replace(new RegExp(`\\s+(?:for sale\\s+)?in\\s+${escapeRegExp(location)}(?=[.,!?]|$)`, "gi"), "")
    .replace(new RegExp(`\\s+(?:shipping from|can ship from)\\s+${escapeRegExp(location)}`, "gi"), " Shipping")
    .replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

function hasAcceptableOfflineFallback(description: string, fill: SkyAiListingFill): boolean {
  const text = description.trim();
  if (!text || isRejectedPublicCopy(text, fill)) return false;
  if (/\b(?:asking\s+\$|priced at\s+\$)\b/i.test(text)) return false;
  if (/\bfor sale in\b/i.test(text)) return false;
  if (/\blocated in\b/i.test(text) && !(fill.location || fill.pickupArea || "").trim()) return false;
  const normalized = (value: string) =>
    value
      .toLowerCase()
      .replace(/\b(?:brand[- ]new|like[- ]new|good used condition|good condition|fair condition)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  // A title or title+condition is never a useful offline public description.
  return normalized(text) !== normalized(fill.title || "");
}

function logAsyncDescriptionOutcome(attempt: DescriptionWriterAttempt, fallbackSelected: boolean, finalDescription: string | undefined): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[awhina:description-finalizer]", { ...attempt, fallback_selected: fallbackSelected, final_description: finalDescription || "" });
}

export async function finalizeAwhinaListingDescriptionAsync(
  fill: SkyAiListingFill,
  opts?: { quality?: ListingDescriptionQuality; force?: boolean; writer?: DescriptionWriterRunOptions["generateRawOutput"] }
): Promise<SkyAiListingFill> {
  fill = normalizeAwhinaListingTitle(fill);
  if (fill.descriptionSource === "user" && fill.description?.trim() && !opts?.force) return finalizeAwhinaListingDescription(fill, opts);
  if (shouldDeferSparseAiDescription(fill) && !opts?.force) {
    return { ...fill, description: "", descriptionSource: "ai" as const };
  }
  const previousValid = fill.description?.trim() && !isRejectedPublicCopy(fill.description, fill)
    ? validateAiListingDescription(fill.description, buildDescriptionWriterFacts(fill))
    : null;
  const attempt = await runAwhinaListingDescriptionWriter(fill, { force: opts?.force, generateRawOutput: opts?.writer });
  if (attempt.description && !isRejectedPublicCopy(attempt.description, fill)) {
    const result = { ...fill, description: attempt.description, descriptionSource: "ai" as const };
    logAsyncDescriptionOutcome(attempt, false, result.description);
    return result;
  }
  if (previousValid && !isRejectedPublicCopy(previousValid, fill)) {
    const result = { ...fill, description: previousValid, descriptionSource: "ai" as const };
    logAsyncDescriptionOutcome(attempt, false, result.description);
    return result;
  }
  const deterministic = finalizeAwhinaListingDescription(fill, opts);
  const fallback = removePhysicalFallbackLocation(deterministic.description || "", fill);
  if (hasAcceptableOfflineFallback(fallback, fill)) {
    const result = { ...deterministic, description: fallback, descriptionSource: "ai" as const };
    logAsyncDescriptionOutcome(attempt, true, result.description);
    return result;
  }
  const result = { ...deterministic, description: "", descriptionSource: "ai" as const };
  logAsyncDescriptionOutcome(attempt, true, result.description);
  return result;
}
