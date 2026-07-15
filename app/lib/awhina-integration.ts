/**
 * Āwhina Integration Layer
 * 
 * Bridges the old and new Āwhina architectures.
 * Routes requests through the new system while preserving backwards compatibility.
 */

import { classifyIntent } from "./awhina-intent-router";
import { tryLocalExecutionCached } from "./awhina-local-execution";
import { executeToolCall } from "./awhina-tool-registry";
import { getGlobalMemory, extractEntitiesFromMessage, isFollowUpRefinement } from "./awhina-conversation-memory";
import { evaluateConfidence } from "./awhina-confidence-scoring";
import { getPerformanceOptimizer } from "./awhina-performance";
import { logCompleteRequest, PerformanceTimer } from "./awhina-logging";

export type IntegrationContext = {
  pathname?: string;
  isAdmin?: boolean;
  hasListingContext?: boolean;
  listingContext?: Record<string, unknown>;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  uid?: string;
};

export type IntegrationResult = {
  action: "navigate" | "search" | "create_listing" | "edit_listing" | "message" | "purchase" | "text_reply" | "unknown";
  data: {
    path?: string;
    query?: string;
    filters?: Record<string, unknown>;
    listingFill?: Record<string, unknown>;
    message?: string;
    toolCall?: {
      tool: string;
      args: Record<string, unknown>;
    };
  };
  routingMode: "local" | "ai" | "hybrid";
  intent: string;
  confidence: number;
  usedLocalExecution: boolean;
  executionTime: number;
  clarificationQuestion?: string;
};

const ENABLE_DEVELOPMENT_LOGS = true;

function devLog(data: Record<string, unknown>): void {
  if (!ENABLE_DEVELOPMENT_LOGS) return;
  console.log("[Awhina Integration]", data);
}

/**
 * Main integration function - routes requests through the new architecture
 */
