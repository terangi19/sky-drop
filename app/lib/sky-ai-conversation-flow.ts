/**
 * Conversation flow routing — interpret replies using structured draft state,
 * not chat history alone.
 */

import { detectCoachAwaiting } from "./sky-ai-coach";
import {
  applyFlowToDraft,
  buildListingDraft,
  type BuildListingDraftOptions,
  draftToListingFill,
  formatAuctionSummary,
  getMissingAuctionFields,
  getMissingListingFields,
  getMissingServiceFields,
  getMissingVehicleFields,
  isAwaitingAuctionCreate,
  isAwaitingListingCreate,
  isAwaitingTitleGeneration,
  isAuctionDraftReady,
  isListingDraftReady,
  parseServicePricingFromMessage,
  userConfirmation,
  userDeclined,
} from "./sky-ai-listing-draft";
import { normalizeFlow } from "./sky-ai-listing-draft";
import { formatMissingFieldsPrompt } from "./sky-ai-expert-mindset";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type {
  SkyAiConversationState,
  SkyAiFlow,
  SkyAiHistoryItem,
  SkyAiListingContext,
  SkyAiListingDraft,
  SkyAiStep,
} from "./sky-ai-types";

export type { SkyAiConversationState, SkyAiFlow, SkyAiStep };

const CREATION_FLOWS: SkyAiFlow[] = [
  "listing_creation",
  "auction_creation",
  "auction_setup",
  "vehicle_listing",
  "service_listing",
  "service_quote",
  "request_quote",
];

const CREATION_STEPS: SkyAiStep[] = [
  "listing_type",
  "photos",
  "describe_item",
  "auction_params",
  "auction_title",
  "auction_confirm_create",
  "service_scope",
  "service_price",
  "listing_confirm_create",
  "confirm_listing",
  "vehicle_details",
];

export type SkyAiFlowReply = {
  text: string;
  listingFill?: SkyAiListingFill;
  navigateTo?: string;
  flow: SkyAiFlow;
  step: SkyAiStep;
  draft: SkyAiListingDraft;
};

function lastAssistantText(history: SkyAiHistoryItem[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") return history[i]!.content;
  }
  return "";
}

function isAwaitingAuctionParams(text: string): boolean {
  const l = text.toLowerCase();
  if (
    l.includes("starting bid") &&
    (l.includes("duration") || l.includes("reserve") || l.includes("days")) &&
    l.includes("?")
  ) {
    return true;
  }
  if (/what\s+(?:starting\s+)?bid|starting\s+bid.*duration|auction\s+settings/i.test(text)) {
    return true;
  }
  return false;
}

function isAwaitingServiceQuoteDetails(text: string): boolean {
  const l = text.toLowerCase();
  return (
    (l.includes("request quote") || l.includes("project scope") || l.includes("service pricing")) &&
    (l.includes("?") || l.includes("fixed price") || l.includes("starting"))
  );
}

function isAwaitingItemDescription(text: string): boolean {
  const l = text.toLowerCase();
  return (
    l.includes("describe what you're selling") ||
    l.includes("tell me what you're selling") ||
    l.includes("what are you selling") ||
    (l.includes("brand") && l.includes("condition") && l.includes("?"))
  );
}

