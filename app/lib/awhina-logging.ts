/**
 * Āwhina Developer Logging - GPT-Style Architecture
 * 
 * Create developer logging for every request.
 * Includes: transcript, intent, entities, tool, execution time, confidence, success/failure.
 */

import {
  AwhinaIntentResult,
  AwhinaToolCall,
  AwhinaToolResult,
  AwhinaConfidenceEvaluation,
} from "./awhina-types";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type AwhinaLogEntry = {
  timestamp: number;
  requestId: string;
  level: LogLevel;
  transcript: string;
  intent: {
    classified: string;
    confidence: string;
    entities: Record<string, string>;
    reasoning?: string;
  };
  tool?: {
    name: string;
    args: Record<string, unknown>;
    executionTime?: number;
    success?: boolean;
    error?: string;
  };
  confidence?: {
    level: string;
    score: number;
    reasoning: string;
    clarificationQuestion?: string;
  };
  context: {
    pathname?: string;
    isAdmin?: boolean;
    hasConversationHistory: boolean;
    hasListingContext: boolean;
  };
  performance: {
    totalExecutionTime: number;
    intentClassificationTime?: number;
    aiProcessingTime?: number;
    toolExecutionTime?: number;
  };
  metadata: {
    uid?: string;
    source: "voice" | "text" | "hybrid";
    localExecution: boolean;
    cached: boolean;
  };
};

/**
 * Logger for Āwhina requests
 */
export class AwhinaLogger {
  private logs: AwhinaLogEntry[] = [];
  private maxLogs = 1000;
  private enableConsoleLogging = process.env.NODE_ENV === "development";

  /**
   * Log a complete request
   */
  logRequest(entry: AwhinaLogEntry): void {
    this.logs.push(entry);
    
    // Keep log size bounded
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console logging in development
    if (this.enableConsoleLogging) {
      this.logToConsole(entry);
    }

    // TODO: Send to external logging service (Sentry, Firestore, etc.)
    this.persistLog(entry);
  }

  /**
   * Get recent logs
   */
  getRecentLogs(limit: number = 50): AwhinaLogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel, limit: number = 50): AwhinaLogEntry[] {
    return this.logs
      .filter(log => log.level === level)
      .slice(-limit);
  }

  /**
   * Get logs by intent
   */
  getLogsByIntent(intent: string, limit: number = 50): AwhinaLogEntry[] {
    return this.logs
      .filter(log => log.intent.classified === intent)
      .slice(-limit);
  }

  /**
   * Get logs by tool
   */
  getLogsByTool(toolName: string, limit: number = 50): AwhinaLogEntry[] {
    return this.logs
      .filter(log => log.tool?.name === toolName)
      .slice(-limit);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    avgExecutionTime: number;
    avgIntentTime: number;
    avgAITime: number;
    avgToolTime: number;
    successRate: number;
    totalRequests: number;
    localExecutionRate: number;
  } {
    const recentLogs = this.logs.slice(-100);
    if (recentLogs.length === 0) {
      return {
        avgExecutionTime: 0,
        avgIntentTime: 0,
        avgAITime: 0,
        avgToolTime: 0,
        successRate: 0,
        totalRequests: 0,
        localExecutionRate: 0,
      };
    }

    const totalExecutionTime = recentLogs.reduce((sum, log) => sum + log.performance.totalExecutionTime, 0);
    const totalIntentTime = recentLogs.reduce((sum, log) => sum + (log.performance.intentClassificationTime || 0), 0);
    const totalAITime = recentLogs.reduce((sum, log) => sum + (log.performance.aiProcessingTime || 0), 0);
    const totalToolTime = recentLogs.reduce((sum, log) => sum + (log.performance.toolExecutionTime || 0), 0);
    const successfulRequests = recentLogs.filter(log => log.tool?.success !== false).length;
    const localExecutionRequests = recentLogs.filter(log => log.metadata.localExecution).length;

    return {
      avgExecutionTime: totalExecutionTime / recentLogs.length,
      avgIntentTime: totalIntentTime / recentLogs.length,
      avgAITime: totalAITime / recentLogs.length,
      avgToolTime: totalToolTime / recentLogs.length,
      successRate: successfulRequests / recentLogs.length,
      totalRequests: recentLogs.length,
      localExecutionRate: localExecutionRequests / recentLogs.length,
    };
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): AwhinaLogEntry[] {
    return [...this.logs];
  }

  /**
   * Log to console in development
   */
  private logToConsole(entry: AwhinaLogEntry): void {
    const prefix = `[Awhina ${entry.level.toUpperCase()}]`;
    const timestamp = new Date(entry.timestamp).toISOString();
    
    console.log(prefix, timestamp, {
      transcript: entry.transcript,
      intent: entry.intent.classified,
      confidence: entry.intent.confidence,
      tool: entry.tool?.name,
      executionTime: entry.performance.totalExecutionTime,
      success: entry.tool?.success,
    });
  }

  /**
   * Persist log to external service
   */
  private persistLog(entry: AwhinaLogEntry): void {
    // TODO: Implement persistence to Firestore, Sentry, or other logging service
    // For now, this is a placeholder
    if (entry.level === "error") {
      // Send errors to error tracking service
      console.error("[Awhina Error]", entry);
    }
  }
}

