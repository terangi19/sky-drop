/** Context-aware end-of-speech timing for Voice Mode.
 *
 * Local commands (navigation, search, page actions) get zero silence wait.
 * Conversational and listing speech get generous patience.
 */

import {
  isInstantLocalCommand,
  isLikelyNavCommand,
  isExactNavShortcut,
  isSellNavigationPhrase,
  isSalesNavigationPhrase,
} from "./local-command-engine";
import { resolveVoiceCommand } from "./awhina-voice-command";

export type VoiceUtteranceKind = "navigation" | "search" | "listing" | "conversation";

const NAV_INTENT =
  /\b(go to|take me|open|navigate|bring me|send me|guide me|show me|show|bring up|go into|view|head to|my messages|my purchases|my sales|my profile|show me messages)\b/i;

const SEARCH_INTENT =
  /\b(find|search(?:ing)?|look(?:ing)?\s+for|show me|show|get me|hunt for|browse for|need a|want a|i need|i want)\b/i;

const LISTING_INTENT =
  /\b(sell|selling|list(?:ing)?|post|create a listing|for sale|i('m| am) selling|bmw|toyota|honda|mazda|ford|iphone|laptop|ps5|vehicle|odometer|km|condition|description|price|twin turbo|upgraded)\b/i;

const MESSAGE_INTENT = /\b(message|contact|chat with|tell the seller|write to)\b/i;

const NOISE_ONLY =
  /^(uh+|um+|ah+|hmm+|oh+|the|a|an|and|or|so|like|yeah|yes|no|okay|ok)[\s.!?]*$/i;

const INCOMPLETE_TRAIL =
  /\b(my|a|an|the|with|for|and|or|about|selling|it's|its|this|that|in|on|at)\s*$/i;

const NAV_TO_INCOMPLETE = /\b(?:go|take me|navigate|open|bring me|bring up|head|show)\s+to\s*$/i;

export const SILENCE_MS: Record<VoiceUtteranceKind, number> = {
  navigation: 0, // Instant — no silence wait for local commands
  search: 220, // Tiny settle so "search for …" can finish the last word
  listing: 7_500, // Patient — user is dictating a listing
  conversation: 650, // Snappy end-of-thought (was 5s — felt broken)
};

/** Short pause after the browser commits a complete phrase (user already stopped). */
const POST_FINAL_MS: Record<VoiceUtteranceKind, number> = {
  navigation: 0,
  search: 60,
  listing: 700,
  conversation: 160,
};

export function isIncompleteUtterance(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return INCOMPLETE_TRAIL.test(t) || NAV_TO_INCOMPLETE.test(t) || t.endsWith("...");
}

/** User is describing or creating a listing — stay patient. */
export function isListingSpeech(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Bare "sell", "post", "go to sell", etc. are navigation — not a listing description
  if (isExactNavShortcut(t) || isSellNavigationPhrase(t) || isSalesNavigationPhrase(t)) {
    return false;
  }

  const words = t.split(/\s+/).length;
  if (words <= 3 && /\b(sell|selling|post|list)\b/i.test(t)) return false;

  if (LISTING_INTENT.test(t) && /\b(sell|selling|list|listing|post|for sale)\b/i.test(t)) {
    return words >= 3;
  }
  if (words >= 8 && (LISTING_INTENT.test(t) || /\$[\d,]+/.test(t))) return true;
  return false;
}

/** Skip noise / junk STT before running a command. */
export function isActionableTranscript(text: string, pathname?: string): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  if (NOISE_ONLY.test(t)) return false;
  if (isIncompleteUtterance(t)) return false;

  if (pathname) {
    const cmd = resolveVoiceCommand(t, pathname);
    if (cmd) return true;
  }

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return true;
  return t.length >= 10;
}

/** Classify accumulated speech to pick a patient or fast end-of-speech window. */
export function classifyVoiceUtterance(text: string, pathname = "/"): VoiceUtteranceKind {
  const t = text.trim();
  if (!t) return "conversation";

  if (
    isExactNavShortcut(t) ||
    isSellNavigationPhrase(t) ||
    isSalesNavigationPhrase(t) ||
    isInstantLocalCommand(t, pathname)
  ) {
    return "navigation";
  }

  const words = t.split(/\s+/).length;
  const looksIncomplete = isIncompleteUtterance(t);

  if (isListingSpeech(t) || looksIncomplete || words >= 12) {
    return "listing";
  }

  if (MESSAGE_INTENT.test(t) && words >= 4) {
    return "conversation";
  }

  if (SEARCH_INTENT.test(t) && !LISTING_INTENT.test(t)) {
    return words <= 10 ? "search" : "conversation";
  }

  if (NAV_INTENT.test(t) && words <= 12 && !LISTING_INTENT.test(t)) {
    return "navigation";
  }

  if (words >= 10) return "conversation";

  return "conversation";
}

export type EndOfSpeechOptions = {
  hadFinalChunk?: boolean;
  pathname?: string;
  quickCommand?: boolean;
};

/** Check if text is an instant local command (no silence wait needed). */
export function isInstantVoiceCommand(text: string, pathname: string): boolean {
  return isInstantLocalCommand(text, pathname);
}

/** How long to wait after the last speech activity before processing. */
export function endOfSpeechDelayMs(text: string, options?: EndOfSpeechOptions): number {
  const t = text.trim();
  if (!t) return SILENCE_MS.conversation;

  if (isExactNavShortcut(t)) return 0;
  if (options?.quickCommand) return 0;

  // Lightweight check: if this looks like a nav command, skip the full pipeline
  if (isLikelyNavCommand(t) && options?.pathname && isInstantLocalCommand(t, options.pathname)) {
    return 0;
  }

  const kind = classifyVoiceUtterance(t, options?.pathname);
  const incomplete = isIncompleteUtterance(t);

  if (!incomplete && options?.pathname) {
    const cmd = resolveVoiceCommand(t, options.pathname);
    if (cmd) {
      if (cmd.type === "voice_off" || cmd.type === "resume") return 0;
      if (
        (cmd.type === "navigate" || cmd.type === "search" || cmd.type === "page") &&
        cmd.confidence === "high"
      ) {
        return options.hadFinalChunk ? 0 : 80;
      }
      if (cmd.type === "listing") {
        if (options.hadFinalChunk) return POST_FINAL_MS.listing;
        return SILENCE_MS.listing;
      }
    }
  }

  if (options?.hadFinalChunk && !incomplete) {
    if (kind === "listing" || isListingSpeech(t)) return POST_FINAL_MS.listing;
    return POST_FINAL_MS[kind];
  }

  if (isListingSpeech(t)) return SILENCE_MS.listing;

  return SILENCE_MS[kind];
}

/** @deprecated Use endOfSpeechDelayMs — kept for server-side VAD base timing. */
export function silenceMsForText(text: string): number {
  return SILENCE_MS[classifyVoiceUtterance(text)];
}

/** UI label while waiting for more speech. */
export function listeningHeadline(text: string, quietForMs: number): string {
  if (!text.trim()) return "Listening…";
  if (quietForMs >= 400) return "Still listening…";
  return "Listening…";
}

export function formatUtteranceDisplay(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `"${trimmed}"`;
}
