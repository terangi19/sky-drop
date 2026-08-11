/**
 * Deterministic self-check before responding (no extra AI call).
 * A ask known? B contradict USER? C ignore latest facts?
 * D repeat question? E treat inference as confirmed?
 * F pendingSlot consume unrelated? G response match draft?
 */

import type { CanonicalTaskState } from "./awhina-canonical-state";
import { isFactSatisfied, wasRecentlyAsked } from "./awhina-canonical-state";
import { isLockedUserAuthority, type FieldAuthority } from "./awhina-authority";
import type { ListingMissingSlot } from "./awhina-pending-slots";
import {
  computeMissingListingSlots,
  isListingSlotComplete,
  SLOT_QUESTIONS,
} from "./awhina-pending-slots";
import {
  computeDomainAwareMissingSlots,
  isFieldRelevant,
  isListingSlotQuestionValid,
  resolveFactDomain,
} from "./awhina-domain-facts";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  assessIdentityCompleteness,
  isMalformedItemIdentity,
} from "./awhina-identity-composition";
import { fuseVisionAndSellerText } from "./awhina-multimodal-fusion";

export type ResponseGuardFailure =
  | "A_ASK_KNOWN"
  | "B_CONTRADICT_USER"
  | "C_IGNORE_LATEST_FACTS"
  | "D_REPEAT_QUESTION"
  | "E_INFERENCE_AS_CONFIRMED"
  | "F_PENDING_SLOT_UNRELATED"
  | "G_RESPONSE_DRAFT_MISMATCH"
  | "H_MALFORMED_IDENTITY"
  | "I_UNUSED_USER_FACTS"
  | "J_OBVIOUS_SELL_ASK"
  | "K_OVERCLAIM_VISION";

export type ResponseGuardInput = {
  reply?: string;
  clarificationQuestion?: string;
  pendingSlotBefore?: ListingMissingSlot | null;
  pendingSlotAfter?: ListingMissingSlot | null;
  draft: Partial<SkyAiListingFill>;
  /** Facts extracted/applied this turn */
  appliedThisTurn?: Partial<SkyAiListingFill>;
  filledSlotsThisTurn?: ListingMissingSlot[];
  /** Fill that would overwrite USER locks */
  proposedFill?: Partial<SkyAiListingFill>;
  fieldAuthority?: Partial<Record<string, FieldAuthority>>;
  canonicalState?: CanonicalTaskState;
  /** True when pending slot consumed an off-slot answer as that slot */
  pendingConsumedUnrelated?: boolean;
  /** Reply claims certainty on LOW confidence inference */
  claimedConfirmedInference?: boolean;
  skippedSlots?: string[];
  /** Latest user message — for unused-fact / sell-intent gates */
  userMessage?: string;
  /** Claimed vision identity phrase */
  claimedIdentity?: string;
  onSellPage?: boolean;
};

export type ResponseGuardResult = {
  ok: boolean;
  failures: ResponseGuardFailure[];
  /** Safe next slot after guards (may differ from pendingSlotAfter) */
  safePendingSlot: ListingMissingSlot | null;
  /** Reply with illegal asks stripped / rewritten when possible */
  safeReply?: string;
  notes: string[];
};

const SLOT_TO_DRAFT_KEY: Partial<Record<ListingMissingSlot, string>> = {
  price: "price",
  year: "vehicleYear",
  odometer: "vehicleOdometer",
  condition: "condition",
  location: "location",
  colour: "vehicleColour",
  transmission: "vehicleTransmission",
  fuel: "vehicleFuelType",
  generation: "vehicleGeneration",
  title: "title",
  card_set: "cardSet",
  card_subject: "cardSubject",
};

function draftSatisfiesSlot(
  slot: ListingMissingSlot,
  draft: Partial<SkyAiListingFill>
): boolean {
  return isListingSlotComplete(slot, draft);
}

