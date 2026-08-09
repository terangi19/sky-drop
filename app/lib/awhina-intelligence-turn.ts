/**
 * ONE authoritative turn pipeline:
 * INPUT → intent → extract → corrections → conflicts → merge → missing → action → guard
 *
 * Do NOT decide response before state is fully merged.
 */

import type { FieldAuthority } from "./awhina-authority";
import {
  emptyCanonicalTaskState,
  isUncertaintyOrSkipMessage,
  markSlotSkipped,
  mergeCanonicalFact,
  recordAskedSlot,
  type CanonicalTaskState,
} from "./awhina-canonical-state";
import { resolveFactDomain, computeDomainAwareMissingSlots } from "./awhina-domain-facts";
import { recordIntelligenceTelemetry } from "./awhina-intelligence-telemetry";
import {
  validatePendingSlotAnswer,
  type PendingSlotValidation,
} from "./awhina-pending-slot-validate";
import {
  buildListingSlotPending,
  mergeExtras,
  type ListingMissingSlot,
} from "./awhina-pending-slots";
import { guardResponseBeforeEmit } from "./awhina-response-guard";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { interpretSemanticTurn } from "./awhina-semantic-intent";

export type IntelligenceTurnInput = {
  message: string;
  activeSlot: ListingMissingSlot | null;
  baseDraft: SkyAiListingFill;
  priorAssistant?: string;
  canonicalState?: CanonicalTaskState;
  fieldAuthority?: Partial<Record<string, FieldAuthority>>;
  pathname?: string;
  turnId?: string;
};

export type IntelligenceTurnResult = {
  handled: boolean;
  validation: PendingSlotValidation | null;
  mergedDraft: SkyAiListingFill;
  canonicalState: CanonicalTaskState;
  filledSlots: ListingMissingSlot[];
  userCorrectedKeys: string[];
  pendingSlotAfter: ListingMissingSlot | null;
  pendingClarification: ReturnType<typeof buildListingSlotPending>;
  /** Authority stamps for client applyFill */
  authorityStamps: Partial<Record<string, FieldAuthority>>;
  skipActiveSlot: boolean;
  guard: ReturnType<typeof guardResponseBeforeEmit>;
  interpretation: ReturnType<typeof interpretSemanticTurn>;
};

function applyPartialToDraft(
  base: SkyAiListingFill,
  partial: SkyAiListingFill
): SkyAiListingFill {
  const merged: SkyAiListingFill = { ...base, ...partial };
  if (partial.extras || base.extras) {
    merged.extras = mergeExtras(base.extras, partial.extras);
  }
  // Sticky identity unless user corrected title/subject
  if (base.vehicleMake && !partial.vehicleMake) merged.vehicleMake = base.vehicleMake;
  if (base.vehicleModel && !partial.vehicleModel) merged.vehicleModel = base.vehicleModel;
  if (base.vehicleGeneration && !partial.vehicleGeneration) {
    merged.vehicleGeneration = base.vehicleGeneration;
  }
  if (base.descriptionSource === "user" && base.description) {
    merged.description = base.description;
    merged.descriptionSource = "user";
  }
  delete merged.replaceDraft;
  return merged;
}

function stampAuthorityForKeys(
  keys: string[],
  authority: FieldAuthority
): Partial<Record<string, FieldAuthority>> {
  const out: Partial<Record<string, FieldAuthority>> = {};
  for (const k of keys) out[k] = authority;
  return out;
}