function inferFlowFromHistory(
  history: SkyAiHistoryItem[],
  listingContext: SkyAiListingContext | null,
  draft: SkyAiListingDraft
): SkyAiConversationState {
  const last = lastAssistantText(history);

  const coachAwaiting = detectCoachAwaiting(history);
  if (coachAwaiting === "listing_type") {
    return { flow: "listing_creation", step: "listing_type" };
  }
  if (coachAwaiting === "photos") {
    return { flow: "listing_creation", step: "photos" };
  }

  if (isAwaitingAuctionCreate(last) && isAuctionDraftReady(draft)) {
    return { flow: "auction_creation", step: "auction_confirm_create" };
  }
  if (isAwaitingTitleGeneration(last)) {
    return { flow: "auction_creation", step: "auction_title" };
  }
  if (isAwaitingAuctionParams(last)) {
    return { flow: "auction_creation", step: "auction_params" };
  }
  if (draft.saleType === "auction" && isAuctionDraftReady(draft)) {
    return { flow: "auction_creation", step: "auction_confirm_create" };
  }
  if (draft.saleType === "auction" && !isAuctionDraftReady(draft)) {
    return { flow: "auction_creation", step: "auction_params" };
  }

  if (isAwaitingListingCreate(last) && isListingDraftReady(draft)) {
    return { flow: "listing_creation", step: "listing_confirm_create" };
  }

  if (draft.listingType === "vehicle") {
    const missing = getMissingVehicleFields(draft);
    if (missing.length > 0) {
      return { flow: "vehicle_listing", step: "vehicle_details" };
    }
    if (isListingDraftReady(draft)) {
      return { flow: "vehicle_listing", step: "listing_confirm_create" };
    }
  }

  if (isAwaitingServiceQuoteDetails(last)) {
    return { flow: "service_listing", step: "service_scope" };
  }
  if (draft.listingType === "service" || listingContext?.listingType === "service") {
    if (!draft.servicePricingType && !listingContext?.servicePricingType) {
      return { flow: "service_listing", step: "service_scope" };
    }
    return { flow: "service_listing", step: "service_price" };
  }
  if (
    listingContext?.servicePricingType === "request_quote" &&
    listingContext?.listingType === "service"
  ) {
    return { flow: "request_quote", step: "service_scope" };
  }

  if (isAwaitingItemDescription(last)) {
    return { flow: "listing_creation", step: "describe_item" };
  }

  if (listingContext?.title || listingContext?.description) {
    return { flow: "listing_creation", step: "describe_item" };
  }

  if (draft.flow && draft.step) {
    return {
      flow: normalizeFlow(draft.flow) ?? draft.flow,
      step: draft.step,
    };
  }

  return { flow: null, step: null };
}

export function resolveConversationState(
  history: SkyAiHistoryItem[],
  listingContext: SkyAiListingContext | null,
  draft: SkyAiListingDraft,
  hints?: Partial<SkyAiConversationState>,
  options?: { skipHistoryInference?: boolean }
): SkyAiConversationState {
  if (options?.skipHistoryInference && (draft.flow || draft.step)) {
    return {
      flow: normalizeFlow(draft.flow),
      step: draft.step ?? null,
    };
  }
  const inferred = inferFlowFromHistory(history, listingContext, draft);
  const hintFlow = normalizeFlow(hints?.flow ?? null);
  if (hintFlow && CREATION_FLOWS.includes(hintFlow)) {
    return {
      flow: hintFlow,
      step: hints?.step ?? inferred.step,
    };
  }
  return inferred;
}

export function isAuctionSetupMessage(message: string): boolean {
  return /\b(starting\s+bid|reserve\s+price|auction\s+duration|auction\s+ends?)\b/i.test(
    message.trim()
  );
}

export function isActiveCreationFlow(state: SkyAiConversationState): boolean {
  if (state.flow && CREATION_FLOWS.includes(state.flow)) return true;
  if (state.step && CREATION_STEPS.includes(state.step)) return true;
  return false;
}

export function shouldRunPricingEngine(
  message: string,
  state: SkyAiConversationState,
  draft: SkyAiListingDraft,
  topicChanged = false
): boolean {
  if (topicChanged) return true;
  if (isActiveCreationFlow(state)) return false;
  if (isAuctionSetupMessage(message)) return false;
  if (draft.saleType === "auction" && isAuctionDraftReady(draft)) return false;
  return true;
}

function formatCreateOffer(draft: SkyAiListingDraft): string {
  const summary = formatAuctionSummary(draft);
  const hasCopy = !!(draft.title && draft.description);
  if (hasCopy) {
    return `${summary}\n\nLooks good to me — want me to fill Quick Post with this auction?`;
  }
  return `${summary}\n\nWant me to draft the title and description from what you've told me?`;
}

function formatReadyToPublish(): string {
  return `All set — I've filled your auction on Quick Post. Give it a quick look, then hit **Publish** when you're happy.`;
}

function isInAuctionFlow(
  state: SkyAiConversationState,
  message: string,
  draft: SkyAiListingDraft
): boolean {
  const flow = normalizeFlow(state.flow);
  if (flow === "auction_creation") return true;
  if (isAuctionSetupMessage(message)) return true;
  if (draft.saleType === "auction" || draft.startingBid) return true;
  const sale = draft.saleType?.toLowerCase();
  return sale === "auction" || sale === "auction_buy_now";
}