export async function processAwhinaRequest(
  message: string,
  context: IntegrationContext = {}
): Promise<IntegrationResult> {
  const timer = new PerformanceTimer();
  timer.checkpoint("start");

  const memory = getGlobalMemory();
  const optimizer = getPerformanceOptimizer();

  // Step 1: Try performance optimization (local execution + cache)
  const perfResult = await optimizer.processRequest({
    message,
    context: {
      pathname: context.pathname,
      isAdmin: context.isAdmin,
      hasConversationHistory: Boolean(context.conversationHistory?.length),
      hasListingContext: Boolean(context.hasListingContext),
    },
    metadata: {
      uid: context.uid,
      source: "hybrid",
    },
  });

  timer.checkpoint("optimization");

  if (perfResult.source === "local" && perfResult.result) {
    // Local execution hit - execute immediately
    const toolCall = perfResult.result as any; // It's a tool call from local execution
    const toolResult = await executeToolCall(toolCall);
    timer.checkpoint("tool");

    const result: IntegrationResult = {
      action: mapToolToAction(toolCall.tool),
      data: {
        toolCall: toolCall,
      },
      routingMode: "local",
      intent: "navigation",
      confidence: 1.0,
      usedLocalExecution: true,
      executionTime: timer.getElapsed(),
    };

    devLog({
      routingMode: result.routingMode,
      intent: result.intent,
      selectedTool: toolCall.tool,
      usedLocalExecution: true,
      confidence: result.confidence,
      executionTime: result.executionTime,
    });

    // Log the request
    logCompleteRequest({
      transcript: message,
      intentResult: {
        intent: "navigation" as any, // Type cast for logging compatibility
        confidence: "high",
        entities: [],
        reasoning: "Local execution",
      },
      toolCall: toolCall,
      toolResult,
      context: {
        pathname: context.pathname,
        isAdmin: context.isAdmin || false,
        hasConversationHistory: Boolean(context.conversationHistory?.length),
        hasListingContext: Boolean(context.hasListingContext),
      },
      timer,
      metadata: {
        uid: context.uid,
        source: "hybrid",
        localExecution: true,
        cached: perfResult.cached,
      },
    });

    return result;
  }

  if (perfResult.source === "cache" && perfResult.result) {
    // Cache hit - return cached result
    timer.checkpoint("cache");

    const result: IntegrationResult = {
      action: "text_reply",
      data: {
        message: "Cached result",
      },
      routingMode: "ai",
      intent: "cached",
      confidence: 0.9,
      usedLocalExecution: false,
      executionTime: timer.getElapsed(),
    };

    devLog({
      routingMode: result.routingMode,
      intent: result.intent,
      selectedTool: "none",
      usedLocalExecution: false,
      confidence: result.confidence,
      executionTime: result.executionTime,
      cached: true,
    });

    return result;
  }

  // Step 2: Intent classification
  timer.checkpoint("intent");
  const intentResult = await classifyIntent(message, {
    pathname: context.pathname,
    isAdmin: context.isAdmin,
    conversationHistory: context.conversationHistory,
    listingContext: context.listingContext,
  });

  // Step 3: Confidence evaluation
  timer.checkpoint("confidence");
  const confidenceEval = evaluateConfidence({
    intent: intentResult.intent as any, // Type cast for compatibility
    entities: intentResult.entities.reduce((acc, e) => ({ ...acc, [e.type]: e.value }), {}) as Record<string, string>,
    message,
    context: {
      hasConversationHistory: Boolean(context.conversationHistory?.length),
      hasListingContext: Boolean(context.hasListingContext),
      currentPath: context.pathname || "/",
      isAdmin: context.isAdmin || false,
    },
  });

  // Step 4: Check for follow-up refinement
  const isFollowUp = context.conversationHistory && isFollowUpRefinement(message, memory);
  if (isFollowUp) {
    const entities = memory.getEntities();
    // Merge entities from memory with current request
    const mergedEntities = { ...entities, ...intentResult.entities.reduce((acc, e) => ({ ...acc, [e.type]: e.value }), {}) };
    
    devLog({
      routingMode: "hybrid",
      intent: intentResult.intent,
      selectedTool: "follow_up",
      usedLocalExecution: false,
      confidence: confidenceEval.score,
      executionTime: timer.getElapsed(),
      isFollowUp: true,
      mergedEntities,
    });
  }

  // Step 5: Convert intent to action
  const action = mapIntentToAction(intentResult.intent as string, context.pathname);
  const data = buildActionData(action, intentResult, context);

  // Step 6: Store in conversation memory
  memory.addUserTurn(message, intentResult.intent as any, intentResult.entities.reduce((acc, e) => ({ ...acc, [e.type]: e.value }), {}) as Record<string, string>);

  timer.checkpoint("memory");

  const result: IntegrationResult = {
    action,
    data,
    routingMode: "ai",
    intent: intentResult.intent as string,
    confidence: confidenceEval.score,
    usedLocalExecution: false,
    executionTime: timer.getElapsed(),
    clarificationQuestion: confidenceEval.clarificationQuestion,
  };

  devLog({
    routingMode: result.routingMode,
    intent: result.intent,
    selectedTool: data.toolCall?.tool || "none",
    usedLocalExecution: false,
    confidence: result.confidence,
    executionTime: result.executionTime,
    clarificationQuestion: result.clarificationQuestion,
  });

  // Log the request
  logCompleteRequest({
    transcript: message,
    intentResult: intentResult as any, // Type cast for compatibility with shared types
    context: {
      pathname: context.pathname,
      isAdmin: context.isAdmin || false,
      hasConversationHistory: Boolean(context.conversationHistory?.length),
      hasListingContext: Boolean(context.hasListingContext),
    },
    timer,
    metadata: {
      uid: context.uid,
      source: "hybrid",
      localExecution: false,
      cached: false,
    },
  });

  return result;
}

/**
 * Map tool name to action type
 */
