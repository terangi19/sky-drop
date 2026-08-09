/**
 * pendingSlot is a HINT, not a TRAP.
 * Validate whether the user answer semantically satisfies the active slot.
 * If not: apply what they DID provide, recalculate pending, continue.
 */

import type { ListingMissingSlot } from "./awhina-pending-slots";
import {
  extractCompoundListingFacts,
  mergeExtras,
  parseShortReplyForPendingSlot,
  type SlotParseResult,
} from "./awhina-pending-slots";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  interpretSemanticTurn,
  type SemanticTurnInterpretation,
} from "./awhina-semantic-intent";

export type SlotSatisfaction =
  | "satisfies"
  | "off_slot"
  | "uncertainty"
  | "corruption"
  | "empty";

export type PendingSlotValidation = {
  satisfaction: SlotSatisfaction;
  /** True when active slot parse matched AND semantically valid for that slot */
  consumeAsPending: boolean;
  slotResult: SlotParseResult;
  interpretation: SemanticTurnInterpretation;
  /** Partial fill from what the user actually provided (may ignore pending slot) */
  appliedPartial: SkyAiListingFill;
  filledSlots: ListingMissingSlot[];
  /** Identity / subject corrections that must stamp USER_CORRECTED */
  userCorrectedKeys: string[];
  reason?: string;
};

/** Product-line / set-like strings — not person names. */
const CARD_SET_LIKE =
  /\b(prizm|select|optic|mosaic|donruss|chronicles|phoenix|hoops|chrome|bowman|topps|panini|upper\s*deck|fleer|stadium\s*club|heritage|update|series\s*[12]|base\s*set|evolving\s*skies|vivid\s*voltage|obsidian|national\s*treasures|flawless|immaculate|contenders|score|absolute|certified|finest|refractor|parallel|rookie|rc)\b/i;

const PERSON_NAME_LIKE =
  /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$|^[a-z]+(?:\s+[a-z]+){1,3}$/i;