function syncCanonicalFromDraft(
  state: CanonicalTaskState,
  draft: SkyAiListingFill,
  authority: FieldAuthority,
  lifecycle: "said" | "corrected" | "inferred",
  keys?: string[]
): CanonicalTaskState {
  let next = state;
  const pairs: Array<[string, string | undefined]> = [
    ["title", draft.title],
    ["price", draft.price],
    ["condition", draft.condition],
    ["location", draft.location || draft.pickupArea],
    ["vehicleYear", draft.vehicleYear],
    ["vehicleOdometer", draft.vehicleOdometer],
    ["vehicleMake", draft.vehicleMake],
    ["vehicleModel", draft.vehicleModel],
    ["vehicleGeneration", draft.vehicleGeneration],
    ["vehicleColour", draft.vehicleColour],
    ["vehicleTransmission", draft.vehicleTransmission],
    ["vehicleFuelType", draft.vehicleFuelType],
    [
      "cardSubject",
      (draft.extras || []).find((e) => e.toLowerCase().startsWith("subject:"))?.slice(8),
    ],
    [
      "cardSet",
      (draft.extras || []).find((e) => e.toLowerCase().startsWith("set:"))?.slice(4),
    ],
  ];
  for (const [key, value] of pairs) {
    if (!value?.trim()) continue;
    if (keys && !keys.includes(key)) continue;
    next = mergeCanonicalFact(next, {
      key,
      value: value.trim(),
      authority,
      lifecycle,
      confidence: "HIGH",
    });
  }
  return next;
}

/**
 * Run the intelligence turn for an active listing slot (or freeform fact harvest).
 */
