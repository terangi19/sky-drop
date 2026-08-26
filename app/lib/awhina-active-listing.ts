/**
 * Authoritative active listing state for /post/ai.
 * One object owns identity, attributes, evidence, and derived description.
 * Chat history is NOT listing state.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import { createListingDraftId } from "./sky-ai-listing-context";
import {
  groupedSellerEvidenceFromExtras,
  isSellerEvidenceExtra,
  type GroupedSellerEvidence,
} from "./awhina-seller-evidence";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";
import { composeListingIdentity } from "./awhina-listing-identity";
import { formatActiveListingLabel } from "./awhina-listing-identity-conflict";

export type ActiveListingIdentity = {
  title?: string;
  brand?: string;
  make?: string;
  model?: string;
  variant?: string;
  year?: string;
};

export type ActiveListingAttributes = {
  condition?: string;
  colour?: string;
  price?: string;
  location?: string;
  odometer?: string;
  transmission?: string;
  fuelType?: string;
  bodyType?: string;
  storage?: string;
  category?: string;
  paymentType?: string;
  serviceDuration?: string;
  rentalSubType?: string;
};

export type ActiveListingEvidence = GroupedSellerEvidence;

export type ActiveListing = {
  draftId: string;
  listingType: string;
  identity: ActiveListingIdentity;
  attributes: ActiveListingAttributes;
  evidence: ActiveListingEvidence;
  description?: string;
  descriptionSource?: "ai" | "user";
  extras?: string[];
};

export function createEmptyActiveListing(
  listingType = "physical",
  draftId?: string
): ActiveListing {
  return {
    draftId: draftId || createListingDraftId(),
    listingType,
    identity: {},
    attributes: {},
    evidence: {
      modifications: [],
      maintenance: [],
      conditionDetails: [],
      mechanical: [],
      compliance: [],
      included: [],
      logistics: [],
      notes: [],
    },
    description: "",
    descriptionSource: "ai",
    extras: [],
  };
}

function storageFromExtras(extras?: string[]): string | undefined {
  if (!extras?.length) return undefined;
  for (const e of extras) {
    const m = e.match(/^storage:(.+)$/i);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

function variantFromExtras(extras?: string[]): string | undefined {
  if (!extras?.length) return undefined;
  for (const e of extras) {
    const m = e.match(/^variant:(.+)$/i);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

/** Convert persisted fill/context → authoritative ActiveListing. */
export function fillToActiveListing(
  fill: SkyAiListingFill | SkyAiListingContext | null | undefined,
  draftId?: string
): ActiveListing | null {
  if (!fill) return null;
  const hasContent =
    fill.title?.trim() ||
    fill.vehicleMake?.trim() ||
    fill.vehicleModel?.trim() ||
    fill.description?.trim() ||
    (Array.isArray(fill.extras) && fill.extras.length > 0);
  if (!hasContent) return null;

  const extras = Array.isArray(fill.extras)
    ? fill.extras.filter((x): x is string => typeof x === "string")
    : [];

  const typed = fill as SkyAiListingFill & SkyAiListingContext;
  return {
    draftId: typed.draftId || draftId || createListingDraftId(),
    listingType: String(fill.listingType || (fill.vehicleMake ? "vehicle" : "physical")),
    identity: {
      title: fill.title?.trim(),
      make: fill.vehicleMake?.trim(),
      model: fill.vehicleModel?.trim(),
      variant: fill.vehicleGeneration?.trim() || variantFromExtras(extras),
      year: fill.vehicleYear?.trim(),
      brand: fill.vehicleMake?.trim(),
    },
    attributes: {
      condition: fill.condition?.trim(),
      colour: fill.vehicleColour?.trim(),
      price: fill.price?.trim(),
      location: fill.location?.trim(),
      odometer: fill.vehicleOdometer?.trim(),
      transmission: fill.vehicleTransmission?.trim(),
      fuelType: fill.vehicleFuelType?.trim(),
      bodyType: fill.vehicleBodyType?.trim(),
      storage: storageFromExtras(extras),
      category: fill.category?.trim(),
      paymentType: fill.paymentType?.trim(),
      serviceDuration: fill.serviceDuration?.trim(),
      rentalSubType: fill.rentalSubType?.trim(),
    },
    evidence: groupedSellerEvidenceFromExtras(extras),
    description: fill.description?.trim(),
    descriptionSource: typed.descriptionSource === "user" ? "user" : "ai",
    extras,
  };
}