function mapToolToAction(tool: string): IntegrationResult["action"] {
  const toolToAction: Record<string, IntegrationResult["action"]> = {
    navigate: "navigate",
    searchListings: "search",
    createListing: "create_listing",
    editListing: "edit_listing",
    openMessages: "message",
    sendMessage: "message",
    arrangePurchase: "purchase",
    updateProfile: "text_reply",
    voiceSearch: "search",
    openCategory: "search",
    reply: "text_reply",
    confirmAction: "text_reply",
  };
  return toolToAction[tool] || "unknown";
}

/**
 * Map intent to action type
 */
function mapIntentToAction(intent: string, pathname?: string): IntegrationResult["action"] {
  const intentToAction: Record<string, IntegrationResult["action"]> = {
    navigation: "navigate",
    marketplace_search: "search",
    listing_create: "create_listing",
    listing_edit: "edit_listing",
    messaging: "message",
    purchase: "purchase",
    profile: "text_reply",
    admin: "navigate",
    general_question: "text_reply",
    conversation: "text_reply",
    unknown: "text_reply",
  };
  return intentToAction[intent] || "text_reply";
}

/**
 * Build action data from intent result
 */
function buildActionData(
  action: IntegrationResult["action"],
  intentResult: any,
  context: IntegrationContext
): IntegrationResult["data"] {
  const data: IntegrationResult["data"] = {};

  switch (action) {
    case "navigate":
      data.path = determineNavigationPath(intentResult.intent, intentResult.entities, context.pathname);
      break;

    case "search":
      data.query = extractSearchQuery(intentResult.entities);
      data.filters = extractSearchFilters(intentResult.entities);
      break;

    case "create_listing":
      data.listingFill = buildListingFill(intentResult.entities, context.listingContext);
      break;

    case "edit_listing":
      data.listingFill = buildListingFill(intentResult.entities, context.listingContext);
      break;

    case "message":
      data.message = "Open messages";
      break;

    case "purchase":
      data.message = "Arrange purchase";
      break;

    case "text_reply":
      data.message = intentResult.clarificationQuestion || "I understand. How can I help?";
      break;
  }

  return data;
}

/**
 * Determine navigation path from intent and entities
 */
function determineNavigationPath(
  intent: string,
  entities: Record<string, string>,
  currentPath?: string
): string {
  // Check for specific navigation entities
  if (entities.path) return entities.path;

  // Intent-based routing
  const intentRoutes: Record<string, string> = {
    navigation: "/",
    marketplace_search: "/search",
    listing_create: "/post/ai",
    messaging: "/messages",
    profile: "/profile",
    admin: "/admin",
  };

  return intentRoutes[intent] || "/";
}

/**
 * Extract search query from entities
 */
function extractSearchQuery(entities: Record<string, string>): string {
  return entities.query || entities.vehicleMake || entities.category || "";
}

/**
 * Extract search filters from entities
 */
function extractSearchFilters(entities: Record<string, string>): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (entities.price) filters.maxPrice = parseInt(entities.price.replace(/[^0-9]/g, ""));
  if (entities.location) filters.location = entities.location;
  if (entities.category) filters.category = entities.category;
  return filters;
}

/**
 * Build listing fill from entities
 */
function buildListingFill(
  entities: Record<string, string>,
  context?: Record<string, unknown>
): Record<string, unknown> {
  const fill: Record<string, unknown> = { ...context };
  
  if (entities.title) fill.title = entities.title;
  if (entities.price) fill.price = entities.price;
  if (entities.condition) fill.condition = entities.condition;
  if (entities.location) fill.location = entities.location;
  if (entities.category) fill.category = entities.category;
  if (entities.vehicleMake) fill.vehicleMake = entities.vehicleMake;
  if (entities.vehicleModel) fill.vehicleModel = entities.vehicleModel;
  if (entities.vehicleYear) fill.vehicleYear = entities.vehicleYear;
  
  return fill;
}
