/**
 * Listing operations — every message produces exactly one CREATE | PATCH | REMOVE | NO_CHANGE.
 * No hidden merge across listing identities.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import { assessDraftTransition } from "./awhina-draft-transition";
import {
  buildNewListingTransitionReply,
  emptyListingDraftShell,
  extractListingIdentityFromMessage,
  isIdentityRichListingPaste,
  listingIdentitiesConflict,
} from "./awhina-listing-identity-conflict";
import { stampReplaceDraft } from "./awhina-draft-transition";
import {
  hasActiveDraftCommandLanguage,
  isListPublishActionMessage,
} from "./awhina-active-draft-commands";
import { isSkyAiGeneralQuestion } from "./sky-ai-prompts";
import { getActiveListingSlot } from "./awhina-pending-slots";
import type { PendingClarification } from "./awhina-task-scope";
import {
  activeListingToFill,
  assertActiveListingInvariants,
  createEmptyActiveListing,
  fillToActiveListing,
  rebuildActiveListingDescription,
  type ActiveListing,
} from "./awhina-active-listing";
import { createListingDraftId } from "./sky-ai-listing-context";
import { enhanceListingFillFromMessage } from "./sky-ai-form-actions";
import { composeListingTitleAndDescription } from "./awhina-listing-composer";
import {
  extractCompoundListingFacts,
  hydrateVehicleGeneration,
} from "./awhina-pending-slots";
import { resolveVehicleIdentity } from "./sky-ai-find-routing";
import { normalizeSkyAiListingFill } from "./sky-ai-listing-fill";
import { groupedSellerEvidenceFromExtras } from "./awhina-seller-evidence";

export type ListingOperation =
  | { type: "CREATE"; message: string; reason: string }
  | { type: "PATCH"; message: string; reason: string }
  | { type: "REMOVE"; message: string; keys: string[]; reason: string }
  | { type: "NO_CHANGE"; message: string; reason: string };

export type ListingOperationResult = {
  operation: ListingOperation;
  listing: ActiveListing;
  fill: SkyAiListingFill;
  reply?: string;
  replaceDraft: boolean;
};

function looksLikePatchMessage(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  if (/^(actually|change|make it|set|update|correct|fix|instead|rather|add|remove)\b/i.test(t)) {
    return true;
  }
  if (/^\s*\$?\s*[\d,]+(?:\.\d{1,2})?\s*(k|K)?\s*$/i.test(t)) return true;
  if (/^\d+\s?(gb|tb)$/i.test(t)) return true;
  if (/^\s*[\d,]+\s*(km|kms)\s*$/i.test(t)) return true;
  if (/^(new|used|like[\s-]?new|good|fair|mint|manual|automatic|petrol|diesel|hybrid|grey|gray|black|white)$/i.test(t)) {
    return true;
  }
  return false;
}

export function classifyListingOperation(
  message: string,
  current: ActiveListing | null,
  opts: {
    freshStartHint?: boolean;
    pendingClarification?: PendingClarification | null;
    pathname?: string;
  } = {}
): ListingOperation {
  const trimmed = message.trim();
  if (!trimmed) return { type: "NO_CHANGE", message: trimmed, reason: "empty" };

  const transition = assessDraftTransition({
    message: trimmed,
    priorDraft: current ? activeListingToFill(current) : null,
    freshStartHint: opts?.freshStartHint,
    pendingClarification: opts.pendingClarification,
  });

  const identityConflict = listingIdentitiesConflict(
    current ? activeListingToFill(current) : null,
    trimmed
  );
  const activeSlot = getActiveListingSlot(opts?.pendingClarification);
  const slotSameListing =
    Boolean(activeSlot) && !listingIdentitiesConflict(current ? activeListingToFill(current) : null, trimmed);

  const removeMatch = trimmed.match(/\bremove\s+(?:the\s+)?(.+)/i);
  if (current && removeMatch?.[1] && looksLikePatchMessage(trimmed)) {
    return {
      type: "REMOVE",
      message: trimmed,
      keys: [removeMatch[1].trim()],
      reason: "explicit_remove",
    };
  }

  if (
    (transition.mode === "REPLACE" || identityConflict || opts?.freshStartHint) &&
    !slotSameListing
  ) {
    return {
      type: "CREATE",
      message: trimmed,
      reason: identityConflict
        ? "identity_conflict"
        : transition.reason || "replace",
    };
  }

  if (
    current &&
    (looksLikePatchMessage(trimmed) ||
      hasActiveDraftCommandLanguage(trimmed) ||
      isListPublishActionMessage(trimmed) ||
      Boolean(activeSlot) ||
      transition.mode === "PATCH")
  ) {
    return { type: "PATCH", message: trimmed, reason: transition.reason || "patch" };
  }

  if (
    isIdentityRichListingPaste(trimmed) ||
    transition.freshStart ||
    !current
  ) {
    return { type: "CREATE", message: trimmed, reason: "new_listing_seed" };
  }

  if (isSkyAiGeneralQuestion(trimmed) && !current) {
    return { type: "NO_CHANGE", message: trimmed, reason: "general_question" };
  }

  if (current) {
    return { type: "PATCH", message: trimmed, reason: "default_patch" };
  }

  return { type: "CREATE", message: trimmed, reason: "no_prior" };
}

function mergeEvidenceExtras(
  prior: string[] | undefined,
  incoming: string[] | undefined
): string[] {
  const a = prior || [];
  const b = incoming || [];
  if (!a.length) return [...b];
  if (!b.length) return [...a];
  const seen = new Set(b.map((x) => x.toLowerCase()));
  const out = [...b];
  for (const item of a) {
    if (!seen.has(item.toLowerCase())) out.push(item);
  }
  return out;
}

function applyPatchToFill(
  current: ActiveListing,
  message: string
): SkyAiListingFill {
  const base = activeListingToFill(current);
  const extracted = extractCompoundListingFacts(message, {
    baseDraft: hydrateVehicleGeneration(base) as SkyAiListingFill,
  });
  let merged: SkyAiListingFill = {
    ...base,
    ...extracted.partial,
    draftId: current.draftId,
    replaceDraft: false,
  };
  if (extracted.partial.extras?.length || base.extras?.length) {
    merged.extras = mergeEvidenceExtras(base.extras, extracted.partial.extras);
  }
  merged = enhanceListingFillFromMessage(message, merged) || merged;
  const addMatch = message.match(/\badd\s+(?:that\s+(?:it\s+)?(?:has|have)\s+)?(?:(?:new|fresh)\s+)?(.+?)\.?$/i);
  if (addMatch?.[1]?.trim()) {
    const item = addMatch[1].trim();
    merged.extras = mergeEvidenceExtras(merged.extras, [`included:${item}`]);
  }
  const odoInline = message.match(/(?:actually|change|make it|update)?\s*([\d,]+)\s*(km|kms)\b/i);
  if (odoInline?.[1]) {
    merged.vehicleOdometer = odoInline[1].replace(/,/g, "");
  }
  const colourPatch = message.match(
    /\b(?:it'?s|its|actually|change(?:\s+it)?(?:\s+to)?|make\s+it|and)\s+(black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|beige|navy)\b/i
  );
  if (colourPatch?.[1]) {
    merged.vehicleColour = colourPatch[1].charAt(0).toUpperCase() + colourPatch[1].slice(1).toLowerCase();
  }
  merged = hydrateVehicleGeneration(merged) as SkyAiListingFill;
  merged.draftId = current.draftId;
  return normalizeSkyAiListingFill(merged) || merged;
}

function buildCreateFillFromMessage(message: string): SkyAiListingFill {
  const shell = emptyListingDraftShell();
  const identity = resolveVehicleIdentity(message);
  const extractedIdentity = extractListingIdentityFromMessage(message);
  let seed: SkyAiListingFill = {
    ...shell,
    draftId: createListingDraftId(),
    listingType:
      extractedIdentity?.listingType ||
      (identity.make ? "vehicle" : shell.listingType),
  };

  if (identity.make || identity.model) {
    seed.vehicleMake = identity.make;
    seed.vehicleModel = identity.model;
    seed.vehicleYear = identity.year;
    seed.listingType = "vehicle";
  } else if (extractedIdentity?.listingType) {
    seed.listingType = extractedIdentity.listingType;
    if (extractedIdentity.title) seed.title = extractedIdentity.title;
  }

  const compound = extractCompoundListingFacts(message, { baseDraft: seed });
  seed = { ...seed, ...compound.partial };

  const composed = composeListingTitleAndDescription({
    item:
      [identity.year, identity.make, identity.model].filter(Boolean).join(" ") ||
      message.slice(0, 80),
    condition: seed.condition,
    price: seed.price,
    location: seed.location,
    listingType: seed.listingType,
    vehicleMake: seed.vehicleMake,
    vehicleModel: seed.vehicleModel,
    vehicleYear: seed.vehicleYear,
    vehicleColour: seed.vehicleColour,
    vehicleOdometer: seed.vehicleOdometer,
    vehicleTransmission: seed.vehicleTransmission,
    vehicleFuelType: seed.vehicleFuelType,
    vehicleBodyType: seed.vehicleBodyType,
    extras: seed.extras,
  });

  seed = {
    ...seed,
    title: composed.title || seed.title,
    category: composed.category || seed.category,
    listingType: composed.listingType || seed.listingType,
    vehicleMake: composed.vehicleMake || seed.vehicleMake,
    vehicleModel: composed.vehicleModel || seed.vehicleModel,
    vehicleYear: composed.vehicleYear || seed.vehicleYear,
  };

  seed = enhanceListingFillFromMessage(message, seed) || seed;
  seed = hydrateVehicleGeneration(seed) as SkyAiListingFill;
  seed.draftId = seed.draftId || createListingDraftId();
  seed.replaceDraft = true;
  seed.description = undefined;
  seed.descriptionSource = "ai";

  const normalized = normalizeSkyAiListingFill(seed) || seed;
  const listing = fillToActiveListing(normalized, normalized.draftId)!;
  const withDesc = rebuildActiveListingDescription(listing, { force: true });
  const fill = stampReplaceDraft(activeListingToFill(withDesc));
  fill.draftId = withDesc.draftId;
  return fill;
}

export function executeListingOperation(
  operation: ListingOperation,
  current: ActiveListing | null
): ListingOperationResult {
  if (operation.type === "NO_CHANGE") {
    const listing = current || createEmptyActiveListing();
    return {
      operation,
      listing,
      fill: activeListingToFill(listing),
      replaceDraft: false,
    };
  }

  if (operation.type === "CREATE") {
    const fill = buildCreateFillFromMessage(operation.message);
    let listing = fillToActiveListing(fill, fill.draftId)!;
    const incomingIdentity = extractListingIdentityFromMessage(operation.message);
    const reply = incomingIdentity
      ? buildNewListingTransitionReply(incomingIdentity)
      : undefined;
    return {
      operation,
      listing,
      fill,
      reply,
      replaceDraft: true,
    };
  }

  if (!current) {
    return executeListingOperation(
      { type: "CREATE", message: operation.message, reason: "no_current_for_patch" },
      null
    );
  }

  if (operation.type === "REMOVE") {
    const removeTarget = operation.keys.join(" ").toLowerCase();
    let fill = applyPatchToFill(current, operation.message);
    if (fill.extras?.length) {
      fill.extras = fill.extras.filter((e) => {
        const val = e.includes(":") ? e.slice(e.indexOf(":") + 1).trim().toLowerCase() : e.toLowerCase();
        return !val.includes(removeTarget) && !removeTarget.includes(val);
      });
    }
    let listing = fillToActiveListing(fill, current.draftId)!;
    listing = rebuildActiveListingDescription(listing, { force: true });
    fill = { ...activeListingToFill(listing), replaceDraft: false, draftId: current.draftId };
    return {
      operation,
      listing,
      fill,
      replaceDraft: false,
    };
  }

  // PATCH
  let fill = applyPatchToFill(current, operation.message);
  fill.draftId = current.draftId;
  fill.replaceDraft = false;

  let listing = fillToActiveListing(fill, current.draftId)!;
  listing.evidence = groupedSellerEvidenceFromExtras(listing.extras);
  listing = rebuildActiveListingDescription(listing, {
    force: listing.descriptionSource !== "user",
  });
  fill = activeListingToFill(listing);
  fill.draftId = current.draftId;
  fill.replaceDraft = false;

  return {
    operation,
    listing,
    fill,
    replaceDraft: false,
  };
}

/** Bridge from client context to operation pipeline. */
export function processActiveListingTurn(
  message: string,
  opts: {
    listingContext?: SkyAiListingContext | null;
    freshStart?: boolean;
    pendingClarification?: PendingClarification | null;
    pathname?: string;
  } = {}
): ListingOperationResult | null {
  const current = fillToActiveListing(opts.listingContext || null);
  const operation = classifyListingOperation(message, current, {
    freshStartHint: opts.freshStart,
    pendingClarification: opts.pendingClarification,
    pathname: opts.pathname,
  });
  if (operation.type === "NO_CHANGE") return null;
  return executeListingOperation(operation, current);
}

export function activeListingFromContext(
  ctx: SkyAiListingContext | SkyAiListingFill | null | undefined
): ActiveListing | null {
  return fillToActiveListing(ctx);
}