/** Convert ActiveListing → SkyAiListingFill for form sync. */
export function activeListingToFill(listing: ActiveListing): SkyAiListingFill {
  const identityTitle =
    listing.identity.title?.trim() ||
    composeListingIdentity({
      year: listing.identity.year,
      brand: listing.identity.make || listing.identity.brand,
      product: listing.identity.model,
      generation: listing.identity.variant,
    }) ||
    formatActiveListingLabel({
      title: listing.identity.title,
      listingType: listing.listingType,
      vehicleMake: listing.identity.make,
      vehicleModel: listing.identity.model,
      vehicleYear: listing.identity.year,
      vehicleGeneration: listing.identity.variant,
    } as SkyAiListingContext);

  const fill: SkyAiListingFill = {
    draftId: listing.draftId,
    listingType: listing.listingType,
    title: identityTitle || undefined,
    description: listing.description,
    descriptionSource: listing.descriptionSource || "ai",
    category: listing.attributes.category,
    condition: listing.attributes.condition,
    price: listing.attributes.price,
    location: listing.attributes.location,
    paymentType: listing.attributes.paymentType,
    serviceDuration: listing.attributes.serviceDuration,
    rentalSubType: listing.attributes.rentalSubType,
    vehicleMake: listing.identity.make,
    vehicleModel: listing.identity.model,
    vehicleGeneration: listing.identity.variant,
    vehicleYear: listing.identity.year,
    vehicleOdometer: listing.attributes.odometer,
    vehicleColour: listing.attributes.colour,
    vehicleTransmission: listing.attributes.transmission,
    vehicleFuelType: listing.attributes.fuelType,
    vehicleBodyType: listing.attributes.bodyType,
    extras: listing.extras?.length ? [...listing.extras] : [],
  };

  return fill;
}

/** Regenerate description from canonical facts only — never chat history. */
export function rebuildActiveListingDescription(
  listing: ActiveListing,
  opts?: { force?: boolean }
): ActiveListing {
  if (listing.descriptionSource === "user" && listing.description && !opts?.force) {
    return listing;
  }
  const fill = activeListingToFill(listing);
  const finalized = finalizeAwhinaListingDescription(fill, {
    force: opts?.force ?? true,
  });
  return {
    ...listing,
    description: finalized.description || listing.description || "",
    descriptionSource: finalized.descriptionSource || "ai",
  };
}

export function activeListingLabel(listing: ActiveListing | null | undefined): string | null {
  if (!listing) return null;
  return (
    listing.identity.title?.trim() ||
    composeListingIdentity({
      year: listing.identity.year,
      brand: listing.identity.make || listing.identity.brand,
      product: listing.identity.model,
      generation: listing.identity.variant,
    }) ||
    null
  );
}

/** Hard invariants — throws in tests, logs in production paths. */
export function assertActiveListingInvariants(
  listing: ActiveListing,
  opts?: { prior?: ActiveListing | null; rawMessage?: string }
): void {
  const label = activeListingLabel(listing)?.toLowerCase() || "";
  const make = listing.identity.make?.toLowerCase() || "";
  const model = listing.identity.model?.toLowerCase() || "";

  if (make && model && label) {
    if (make && !label.includes(make.split(/\s+/)[0])) {
      if (model && !label.includes(model.split(/\s+/)[0])) {
        throw new Error(`Identity label mismatch: "${label}" vs ${make} ${model}`);
      }
    }
  }

  if (opts?.prior && opts.prior.draftId === listing.draftId) {
    const priorMake = opts.prior.identity.make?.toLowerCase();
    const priorModel = opts.prior.identity.model?.toLowerCase();
    if (
      priorMake &&
      make &&
      priorMake !== make &&
      priorModel &&
      model &&
      priorModel !== model
    ) {
      throw new Error(
        `Cross-identity patch forbidden on draft ${listing.draftId}: ${priorMake} ${priorModel} → ${make} ${model}`
      );
    }
  }

  if (opts?.rawMessage?.trim()) {
    const raw = opts.rawMessage.trim().toLowerCase();
    for (const item of listing.extras || []) {
      if (!isSellerEvidenceExtra(item)) continue;
      const text = item.includes(":") ? item.slice(item.indexOf(":") + 1).trim() : item;
      if (text.length > 24 && raw.includes(text.toLowerCase())) {
        const ratio = text.length / raw.length;
        if (ratio > 0.65) {
          throw new Error(`Raw seller message leaked as evidence: "${text.slice(0, 48)}…"`);
        }
      }
    }
  }
}
