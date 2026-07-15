/**
 * Āwhina Performance Optimization - GPT-Style Architecture
 * 
 * Optimize performance through:
 * - Local execution for common commands
 * - Cached context and results
 * - Deterministic routing
 * - Request deduplication
 */

import { tryLocalExecutionCached, clearCommandCache } from "./awhina-local-execution";
import { ConversationMemory, getGlobalMemory } from "./awhina-conversation-memory";
import {
  AwhinaIntentResult,
  AwhinaToolCall,
  AwhinaToolResult,
  AwhinaConfidenceEvaluation,
} from "./awhina-types";
import { generateRequestId, PerformanceTimer, logCompleteRequest } from "./awhina-logging";

export type CacheEntry = {
  result: AwhinaIntentResult | AwhinaToolCall;
  timestamp: number;
  hits: number;
};

export type PerformanceConfig = {
  enableLocalExecution: boolean;
  enableCaching: boolean;
  cacheTtlMs: number;
  maxCacheSize: number;
  enableDeduplication: boolean;
  deduplicationWindowMs: number;
};

const DEFAULT_CONFIG: PerformanceConfig = {
  enableLocalExecution: true,
  enableCaching: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  maxCacheSize: 100,
  enableDeduplication: true,
  deduplicationWindowMs: 2000, // 2 seconds
};

/**
 * Performance optimizer for Āwhina requests
 */
export class AwhinaPerformanceOptimizer {
  private config: PerformanceConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private recentRequests: Map<string, number> = new Map();
  private memory: ConversationMemory;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memory = getGlobalMemory();
    
    // Periodic cleanup
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Process a request with performance optimizations
   */
  async processRequest(params: {
    message: string;
    context: {
      pathname?: string;
      isAdmin?: boolean;
      hasConversationHistory: boolean;
      hasListingContext: boolean;
    };
    metadata: {
      uid?: string;
      source: "voice" | "text" | "hybrid";
    };
  }): Promise<{
    result: AwhinaIntentResult | AwhinaToolCall | null;
    source: "local" | "cache" | "ai";
    cached: boolean;
    executionTime: number;
  }> {
    const timer = new PerformanceTimer();
    timer.checkpoint("start");

    const { message, context, metadata } = params;

    // Step 1: Check for duplicate requests
    if (this.config.enableDeduplication) {
      const dedupResult = this.checkDeduplication(message);
      if (dedupResult) {
        timer.checkpoint("deduplication");
        return {
          result: dedupResult,
          source: "cache",
          cached: true,
          executionTime: timer.getElapsed(),
        };
      }
    }

    // Step 2: Try local execution
    if (this.config.enableLocalExecution) {
      const localResult = tryLocalExecutionCached(message, context.pathname || "/");
      if (localResult.handled && localResult.toolCall) {
        timer.checkpoint("local");
        this.recordRequest(message);
        
        // Log the local execution
        logCompleteRequest({
          transcript: message,
          intentResult: {
            intent: "navigation",
            confidence: "high",
            entities: [],
            reasoning: "Local command execution",
          },
          toolCall: localResult.toolCall,
          context,
          timer,
          metadata: {
            ...metadata,
            localExecution: true,
            cached: false,
          },
        });

        return {
          result: localResult.toolCall,
          source: "local",
          cached: false,
          executionTime: timer.getElapsed(),
        };
      }
    }

    // Step 3: Check cache
    if (this.config.enableCaching) {
      const cacheResult = this.checkCache(message);
      if (cacheResult) {
        timer.checkpoint("cache");
        this.recordRequest(message);
        
        return {
          result: cacheResult,
          source: "cache",
          cached: true,
          executionTime: timer.getElapsed(),
        };
      }
    }

    // Step 4: No optimization hit - return null to trigger AI processing
    this.recordRequest(message);
    timer.checkpoint("optimization");

    return {
      result: null,
      source: "ai",
      cached: false,
      executionTime: timer.getElapsed(),
    };
  }