function stripItsPrefix(t: string): string {
  return t
    .replace(/^(?:it'?s|its|is|nah(?:\s+bro)?[,.]?|actually[,.]?)\s+/i, "")
    .replace(/\s+not\s+.+$/i, "")
    .trim();
}

/**
 * Does this text look like a trading-card SET / product line?
 * Person names and identity phrases must NOT satisfy card_set.
 */
export function looksLikeCardSetAnswer(message: string): boolean {
  const t = stripItsPrefix(message.trim());
  if (!t || t.length > 60) return false;
  if (CARD_SET_LIKE.test(t)) return true;
  // Year + brand fragments
  if (/\b(?:19|20)\d{2}\b/.test(t) && /topps|panini|bowman|pokemon|yugioh/i.test(t)) {
    return true;
  }
  // Explicit set phrasing
  if (/\b(set|product\s*line|series|collection)\b/i.test(message) && t.length >= 2) {
    return true;
  }
  // Reject person-like / identity phrases
  if (PERSON_NAME_LIKE.test(t) && !CARD_SET_LIKE.test(t)) return false;
  if (/^(it'?s|its)\s+/i.test(message.trim())) return false;
  return false;
}

export function looksLikeCardSubjectAnswer(message: string): boolean {
  const t = stripItsPrefix(message.trim());
  if (!t || t.length < 2 || t.length > 60) return false;
  if (CARD_SET_LIKE.test(t) && !/\s/.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  if (/^(new|used|good|fair|mint|psa|bgs)\b/i.test(t)) return false;
  return PERSON_NAME_LIKE.test(t) || /^[a-z][\w.'-]*(?:\s+[a-z][\w.'-]*){0,4}$/i.test(t);
}

function factsToPartial(
  interpretation: SemanticTurnInterpretation
): { partial: SkyAiListingFill; filledSlots: ListingMissingSlot[] } {
  const partial: SkyAiListingFill = {};
  const filledSlots: ListingMissingSlot[] = [];
  for (const f of interpretation.facts) {
    switch (f.key) {
      case "price":
        partial.price = f.value;
        filledSlots.push("price");
        break;
      case "location":
        partial.location = f.value;
        filledSlots.push("location");
        break;
      case "vehicleYear":
        partial.vehicleYear = f.value;
        filledSlots.push("year");
        break;
      case "vehicleGeneration":
        partial.vehicleGeneration = f.value;
        filledSlots.push("generation");
        break;
      case "condition":
        partial.condition = f.value;
        filledSlots.push("condition");
        break;
      case "cardSubject":
      case "itemIdentity": {
        partial.extras = mergeExtras(partial.extras, [`subject:${f.value}`]);
        // Promote identity into title when correcting subject
        if (!partial.title || interpretation.isCorrection) {
          partial.title = f.value;
        }
        filledSlots.push("card_subject");
        break;
      }
      case "delivery":
        if (f.value === "pickup_only") {
          partial.extras = mergeExtras(partial.extras, ["delivery:pickup_only"]);
        }
        break;
      default:
        break;
    }
  }
  return { partial, filledSlots: [...new Set(filledSlots)] };
}

/**
 * Validate pending-slot consumption for one user message.
 */
export function validatePendingSlotAnswer(opts: {
  message: string;
  activeSlot: ListingMissingSlot;
  baseDraft: Partial<SkyAiListingFill>;
  priorAssistant?: string;
}): PendingSlotValidation {
  const { message, activeSlot, baseDraft, priorAssistant } = opts;
  const t = message.trim();
  if (!t) {
    return {
      satisfaction: "empty",
      consumeAsPending: false,
      slotResult: { matched: false, partial: {} },
      interpretation: interpretSemanticTurn({ message: t, pendingSlot: activeSlot }),
      appliedPartial: {},
      filledSlots: [],
      userCorrectedKeys: [],
      reason: "empty",
    };
  }

  const interpretation = interpretSemanticTurn({
    message: t,
    pendingSlot: activeSlot,
    priorAssistant,
    canonical: baseDraft,
  });

  if (interpretation.primary === "UNCERTAINTY") {
    return {
      satisfaction: "uncertainty",
      consumeAsPending: false,
      slotResult: { matched: false, partial: {} },
      interpretation,
      appliedPartial: {},
      filledSlots: [],
      userCorrectedKeys: [],
      reason: "uncertainty",
    };
  }

  const slotResult = parseShortReplyForPendingSlot(t, activeSlot);
  const fromSemantic = factsToPartial(interpretation);
  const fromCompound = extractCompoundListingFacts(t, {
    activeSlot,
    baseDraft,
  });

  // ── card_set trap fix ──────────────────────────────────────────────
  if (activeSlot === "card_set") {
    if (slotResult.matched && !looksLikeCardSetAnswer(t)) {
      // Parser would have trapped identity as set — reject that consume
      const applied: SkyAiListingFill = {
        ...fromCompound.partial,
        ...fromSemantic.partial,
      };
      if (fromSemantic.partial.extras || fromCompound.partial.extras) {
        applied.extras = mergeExtras(
          fromCompound.partial.extras,
          fromSemantic.partial.extras
        );
      }
      const filled = [
        ...fromSemantic.filledSlots,
        ...fromCompound.filledSlots,
      ].filter((s) => s !== "card_set");
      return {
        satisfaction: filled.length ? "off_slot" : "corruption",
        consumeAsPending: false,
        slotResult: {
          matched: false,
          partial: {},
          rejectedCorruption: !filled.length,
          reason: "identity_not_card_set",
        },
        interpretation,
        appliedPartial: applied,
        filledSlots: [...new Set(filled)],
        userCorrectedKeys: interpretation.correctedKeys,
        reason: "pending_slot_hint_rejected_identity_as_set",
      };
    }
    if (!looksLikeCardSetAnswer(t) && fromSemantic.filledSlots.length) {
      return {
        satisfaction: "off_slot",
        consumeAsPending: false,
        slotResult: { matched: false, partial: {} },
        interpretation,
        appliedPartial: {
          ...fromCompound.partial,
          ...fromSemantic.partial,
          extras: mergeExtras(
            fromCompound.partial.extras,
            fromSemantic.partial.extras
          ),
        },
        filledSlots: [
          ...new Set([
            ...fromSemantic.filledSlots,
            ...fromCompound.filledSlots,
          ]),
        ],
        userCorrectedKeys: interpretation.correctedKeys,
        reason: "off_slot_facts_applied",
      };
    }
  }

  // card_subject: accept person-like; reject pure set names as subject when correction of set pending
  if (activeSlot === "card_subject" && slotResult.matched) {
    if (!looksLikeCardSubjectAnswer(t) && looksLikeCardSetAnswer(t)) {
      return {
        satisfaction: "off_slot",
        consumeAsPending: false,
        slotResult: { matched: false, partial: {} },
        interpretation,
        appliedPartial: {
          extras: mergeExtras(baseDraft.extras, [`set:${stripItsPrefix(t)}`]),
        },
        filledSlots: ["card_set"],
        userCorrectedKeys: [],
        reason: "set_answered_while_subject_pending",
      };
    }
  }

  if (slotResult.rejectedCorruption) {
    // Still apply off-slot facts if any
    if (fromSemantic.filledSlots.length || fromCompound.filledSlots.length) {
      return {
        satisfaction: "off_slot",
        consumeAsPending: false,
        slotResult,
        interpretation,
        appliedPartial: {
          ...fromCompound.partial,
          ...fromSemantic.partial,
          extras: mergeExtras(
            fromCompound.partial.extras,
            fromSemantic.partial.extras
          ),
        },
        filledSlots: [
          ...new Set([
            ...fromSemantic.filledSlots,
            ...fromCompound.filledSlots,
          ]),
        ],
        userCorrectedKeys: interpretation.correctedKeys,
        reason: slotResult.reason || "corruption_with_other_facts",
      };
    }
    return {
      satisfaction: "corruption",
      consumeAsPending: false,
      slotResult,
      interpretation,
      appliedPartial: {},
      filledSlots: [],
      userCorrectedKeys: [],
      reason: slotResult.reason,
    };
  }

  if (slotResult.matched) {
    // Slot + compound win over semantic for the active field (e.g. 190k odo ≠ price)
    let partial: SkyAiListingFill = {
      ...fromSemantic.partial,
      ...fromCompound.partial,
      ...slotResult.partial,
    };
    // If odometer filled this turn, never let a semantic price steal the k-token
    if (
      (slotResult.filledSlot === "odometer" ||
        fromCompound.filledSlots.includes("odometer") ||
        activeSlot === "odometer") &&
      fromSemantic.partial.price &&
      !fromCompound.partial.price &&
      !slotResult.partial.price
    ) {
      delete partial.price;
    }
    if (
      fromCompound.partial.extras ||
      slotResult.partial.extras ||
      fromSemantic.partial.extras
    ) {
      partial.extras = mergeExtras(
        mergeExtras(fromCompound.partial.extras, slotResult.partial.extras),
        fromSemantic.partial.extras
      );
    }
    // Semantic identity wins over mistaken set: capture
    if (interpretation.facts.some((f) => f.key === "cardSubject")) {
      const subj = interpretation.facts.find((f) => f.key === "cardSubject")!.value;
      partial.extras = mergeExtras(partial.extras, [`subject:${subj}`]);
      // Drop erroneous set: from slot if it was identity text
      if (activeSlot === "card_set" && slotResult.partial.extras) {
        partial.extras = (partial.extras || []).filter(
          (e) => !e.toLowerCase().startsWith("set:") || looksLikeCardSetAnswer(e.slice(4))
        );
      }
      if (!partial.title) partial.title = subj;
    }
    let filledSlots = [
      ...(slotResult.filledSlot ? [slotResult.filledSlot] : [activeSlot]),
      ...fromCompound.filledSlots,
      ...fromSemantic.filledSlots,
    ];
    if (!partial.price) {
      filledSlots = filledSlots.filter((s) => s !== "price");
    }
    return {
      satisfaction: "satisfies",
      consumeAsPending: true,
      slotResult,
      interpretation,
      appliedPartial: partial,
      filledSlots: [...new Set(filledSlots)],
      userCorrectedKeys: interpretation.correctedKeys,
      reason: "slot_satisfied",
    };
  }

  // Unmatched slot parser — apply compound + semantic facts (hint not trap)
  if (fromCompound.filledSlots.length || fromSemantic.filledSlots.length) {
    return {
      satisfaction: "off_slot",
      consumeAsPending: false,
      slotResult,
      interpretation,
      appliedPartial: {
        ...fromCompound.partial,
        ...fromSemantic.partial,
        extras: mergeExtras(
          fromCompound.partial.extras,
          fromSemantic.partial.extras
        ),
      },
      filledSlots: [
        ...new Set([...fromCompound.filledSlots, ...fromSemantic.filledSlots]),
      ],
      userCorrectedKeys: interpretation.correctedKeys,
      reason: "off_slot_applied",
    };
  }

  return {
    satisfaction: "empty",
    consumeAsPending: false,
    slotResult,
    interpretation,
    appliedPartial: {},
    filledSlots: [],
    userCorrectedKeys: [],
    reason: "no_facts",
  };
}
