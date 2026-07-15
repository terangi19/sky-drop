/**
 * Āwhina Intent Router - GPT-Style Architecture
 * 
 * Replaces regex-based intent detection with AI-powered classification.
 * Every request is classified into an intent with confidence score and entities.
 */

export type AwhinaIntent =
  | "navigation"
  | "marketplace_search"
  | "listing_create"
  | "listing_edit"
  | "messaging"
  | "purchase"
  | "profile"
  | "admin"
  | "general_question"
  | "conversation"
  | "unknown";

export type AwhinaConfidence = "high" | "medium" | "low";

export type AwhinaEntity = {
  type: string;
  value: string;
  confidence?: number;
};

export type AwhinaIntentResult = {
  intent: AwhinaIntent;
  confidence: AwhinaConfidence;
  entities: AwhinaEntity[];
  reasoning?: string;
  clarificationQuestion?: string;
};

export type AwhinaIntentContext = {
  pathname?: string;
  isAdmin?: boolean;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  listingContext?: Record<string, unknown>;
};

/**
 * Intent classification using AI (OpenAI function calling)
 * Returns structured intent with confidence and entities
 */
export async function classifyIntent(
  message: string,
  context: AwhinaIntentContext = {}
): Promise<AwhinaIntentResult> {
  // Phase 2: Start with hybrid approach - local fast path + AI fallback
  // This preserves backwards compatibility while enabling AI classification
  
  const trimmed = message.trim();
  if (!trimmed) {
    return {
      intent: "unknown",
      confidence: "low",
      entities: [],
      reasoning: "Empty message",
    };
  }

  // Fast path for common navigation commands (preserves existing local execution)
  const localResult = classifyIntentLocal(trimmed, context);
  if (localResult.confidence === "high") {
    return localResult;
  }

  // AI classification for complex queries
  return await classifyIntentWithAI(trimmed, context);
}

/**
 * Local intent classification for common commands
 * Fast, deterministic, no AI call needed
 */
function classifyIntentLocal(
  message: string,
  context: AwhinaIntentContext
): AwhinaIntentResult {
  const lower = message.toLowerCase();
  
  // Navigation shortcuts
  const navPatterns = [
    { pattern: /^(go to|take me to|open|show|navigate)\s+(home|sell|sales|messages|profile|search|watchlist|admin)/i, intent: "navigation" as AwhinaIntent },
    { pattern: /^(home|sell|sales|messages|profile|search|watchlist|admin)$/i, intent: "navigation" as AwhinaIntent },
  ];

  for (const { pattern, intent } of navPatterns) {
    if (pattern.test(lower)) {
      return {
        intent,
        confidence: "high",
        entities: extractEntities(message, intent),
        reasoning: "Local pattern match",
      };
    }
  }

  // Search patterns
  const searchPatterns = [
    { pattern: /\b(find|search|show|looking for|want to buy|need)\b/i, intent: "marketplace_search" as AwhinaIntent },
  ];

  for (const { pattern, intent } of searchPatterns) {
    if (pattern.test(lower)) {
      return {
        intent,
        confidence: "medium",
        entities: extractEntities(message, intent),
        reasoning: "Local search pattern",
      };
    }
  }

  // Sell patterns
  const sellPatterns = [
    { pattern: /\b(sell|selling|list|post|create a listing|for sale)\b/i, intent: "listing_create" as AwhinaIntent },
  ];

  for (const { pattern, intent } of sellPatterns) {
    if (pattern.test(lower)) {
      return {
        intent,
        confidence: "medium",
        entities: extractEntities(message, intent),
        reasoning: "Local sell pattern",
      };
    }
  }

  return {
    intent: "unknown",
    confidence: "low",
    entities: [],
    reasoning: "No local pattern match",
  };
}

/**
 * AI-powered intent classification using OpenAI
 * Fallback for complex queries that local patterns can't handle
 */
async function classifyIntentWithAI(
  message: string,
  context: AwhinaIntentContext
): Promise<AwhinaIntentResult> {
  try {
    const token = await getAuthToken();
    if (!token) {
      // Fallback to local classification if not authenticated
      return {
        intent: "general_question",
        confidence: "low",
        entities: extractEntities(message, "general_question"),
        reasoning: "Not authenticated - using local fallback",
      };
    }

    const response = await fetch("/api/awhina-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        pathname: context.pathname,
        isAdmin: context.isAdmin,
        conversationHistory: context.conversationHistory,
        listingContext: context.listingContext,
      }),
    });

    if (!response.ok) {
      throw new Error(`Intent API error: ${response.status}`);
    }

    const result = await response.json();
    return result as AwhinaIntentResult;
  } catch (error) {
    console.error("AI intent classification failed:", error);
    // Fallback to local classification
    return {
      intent: "general_question",
      confidence: "low",
      entities: extractEntities(message, "general_question"),
      reasoning: "AI classification failed - using local fallback",
    };
  }
}

/**
 * Get auth token for API calls
 */
async function getAuthToken(): Promise<string | null> {
  try {
    // This is a placeholder - actual implementation depends on auth system
    // For now, return null to trigger local fallback
    if (typeof window === "undefined") return null;
    
    // Check if Firebase auth is available
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return null;
    
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Extract entities from message based on intent
 * Simple regex-based extraction for now, will be replaced with AI in Phase 4
 */
function extractEntities(message: string, intent: AwhinaIntent): AwhinaEntity[] {
  const entities: AwhinaEntity[] = [];
  
  // Price extraction
  const priceMatch = message.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (priceMatch) {
    entities.push({
      type: "price",
      value: priceMatch[1].replace(/,/g, ""),
    });
  }

  // Location extraction
  const locations = ["auckland", "wellington", "christchurch", "hamilton", "tauranga", "dunedin"];
  for (const loc of locations) {
    if (message.toLowerCase().includes(loc)) {
      entities.push({
        type: "location",
        value: loc,
      });
      break;
    }
  }

  // Category extraction
  const categories = ["vehicle", "car", "phone", "laptop", "furniture", "clothing"];
  for (const cat of categories) {
    if (message.toLowerCase().includes(cat)) {
      entities.push({
        type: "category",
        value: cat,
      });
      break;
    }
  }

  return entities;
}

/**
 * Generate clarification question for low-confidence intents
 */
export function generateClarificationQuestion(
  intent: AwhinaIntent,
  entities: AwhinaEntity[]
): string | undefined {
  if (intent === "marketplace_search" && entities.length === 0) {
    return "What are you looking for?";
  }
  
  if (intent === "listing_create" && entities.length === 0) {
    return "What would you like to sell?";
  }
  
  if (intent === "navigation") {
    return "Where would you like to go?";
  }

  return undefined;
}
