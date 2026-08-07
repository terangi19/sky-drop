/**
 * Standardized Āwhina confidence across voice / search / listing / vision / profile / free-form.
 * Destructive actions always require explicit confirmation.
 */

import type { AwhinaToolCall, AwhinaToolName } from "./awhina-types";
import { isStateChangingTool } from "./awhina-tool-registry";

export type AwhinaConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
} as const;

/** Tools that permanently alter accounts, listings, or admin state. */
const DESTRUCTIVE_TOOLS = new Set<AwhinaToolName>([
  "adminAction",
  "editListing",
  "confirmAction",
]);

export function scoreToConfidenceLevel(score: number): AwhinaConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) return "HIGH";
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return "MEDIUM";
  return "LOW";
}

export function confidenceLevelToScore(level: AwhinaConfidenceLevel): number {
  switch (level) {
    case "HIGH":
      return 0.9;
    case "MEDIUM":
      return 0.65;
    case "LOW":
      return 0.35;
  }
}

export function normalizeConfidenceLevel(
  raw: string | number | undefined | null
): AwhinaConfidenceLevel {
  if (typeof raw === "number") return scoreToConfidenceLevel(raw);
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (s === "HIGH" || s === "H") return "HIGH";
  if (s === "MEDIUM" || s === "MED" || s === "M") return "MEDIUM";
  if (s === "LOW" || s === "L") return "LOW";
  // legacy lowercase from voice / intent routers
  const lower = String(raw || "").toLowerCase();
  if (lower === "high") return "HIGH";
  if (lower === "medium") return "MEDIUM";
  if (lower === "low") return "LOW";
  return "LOW";
}

export function isDestructiveTool(toolCall: Pick<AwhinaToolCall, "tool">): boolean {
  return DESTRUCTIVE_TOOLS.has(toolCall.tool);
}

/**
 * Gate execution by confidence.
 * - LOW → never auto-execute state-changing
 * - MEDIUM → allow read-only / soft updates; clarify for state-changing
 * - HIGH → allow (destructive still needs confirmation)
 */
export type ConfidenceGate = {
  shouldExecute: boolean;
  needsConfirmation: boolean;
  needsClarification: boolean;
  level: AwhinaConfidenceLevel;
  reason: string;
};

export function gateByConfidence(
  toolCall: AwhinaToolCall,
  level: AwhinaConfidenceLevel
): ConfidenceGate {
  if (isDestructiveTool(toolCall)) {
    return {
      shouldExecute: false,
      needsConfirmation: true,
      needsClarification: false,
      level,
      reason: "Destructive action always requires confirmation",
    };
  }

  if (level === "HIGH") {
    return {
      shouldExecute: true,
      needsConfirmation: false,
      needsClarification: false,
      level,
      reason: "High confidence",
    };
  }

  if (level === "MEDIUM") {
    if (isStateChangingTool(toolCall)) {
      return {
        shouldExecute: false,
        needsConfirmation: false,
        needsClarification: true,
        level,
        reason: "Medium confidence on state-changing action — clarify",
      };
    }
    return {
      shouldExecute: true,
      needsConfirmation: false,
      needsClarification: false,
      level,
      reason: "Medium confidence read-only ok",
    };
  }

  // LOW
  return {
    shouldExecute: false,
    needsConfirmation: false,
    needsClarification: true,
    level,
    reason: "Low confidence — ask one clarification",
  };
}

/** Keep only fields at or above minLevel (omit LOW by default for vision). */
export function keepConfidentFields<T extends Record<string, { confidence: AwhinaConfidenceLevel }>>(
  fields: T,
  minLevel: AwhinaConfidenceLevel = "MEDIUM"
): Partial<T> {
  const minScore = confidenceLevelToScore(minLevel);
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!v || typeof v !== "object") continue;
    const score = confidenceLevelToScore(normalizeConfidenceLevel(v.confidence));
    if (score >= minScore) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}
