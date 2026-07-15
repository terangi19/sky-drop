/**
 * Āwhina Confidence Scoring - GPT-Style Architecture
 * 
 * Every request returns confidence, reason, and tool.
 * If confidence is low, ask a single clarification question instead of guessing.
 */

import {
  AwhinaIntent,
  AwhinaEntity,
  AwhinaToolCall,
  AwhinaConfidenceEvaluation,
  AwhinaConversationContext,
  AwhinaIntentResult,
  AwhinaConfidenceContext,
} from "./awhina-types";

export type ConfidenceLevel = "high" | "medium" | "low";
export type ConfidenceThreshold = {
  high: number;    // >= this is high confidence
  medium: number;  // >= this is medium confidence
  low: number;     // below this is low confidence
};

const DEFAULT_THRESHOLDS: ConfidenceThreshold = {
  high: 0.8,
  medium: 0.5,
  low: 0.0,
};

export type ConfidenceEvaluation = AwhinaConfidenceEvaluation & {
  level: ConfidenceLevel;
};

export type ConfidenceRequest = {
  intent: AwhinaIntent;
  entities: Record<string, string>;
  message: string;
  context: AwhinaConfidenceContext;
};

/**
 * Evaluate confidence of an intent classification
 */
export function evaluateConfidence(
  request: ConfidenceRequest,
  thresholds: ConfidenceThreshold = DEFAULT_THRESHOLDS
): ConfidenceEvaluation {
  let score = 0.5; // Start with medium confidence
  const factors: string[] = [];

  // Factor 1: Intent clarity
  if (request.intent === "unknown") {
    score -= 0.4;
    factors.push("Unknown intent");
  } else if (["general_question", "conversation"].includes(request.intent)) {
    score -= 0.2;
    factors.push("Generic intent");
  } else {
    score += 0.1;
    factors.push("Specific intent");
  }

  // Factor 2: Entity completeness
  const entityCount = Object.keys(request.entities).length;
  if (entityCount >= 3) {
    score += 0.2;
    factors.push("Rich entity extraction");
  } else if (entityCount >= 1) {
    score += 0.1;
    factors.push("Some entities extracted");
  } else {
    score -= 0.1;
    factors.push("No entities extracted");
  }

  // Factor 3: Message length
  const wordCount = request.message.split(/\s+/).length;
  if (wordCount >= 5) {
    score += 0.1;
    factors.push("Sufficient message length");
  } else if (wordCount < 2) {
    score -= 0.2;
    factors.push("Very short message");
  }

  // Factor 4: Context availability
  if (request.context.hasConversationHistory) {
    score += 0.1;
    factors.push("Conversation history available");
  }
  if (request.context.hasListingContext) {
    score += 0.1;
    factors.push("Listing context available");
  }

  // Factor 5: Message specificity
  const specificPatterns = [
    /\$\d+/, // Price mentioned
    /\d{4}/, // Year mentioned
    /toyota|honda|bmw|ford/i, // Car brand mentioned
    /auckland|wellington|christchurch/i, // Location mentioned
  ];
  const hasSpecificity = specificPatterns.some(pattern => pattern.test(request.message));
  if (hasSpecificity) {
    score += 0.2;
    factors.push("Specific details present");
  } else {
    score -= 0.1;
    factors.push("Lacks specific details");
  }

  // Clamp score to 0-1 range
  score = Math.max(0, Math.min(1, score));

  // Determine confidence level
  let level: ConfidenceLevel;
  if (score >= thresholds.high) {
    level = "high";
  } else if (score >= thresholds.medium) {
    level = "medium";
  } else {
    level = "low";
  }

  // Generate clarification question if low confidence
  const clarificationQuestion = level === "low"
    ? generateClarificationQuestion(request)
    : undefined;

  return {
    level,
    score,
    reasoning: factors.join(", "),
    clarificationQuestion,
    shouldAskForClarification: level === "low",
  };
}

/**
 * Generate clarification question based on intent and missing entities
 */
function generateClarificationQuestion(request: ConfidenceRequest): string {
  const { intent, entities, message } = request;

  // Intent-specific clarifications
  switch (intent) {
    case "marketplace_search":
      if (!entities.query && !entities.category) {
        return "What are you looking for? (e.g., 'BMW cars under $15k in Auckland')";
      }
      if (!entities.location && !entities.price) {
        return "Any preferences for location or price range?";
      }
      return "Could you be more specific about what you're looking for?";

    case "listing_create":
      if (!entities.category && !entities.price) {
        return "What would you like to sell? (e.g., '2015 BMW 335i for $15,000')";
      }
      if (!entities.price) {
        return "How much would you like to sell it for?";
      }
      return "Can you provide more details about the item?";

    case "navigation":
      return "Where would you like to go? (e.g., 'Home', 'Sell', 'Messages', 'Profile')";

    case "messaging":
      return "Who would you like to message?";

    case "purchase":
      return "Which listing would you like to purchase?";

    case "profile":
      return "What would you like to update on your profile?";

    default:
      return "Could you please rephrase that? I want to make sure I understand correctly.";
  }
}

/**
 * Evaluate confidence for a tool call
 */
