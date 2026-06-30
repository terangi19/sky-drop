/**
 * Voice command resolver — two-pipeline architecture:
 *
 * Pipeline 1 — Local Command Engine (highest priority)
 *   Handles navigation, search, UI actions, common marketplace commands.
 *   Runs entirely on the client. Returns instantly.
 *
 * Pipeline 2 — AI Conversation Engine
 *   Only used when the local engine determines the query is conversational.
 *   Examples: "How much is my BMW worth?", "Write a listing description."
 */

import { dispatchListingFill, type SkyAiListingFill } from "./sky-ai-listing-fill";
import { matchLocalCommand, resolveLocalCommand, type LocalCommandAction } from "./local-command-engine";

export type VoiceConfidence = "high" | "medium" | "low";

export type VoiceCommandAction = {
  type: "navigate" | "search" | "listing" | "chat" | "reply" | "page" | "resume" | "voice_off";
  status: string;
  confidence: VoiceConfidence;
  heard: string;
  targetTitle?: string;
  path?: string;
  message?: string;
  query?: string;
  openChat?: string;
  run?: () => { ok: boolean; path?: string };
};

/* ── Debug / analytics bridge ── */

export type VoiceDebugLog = {
  timestamp: string;
  transcript: string;
  matchedCommand: string;
  confidence: VoiceConfidence;
  targetRoute: string | null;
  navigationSuccess: boolean | null;
};

let _debugLogs: VoiceDebugLog[] = [];

export function popDebugLogs(): VoiceDebugLog[] {
  const logs = _debugLogs;
  _debugLogs = [];
  return logs;
}

function voiceLog(transcript: string, action: VoiceCommandAction | null) {
  const entry: VoiceDebugLog = {
    timestamp: new Date().toISOString(),
    transcript,
    matchedCommand: action?.type ?? "none",
    confidence: action?.confidence ?? "low",
    targetRoute: action?.path ?? null,
    navigationSuccess: null,
  };
  _debugLogs.push(entry);
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[VoiceCommand] "${transcript}" → ${entry.matchedCommand} (${entry.confidence}) → ${entry.targetRoute ?? "—"}`
    );
  }
}

/* ── Intents for AI-only detection ── */

const CONVERSATIONAL_INTENT =
  /\b(how much|worth|value|price check|what should|how do i|write a|create a|describe|generate|help me|tell me about|explain|what is|can you)\b/i;

const LISTING_DESC_INTENT =
  /\b(write|create|generate|draft|make)\s+(a\s+)?(description|listing|title|ad)\b/i;

const PRICING_INTENT =
  /\b(how much|what should i price|worth|value|price suggestion|pricing|how much is)\b/i;

const HELP_INTENT =
  /\b(how do i|how to|what is|help me|guide me|tutorial|explain|show me how)\b/i;

/* ── Listing / Sell intent ── */

const SELL_INTENT =
  /\b(sell|selling|list(?:ing)?|post|create a listing|advertise|for sale|i want to sell|make a listing|list an item)\b/i;

const HAS_DETAIL =
  /\$[\d,]+|\b(ps5|iphone|laptop|car|toyota|honda|mazda|bike|couch|service|rental|digital|bmw|ford|nissan|subaru)\b/i;

/* ── Main Resolver ── */

export function resolveVoiceCommand(text: string, pathname: string): VoiceCommandAction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Pipeline 1: Local Command Engine
  // Try exact match first — fastest path
  const local = matchLocalCommand(trimmed, pathname);
  if (local) {
    const action = localToVoiceAction(local);
    voiceLog(trimmed, action);
    return action;
  }

  // Try phonetic-corrected match
  const { action: localPhonetic } = resolveLocalCommand(trimmed, pathname);
  if (localPhonetic) {
    const action = localToVoiceAction(localPhonetic);
    voiceLog(trimmed, action);
    return action;
  }

  // Pipeline 2: AI Conversation Engine detection
  // Only reach here if local engine returned nothing

  // Check if this looks conversational
  const isConversational = CONVERSATIONAL_INTENT.test(trimmed);
  const isListingDesc = LISTING_DESC_INTENT.test(trimmed);
  const isPricing = PRICING_INTENT.test(trimmed);
  const isHelp = HELP_INTENT.test(trimmed);

  // Explicit conversational intent → let AI handle it
  if (isConversational || isListingDesc || isPricing || isHelp) {
    voiceLog(trimmed, null);
    return null;
  }

  // Check for selling intent with enough detail
  if (SELL_INTENT.test(trimmed) || HAS_DETAIL.test(trimmed)) {
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount >= 3 && (SELL_INTENT.test(trimmed) || /\$/.test(trimmed) || wordCount >= 5)) {
      const action: VoiceCommandAction = {
        type: "listing",
        path: "/post/ai",
        status: "Opening Sell — filling your listing…",
        confidence: "high",
        heard: trimmed,
        targetTitle: "Sell",
        message: trimmed,
      };
      voiceLog(trimmed, action);
      return action;
    }
  }

  // Nothing matched — let AI handle it
  voiceLog(trimmed, null);
  return null;
}

/* ── Convert local command action to VoiceCommandAction ── */

function localToVoiceAction(local: LocalCommandAction): VoiceCommandAction {
  const confidence: VoiceConfidence = local.confidence;

  switch (local.type) {
    case "navigate":
      return {
        type: "navigate",
        path: local.path,
        status: local.status,
        confidence,
        heard: local.heard,
        targetTitle: local.targetTitle,
      };

    case "search":
      return {
        type: "search",
        path: local.path!,
        status: local.status,
        confidence,
        heard: local.heard,
        targetTitle: local.targetTitle,
        query: local.query,
      };

    case "page":
      return {
        type: "page",
        status: local.status,
        confidence,
        heard: local.heard,
        targetTitle: local.targetTitle,
        run: local.run,
      };

    case "resume":
      return {
        type: "resume",
        status: "Resuming…",
        confidence: "high",
        heard: local.heard,
      };

    case "voice_off":
      return {
        type: "voice_off",
        status: "Turning off Voice Mode…",
        confidence: "high",
        heard: local.heard,
      };
  }
}

/** Resolve a command to run immediately on interim STT (no silence wait). */
export function resolveInstantCommand(
  text: string,
  pathname: string
): VoiceCommandAction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const cmd = resolveVoiceCommand(trimmed, pathname);
  if (!cmd) return null;
  if (cmd.type === "listing" || cmd.type === "chat") return null;
  if (cmd.type === "search" && trimmed.split(/\s+/).filter(Boolean).length < 2) return null;
  return cmd;
}

/** True when speech looks like a complete navigation phrase (not mid-sentence). */
export function isCompleteNavPhrase(text: string, pathname: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\b(?:go|take me|navigate|open|bring me|bring up|head)\s+to\s*$/i.test(t)) return false;
  if (/\b(my|a|an|the|with|for|and|or|about|in|on|at)\s*$/i.test(t)) return false;
  const cmd = resolveVoiceCommand(t, pathname);
  if (!cmd) return false;
  return (
    cmd.type === "navigate" ||
    cmd.type === "search" ||
    cmd.type === "page" ||
    cmd.type === "resume" ||
    cmd.type === "voice_off"
  );
}

/** Commands that should navigate or act immediately once speech is final. */
export function isQuickVoiceCommand(text: string, pathname: string): boolean {
  return resolveInstantCommand(text, pathname) !== null;
}

export function listingFillFromVoiceApi(fill: SkyAiListingFill | undefined) {
  if (!fill) return;
  dispatchListingFill(fill);
}
