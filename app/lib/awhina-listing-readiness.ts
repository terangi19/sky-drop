/**
 * Honest listing readiness — never "Listing ready" from sparse fields alone.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  getVehicleDraftReadiness,
  isVehicleListingFill,
} from "./awhina-listing-description";
import {
  computeMissingListingSlots,
  nextListingSlotQuestion,
  composeVehicleIdentityTitle,
  hydrateVehicleGeneration,
  SLOT_QUESTIONS,
} from "./awhina-pending-slots";

export type ListingReadinessState =
  | "STARTED"
  | "IN_PROGRESS"
  | "READY_TO_REVIEW"
  | "READY_TO_PUBLISH";

export function getListingReadinessState(
  fill: Partial<SkyAiListingFill>
): ListingReadinessState {
  const type = (fill.listingType || "").toLowerCase();
  const title = fill.title?.trim();
  const vehicleIdentityActive = type === "vehicle" || (!type && Boolean(fill.vehicleMake || fill.vehicleModel));
  const hasIdentity = Boolean(
    title ||
      (vehicleIdentityActive && (fill.vehicleMake || fill.vehicleModel)) ||
      (fill.extras && fill.extras.length)
  );
  if (!hasIdentity) return "STARTED";

  const missing = computeMissingListingSlots(fill);
  if (isVehicleListingFill(fill as SkyAiListingFill)) {
    const r = getVehicleDraftReadiness(fill as SkyAiListingFill);
    if (!r.identityComplete) return "STARTED";
    if (!fill.vehicleYear?.trim() || missing.length >= 4) return "IN_PROGRESS";
    if (
      r.worthGeneratingBuyerCopy &&
      fill.price &&
      fill.condition &&
      (fill.location || fill.pickupArea) &&
      fill.vehicleYear
    ) {
      return missing.length === 0 ? "READY_TO_PUBLISH" : "READY_TO_REVIEW";
    }
    return "IN_PROGRESS";
  }

  const hasCore =
    Boolean(fill.price) &&
    Boolean(type === "wanted" || fill.condition) &&
    Boolean(fill.location || fill.pickupArea || type === "wanted") &&
    Boolean(title);
  if (!hasCore) return missing.length >= 3 ? "STARTED" : "IN_PROGRESS";
  if (missing.length === 0) return "READY_TO_PUBLISH";
  return "READY_TO_REVIEW";
}

export function readinessLabel(state: ListingReadinessState): string {
  switch (state) {
    case "STARTED":
      return "Listing started";
    case "IN_PROGRESS":
      return "Listing in progress";
    case "READY_TO_REVIEW":
      return "Ready to review";
    case "READY_TO_PUBLISH":
      return "Ready to publish";
  }
}

/** Premium auto-title from sticky identity — includes USER variant when present. */
export function buildStickyIdentityTitle(fill: Partial<SkyAiListingFill>): string {
  const hydrated = hydrateVehicleGeneration(fill);
  if (hydrated.vehicleMake || hydrated.vehicleModel || hydrated.vehicleGeneration) {
    return composeVehicleIdentityTitle(hydrated);
  }
  return (fill.title || "").trim();
}

/**
 * Reply after compound / list-it turns — one next question, never false ready.
 */
export function buildReadinessFollowUpReply(
  fill: SkyAiListingFill,
  opts?: {
    lead?: string;
    notes?: string[];
    listPublishAsked?: boolean;
  }
): string {
  const state = getListingReadinessState(fill);
  const title = buildStickyIdentityTitle(fill) || fill.title || "your listing";
  const next = nextListingSlotQuestion(fill);
  const lead =
    opts?.lead ||
    (opts?.notes?.length
      ? `Done — ${opts.notes.join(", ")}.`
      : `Got it — **${title}** is on the form.`);

  if (opts?.listPublishAsked) {
    if (state === "READY_TO_PUBLISH" || state === "READY_TO_REVIEW") {
      return `${lead} Your draft looks solid — add photos, then tap **Publish** on the form when you're ready.`;
    }
    const q = next?.question || SLOT_QUESTIONS.year;
    return `I've got **${title}** started — I still need more before we can publish. ${q}`;
  }

  if (next) {
    return `${lead} ${next.question}`;
  }
  if (state === "READY_TO_PUBLISH") {
    return `${lead} Add photos, then tap **Publish** when you're happy.`;
  }
  return lead;
}