  /**
   * Cache a result
   */
  cacheResult(key: string, result: AwhinaIntentResult | AwhinaToolCall): void {
    if (!this.config.enableCaching) return;

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      hits: 0,
    });

    // Limit cache size
    if (this.cache.size > this.config.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Check cache for a result
   */
  private checkCache(key: string): AwhinaIntentResult | AwhinaToolCall | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.config.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.result;
  }

  /**
   * Check for duplicate requests within deduplication window
   */
  private checkDeduplication(message: string): AwhinaIntentResult | AwhinaToolCall | null {
    const normalized = message.toLowerCase().trim();
    const now = Date.now();

    for (const [key, timestamp] of this.recentRequests.entries()) {
      if (now - timestamp < this.config.deduplicationWindowMs) {
        const cached = this.checkCache(key);
        if (cached) {
          return cached;
        }
      }
    }

    return null;
  }

  /**
   * Record a request for deduplication
   */
  private recordRequest(message: string): void {
    const normalized = message.toLowerCase().trim();
    this.recentRequests.set(normalized, Date.now());

    // Clean up old requests
    const now = Date.now();
    for (const [key, timestamp] of this.recentRequests.entries()) {
      if (now - timestamp > this.config.deduplicationWindowMs) {
        this.recentRequests.delete(key);
      }
    }
  }

  /**
   * Periodic cleanup of expired cache entries
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheTtlMs) {
        this.cache.delete(key);
      }
    }

    // Clean up old deduplication records
    for (const [key, timestamp] of this.recentRequests.entries()) {
      if (now - timestamp > this.config.deduplicationWindowMs) {
        this.recentRequests.delete(key);
      }
    }
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.cache.clear();
    this.recentRequests.clear();
    clearCommandCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    totalHits: number;
    recentRequests: number;
  } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }

    return {
      size: this.cache.size,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
      totalHits,
      recentRequests: this.recentRequests.size,
    };
  }

  /**
   * Get conversation memory for context
   */
  getConversationMemory(): ConversationMemory {
    return this.memory;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Global performance optimizer instance
 */
let globalOptimizer: AwhinaPerformanceOptimizer | null = null;

export function getPerformanceOptimizer(): AwhinaPerformanceOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = new AwhinaPerformanceOptimizer();
  }
  return globalOptimizer;
}

/**
 * Reset global optimizer
 */
export function resetPerformanceOptimizer(): void {
  if (globalOptimizer) {
    globalOptimizer.clearCaches();
  }
  globalOptimizer = null;
}

/**
 * Generate cache key from message and context
 */
export function generateCacheKey(
  message: string,
  context: { pathname?: string; hasListingContext?: boolean }
): string {
  const normalized = message.toLowerCase().trim();
  const contextStr = `${context.pathname || ""}|${context.hasListingContext ? "listing" : ""}`;
  return `${contextStr}:${normalized}`;
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    const values = this.metrics.get(name)!;
    values.push(value);

    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }
  }

  getMetricStats(name: string): { avg: number; min: number; max: number; count: number } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  }

  getAllStats(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const stats: Record<string, { avg: number; min: number; max: number; count: number }> = {};

    for (const [name] of this.metrics.entries()) {
      const metricStats = this.getMetricStats(name);
      if (metricStats) {
        stats[name] = metricStats;
      }
    }

    return stats;
  }

  clear(): void {
    this.metrics.clear();
  }
}

/**
 * Global performance monitor instance
 */
let globalMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

/**
 * Optimize context for AI requests
 * Reduces prompt size by using cached and summarized context
 */
export function optimizeContextForAI(context: {
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  listingContext?: Record<string, unknown>;
}): {
  optimizedHistory: Array<{ role: "user" | "assistant"; content: string }>;
  optimizedListingContext: Record<string, unknown> | null;
  savedTokens: number;
} {
  let savedTokens = 0;

  // Optimize conversation history
  let optimizedHistory = context.conversationHistory || [];
  if (optimizedHistory.length > 10) {
    savedTokens += (optimizedHistory.length - 10) * 100; // Approximate token savings
    optimizedHistory = optimizedHistory.slice(-10);
  }

  // Optimize listing context
  let optimizedListingContext: Record<string, unknown> | null = null;
  if (context.listingContext) {
    // Only include non-empty fields
    optimizedListingContext = {};
    for (const [key, value] of Object.entries(context.listingContext)) {
      if (value !== null && value !== undefined && value !== "") {
        optimizedListingContext[key] = value;
      } else {
        savedTokens += 10; // Approximate token savings per field
      }
    }

    if (Object.keys(optimizedListingContext).length === 0) {
      optimizedListingContext = null;
    }
  }

  return {
    optimizedHistory,
    optimizedListingContext,
    savedTokens,
  };
}
