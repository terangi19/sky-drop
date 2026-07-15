/**
 * Āwhina AI Server - GPT-Style Architecture
 * 
 * Uses OpenAI function calling to return typed tool calls instead of free-form text.
 * The AI never directly manipulates UI - it selects tools only.
 * The application executes the tools.
 */

import OpenAI from "openai";
import {
  AwhinaToolCall,
  AwhinaToolResult,
  AwhinaConversationContext,
  AwhinaAIResponse as SharedAIResponse,
} from "./awhina-types";
import { AWHINA_TOOLS } from "./awhina-tool-registry";
import { classifyIntentWithOpenAI, type AwhinaIntentContext } from "./awhina-intent-router-server";

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

const AWHINA_SYSTEM_PROMPT = `You are Āwhina, the AI assistant for Sky Drop marketplace.

Your role is to help users with:
- Finding and searching for listings
- Creating and editing listings
- Messaging and communication
- Purchasing and arranging delivery
- Profile management
- Navigation and general assistance

IMPORTANT RULES:
1. NEVER directly manipulate UI or provide navigation URLs in text
2. ALWAYS use function calls for actions (navigate, search, createListing, etc.)
3. Use the 'reply' tool only for text-only responses that don't require action
4. If you need more information, ask a specific question
5. Be concise and direct - avoid lengthy explanations
6. Use New Zealand context (NZD pricing, NZ locations, NZ spelling)

When users provide listing details (price, item, condition, etc.), use the createListing tool with appropriate parameters.
When users want to search, use the searchListings tool with query and filters.
When users want to go somewhere, use the navigate tool with the path.
When users just want information or help, use the reply tool.

If a user's intent is unclear, ask a specific clarification question rather than guessing.`;

/**
 * Process AI request using OpenAI function calling
 * Returns structured tool calls instead of free-form text
 */
export async function processAwhinaAIRequest(
  request: AwhinaAIRequest
): Promise<AwhinaAIResponse> {
  const startTime = Date.now();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    // First, classify intent for better routing
    const intentResult = await classifyIntentWithOpenAI(request.message, request.context);
    
    // Build messages with context
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: AWHINA_SYSTEM_PROMPT,
      },
    ];

    // Add conversation history (last 10 messages)
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      const recentHistory = request.conversationHistory.slice(-10);
      messages.push(...recentHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })));
    }

    // Add current user message with context
    let contextInfo = "";
    if (request.context.pathname) {
      contextInfo += `\nCurrent page: ${request.context.pathname}`;
    }
    if (request.context.isAdmin) {
      contextInfo += "\nUser has admin access";
    }
    if (request.context.listingContext && Object.keys(request.context.listingContext).length > 0) {
      contextInfo += "\nUser has an active listing draft";
    }

    messages.push({
      role: "user",
      content: `${request.message}${contextInfo}`,
    });

    // Call OpenAI with function calling
    const response = await openai.chat.completions.create({
      model,
      messages,
      functions: Object.values(AWHINA_TOOLS),
      function_call: "auto", // Let AI decide whether to call a function
      temperature: 0.3, // Lower temperature for more deterministic tool selection
      max_tokens: 1000,
    });

    const choice = response.choices[0];
    const functionCall = choice?.message?.function_call;
    const content = choice?.message?.content;

    if (functionCall && functionCall.arguments) {
      // AI returned a tool call
      const toolCall: AwhinaToolCall = {
        tool: functionCall.name as any,
        args: JSON.parse(functionCall.arguments),
        confidence: intentResult.confidence === "high" ? 0.9 : intentResult.confidence === "medium" ? 0.7 : 0.5,
        reasoning: intentResult.reasoning,
      };

      return {
        toolCall,
        reasoning: intentResult.reasoning,
        confidence: toolCall.confidence ?? 0.5,
        executionTime: Date.now() - startTime,
      };
    }

    // AI returned text only (no tool call)
    if (content) {
      return {
        toolCall: null,
        textReply: content,
        reasoning: intentResult.reasoning,
        confidence: 0.8,
        executionTime: Date.now() - startTime,
      };
    }

    // No response
    return {
      toolCall: null,
      textReply: "I'm not sure how to help with that. Could you rephrase?",
      reasoning: "No tool call or text response from AI",
      confidence: 0.3,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error("Awhina AI request failed:", error);
    throw error;
  }
}

/**
 * Process AI request and execute the tool call
 * Convenience function that combines AI processing and tool execution
 */
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
