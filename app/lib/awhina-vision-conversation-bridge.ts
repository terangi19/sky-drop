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
import { enforcePublicListingDescription } from "./awhina-listing-composer";
import {
  buildDescriptionWriterFacts,
  validateAiListingDescription,
} from "./awhina-description-writer";
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
import { gatePublicListingCopy } from "./awhina-public-copy-gate";
import {
  buildConfirmIdentityPendingAction,
  type AwhinaPendingAction,
} from "./awhina-pending-action";

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

function naturalVisionIdentityLead(
  identity: string,
  fill: SkyAiListingFill
): string {
  const subject = (fill.extras || [])
    .map((extra) => String(extra).match(/^subject:\s*(.+)$/i)?.[1]?.trim())
    .find(Boolean);
  const set = (fill.extras || [])
    .map((extra) => String(extra).match(/^(?:set|product_line|productline):\s*(.+)$/i)?.[1]?.trim())
    .find(Boolean);
  const subjectCount = subject
    ? subject
        .split(/\s*(?:,|&|\band\b)\s*/i)
        .map((part) => part.trim())
        .filter(Boolean).length
    : 0;

  // Use structured facts where a photo contains a set. This is general card
  // composition, not a special case for any named franchise or character.
  if (subject && subjectCount > 1) {
    const collection = set
      ? `${set}${/\bcards?\b/i.test(set) ? "" : " cards"}`
      : "trading cards";
    return `Looks like a set of ${collection} — ${subject}.`;
  }
  return `Looks like **${identity.replace(/[.!]+$/g, "")}**.`;
}

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
  /** Stable photo operation identity, used to make the conversation commit idempotent. */
  operationId?: string;
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
  /**
   * Structured confirmation — REQUIRED when needsIdentityConfirm.
   * Presentation ("Is that right?") is not enough; Yes resolves this.
   */
  pendingAction: AwhinaPendingAction | null;
  focusChat: true;
  operationId?: string;
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

  // Vision = FACTS only — never ship raw vision prose as the buyer description.
  // Validated grounded-writer copy is not raw vision and must survive this bridge.
  const fill: SkyAiListingFill = {
    ...(fused?.listingFill || input.listingFill),
  };
  const validatedAiDescription =
    fill.descriptionSource === "ai" && fill.description?.trim()
      ? validateAiListingDescription(
          fill.description,
          buildDescriptionWriterFacts(fill)
        )
      : null;
  if (validatedAiDescription) {
    fill.description = validatedAiDescription;
    fill.descriptionSource = "ai";
  } else {
    delete fill.description;
  }
  // Incomplete fused identity → never claim attribute stacks as buyer description
  if (fused && !identityAssessment.isComplete) {
    delete fill.description;
  }

  // NEW_OBJECT / replaceDraft: do not re-merge stale prior item price/condition into compose
  const isFreshObject = fill.replaceDraft === true;
  const draftForCompose: SkyAiListingFill = isFreshObject
    ? { ...fill }
    : { ...(input.existingDraft || {}), ...fill };
  if (isFreshObject) {
    // Location may persist from profile; item-scoped prior must not
    if (
      input.existingDraft?.location?.trim() &&
      !fill.location?.trim()
    ) {
      draftForCompose.location = input.existingDraft.location.trim();
    }
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

  // Public copy gate — Attr:/lone manufacturer never reach draft
  const gated = gatePublicListingCopy(fill, {
    allowPrice: !isFreshObject || Boolean(input.listingFill.price),
    // Adapter already gated unsupported New from looks-clean
    allowConditionNew: true,
    canonicalIdentity: identity,
    richerFactsAvailable: true,
  });
  Object.assign(fill, gated.fill);
  if (isFreshObject && !input.listingFill.price) delete fill.price;
  if (isFreshObject && !input.listingFill.condition) delete fill.condition;
  if (mayComposeDescription) {
    // Recompose only after the public-copy gate and field-provenance resolution:
    // vision never publishes raw model prose and every AI path uses one finalizer.
    const finalizerInput = { ...draftForCompose, ...fill };
    if (isFreshObject && !input.listingFill.price) delete finalizerInput.price;
    if (isFreshObject && !input.listingFill.condition) delete finalizerInput.condition;
    if (validatedAiDescription && fill.description) {
      finalizerInput.description = fill.description;
      finalizerInput.descriptionSource = "ai";
    }
    Object.assign(
      fill,
      enforcePublicListingDescription(finalizerInput, {
        quality: "premium_plus",
      })
    );
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
  const finalDescription = (fill as Record<string, unknown>).description;
  if (typeof finalDescription === "string" && finalDescription.trim()) {
    provenanceOverrides.description = "AWHINA";
  }

  const draftAfter: SkyAiListingFill = {
    ...(input.existingDraft || {}),
    ...fill,
  };

  if (needsConfirm) {
    const assistantMessage =
      fused?.assistantMessage ||
      `${naturalVisionIdentityLead(identity, fill)} Is that right?`;
    // Response → state contract: confirmation prose MUST set structured pendingAction
    const pendingAction: AwhinaPendingAction = {
      ...buildConfirmIdentityPendingAction({
        identity,
        listingFill: fill,
        prompt: `${naturalVisionIdentityLead(identity, fill)} Is that right?`,
      }),
      id: `pa_ident_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      status: "active",
      createdAt: Date.now(),
    };
    return {
      listingFill: fill,
      displayIdentity: identity,
      needsIdentityConfirm: true,
      imageFieldKeys,
      provenanceOverrides,
      assistantMessage,
      // Confirm is identity-only. Never hardcode card_subject — sealed TCG
      // products must inherit next slot from the object-type schema after Yes.
      pendingSlot: fused?.pendingSlot || null,
      pendingClarification: null,
      pendingAction,
      focusChat: true,
    operationId: input.operationId,
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
      lead: naturalVisionIdentityLead(identity, fill),
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
    pendingAction: null,
    focusChat: true,
    operationId: input.operationId,
  };
}

/** Push assistant turn + session pendingSlot / pendingAction into the ONE conversation store. */
export function commitVisionBridgeToConversation(
  bridge: VisionConversationBridgeResult
): void {
  const id = bridge.operationId
    ? `vision-bridge-${bridge.operationId}`
    : `vision-bridge-${Date.now()}`;
  // Both the page and chat can observe a photo handoff. A stable operation id
  // makes the canonical store the final idempotency boundary, so a repeated
  // listener/event cannot add another assistant vision turn.
  if (getAwhinaConversationState().messages.some((message) => message.id === id)) {
    return;
  }
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

  // Authoritative pendingAction — CONFIRM_IDENTITY when asking, null when continuing
  const pendingAction = bridge.pendingAction ?? null;

  setAwhinaSessionEcho({
    task,
    pendingSlot: bridge.pendingSlot,
    pendingAction,
  });

  const conversationId = getAwhinaConversationState().conversationId;
  persistAwhinaSession({
    conversationId,
    task,
    pendingSlot: bridge.pendingSlot,
    pendingAction,
    updatedAt: Date.now(),
  });
}