function replyAsksAboutSlot(reply: string, slot: ListingMissingSlot): boolean {
  const q = SLOT_QUESTIONS[slot] || "";
  const r = reply.toLowerCase();
  if (q && r.includes(q.toLowerCase().slice(0, 24))) return true;
  const patterns: Partial<Record<ListingMissingSlot, RegExp>> = {
    price: /what(?:'s| is) the (?:asking )?price|how much/i,
    year: /what year/i,
    odometer: /kilometres|kilometers|odometer|how many k/i,
    condition: /what condition/i,
    location: /where (?:is it|are you)|located/i,
    card_set: /which set|product line/i,
    card_subject: /which player|which character|who is on/i,
    generation: /what generation|r32|r33|r34/i,
    storage: /storage size|how many gb/i,
    colour: /what colour|what color/i,
  };
  const re = patterns[slot];
  return re ? re.test(reply) : false;
}

function pickSafeNextSlot(
  draft: Partial<SkyAiListingFill>,
  skipped: string[],
  canonical?: CanonicalTaskState
): ListingMissingSlot | null {
  // ONE brain: domain registry next-best (never merge stale legacy specialist slots)
  const ordered = [
    ...computeDomainAwareMissingSlots(draft, {
      skipped,
      includeOptionalHighValue: true,
    }),
  ];
  // Include readiness-filtered missing only when still relevant for CURRENT object
  for (const s of computeMissingListingSlots(draft)) {
    if (!ordered.includes(s) && s !== "card_set" && isFieldRelevant(s, draft)) {
      ordered.push(s);
    }
  }
  for (const slot of ordered) {
    if (skipped.includes(slot)) continue;
    if (draftSatisfiesSlot(slot, draft)) continue;
    if (!isListingSlotQuestionValid(slot, draft)) continue;
    if (canonical && wasRecentlyAsked(canonical, slot) && draftSatisfiesSlot(slot, draft)) {
      continue;
    }
    // Don't re-ask recently asked if user skipped / uncertain
    if (canonical && wasRecentlyAsked(canonical, slot) && skipped.includes(slot)) {
      continue;
    }
    return slot;
  }
  return null;
}

/**
 * Run deterministic response guards. Prefer fixing over another AI call.
 */
export function guardResponseBeforeEmit(
  input: ResponseGuardInput
): ResponseGuardResult {
  const failures: ResponseGuardFailure[] = [];
  const notes: string[] = [];
  const draft = input.draft;
  const skipped = input.skippedSlots || input.canonicalState?.skippedSlots || [];
  let safeReply = input.reply;
  let safePending =
    input.pendingSlotAfter ??
    pickSafeNextSlot(draft, skipped, input.canonicalState);

  // F — pendingSlot consumed unrelated
  if (input.pendingConsumedUnrelated) {
    failures.push("F_PENDING_SLOT_UNRELATED");
    notes.push("pending_slot_trap_blocked");
  }

  // E — inference as confirmed
  if (input.claimedConfirmedInference) {
    failures.push("E_INFERENCE_AS_CONFIRMED");
    notes.push("softened_inference_claim");
    if (safeReply) {
      safeReply = safeReply
        .replace(/\bthis is definitely\b/gi, "this looks like")
        .replace(/\bI'?m sure\b/gi, "I think");
    }
  }

  // B — contradict USER
  if (input.proposedFill && input.fieldAuthority) {
    for (const [key, val] of Object.entries(input.proposedFill)) {
      if (val == null || val === "") continue;
      const auth = input.fieldAuthority[key];
      if (!isLockedUserAuthority(auth)) continue;
      const cur = (draft as Record<string, unknown>)[key];
      if (
        typeof cur === "string" &&
        typeof val === "string" &&
        cur.trim() &&
        cur.trim().toLowerCase() !== val.trim().toLowerCase()
      ) {
        failures.push("B_CONTRADICT_USER");
        notes.push(`blocked_overwrite:${key}`);
      }
    }
  }

  // C — ignore latest facts (asking about something just filled)
  const filled = input.filledSlotsThisTurn || [];
  for (const slot of filled) {
    if (safePending === slot) {
      failures.push("C_IGNORE_LATEST_FACTS");
      notes.push(`cleared_pending_just_filled:${slot}`);
      safePending = pickSafeNextSlot(draft, skipped, input.canonicalState);
    }
    if (safeReply && replyAsksAboutSlot(safeReply, slot)) {
      failures.push("C_IGNORE_LATEST_FACTS");
      notes.push(`stripped_ask_just_filled:${slot}`);
    }
  }

  // A — ask known
  if (safePending && draftSatisfiesSlot(safePending, draft)) {
    failures.push("A_ASK_KNOWN");
    notes.push(`pending_already_known:${safePending}`);
    safePending = pickSafeNextSlot(draft, skipped, input.canonicalState);
  }
  if (safeReply) {
    for (const slot of Object.keys(SLOT_QUESTIONS) as ListingMissingSlot[]) {
      if (!draftSatisfiesSlot(slot, draft)) continue;
      if (replyAsksAboutSlot(safeReply, slot)) {
        failures.push("A_ASK_KNOWN");
        notes.push(`reply_asks_known:${slot}`);
      }
    }
  }

  // L — domain relevance: reject storage/etc for wrong subtype (gaming_mouse)
  if (safePending && !isListingSlotQuestionValid(safePending, draft)) {
    failures.push("A_ASK_KNOWN");
    notes.push(`rejected_irrelevant_slot:${safePending}`);
    safePending = pickSafeNextSlot(
      draft,
      [...skipped, safePending],
      input.canonicalState
    );
  }
  if (safeReply) {
    for (const slot of Object.keys(SLOT_QUESTIONS) as ListingMissingSlot[]) {
      if (isFieldRelevant(slot, draft)) continue;
      if (replyAsksAboutSlot(safeReply, slot)) {
        failures.push("A_ASK_KNOWN");
        notes.push(`stripped_irrelevant_ask:${slot}`);
        safeReply = safeReply
          .replace(SLOT_QUESTIONS[slot], "")
          .replace(/what storage size[^.?]*[?.]?/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();
      }
    }
  }

  // Also check canonical state facts
  if (input.canonicalState && safePending) {
    const key = SLOT_TO_DRAFT_KEY[safePending];
    if (key && isFactSatisfied(input.canonicalState, key)) {
      failures.push("A_ASK_KNOWN");
      safePending = pickSafeNextSlot(draft, skipped, input.canonicalState);
    }
  }

  // D — repeat question
  if (
    safePending &&
    input.canonicalState &&
    wasRecentlyAsked(input.canonicalState, safePending) &&
    !filled.includes(safePending)
  ) {
    // Allow one repeat only if still missing; if asked twice recently, skip
    const asks = input.canonicalState.recentlyAsked.filter(
      (r) => r.slot === safePending
    );
    if (asks.length >= 1 && skipped.includes(safePending)) {
      failures.push("D_REPEAT_QUESTION");
      notes.push(`skip_repeat:${safePending}`);
      safePending = pickSafeNextSlot(
        draft,
        [...skipped, safePending],
        input.canonicalState
      );
    }
  }

  // G — response should acknowledge draft identity when correcting
  if (
    input.appliedThisTurn?.title &&
    safeReply &&
    /samuels|unknown player|this card/i.test(safeReply) &&
    !safeReply.toLowerCase().includes(
      String(input.appliedThisTurn.title).toLowerCase().slice(0, 8)
    )
  ) {
    failures.push("G_RESPONSE_DRAFT_MISMATCH");
    notes.push("reply_stale_identity");
  }

  // H/I/J/K — multimodal quality: identity, unused USER facts, sell ask, overclaim
  const quality = guardAssistantOutputQuality({
    reply: safeReply,
    draft,
    userMessage: input.userMessage,
    claimedIdentity: input.claimedIdentity,
    onSellPage: input.onSellPage,
  });
  if (quality.failures.length) {
    failures.push(...quality.failures);
    notes.push(...quality.notes);
    if (quality.safeReply) safeReply = quality.safeReply;
  }

  // Rebuild reply when we stripped illegal asks — never keep the known-slot question
  if (
    failures.includes("A_ASK_KNOWN") ||
    failures.includes("C_IGNORE_LATEST_FACTS")
  ) {
    // Strip every question about already-known slots from the reply
    let cleaned = safeReply || "";
    for (const slot of Object.keys(SLOT_QUESTIONS) as ListingMissingSlot[]) {
      if (!draftSatisfiesSlot(slot, draft) && !filled.includes(slot)) continue;
      cleaned = cleaned
        .replace(SLOT_QUESTIONS[slot], "")
        .replace(/\(\s*that didn't look[^)]*\)/gi, "");
      // Also strip common paraphrases
      if (slot === "price") {
        cleaned = cleaned.replace(/what(?:'s| is) the (?:asking )?price\??/gi, "");
      }
    }
    cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/^[\s.,:-]+|[\s.,:-]+$/g, "").trim();
    const ack =
      cleaned && cleaned.length < 120 && !/\?/.test(cleaned) ? cleaned : "Got it.";
    if (safePending && SLOT_QUESTIONS[safePending]) {
      safeReply = `${ack} ${SLOT_QUESTIONS[safePending]}`.replace(/\s+/g, " ").trim();
    } else {
      safeReply =
        ack === "Got it."
          ? "Got it — ready when you are. Add photos or publish when it looks right."
          : ack;
    }
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    safePendingSlot: safePending,
    safeReply,
    notes,
  };
}

/**
 * Fail responses like "Looks like a PSA 10 Panini. Want to sell it?"
 * — malformed identity, unused USER facts, obvious sell ask, vision overclaim.
 */
export function guardAssistantOutputQuality(input: {
  reply?: string;
  draft: Partial<SkyAiListingFill>;
  userMessage?: string;
  claimedIdentity?: string;
  onSellPage?: boolean;
}): {
  failures: ResponseGuardFailure[];
  notes: string[];
  safeReply?: string;
} {
  const failures: ResponseGuardFailure[] = [];
  const notes: string[] = [];
  const reply = input.reply || "";
  const domain = resolveFactDomain(input.draft);
  const claimed =
    input.claimedIdentity ||
    reply.match(/Looks like a?\s*\*?\*?(.+?)\*?\*?\./i)?.[1] ||
    "";

  if (claimed && isMalformedItemIdentity(claimed.trim(), domain)) {
    failures.push("H_MALFORMED_IDENTITY");
    notes.push("malformed_attribute_identity");
  }

  if (/want to sell it\?/i.test(reply)) {
    failures.push("J_OBVIOUS_SELL_ASK");
    notes.push("asked_sell_when_obvious_or_on_sell_surface");
  }

  if (
    /Looks like a?\s+\*?\*?PSA\s*\d+/i.test(reply) ||
    /Looks like a?\s+\*?\*?(Nike Size|BMW Automatic|Apple\s*\d+\s*GB)/i.test(reply)
  ) {
    failures.push("K_OVERCLAIM_VISION");
    notes.push("overclaimed_attribute_as_identity");
  }

  const msg = (input.userMessage || "").trim();
  if (msg && reply) {
    const fused = fuseVisionAndSellerText({
      listingFill: input.draft as SkyAiListingFill,
      displayIdentity: claimed || input.draft.title,
      sellerMessage: msg,
      onSellPage: input.onSellPage,
    });
    const unused: string[] = [];
    if (fused.userFacts.price && !reply.includes(fused.userFacts.price) && !/\$/.test(reply)) {
      unused.push("price");
    }
    if (
      fused.userFacts.location &&
      !reply.toLowerCase().includes(fused.userFacts.location.toLowerCase())
    ) {
      unused.push("location");
    }
    if (
      fused.userFacts.serialNumber &&
      !reply.includes(fused.userFacts.serialNumber)
    ) {
      unused.push("serial");
    }
    if (unused.length) {
      failures.push("I_UNUSED_USER_FACTS");
      notes.push(`unused_user_facts:${unused.join(",")}`);
    }

    if (failures.length) {
      return {
        failures,
        notes,
        safeReply: fused.assistantMessage,
      };
    }
  } else if (failures.includes("H_MALFORMED_IDENTITY") || failures.includes("K_OVERCLAIM_VISION")) {
    const identity = assessIdentityCompleteness({
      fill: input.draft,
      claimedIdentity: claimed,
      domain,
    });
    return {
      failures,
      notes,
      safeReply: identity.missingCoreQuestion
        ? `I can see ${identity.knownSummary}, but ${identity.missingCoreQuestion}`
        : `I can see ${identity.knownSummary || "this item"}. What exactly is it?`,
    };
  }

  return { failures, notes };
}
