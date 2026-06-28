/** Context-aware end-of-speech timing for Āwhina Voice. */

export type VoiceUtteranceKind = "navigation" | "search" | "listing" | "conversation";

const NAV_INTENT =
  /\b(go to|take me|open|navigate|bring me|send me|guide me|my messages|my purchases|my sales|my profile|show me messages)\b/i;

const SEARCH_INTENT =
  /\b(find|search(?:ing)?|look(?:ing)?\s+for|show me|get me|hunt for|browse for|need a|want a)\b/i;

const LISTING_INTENT =
  /\b(sell|selling|list(?:ing)?|post|create a listing|for sale|i('m| am) selling|bmw|toyota|honda|mazda|ford|iphone|laptop|ps5|vehicle|odometer|km|condition|description|price|twin turbo|upgraded)\b/i;

const MESSAGE_INTENT = /\b(message|contact|chat with|tell the seller|write to)\b/i;

const INCOMPLETE_TRAIL =
  /\b(my|a|an|the|with|for|and|or|about|selling|it's|its|this|that|in|on|at)\s*$/i;

const NAV_TO_INCOMPLETE = /\b(?:go|take me|navigate|open|bring me)\s+to\s*$/i;

export const SILENCE_MS: Record<VoiceUtteranceKind, number> = {
  navigation: 2_600,
  search: 3_600,
  listing: 9_500,
  conversation: 9_000,
};

/** Classify accumulated speech to pick a patient or fast end-of-speech window. */
export function classifyVoiceUtterance(text: string): VoiceUtteranceKind {
  const t = text.trim();
  if (!t) return "conversation";

  const words = t.split(/\s+/).length;
  const looksIncomplete = INCOMPLETE_TRAIL.test(t) || NAV_TO_INCOMPLETE.test(t) || t.endsWith("...");

  if (LISTING_INTENT.test(t) || looksIncomplete || words >= 10) {
    return "listing";
  }

  if (MESSAGE_INTENT.test(t) && words >= 4) {
    return "conversation";
  }

  if (SEARCH_INTENT.test(t) && !LISTING_INTENT.test(t)) {
    return words <= 8 ? "search" : "conversation";
  }

  if (NAV_INTENT.test(t) && words <= 10 && !LISTING_INTENT.test(t)) {
    return "navigation";
  }

  if (words >= 8) return "conversation";

  return "conversation";
}

export function silenceMsForText(text: string): number {
  return SILENCE_MS[classifyVoiceUtterance(text)];
}

/** UI label while waiting for more speech. */
export function listeningHeadline(text: string, quietForMs: number): string {
  if (!text.trim()) return "Listening…";
  if (quietForMs >= 1_400) return "Still listening…";
  return "Listening…";
}

export function formatUtteranceDisplay(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `"${trimmed}"`;
}
