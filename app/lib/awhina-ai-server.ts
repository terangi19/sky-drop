/**
 * Āwhina AI Server — thin wrapper around free-form capability (single model call).
 * Prefer importing from awhina-freeform-capability / awhina-llm-capability directly.
 */

import { runLlmCapability } from "./awhina-llm-capability";
import type { AwhinaToolCall, AwhinaToolResult } from "./awhina-types";
import type { AwhinaIntentContext } from "./awhina-intent-router-server";
import { confidenceLevelToScore } from "./awhina-confidence-levels";

export type AwhinaAIRequest = {
  message: string;
  context: AwhinaIntentContext;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
};

export type AwhinaAIResponse = {
  toolCall: AwhinaToolCall | null;
  textReply?: string;
  reasoning?: string;
  confidence: number;
  executionTime: number;
};

export async function processAwhinaAIRequest(
  request: AwhinaAIRequest
): Promise<AwhinaAIResponse> {
  const result = await runLlmCapability({
    message: request.message,
    pathname: request.context.pathname,
    history: request.conversationHistory,
    listingContext: request.context.listingContext as never,
    isAdmin: request.context.isAdmin,
  });

  return {
    toolCall: result.toolCall || null,
    textReply: result.reply,
    reasoning: result.routing,
    confidence: confidenceLevelToScore(result.confidence),
    executionTime: result.latencyMs,
  };
}

export async function processAndExecuteAIRequest(
  request: AwhinaAIRequest
): Promise<{ aiResponse: AwhinaAIResponse; toolResult: AwhinaToolResult | null }> {
  const aiResponse = await processAwhinaAIRequest(request);
  let toolResult: AwhinaToolResult | null = null;
  if (aiResponse.toolCall) {
    const { executeToolCall } = await import("./awhina-tool-registry");
    toolResult = await executeToolCall(aiResponse.toolCall);
  }
  return { aiResponse, toolResult };
}
