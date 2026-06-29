/** Context-aware end-of-speech timing for Āwhina Voice. */

import { resolveInstantCommand, resolveVoiceCommand } from "./awhina-voice-command";

export type VoiceUtteranceKind = "navigation" | "search" | "listing" | "conversation";

const NAV_INTENT =
  /\b(go to|take me|open|navigate|bring me|send me|guide me|my messages|my purchases|my sales|my profile|show me messages)\b/i;

const SEARCH_INTENT =
  /\b(find|search(?:ing)?|look(?:ing)?\s+for|show me|get me|hunt for|browse for|need a|want a)\b/i;

const LISTING_INTENT =
  /\b(sell|selling|list(?:ing)?|post|create a listing|for sale|i('m| am) selling|bmw|toyota|honda|mazda|ford|iphone|laptop|ps5|vehicle|odometer|km|condition|description|price|twin turbo|upgraded)\b/i;

const MESSAGE_INTENT = /\b(message|contact|chat with|tell the seller|write to)\b/i;

const NOISE_ONLY =
  /^(uh+|um+|ah+|hmm+|oh+|the|a|an|and|or|so|like|yeah|yes|no|okay|ok)[\s.!?]*$/i;

const INCOMPLETE_TRAIL =
  /\b(my|a|an|the|with|for|and|or|about|selling|it's|its|this|that|in|on|at)\s*$/i;

const NAV_TO_INCOMPLETE = /\b(?:go|take me|navigate|open|bring me)\s+to\s*$/i;

export const SILENCE_MS: Record<VoiceUtteranceKind, number> = {
  navigation: 500,
  search: 900,
  listing: 11_000,
  conversation: 5_000,
};

/** Short pause after the browser commits a complete phrase (user already stopped). */
const POST_FINAL_MS: Record<VoiceUtteranceKind, number> = {
  navigation: 0,
  search: 120,
  listing: 2_000,
  conversation: 1_400,
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
  if (LISTING_INTENT.test(t)) return true;
  if (isIncompleteUtterance(t) && LISTING_INTENT.test(t)) return true;
  const words = t.split(/\s+/).length;
  if (words >= 8 && (LISTING_INTENT.test(t) || /\$[\d,]+/.test(t))) return true;
  return classifyVoiceUtterance(t) === "listing" && words >= 4;
}

/** Skip noise / junk STT before running a command. */
export function isActionableTranscript(text: string, pathname?: string): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  if (NOISE_ONLY.test(t)) return false;

  if (pathname) {
    const cmd = resolveVoiceCommand(t, pathname);
    if (cmd) return true;
  }

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return true;
  return t.length >= 10;
}

/** Classify accumulated speech to pick a patient or fast end-of-speech window. */
export function classifyVoiceUtterance(text: string): VoiceUtteranceKind {
  const t = text.trim();
  if (!t) return "conversation";

  const words = t.split(/\s+/).length;
  const looksIncomplete = isIncompleteUtterance(t);

  if (LISTING_INTENT.test(t) || looksIncomplete || words >= 12) {
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

/** Ready to act immediately — no silence wait (page names, go to X, etc.). */
export function isInstantVoiceCommand(text: string, pathname: string): boolean {
  return resolveInstantCommand(text, pathname) !== null;
}

/** How long to wait after the last speech activity before processing. */
export function endOfSpeechDelayMs(text: string, options?: EndOfSpeechOptions): number {
  const t = text.trim();
  if (!t) return SILENCE_MS.conversation;

  const kind = classifyVoiceUtterance(t);
  const incomplete = isIncompleteUtterance(t);

  if (!incomplete && options?.pathname) {
    const cmd = resolveVoiceCommand(t, options.pathname);
    if (cmd?.type === "listing") {
      if (options.hadFinalChunk) return POST_FINAL_MS.listing;
      return SILENCE_MS.listing;
    }
    if (cmd?.type === "navigate" || cmd?.type === "page") {
      return 0;
    }
    if (cmd?.type === "search") {
      return 0;
    }
    if (cmd?.type === "resume" || cmd?.type === "voice_off") {
      return 0;
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
  if (quietForMs >= 800) return "Still listening…";
  return "Listening…";
}

export function formatUtteranceDisplay(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `"${trimmed}"`;
}