export function evaluateToolCallConfidence(
  toolCall: AwhinaToolCall,
  originalIntent: AwhinaIntentResult,
  thresholds: ConfidenceThreshold = DEFAULT_THRESHOLDS
): ConfidenceEvaluation {
  let score = originalIntent.confidence === "high" ? 0.9 : 
              originalIntent.confidence === "medium" ? 0.6 : 0.3;
  
  const factors: string[] = [`Base confidence: ${originalIntent.confidence}`];

  // Factor 1: Tool match with intent
  const intentToolMap: Record<AwhinaIntent, string[]> = {
    navigation: ["navigate"],
    marketplace_search: ["searchListings", "openCategory"],
    listing_create: ["createListing"],
    listing_edit: ["editListing"],
    messaging: ["openMessages", "sendMessage"],
    purchase: ["arrangePurchase"],
    profile: ["updateProfile"],
    admin: ["navigate"],
    general_question: ["reply"],
    conversation: ["reply"],
    unknown: ["reply"],
  };

  const expectedTools = intentToolMap[originalIntent.intent] || [];
  if (expectedTools.includes(toolCall.tool)) {
    score += 0.1;
    factors.push("Tool matches intent");
  } else {
    score -= 0.2;
    factors.push("Tool doesn't match intent");
  }

  // Factor 2: Argument completeness
  const args = toolCall.args[toolCall.tool as keyof typeof toolCall.args] as Record<string, unknown>;
  const argKeys = args ? Object.keys(args) : [];
  
  if (argKeys.length >= 2) {
    score += 0.1;
    factors.push("Complete arguments");
  } else if (argKeys.length === 0) {
    score -= 0.1;
    factors.push("Missing arguments");
  }

  // Factor 3: Tool-specific validation
  if (toolCall.tool === "navigate") {
    const navArgs = args as { path?: string };
    if (navArgs.path && navArgs.path.startsWith("/")) {
      score += 0.1;
      factors.push("Valid navigation path");
    } else {
      score -= 0.3;
      factors.push("Invalid navigation path");
    }
  }

  if (toolCall.tool === "searchListings") {
    const searchArgs = args as { query?: string };
    if (searchArgs.query && searchArgs.query.length >= 2) {
      score += 0.1;
      factors.push("Valid search query");
    } else {
      score -= 0.2;
      factors.push("Invalid or missing search query");
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(1, score));

  // Determine level
  let level: ConfidenceLevel;
  if (score >= thresholds.high) {
    level = "high";
  } else if (score >= thresholds.medium) {
    level = "medium";
  } else {
    level = "low";
  }

  return {
    level,
    score,
    reasoning: factors.join(", "),
    shouldAskForClarification: level === "low",
  };
}

/**
 * Request confirmation for low-confidence actions
 */
export type ConfirmationRequest = {
  action: string;
  confidence: number;
  reasoning: string;
  clarificationQuestion: string;
};

export type ConfirmationResponse = {
  confirmed: boolean;
  userMessage?: string;
};

/**
 * Generate confirmation request for low-confidence action
 */
export function generateConfirmationRequest(
  toolCall: AwhinaToolCall,
  evaluation: ConfidenceEvaluation
): ConfirmationRequest {
  return {
    action: `${toolCall.tool} with args: ${JSON.stringify(toolCall.args)}`,
    confidence: evaluation.score,
    reasoning: evaluation.reasoning,
    clarificationQuestion: evaluation.clarificationQuestion || "Are you sure you want to do this?",
  };
}

/**
 * Check if user confirmed the action
 */
export function isConfirmationConfirmed(
  userMessage: string
): boolean {
  const confirmationPatterns = [
    /\b(yes|yeah|yep|sure|correct|that'?s right|right|go ahead|do it|okay|ok|confirm|that'?s it|exactly)\b/i,
  ];

  return confirmationPatterns.some(pattern => pattern.test(userMessage));
}

/**
 * Check if user denied the action
 */
export function isConfirmationDenied(
  userMessage: string
): boolean {
  const denialPatterns = [
    /\b(no|nah|nope|cancel|never mind|forget it|not that|wrong|different|no way)\b/i,
  ];

  return denialPatterns.some(pattern => pattern.test(userMessage));
}

/**
 * Confidence-aware execution flow
 */
export type ConfidenceAwareExecution = {
  shouldExecute: boolean;
  needsConfirmation: boolean;
  confirmationRequest?: ConfirmationRequest;
  clarificationQuestion?: string;
};

export function evaluateExecutionFlow(
  toolCall: AwhinaToolCall,
  intentResult: AwhinaIntentResult,
  thresholds: ConfidenceThreshold = DEFAULT_THRESHOLDS
): ConfidenceAwareExecution {
  // Evaluate tool call confidence
  const toolEvaluation = evaluateToolCallConfidence(toolCall, intentResult, thresholds);

  if (toolEvaluation.level === "high") {
    return {
      shouldExecute: true,
      needsConfirmation: false,
    };
  }

  if (toolEvaluation.level === "medium") {
    // Medium confidence - may need confirmation for sensitive actions
    const sensitiveActions = ["deleteListing", "banUser", "adminAction"];
    if (sensitiveActions.includes(toolCall.tool)) {
      return {
        shouldExecute: false,
        needsConfirmation: true,
        confirmationRequest: generateConfirmationRequest(toolCall, toolEvaluation),
      };
    }

    return {
      shouldExecute: true,
      needsConfirmation: false,
    };
  }

  // Low confidence - need clarification
  return {
    shouldExecute: false,
    needsConfirmation: false,
    clarificationQuestion: toolEvaluation.clarificationQuestion || "Could you please clarify what you'd like to do?",
  };
}
