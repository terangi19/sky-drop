/**
 * Vision → EXISTING Āwhina listing conversation bridge.
 *
 * PHOTO is an INPUT SOURCE only. Does not create a second listing brain.
 * listingFill enters the same canonical draft path as chat fills;
 * pendingSlot comes from the same computeMissingListingSlots / readiness helpers.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import {
  type ListingDraftFormSnapshot,
  type ListingFieldProvenance,
  type ListingFieldProvenanceMap,
  isUserLockedProvenance,
} from "./listing-draft-confirmed";
import { recomposeListingDescription } from "./awhina-listing-composer";
import {
  buildListingSlotPending,
  nextListingSlotQuestion,
} from "./awhina-pending-slots";
import { buildReadinessFollowUpReply } from "./awhina-listing-readiness";
import type { PendingClarification } from "./awhina-task-scope";
import {
  appendMessage,
  getAwhinaConversationState,
  setAwhinaSessionEcho,
  setListingFillOccurred,
} from "./awhina-conversation-store";
import { persistAwhinaSession } from "./awhina-session-persist";
import { fuseVisionAndSellerText } from "./awhina-multimodal-fusion";
import { assessIdentityCompleteness } from "./awhina-identity-composition";

/** Fields vision may safely stamp as IMAGE (never price/location). */
const IMAGE_PROVENANCE_KEYS: (keyof ListingDraftFormSnapshot)[] = [
  "title",
  "category",
  "condition",
  "listingType",
  "vehicleMake",
  "vehicleModel",
  "vehicleGeneration",
  "vehicleYear",
  "vehicleColour",
  "vehicleBodyType",
  "vehicleFuelType",
  "vehicleTransmission",
  "rentalSubType",
  "rentalPropertyType",
];

export type VisionConversationBridgeInput = {
  listingFill: SkyAiListingFill;
  displayIdentity: string;
  needsIdentityConfirm: boolean;
  /** If USER / EDITED, never overwrite description */
  descriptionProvenance?: ListingFieldProvenance;
  /** Full form provenance — USER* identity survives re-photo */
  fieldProvenance?: ListingFieldProvenanceMap;
  existingDraft?: SkyAiListingContext | null;
  /**
   * After user taps Yes on medium-confidence identity —
   * skip confirm ask and establish the next missing slot.
   */
  identityConfirmed?: boolean;
  /** Companion seller text attached with the photo — fuse before reply */
  sellerMessage?: string;
};

export type VisionConversationBridgeResult = {
  listingFill: SkyAiListingFill;
  displayIdentity: string;
  needsIdentityConfirm: boolean;
  /** Keys to mark IMAGE after applyFill */
  imageFieldKeys: (keyof ListingDraftFormSnapshot)[];
  /** Extra provenance (price/location from companion text → USER) */
  provenanceOverrides: ListingFieldProvenanceMap;
  assistantMessage: string;
  pendingSlot: string | null;
  pendingClarification: PendingClarification | null;
  focusChat: true;
};

function isUserLockedDescription(p?: ListingFieldProvenance): boolean {
  return p === "USER" || p === "EDITED_EXISTING_LISTING";
}

function collectImageKeys(
  fill: SkyAiListingFill
): (keyof ListingDraftFormSnapshot)[] {
  const keys: (keyof ListingDraftFormSnapshot)[] = [];
  for (const key of IMAGE_PROVENANCE_KEYS) {
    const val = fill[key as keyof SkyAiListingFill];
    if (typeof val === "string" && val.trim()) keys.push(key);
  }
  return keys;
}

/**
 * Prepare vision listingFill for the canonical draft + conversation.
 * Strips raw vision prose; composes description via existing writer when allowed.
 */