export function runIntelligenceTurn(
  input: IntelligenceTurnInput
): IntelligenceTurnResult {
  const turnId = input.turnId || `intel_${Date.now()}`;
  let state = input.canonicalState || emptyCanonicalTaskState();
  state = {
    ...state,
    pendingSlot: input.activeSlot,
    domain: resolveFactDomain(input.baseDraft),
  };

  const interpretation = interpretSemanticTurn({
    message: input.message,
    pendingSlot: input.activeSlot,
    priorAssistant: input.priorAssistant,
    canonical: input.baseDraft,
  });

  // Uncertainty → skip current slot, continue
  if (
    input.activeSlot &&
    (interpretation.primary === "UNCERTAINTY" ||
      isUncertaintyOrSkipMessage(input.message))
  ) {
    state = markSlotSkipped(state, input.activeSlot);
    const draft = input.baseDraft;
    const pending = buildListingSlotPending(draft, input.message);
    // Force next slot ≠ skipped
    const domainMissing = computeDomainAwareMissingSlots(draft, {
      skipped: state.skippedSlots,
    });
    const pendingSlotAfter =
      (domainMissing[0] as ListingMissingSlot | undefined) ||
      (pending?.pendingSlot as ListingMissingSlot | undefined) ||
      null;
    if (pendingSlotAfter) {
      state = recordAskedSlot(state, pendingSlotAfter);
    }
    const guard = guardResponseBeforeEmit({
      draft,
      pendingSlotBefore: input.activeSlot,
      pendingSlotAfter,
      clarificationQuestion: pending?.priorMessage,
      canonicalState: state,
      skippedSlots: state.skippedSlots,
    });
    recordIntelligenceTelemetry({
      turnId,
      pathname: input.pathname,
      intentPrimary: interpretation.primary,
      intentKinds: interpretation.kinds,
      pendingBefore: input.activeSlot,
      pendingAfter: guard.safePendingSlot,
      satisfaction: "uncertainty",
      consumeAsPending: false,
      guardFailures: guard.failures,
      domain: state.domain,
      responseAction: "skip_slot",
      messageLen: input.message.length,
    });
    return {
      handled: true,
      validation: null,
      mergedDraft: draft,
      canonicalState: state,
      filledSlots: [],
      userCorrectedKeys: [],
      pendingSlotAfter: guard.safePendingSlot,
      pendingClarification: pending
        ? {
            ...pending,
            pendingSlot: guard.safePendingSlot || undefined,
          }
        : null,
      authorityStamps: {},
      skipActiveSlot: true,
      guard,
      interpretation,
    };
  }

  if (!input.activeSlot) {
    // No pending slot — harvest semantic facts without slot trapping
    let merged = input.baseDraft;
    const filledSlots: ListingMissingSlot[] = [];
    const authorityStamps: Partial<Record<string, FieldAuthority>> = {};
    if (interpretation.facts.length) {
      const harvested = validatePendingSlotAnswer({
        message: input.message,
        activeSlot: "title",
        baseDraft: input.baseDraft,
        priorAssistant: input.priorAssistant,
      });
      if (harvested.filledSlots.length && harvested.satisfaction !== "empty") {
        merged = applyPartialToDraft(input.baseDraft, harvested.appliedPartial);
        filledSlots.push(...harvested.filledSlots);
        const auth: FieldAuthority = interpretation.isCorrection
          ? "USER_CORRECTED"
          : "USER_CONFIRMED";
        Object.assign(
          authorityStamps,
          stampAuthorityForKeys(
            [
              "title",
              "price",
              "condition",
              "location",
              "vehicleYear",
              "vehicleGeneration",
            ],
            auth
          )
        );
        state = syncCanonicalFromDraft(
          state,
          merged,
          auth,
          interpretation.isCorrection ? "corrected" : "said"
        );
      }
    }
    const pending = buildListingSlotPending(merged, input.message);
    const guard = guardResponseBeforeEmit({
      draft: merged,
      appliedThisTurn: merged,
      filledSlotsThisTurn: filledSlots,
      pendingSlotAfter: (pending?.pendingSlot as ListingMissingSlot) || null,
      fieldAuthority: { ...input.fieldAuthority, ...authorityStamps },
      proposedFill: merged,
      canonicalState: state,
    });
    recordIntelligenceTelemetry({
      turnId,
      pathname: input.pathname,
      intentPrimary: interpretation.primary,
      intentKinds: interpretation.kinds,
      extractedKeys: interpretation.facts.map((f) => f.key),
      correctedKeys: interpretation.correctedKeys,
      pendingBefore: null,
      pendingAfter: guard.safePendingSlot,
      guardFailures: guard.failures,
      domain: state.domain,
      responseAction: filledSlots.length ? "freeform_facts" : "passthrough",
      messageLen: input.message.length,
    });
    return {
      handled: filledSlots.length > 0,
      validation: null,
      mergedDraft: merged,
      canonicalState: state,
      filledSlots,
      userCorrectedKeys: interpretation.correctedKeys,
      pendingSlotAfter: guard.safePendingSlot,
      pendingClarification: pending,
      authorityStamps,
      skipActiveSlot: false,
      guard,
      interpretation,
    };
  }

  // ── Active pending slot path ───────────────────────────────────────
  const validation = validatePendingSlotAnswer({
    message: input.message,
    activeSlot: input.activeSlot,
    baseDraft: input.baseDraft,
    priorAssistant: input.priorAssistant,
  });

  let merged = input.baseDraft;
  let filledSlots: ListingMissingSlot[] = [];
  const authorityStamps: Partial<Record<string, FieldAuthority>> = {};

  if (
    validation.satisfaction === "satisfies" ||
    validation.satisfaction === "off_slot"
  ) {
    if (Object.keys(validation.appliedPartial).length || validation.filledSlots.length) {
      merged = applyPartialToDraft(input.baseDraft, validation.appliedPartial);
      filledSlots = validation.filledSlots;

      const auth: FieldAuthority = validation.interpretation.isCorrection
        ? "USER_CORRECTED"
        : "USER_CONFIRMED";

      for (const slot of filledSlots) {
        if (slot === "price") authorityStamps.price = auth;
        if (slot === "year") authorityStamps.vehicleYear = auth;
        if (slot === "odometer") authorityStamps.vehicleOdometer = auth;
        if (slot === "condition") authorityStamps.condition = auth;
        if (slot === "location") authorityStamps.location = auth;
        if (slot === "generation") authorityStamps.vehicleGeneration = auth;
        if (slot === "colour") authorityStamps.vehicleColour = auth;
        if (slot === "transmission") authorityStamps.vehicleTransmission = auth;
        if (slot === "title" || slot === "card_subject") {
          authorityStamps.title = auth;
        }
      }
      if (validation.userCorrectedKeys.length) {
        for (const k of validation.userCorrectedKeys) {
          authorityStamps[k] = "USER_CORRECTED";
        }
        authorityStamps.title = "USER_CORRECTED";
      }

      state = syncCanonicalFromDraft(
        state,
        merged,
        auth,
        validation.interpretation.isCorrection ? "corrected" : "said"
      );
      if (validation.interpretation.isCorrection) {
        state = {
          ...state,
          entityLocked: true,
          entityLockKey: (
            merged.title ||
            validation.appliedPartial.title ||
            ""
          )
            .trim()
            .toLowerCase(),
        };
      }
    }
  }

  // Domain-aware missing (don't auto-demand card_set)
  const domainMissing = computeDomainAwareMissingSlots(merged, {
    skipped: state.skippedSlots,
  });
  let pending = buildListingSlotPending(merged, input.message);
  // Prefer domain-aware first slot over legacy card_set demand
  if (domainMissing.length) {
    const slot = domainMissing[0];
    pending = pending
      ? {
          ...pending,
          pendingSlot: slot,
          missingListingSlots: domainMissing.slice(0, 4),
        }
      : buildListingSlotPending(merged, input.message);
    if (pending) {
      pending = {
        ...pending,
        pendingSlot: slot,
        missingListingSlots: domainMissing.slice(0, 4),
      };
    }
  } else if (pending?.pendingSlot === "card_set") {
    // Strip auto card_set when domain schema says not required
    const rest = (pending.missingListingSlots || []).filter((s) => s !== "card_set");
    if (!rest.length) pending = null;
    else {
      pending = {
        ...pending,
        pendingSlot: rest[0],
        missingListingSlots: rest,
      };
    }
  }

  const pendingAfter = (pending?.pendingSlot as ListingMissingSlot) || null;
  if (pendingAfter) state = recordAskedSlot(state, pendingAfter);

  const guard = guardResponseBeforeEmit({
    draft: merged,
    appliedThisTurn: validation.appliedPartial,
    filledSlotsThisTurn: filledSlots,
    pendingSlotBefore: input.activeSlot,
    pendingSlotAfter: pendingAfter,
    fieldAuthority: { ...input.fieldAuthority, ...authorityStamps },
    proposedFill: validation.appliedPartial,
    canonicalState: state,
    pendingConsumedUnrelated:
      validation.reason === "pending_slot_hint_rejected_identity_as_set",
    skippedSlots: state.skippedSlots,
  });

  if (pending && guard.safePendingSlot) {
    pending = { ...pending, pendingSlot: guard.safePendingSlot };
  } else if (pending && !guard.safePendingSlot) {
    pending = null;
  }

  const handled =
    validation.satisfaction === "satisfies" ||
    validation.satisfaction === "off_slot" ||
    validation.satisfaction === "uncertainty" ||
    (validation.satisfaction === "corruption" && filledSlots.length > 0);

  recordIntelligenceTelemetry({
    turnId,
    pathname: input.pathname,
    intentPrimary: validation.interpretation.primary,
    intentKinds: validation.interpretation.kinds,
    extractedKeys: validation.interpretation.facts.map((f) => f.key),
    correctedKeys: validation.userCorrectedKeys,
    pendingBefore: input.activeSlot,
    pendingAfter: guard.safePendingSlot,
    satisfaction: validation.satisfaction,
    consumeAsPending: validation.consumeAsPending,
    guardFailures: guard.failures,
    domain: state.domain,
    entityLocked: state.entityLocked,
    conflictingCount: state.conflictingEvidence.length,
    responseAction: handled
      ? validation.consumeAsPending
        ? "slot_fill"
        : "off_slot_fill"
      : "unhandled",
    messageLen: input.message.length,
  });

  return {
    handled,
    validation,
    mergedDraft: merged,
    canonicalState: { ...state, pendingSlot: guard.safePendingSlot },
    filledSlots,
    userCorrectedKeys: validation.userCorrectedKeys,
    pendingSlotAfter: guard.safePendingSlot,
    pendingClarification: pending,
    authorityStamps,
    skipActiveSlot: validation.satisfaction === "uncertainty",
    guard,
    interpretation: validation.interpretation,
  };
}
