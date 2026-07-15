/**
 * Āwhina Conversation Memory - GPT-Style Architecture
 * 
 * Short-term conversation memory for follow-up refinements.
 * Enables context-aware conversations like:
 * - "Show BMWs" → "Under $15k" → "Only Auckland"
 * - "How much is my car worth?" → "It's a 2015 Toyota" → [refined answer]
 */

import {
  AwhinaConversationTurn,
  AwhinaConversationContext,
  AwhinaIntent,
  AwhinaEntity,
  AwhinaEntityType,
  AwhinaToolCall,
} from "./awhina-types";

export type ConversationTurn = AwhinaConversationTurn;

export type ConversationContext = AwhinaConversationContext & {
  startedAt: number;
  lastActivity: number;
};

export type MemoryConfig = {
  maxTurns: number;
  maxAgeMs: number;
  maxEntities: number;
};

const DEFAULT_CONFIG: MemoryConfig = {
  maxTurns: 20,
  maxAgeMs: 30 * 60 * 1000, // 30 minutes
  maxEntities: 50,
};

/**
 * Conversation memory manager
 */
export class ConversationMemory {
  private context: ConversationContext;
  private config: MemoryConfig;

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = {
      currentPath: "/",
      hasListingContext: false,
      isAdmin: false,
      conversationHistory: [],
      startedAt: Date.now(),
      lastActivity: Date.now(),
    };
  }

  /**
   * Add a user turn to memory
   */
  addUserTurn(content: string, intent?: AwhinaIntent, entities?: Record<string, string>): void {
    this.pruneOldTurns();
    
    this.context.conversationHistory.push({
      role: "user",
      content,
      timestamp: Date.now(),
      intent,
      entities: entities ? Object.entries(entities).map(([type, value]) => ({ type: type as AwhinaEntityType, value })) : undefined,
    });

    // Merge entities
    if (entities && this.context.entities) {
      this.mergeEntities(entities);
    }

    this.context.lastActivity = Date.now();
  }

  /**
   * Add an assistant turn to memory
   */
  addAssistantTurn(content: string, toolCall?: AwhinaToolCall): void {
    this.pruneOldTurns();
    
    this.context.conversationHistory.push({
      role: "assistant",
      content,
      timestamp: Date.now(),
      toolCall,
    });

    if (toolCall) {
      this.context.lastToolCall = toolCall;
    }

    this.context.lastActivity = Date.now();
  }

  /**
   * Get recent conversation history for AI context
   */
  getRecentHistory(limit: number = 10): ConversationTurn[] {
    return this.context.conversationHistory.slice(-limit);
  }

  /**
   * Get accumulated entities from conversation
   */
  getEntities(): Record<string, string> {
    return this.context.entities ? { ...this.context.entities } : {};
  }

  /**
   * Get a specific entity value
   */
  getEntity(key: string): string | undefined {
    return this.context.entities?.[key];
  }

  /**
   * Update or set an entity
   */
  setEntity(key: string, value: string): void {
    if (!this.context.entities) {
      this.context.entities = {};
    }
    this.context.entities[key] = value;
    
    // Limit number of entities
    const keys = Object.keys(this.context.entities);
    if (keys.length > this.config.maxEntities) {
      // Remove oldest entities (first added)
      const keysToRemove = keys.slice(0, keys.length - this.config.maxEntities);
      keysToRemove.forEach(k => delete this.context.entities![k]);
    }
  }

  /**
   * Clear specific entities
   */
  clearEntities(...keys: string[]): void {
    if (this.context.entities) {
      keys.forEach(key => delete this.context.entities![key]);
    }
  }

  /**
   * Clear all entities
   */
  clearAllEntities(): void {
    this.context.entities = {};
  }

  /**
   * Get current intent
   */
  getCurrentIntent(): string | undefined {
    return this.context.currentIntent;
  }

  /**
   * Set current intent
   */
  setCurrentIntent(intent: AwhinaIntent): void {
    this.context.currentIntent = intent;
  }

  /**
   * Get last tool call
   */
  getLastToolCall(): { tool: string; args: Record<string, unknown> } | undefined {
    return this.context.lastToolCall;
  }

  /**
   * Check if conversation is stale (too old)
   */
  isStale(): boolean {
    const age = Date.now() - this.context.lastActivity;
    return age > this.config.maxAgeMs;
  }

  /**
   * Reset conversation memory
   */
  reset(): void {
    this.context = {
      currentPath: "/",
      hasListingContext: false,
      isAdmin: false,
      conversationHistory: [],
      startedAt: Date.now(),
      lastActivity: Date.now(),
    };
  }

  /**
   * Get conversation age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.context.startedAt;
  }

  /**
   * Get number of turns
   */
  getTurnCount(): number {
    return this.context.conversationHistory.length;
  }

  /**
   * Export context for persistence
   */
  export(): ConversationContext {
    return JSON.parse(JSON.stringify(this.context));
  }

  /**
   * Import context from persistence
   */
  import(context: ConversationContext): void {
    this.context = JSON.parse(JSON.stringify(context));
  }

  /**
   * Merge entities from a turn into accumulated entities
   */
  private mergeEntities(newEntities: Record<string, string>): void {
    if (!this.context.entities) {
      this.context.entities = {};
    }
    // New entities override old ones (most recent wins)
    Object.assign(this.context.entities, newEntities);
    
    // Limit number of entities
    const keys = Object.keys(this.context.entities);
    if (keys.length > this.config.maxEntities) {
      // Keep most recent entities (last added wins)
      const keysToRemove = keys.slice(0, keys.length - this.config.maxEntities);
      keysToRemove.forEach(k => delete this.context.entities![k]);
    }
  }

  /**
   * Remove old turns to prevent memory bloat
   */
  private pruneOldTurns(): void {
    const now = Date.now();
    
    // Remove turns older than max age
    this.context.conversationHistory = this.context.conversationHistory.filter(
      turn => now - turn.timestamp < this.config.maxAgeMs
    );

    // Limit total number of turns
    if (this.context.conversationHistory.length > this.config.maxTurns) {
      this.context.conversationHistory = this.context.conversationHistory.slice(-this.config.maxTurns);
    }
  }

  /**
   * Get context summary for AI (compact representation)
   */
  getContextSummary(): string {
    const parts: string[] = [];

    if (this.context.entities && Object.keys(this.context.entities).length > 0) {
      const entityStr = Object.entries(this.context.entities)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      parts.push(`Entities: ${entityStr}`);
    }

    if (this.context.currentIntent) {
      parts.push(`Current intent: ${this.context.currentIntent}`);
    }

    if (this.context.lastToolCall) {
      parts.push(`Last action: ${this.context.lastToolCall.tool}`);
    }

    return parts.length > 0 ? parts.join(". ") : "No active context";
  }
}