export function prepareVisionConversationBridge(
  input: VisionConversationBridgeInput
): VisionConversationBridgeResult {
  // Fuse photo facts + seller shorthand BEFORE composing any reply
  const fused = input.sellerMessage?.trim()
    ? fuseVisionAndSellerText({
        listingFill: input.listingFill,
        displayIdentity: input.displayIdentity,
        sellerMessage: input.sellerMessage,
        onSellPage: true,
      })
    : null;

  const identityAssessment = assessIdentityCompleteness({
    fill: fused?.listingFill || input.listingFill,
    claimedIdentity: input.displayIdentity || input.listingFill.title,
  });

  // Without seller text, prefer vision's displayIdentity (don't over-rewrite PS5 etc.)
  const identity = (
    fused
      ? identityAssessment.isComplete
        ? identityAssessment.displayIdentity
        : identityAssessment.knownSummary.replace(/^an?\s+/i, "") ||
          input.displayIdentity ||
          input.listingFill.title ||
          "your item"
      : input.displayIdentity || input.listingFill.title || "your item"
  )
    .trim() || "your item";

  const needsConfirm =
    input.identityConfirmed !== true &&
    (fused ? !identityAssessment.isComplete : input.needsIdentityConfirm === true);

  // Vision = FACTS only — never ship raw vision prose as the buyer description
  const fill: SkyAiListingFill = {
    ...(fused?.listingFill || input.listingFill),
  };
  delete fill.description;
  // Incomplete fused identity → never claim attribute stacks as buyer description
  if (fused && !identityAssessment.isComplete) {
    delete fill.description;
  }

  // PHOTO AGAIN: never silently overwrite USER* identity / title / vehicle facts
  const prov = input.fieldProvenance || {};
  const identityKeys: (keyof ListingDraftFormSnapshot)[] = [
    "title",
    "vehicleMake",
    "vehicleModel",
    "vehicleGeneration",
    "vehicleYear",
    "vehicleColour",
  ];
  for (const key of identityKeys) {
    if (!isUserLockedProvenance(prov[key])) continue;
    const prior = input.existingDraft?.[key as keyof SkyAiListingContext];
    if (typeof prior === "string" && prior.trim()) {
      (fill as Record<string, string>)[key] = prior.trim();
    } else {
      delete (fill as Record<string, unknown>)[key];
    }
  }
  // Preserve USER subject extras over vision subject
  if (input.existingDraft?.extras?.length) {
    const userSubject = input.existingDraft.extras.find((e) =>
      e.toLowerCase().startsWith("subject:")
    );
    if (userSubject && isUserLockedProvenance(prov.title)) {
      fill.extras = [
        ...(fill.extras || []).filter((e) => !e.toLowerCase().startsWith("subject:")),
        userSubject,
      ];
      if (input.existingDraft.title?.trim()) {
        fill.title = input.existingDraft.title.trim();
      }
    }
  }

  const mayComposeDescription =
    !isUserLockedDescription(input.descriptionProvenance) &&
    (fused ? identityAssessment.isComplete : !needsConfirm);
  if (mayComposeDescription) {
    const composed = recomposeListingDescription(
      { ...(input.existingDraft || {}), ...fill },
      { quality: "premium_plus" }
    );
    if (composed?.trim()) fill.description = composed.trim();
  }

  const imageFieldKeys = collectImageKeys(fill);
  const provenanceOverrides: ListingFieldProvenanceMap = {};
  // Companion / seller text facts in the fill are USER (vision never invents these)
  if (typeof fill.price === "string" && fill.price.trim()) {
    provenanceOverrides.price = "USER";
  }
  if (typeof fill.location === "string" && fill.location.trim()) {
    provenanceOverrides.location = "USER";
  }
  if (typeof fill.pickupArea === "string" && fill.pickupArea.trim()) {
    provenanceOverrides.location = provenanceOverrides.location || "USER";
  }
  // Composed description is writer output, not IMAGE raw
  if (fill.description?.trim()) {
    provenanceOverrides.description = "AWHINA";
  }

  const draftAfter: SkyAiListingFill = {
    ...(input.existingDraft || {}),
    ...fill,
  };

  if (needsConfirm) {
    const assistantMessage =
      fused?.assistantMessage ||
      `Looks like a **${identity}**. Is that right?`;
    return {
      listingFill: fill,
      displayIdentity: identity,
      needsIdentityConfirm: true,
      imageFieldKeys,
      provenanceOverrides,
      assistantMessage,
      pendingSlot:
        fused?.pendingSlot ||
        (fused && identityAssessment.domain === "TRADING_CARD"
          ? "card_subject"
          : null),
      pendingClarification: null,
      focusChat: true,
    };
  }

  const next = nextListingSlotQuestion(draftAfter);
  const pendingClarification = buildListingSlotPending(
    draftAfter,
    `vision:${identity}`
  );
  const pendingSlot = next?.slot ?? null;
  const assistantMessage =
    fused?.assistantMessage ||
    buildReadinessFollowUpReply(draftAfter, {
      lead: `Looks like a **${identity}**.`,
    });

  return {
    listingFill: fill,
    displayIdentity: identity,
    needsIdentityConfirm: false,
    imageFieldKeys,
    provenanceOverrides,
    assistantMessage,
    pendingSlot,
    pendingClarification,
    focusChat: true,
  };
}

/** Push assistant turn + session pendingSlot into the ONE conversation store. */
export function commitVisionBridgeToConversation(
  bridge: VisionConversationBridgeResult
): void {
  const id = `vision-bridge-${Date.now()}`;
  appendMessage({
    id,
    role: "assistant",
    text: bridge.assistantMessage,
  });
  setListingFillOccurred(true);

  const task = {
    task: "selling" as const,
    pendingItem: bridge.displayIdentity,
    pendingClarification: bridge.pendingClarification || undefined,
    updatedAt: Date.now(),
  };

  setAwhinaSessionEcho({
    task,
    pendingSlot: bridge.pendingSlot,
  });

  const conversationId = getAwhinaConversationState().conversationId;
  persistAwhinaSession({
    conversationId,
    task,
    pendingSlot: bridge.pendingSlot,
    updatedAt: Date.now(),
  });
}
