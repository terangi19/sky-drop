/**
 * Intent router — classify messages before handler dispatch.
 * Prevents pricing/search from hijacking active listing workflows.
 */

import { detectCoachAwaiting } from "./sky-ai-coach";
import { detectMarketplaceQuestion } from "./sky-ai-marketplace-knowledge";
import { detectListingSearchIntent } from "./sky-ai-listing-search";
import { detectPricingIntent } from "./sky-ai-comps";
import {
  isActiveCreationFlow,
  isAuctionSetupMessage,
  shouldRunPricingEngine,
  type SkyAiConversationState,
} from "./sky-ai-conversation-flow";
import { normalizeFlow } from "./sky-ai-listing-draft";
import { isExplicitTopicChange } from "./sky-ai-expert-mindset";
import type { SkyAiHistoryItem, SkyAiListingDraft, SkyAiFlow, SkyAiStep } from "./sky-ai-types";

export { normalizeFlow };

export type SkyAiIntent =
  | "coach"
  | "platform_help"
  | "conversation_flow"
  | "pricing"
  | "search"
  | "scam_check"
  | "negotiation"
  | "navigation"
  | "general_ai";

export type SkyAiWorkflowState = {
  flow: SkyAiFlow | null;
  step: SkyAiStep | null;
  confidence: number;
};

const SCAM_CHECK_INTENT =
  /\b(is this (a )?scam|scam check|sounds? (like )?a scam|fake courier|courier fee|shipping agent|too good to be true|safe to (buy|pay|trust)|is this message safe|is this legit|phishing|off[- ]platform)\b/i;

const NEGOTIATION_INTENT =
  /\b(counter( |-)offer|should i offer|how much should i offer|negotiat|lower (the )?price|walk away|accept (this )?offer|they offered|buyer offered|seller offered|what(?:'s| is) a fair offer)\b/i;

export function workflowStateFromDraft(
  draft: SkyAiListingDraft,
  state?: SkyAiConversationState
): SkyAiWorkflowState {
  const flow = normalizeFlow(state?.flow ?? draft.flow);
  const step = state?.step ?? draft.step ?? null;
  let confidence = 0.45;

  if (flow && step) confidence = 0.72;
  if (draft.status === "ready") confidence = 0.85;
  if (draft.status === "complete") confidence = 0.92;
  if (draft.startingBid && draft.durationDays) confidence = 0.95;
  if (draft.title && draft.description && draft.price) confidence = Math.max(confidence, 0.88);

  return { flow, step, confidence };
}

export function classifySkyAiIntent(
  message: string,
  state: SkyAiConversationState,
  draft: SkyAiListingDraft,
  history: SkyAiHistoryItem[],
  subjectChanged = false
): { intent: SkyAiIntent; workflow: SkyAiWorkflowState } {
  const workflow = workflowStateFromDraft(draft, state);
  const q = message.trim();

  if (detectCoachAwaiting(history)) {
    return { intent: "coach", workflow: { ...workflow, flow: "listing_creation", step: "listing_type", confidence: 0.9 } };
  }

  if (detectMarketplaceQuestion(q)) {
    return {
      intent: "platform_help",
      workflow: { ...workflow, flow: "marketplace_help", step: null, confidence: 0.9 },
    };
  }

  if (SCAM_CHECK_INTENT.test(q)) {
    return { intent: "scam_check", workflow };
  }

  if (NEGOTIATION_INTENT.test(q) && !isActiveCreationFlow(state)) {
    return { intent: "negotiation", workflow };
  }

  const inCreationWorkflow =
    isActiveCreationFlow(state) ||
    isAuctionSetupMessage(q) ||
    workflow.flow === "auction_creation" ||
    workflow.flow === "listing_creation" ||
    workflow.flow === "vehicle_listing" ||
    workflow.flow === "service_listing" ||
    workflow.flow === "request_quote";

  const topicChanged = isExplicitTopicChange(q, workflow.flow);

  if (inCreationWorkflow && !topicChanged && !subjectChanged) {
    return {
      intent: "conversation_flow",
      workflow: { ...workflow, confidence: Math.max(workflow.confidence, 0.8) },
    };
  }

  if (
    detectPricingIntent(q) &&
    shouldRunPricingEngine(q, state, draft, topicChanged || subjectChanged)
  ) {
    return { intent: "pricing", workflow: { ...workflow, flow: "pricing_estimate", step: "pricing_request", confidence: 0.75 } };
  }

  if (detectListingSearchIntent(q)) {
    return {
      intent: "search",
      workflow: { ...workflow, flow: "marketplace_search", step: null, confidence: 0.7 },
    };
  }

  return { intent: "general_ai", workflow };
}