/**
 * Global conversation memory instance (for single-session use)
 */
let globalMemory: ConversationMemory | null = null;

export function getGlobalMemory(): ConversationMemory {
  if (!globalMemory) {
    globalMemory = new ConversationMemory();
  }
  return globalMemory;
}

export function resetGlobalMemory(): void {
  if (globalMemory) {
    globalMemory.reset();
  }
}

/**
 * Utility functions for entity extraction
 */
export function extractEntitiesFromMessage(message: string): Record<string, string> {
  const entities: Record<string, string> = {};

  // Price extraction
  const priceMatch = message.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (priceMatch) {
    entities.price = priceMatch[1].replace(/,/g, "");
  }

  // Location extraction
  const locations = ["auckland", "wellington", "christchurch", "hamilton", "tauranga", "dunedin"];
  for (const loc of locations) {
    if (message.toLowerCase().includes(loc)) {
      entities.location = loc;
      break;
    }
  }

  // Category extraction
  const categories = ["vehicle", "car", "phone", "laptop", "furniture", "clothing", "electronics"];
  for (const cat of categories) {
    if (message.toLowerCase().includes(cat)) {
      entities.category = cat;
      break;
    }
  }

  // Vehicle make extraction
  const makes = ["toyota", "honda", "mazda", "bmw", "ford", "nissan", "subaru"];
  for (const make of makes) {
    if (message.toLowerCase().includes(make)) {
      entities.vehicleMake = make;
      break;
    }
  }

  return entities;
}

/**
 * Check if message is a follow-up refinement
 * (e.g., "under $15k" after "show BMWs")
 */
export function isFollowUpRefinement(message: string, memory: ConversationMemory): boolean {
  const lower = message.toLowerCase();
  
  // Price refinements
  if (/under|below|less than|max|over|above|more than|min/i.test(lower)) {
    const lastIntent = memory.getCurrentIntent();
    if (lastIntent === "marketplace_search" || lastIntent === "listing_create") {
      return true;
    }
  }

  // Location refinements
  if (/only|just|filter|show only/i.test(lower)) {
    const hasLocation = locations.includes(lower);
    if (hasLocation && memory.getCurrentIntent() === "marketplace_search") {
      return true;
    }
  }

  // Short messages (likely refinements)
  if (message.split(/\s+/).length <= 3 && memory.getTurnCount() > 0) {
    return true;
  }

  return false;
}

const locations = ["auckland", "wellington", "christchurch", "hamilton", "tauranga", "dunedin"];