/**
 * Global logger instance
 */
const globalLogger = new AwhinaLogger();

export function getAwhinaLogger(): AwhinaLogger {
  return globalLogger;
}

/**
 * Create a log entry from request components
 */
export function createLogEntry(params: {
  requestId: string;
  transcript: string;
  intentResult: AwhinaIntentResult;
  toolCall?: AwhinaToolCall;
  toolResult?: AwhinaToolResult;
  confidenceEvaluation?: AwhinaConfidenceEvaluation;
  context: {
    pathname?: string;
    isAdmin?: boolean;
    hasConversationHistory: boolean;
    hasListingContext: boolean;
  };
  performance: {
    totalExecutionTime: number;
    intentClassificationTime?: number;
    aiProcessingTime?: number;
    toolExecutionTime?: number;
  };
  metadata: {
    uid?: string;
    source: "voice" | "text" | "hybrid";
    localExecution: boolean;
    cached: boolean;
  };
}): AwhinaLogEntry {
  const level: LogLevel = params.toolResult?.error ? "error" : 
                      params.toolResult?.success === false ? "warn" : "info";

  return {
    timestamp: Date.now(),
    requestId: params.requestId,
    level,
    transcript: params.transcript,
    intent: {
      classified: params.intentResult.intent,
      confidence: params.intentResult.confidence,
      entities: params.intentResult.entities.reduce((acc, e) => {
        acc[e.type] = e.value;
        return acc;
      }, {} as Record<string, string>),
      reasoning: params.intentResult.reasoning,
    },
    tool: params.toolCall ? {
      name: params.toolCall.tool,
      args: params.toolCall.args,
      executionTime: params.toolResult?.executionTime,
      success: params.toolResult?.success,
      error: params.toolResult?.error,
    } : undefined,
    confidence: params.confidenceEvaluation ? {
      level: params.confidenceEvaluation.level || "medium",
      score: params.confidenceEvaluation.score,
      reasoning: params.confidenceEvaluation.reasoning,
      clarificationQuestion: params.confidenceEvaluation.clarificationQuestion,
    } : undefined,
    context: params.context,
    performance: params.performance,
    metadata: params.metadata,
  };
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `awhina-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Performance timer utility
 */
export class PerformanceTimer {
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Record a checkpoint
   */
  checkpoint(name: string): number {
    const now = Date.now();
    const elapsed = now - this.startTime;
    this.checkpoints.set(name, elapsed);
    return elapsed;
  }

  /**
   * Get elapsed time since start
   */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get elapsed time since checkpoint
   */
  getElapsedSince(checkpoint: string): number | undefined {
    const checkpointTime = this.checkpoints.get(checkpoint);
    if (!checkpointTime) return undefined;
    return Date.now() - this.startTime - checkpointTime;
  }

  /**
   * Get all checkpoints
   */
  getCheckpoints(): Record<string, number> {
    return Object.fromEntries(this.checkpoints);
  }
}

/**
 * Log a complete request with performance tracking
 */
export function logCompleteRequest(params: {
  transcript: string;
  intentResult: AwhinaIntentResult;
  toolCall?: AwhinaToolCall;
  toolResult?: AwhinaToolResult;
  confidenceEvaluation?: AwhinaConfidenceEvaluation;
  context: {
    pathname?: string;
    isAdmin?: boolean;
    hasConversationHistory: boolean;
    hasListingContext: boolean;
  };
  timer: PerformanceTimer;
  metadata: {
    uid?: string;
    source: "voice" | "text" | "hybrid";
    localExecution: boolean;
    cached: boolean;
  };
}): void {
  const requestId = generateRequestId();
  
  const entry = createLogEntry({
    requestId,
    transcript: params.transcript,
    intentResult: params.intentResult,
    toolCall: params.toolCall,
    toolResult: params.toolResult,
    confidenceEvaluation: params.confidenceEvaluation,
    context: params.context,
    performance: {
      totalExecutionTime: params.timer.getElapsed(),
      intentClassificationTime: params.timer.getElapsedSince("intent"),
      aiProcessingTime: params.timer.getElapsedSince("ai"),
      toolExecutionTime: params.timer.getElapsedSince("tool"),
    },
    metadata: params.metadata,
  });

  getAwhinaLogger().logRequest(entry);
}
