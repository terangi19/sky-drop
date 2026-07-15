/**
 * Āwhina Development Telemetry
 * 
 * Captures detailed metrics for every AI interaction to identify failure modes.
 * Only active in development mode - no user-facing impact.
 */

export type AwhinaTelemetryEvent = {
  timestamp: number;
  requestId: string;
  
  // Intent classification
  detectedIntent: string;
  confidenceScore: number;
  
  // Timing metrics
  timeToFirstResponse: number; // ms
  totalExecutionTime: number; // ms
  
  // Interaction quality
  askedClarificationQuestion: boolean;
  userRepeatedOrRephrased: boolean;
  
  // Execution metrics
  actionExecutedSuccessfully: boolean;
  respondedConversationallyInsteadOfActing: boolean;
  
  // Context
  pathname: string;
  message: string;
  hasConversationHistory: boolean;
  hasListingContext: boolean;
};

export type TelemetrySummary = {
  totalInteractions: number;
  avgConfidence: number;
  avgTimeToFirstResponse: number;
  avgTotalExecutionTime: number;
  clarificationRate: number;
  repetitionRate: number;
  successRate: number;
  conversationalInsteadOfActionRate: number;
  intentDistribution: Record<string, number>;
  commonIssues: string[];
};

class AwhinaTelemetry {
  private events: AwhinaTelemetryEvent[] = [];
  private maxEvents = 1000; // Keep last 1000 events
  private isEnabled = process.env.NODE_ENV === "development";

  recordEvent(event: AwhinaTelemetryEvent): void {
    if (!this.isEnabled) return;

    this.events.push(event);
    
    // Keep log size bounded
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Log to console in development
    console.log("[AWHINA_TELEMETRY]", JSON.stringify(event, null, 2));
  }

  getRecentEvents(limit: number = 50): AwhinaTelemetryEvent[] {
    return this.events.slice(-limit);
  }

  getSummary(): TelemetrySummary {
    if (this.events.length === 0) {
      return {
        totalInteractions: 0,
        avgConfidence: 0,
        avgTimeToFirstResponse: 0,
        avgTotalExecutionTime: 0,
        clarificationRate: 0,
        repetitionRate: 0,
        successRate: 0,
        conversationalInsteadOfActionRate: 0,
        intentDistribution: {},
        commonIssues: [],
      };
    }

    const total = this.events.length;
    const avgConfidence = this.events.reduce((sum, e) => sum + e.confidenceScore, 0) / total;
    const avgTimeToFirstResponse = this.events.reduce((sum, e) => sum + e.timeToFirstResponse, 0) / total;
    const avgTotalExecutionTime = this.events.reduce((sum, e) => sum + e.totalExecutionTime, 0) / total;
    const clarificationRate = this.events.filter(e => e.askedClarificationQuestion).length / total;
    const repetitionRate = this.events.filter(e => e.userRepeatedOrRephrased).length / total;
    const successRate = this.events.filter(e => e.actionExecutedSuccessfully).length / total;
    const conversationalRate = this.events.filter(e => e.respondedConversationallyInsteadOfActing).length / total;

    // Intent distribution
    const intentDistribution: Record<string, number> = {};
    this.events.forEach(e => {
      intentDistribution[e.detectedIntent] = (intentDistribution[e.detectedIntent] || 0) + 1;
    });

    // Identify common issues
    const commonIssues: string[] = [];
    if (clarificationRate > 0.3) commonIssues.push("High clarification rate (30%+)");
    if (repetitionRate > 0.2) commonIssues.push("High repetition rate (20%+)");
    if (successRate < 0.8) commonIssues.push("Low success rate (<80%)");
    if (conversationalRate > 0.3) commonIssues.push("High conversational vs action rate (30%+)");
    if (avgTimeToFirstResponse > 2000) commonIssues.push("Slow first response (>2s)");
    if (avgConfidence < 0.7) commonIssues.push("Low confidence (<70%)");

    return {
      totalInteractions: total,
      avgConfidence,
      avgTimeToFirstResponse,
      avgTotalExecutionTime,
      clarificationRate,
      repetitionRate,
      successRate,
      conversationalInsteadOfActionRate: conversationalRate,
      intentDistribution,
      commonIssues,
    };
  }

  clear(): void {
    this.events = [];
  }

  exportEvents(): AwhinaTelemetryEvent[] {
    return [...this.events];
  }
}

// Global telemetry instance
const globalTelemetry = new AwhinaTelemetry();

export function getAwhinaTelemetry(): AwhinaTelemetry {
  return globalTelemetry;
}

export function generateTelemetryRequestId(): string {
  return `telemetry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