function formatReadyToPublishListing(): string {
  return `Done — your listing is on Quick Post. Check the details, then **Publish** when you're ready.`;
}

function tryListingCreationReply(
  message: string,
  history: SkyAiHistoryItem[],
  state: SkyAiConversationState,
  listingContext: SkyAiListingContext | null,
  sessionDraft: Partial<SkyAiListingDraft> | null | undefined,
  buildOptions?: BuildListingDraftOptions
): SkyAiFlowReply | null {
  const flow = normalizeFlow(state.flow);
  if (flow !== "listing_creation" && flow !== "vehicle_listing") return null;
  if (flow === "vehicle_listing") return null;

  let draft = buildListingDraft(
    listingContext,
    history,
    sessionDraft,
    message,
    buildOptions
  );
  draft = applyFlowToDraft(draft, "listing_creation", state.step);
  const last = lastAssistantText(history);

  if (
    (state.step === "listing_confirm_create" || isAwaitingListingCreate(last)) &&
    userConfirmation(message) &&
    isListingDraftReady(draft)
  ) {
    const updated = applyFlowToDraft({ ...draft, status: "complete" }, "listing_creation", "listing_confirm_create");
    return {
      text: formatReadyToPublishListing(),
      listingFill: draftToListingFill(updated),
      flow: "listing_creation",
      step: "listing_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  if (state.step === "listing_confirm_create" && userDeclined(message)) {
    const updated = applyFlowToDraft(draft, "listing_creation", "listing_confirm_create");
    return {
      text: `No worries — your listing details are saved on Quick Post. Edit anything there, or tell me what to change.`,
      listingFill: draftToListingFill(updated),
      flow: "listing_creation",
      step: "listing_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  if (isListingDraftReady(draft) && isAwaitingListingCreate(last) && userConfirmation(message)) {
    const updated = applyFlowToDraft({ ...draft, status: "complete" }, "listing_creation", "listing_confirm_create");
    return {
      text: formatReadyToPublishListing(),
      listingFill: draftToListingFill(updated),
      flow: "listing_creation",
      step: "listing_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  return null;
}

function tryVehicleListingReply(
  message: string,
  history: SkyAiHistoryItem[],
  state: SkyAiConversationState,
  listingContext: SkyAiListingContext | null,
  sessionDraft: Partial<SkyAiListingDraft> | null | undefined,
  buildOptions?: BuildListingDraftOptions
): SkyAiFlowReply | null {
  if (normalizeFlow(state.flow) !== "vehicle_listing" && state.flow !== "vehicle_listing") {
    const draft = buildListingDraft(
      listingContext,
      history,
      sessionDraft,
      message,
      buildOptions
    );
    if (draft.listingType !== "vehicle") return null;
  }

  let draft = buildListingDraft(
    listingContext,
    history,
    sessionDraft,
    message,
    buildOptions
  );
  draft = applyFlowToDraft({ ...draft, listingType: "vehicle" }, "vehicle_listing", state.step);
  const last = lastAssistantText(history);

  if (
    (state.step === "listing_confirm_create" || isAwaitingListingCreate(last)) &&
    userConfirmation(message) &&
    isListingDraftReady(draft)
  ) {
    const updated = applyFlowToDraft({ ...draft, status: "complete" }, "vehicle_listing", "listing_confirm_create");
    return {
      text: formatReadyToPublishListing(),
      listingFill: draftToListingFill(updated),
      flow: "vehicle_listing",
      step: "listing_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  const missing = getMissingVehicleFields(draft);
  if (
    missing.length > 0 &&
    message.trim().length < 80 &&
    !userConfirmation(message) &&
    !userDeclined(message)
  ) {
    const updated = applyFlowToDraft(draft, "vehicle_listing", "vehicle_details");
    return {
      text: formatMissingFieldsPrompt(draft, missing, "vehicle") ||
        `What else can you tell me about the vehicle? I'll fill the form as we go.`,
      flow: "vehicle_listing",
      step: "vehicle_details",
      draft: updated,
    };
  }

  if (isListingDraftReady(draft) && missing.length === 0) {
    const updated = applyFlowToDraft({ ...draft, status: "ready" }, "vehicle_listing", "listing_confirm_create");
    return {
      text: `That covers the main vehicle details.\n\nWant me to fill Quick Post with this listing?`,
      listingFill: draftToListingFill(updated),
      flow: "vehicle_listing",
      step: "listing_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  return null;
}

function tryServiceListingReply(
  message: string,
  history: SkyAiHistoryItem[],
  state: SkyAiConversationState,
  listingContext: SkyAiListingContext | null,
  sessionDraft: Partial<SkyAiListingDraft> | null | undefined,
  buildOptions?: BuildListingDraftOptions
): SkyAiFlowReply | null {
  const flow = normalizeFlow(state.flow);
  if (
    flow !== "service_listing" &&
    flow !== "request_quote" &&
    flow !== "service_quote"
  ) {
    const d = buildListingDraft(
      listingContext,
      history,
      sessionDraft,
      message,
      buildOptions
    );
    if (d.listingType !== "service") return null;
  }

  let draft = buildListingDraft(
    listingContext,
    history,
    sessionDraft,
    message,
    buildOptions
  );
  draft = mergeServicePatch(draft, parseServicePricingFromMessage(message));
  draft = applyFlowToDraft({ ...draft, listingType: "service" }, "service_listing", state.step);
  const last = lastAssistantText(history);

  if (
    (state.step === "listing_confirm_create" || isAwaitingListingCreate(last)) &&
    userConfirmation(message) &&
    isListingDraftReady(draft)
  ) {
    const updated = applyFlowToDraft({ ...draft, status: "complete" }, "service_listing", "listing_confirm_create");
    return {
      text: formatReadyToPublishListing(),
      listingFill: draftToListingFill(updated),
      flow: "service_listing",
      step: "listing_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  if (!draft.servicePricingType && state.step === "service_scope") {
    const updated = applyFlowToDraft(draft, "service_listing", "service_scope");
    return {
      text: `How do you want to handle pricing for this service — **fixed price**, **hourly**, or **Request Quote** (buyer messages you for a custom quote)?`,
      flow: "service_listing",
      step: "service_scope",
      draft: updated,
    };
  }

  const missing = getMissingServiceFields(draft);
  if (missing.length > 0 && state.step !== "listing_confirm_create") {
    const updated = applyFlowToDraft(draft, "service_listing", "service_price");
    return {
      text:
        formatMissingFieldsPrompt(draft, missing, "service") ||
        `Tell me a bit more about the service and I'll draft the listing.`,
      flow: "service_listing",
      step: "service_price",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  if (isListingDraftReady(draft)) {
    const updated = applyFlowToDraft({ ...draft, status: "ready" }, "service_listing", "listing_confirm_create");
    return {
      text: `Service listing looks ready.\n\nWant me to put it on Quick Post for you?`,
      listingFill: draftToListingFill(updated),
      flow: "service_listing",
      step: "listing_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  return null;
}

function mergeServicePatch(
  draft: SkyAiListingDraft,
  patch: Partial<SkyAiListingDraft>
): SkyAiListingDraft {
  if (!patch.servicePricingType) return draft;
  return { ...draft, ...patch };
}

function tryAuctionSetupReply(
  message: string,
  history: SkyAiHistoryItem[],
  state: SkyAiConversationState,
  listingContext: SkyAiListingContext | null,
  sessionDraft: Partial<SkyAiListingDraft> | null | undefined,
  buildOptions?: BuildListingDraftOptions
): SkyAiFlowReply | null {
  let draft = buildListingDraft(
    listingContext,
    history,
    sessionDraft,
    message,
    buildOptions
  );
  draft = applyFlowToDraft(draft, normalizeFlow(state.flow) ?? "auction_creation", state.step);

  if (!isInAuctionFlow(state, message, draft)) return null;

  const last = lastAssistantText(history);

  // User confirmed listing creation — draft already has auction params
  if (
    (state.step === "auction_confirm_create" || isAwaitingAuctionCreate(last)) &&
    userConfirmation(message) &&
    isAuctionDraftReady(draft)
  ) {
    const updated = applyFlowToDraft(
      { ...draft, status: "complete" },
      "auction_creation",
      "auction_confirm_create"
    );
    return {
      text: formatReadyToPublish(),
      listingFill: draftToListingFill(updated),
      flow: "auction_creation",
      step: "auction_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  if (state.step === "auction_confirm_create" && userDeclined(message)) {
    const updated = applyFlowToDraft(draft, "auction_creation", "auction_confirm_create");
    return {
      text: `No worries — your auction details are saved on Quick Post. Edit anything there, or tell me what you'd like to change.`,
      listingFill: draftToListingFill(updated),
      flow: "auction_creation",
      step: "auction_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  // User confirmed title/description generation
  if (
    (state.step === "auction_title" || isAwaitingTitleGeneration(last)) &&
    userConfirmation(message) &&
    isAuctionDraftReady(draft)
  ) {
    const updated = applyFlowToDraft(draft, "auction_creation", "describe_item");
    return {
      text: `Tell me what you're selling — brand, model, condition, location, whatever you've got — and I'll draft the title and description.`,
      listingFill: draftToListingFill(updated),
      flow: "auction_creation",
      step: "describe_item",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  if (state.step === "auction_title" && userDeclined(message)) {
    const updated = applyFlowToDraft(
      { ...draft, status: "ready" },
      "auction_creation",
      "auction_confirm_create"
    );
    return {
      text: `${formatAuctionSummary(draft)}\n\nNo problem — add title and description on the form when you're ready.\n\nWould you like me to create this auction listing now?`,
      listingFill: draftToListingFill(updated),
      flow: "auction_creation",
      step: "auction_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  // Collecting or confirming auction params
  const awaitingParams =
    state.step === "auction_params" ||
    isAwaitingAuctionParams(last) ||
    isAuctionSetupMessage(message) ||
    (!isAuctionDraftReady(draft) && draft.saleType === "auction");

  if (awaitingParams && !isAwaitingAuctionCreate(last) && !userConfirmation(message)) {
    const missing = getMissingAuctionFields(draft);
    if (missing.length > 0) {
      const updated = applyFlowToDraft(
        { ...draft, status: "draft" },
        "auction_creation",
        "auction_params"
      );
      return {
        text: formatMissingFieldsPrompt(draft, missing, "auction"),
        flow: "auction_creation",
        step: "auction_params",
        draft: updated,
      };
    }

    const updated = applyFlowToDraft(
      { ...draft, status: "ready", saleType: "auction" },
      "auction_creation",
      "auction_title"
    );
    return {
      text: formatCreateOffer(updated),
      listingFill: draftToListingFill(updated),
      flow: "auction_creation",
      step: draft.title && draft.description ? "auction_confirm_create" : "auction_title",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  // Affirmative after summary shown in last turn but step not inferred
  if (userConfirmation(message) && isAuctionDraftReady(draft) && isAwaitingAuctionCreate(last)) {
    const updated = applyFlowToDraft({ ...draft, status: "complete" }, "auction_creation", "auction_confirm_create");
    return {
      text: formatReadyToPublish(),
      listingFill: draftToListingFill(updated),
      flow: "auction_creation",
      step: "auction_confirm_create",
      draft: updated,
      navigateTo: "/post/ai",
    };
  }

  return null;
}

/**
 * Handle in-flow replies before pricing, search, or generic AI routing.
 */
export function tryConversationFlowReply(
  message: string,
  history: SkyAiHistoryItem[],
  listingContext: SkyAiListingContext | null,
  sessionDraft?: Partial<SkyAiListingDraft> | null,
  hints?: Partial<SkyAiConversationState>,
  buildOptions?: BuildListingDraftOptions
): SkyAiFlowReply | null {
  const baseDraft = buildListingDraft(
    listingContext,
    history,
    sessionDraft,
    message,
    buildOptions
  );
  const state = resolveConversationState(history, listingContext, baseDraft, hints);
  const draftWithFlow = applyFlowToDraft(baseDraft, state.flow, state.step);

  const auction = tryAuctionSetupReply(
    message,
    history,
    state,
    listingContext,
    draftWithFlow,
    buildOptions
  );
  if (auction) return auction;

  const listing = tryListingCreationReply(
    message,
    history,
    state,
    listingContext,
    draftWithFlow,
    buildOptions
  );
  if (listing) return listing;

  const vehicle = tryVehicleListingReply(
    message,
    history,
    state,
    listingContext,
    draftWithFlow,
    buildOptions
  );
  if (vehicle) return vehicle;

  const service = tryServiceListingReply(
    message,
    history,
    state,
    listingContext,
    draftWithFlow,
    buildOptions
  );
  if (service) return service;

  return null;
}
