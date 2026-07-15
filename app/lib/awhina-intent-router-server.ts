/**
 * Server-side Intent Router with OpenAI Function Calling
 * 
 * This is the server-side implementation that uses OpenAI's function calling
 * to classify intents with high accuracy and extract entities.
 */

import OpenAI from "openai";
import {
  AwhinaIntent,
  AwhinaConfidence,
  AwhinaEntity,
  AwhinaEntityType,
  AwhinaIntentResult,
  AwhinaServerIntentContext,
} from "./awhina-types";

export type AwhinaIntentContext = AwhinaServerIntentContext;

// Re-export AwhinaIntentResult for use in other modules
export type { AwhinaIntentResult } from "./awhina-types";

const INTENT_CLASSIFICATION_SYSTEM = `You are Āwhina's intent classifier for Sky Drop marketplace.

Your job is to classify user requests into intents and extract key entities.

Available intents:
- navigation: User wants to go to a specific page (home, sell, messages, profile, etc.)
- marketplace_search: User wants to search for listings or find items
- listing_create: User wants to create a new listing or sell something
- listing_edit: User wants to modify an existing listing
- messaging: User wants to send messages, contact sellers, or communicate
- purchase: User wants to buy something or complete a purchase
- profile: User wants to view or edit their profile
- admin: User wants to access admin features
- general_question: User is asking a question or needs help
- conversation: User is continuing a conversation
- unknown: Unable to determine intent

Confidence levels:
- high: Clear intent with sufficient information
- medium: Likely intent but missing some details
- low: Unclear intent or ambiguous request

Extract entities:
- price: Monetary values (e.g., "$500", "500 dollars")
- location: Geographic locations (e.g., "Auckland", "Wellington")
- category: Item categories (e.g., "vehicle", "electronics", "furniture")
- listing_id: Specific listing identifiers
- username: User profile names
- vehicle_make: Car brands (Toyota, BMW, etc.)
- vehicle_model: Car models
- year: Year values (e.g., "2020", "2015")

Return ONLY the function call, no other text.`;

const INTENT_FUNCTION = {
  name: "classify_intent",
  description: "Classify the user's intent and extract entities",
  parameters: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["navigation", "marketplace_search", "listing_create", "listing_edit", "messaging", "purchase", "profile", "admin", "general_question", "conversation", "unknown"],
        description: "The primary intent of the user's request",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Confidence level of the intent classification",
      },
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description: "Entity type (price, location, category, listing_id, username, vehicle_make, vehicle_model, year, etc.)",
            },
            value: {
              type: "string",
              description: "The extracted entity value",
            },
            confidence: {
              type: "number",
              description: "Confidence score for this entity (0-1)",
            },
          },
          required: ["type", "value"],
        },
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of why this intent was chosen",
      },
      clarificationQuestion: {
        type: "string",
        description: "If confidence is low, a question to ask the user to clarify their intent",
      },
    },
    required: ["intent", "confidence", "entities", "reasoning"],
  },
};

/**
 * Classify intent using OpenAI function calling
 */
export async function classifyIntentWithOpenAI(
  message: string,
  context: AwhinaIntentContext = {}
): Promise<AwhinaIntentResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // Build context-aware prompt
  let contextPrompt = "";
  if (context.pathname) {
    contextPrompt += `\nCurrent page: ${context.pathname}`;
  }
  if (context.isAdmin) {
    contextPrompt += "\nUser has admin access";
  }
  if (context.listingContext && Object.keys(context.listingContext).length > 0) {
    contextPrompt += "\nUser has an active listing draft";
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: INTENT_CLASSIFICATION_SYSTEM,
        },
        {
          role: "user",
          content: `Classify this user request:${contextPrompt}\n\nUser message: "${message}"`,
        },
      ],
      functions: [INTENT_FUNCTION],
      function_call: { name: "classify_intent" },
      temperature: 0.1, // Low temperature for consistent classification
      max_tokens: 500,
    });

    const functionCall = response.choices[0]?.message?.function_call;
    if (!functionCall || !functionCall.arguments) {
      throw new Error("No function call returned from OpenAI");
    }

    const result = JSON.parse(functionCall.arguments) as AwhinaIntentResult;
    
    // Validate and sanitize result
    return {
      intent: result.intent || "unknown",
      confidence: result.confidence || "low",
      entities: Array.isArray(result.entities) ? result.entities : [],
      reasoning: result.reasoning,
      clarificationQuestion: result.clarificationQuestion,
    };
  } catch (error) {
    console.error("Intent classification failed:", error);
    // Fallback to basic classification
    return {
      intent: "unknown",
      confidence: "low",
      entities: [],
      reasoning: "AI classification failed, using fallback",
    };
  }
}

/**
 * Batch classify multiple messages (for conversation analysis)
 */
export async function classifyIntentsBatch(
  messages: string[],
  context: AwhinaIntentContext = {}
): Promise<AwhinaIntentResult[]> {
  return Promise.all(
    messages.map((msg) => classifyIntentWithOpenAI(msg, context))
  );
}
