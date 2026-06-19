import type { SkyAiHistoryItem } from "./sky-ai-types";
import { isListingDetailMessage } from "./sky-ai-listing-paste";

const USERNAME_PATTERN = /[a-z0-9_]{3,30}/;

/** Words that must not be treated as seller handles when parsed from messages. */
const RESERVED_USERNAMES = new Set([
  "username",
  "user",
  "seller",
  "member",
  "name",
  "this",
  "the",
  "plan",
  "page",
  "form",
  "home",
  "house",
  "open",
]);

const EXPLICIT_SELLER_USERNAME =
  /\b(?:report(?:ing)?\s+username|username\s+is|username\s+@|@\w{3,30})\b/i;

function normalizeUsername(raw: string): string | undefined {
  const u = raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!USERNAME_PATTERN.test(u) || RESERVED_USERNAMES.has(u)) return undefined;
  return u;
}

/** Pull @handle or username from report / profile navigation messages. */
export function extractSellerUsernameFromMessage(
  message: string,
  history: SkyAiHistoryItem[] = []
): string | undefined {
  const text = message.trim();
  if (!text) return undefined;

  if (isListingDetailMessage(text) && !EXPLICIT_SELLER_USERNAME.test(text)) {
    return undefined;
  }

  const directPatterns = [
    /\busername\s+is\s+@?([a-zA-Z0-9_]{3,30})\b/i,
    // "report username Whanau" — must run before generic "report …" patterns
    /\b(?:report|reporting)\s+username\s+@?([a-zA-Z0-9_]{3,30})\b/i,
    /\busername\s+@?([a-zA-Z0-9_]{3,30})\b/i,
    /\b(?:report|reporting)\s+(?:this\s+)?(?:user|seller|member)\s+@?([a-zA-Z0-9_]{3,30})\b/i,
    /\b(?:report|reporting)\s+(?:this\s+)?@?([a-zA-Z0-9_]{3,30})\b/i,
    /\b(?:take me to|go to|show me)\s+@?([a-zA-Z0-9_]{3,30})(?:'s)?\s*(?:profile|page|seller page)?\b/i,
    // "open" alone matches listing copy (e.g. "open-plan living") — require the/their/@
    /\bopen\s+(?:the|their)\s+@?([a-zA-Z0-9_]{3,30})(?:'s)?\s*(?:profile|page|seller page)?\b/i,
    /\bopen\s+@([a-zA-Z0-9_]{3,30})\b/i,
    /\b@([a-zA-Z0-9_]{3,30})\b/,
  ];

  for (const pattern of directPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const u = normalizeUsername(match[1]);
      if (u) return u;
    }
  }

  // Follow-up: "terangi3" or "username is terangi3" after asking how to report
  const bare = text.match(/^@?([a-zA-Z0-9_]{3,30})$/i);
  if (bare?.[1] && hasRecentReportUserContext(history)) {
    const u = normalizeUsername(bare[1]);
    if (u) return u;
  }

  return undefined;
}

export function hasRecentReportUserContext(history: SkyAiHistoryItem[]): boolean {
  const recent = history.slice(-8);
  return recent.some((h) =>
    /\breport\s+(a\s+)?user\b/i.test(h.content) ||
    /\bhow do i report\b/i.test(h.content) ||
    (/\breport\b/i.test(h.content) && /\bprofile\b/i.test(h.content)) ||
    (/\bseller profile\b/i.test(h.content) && /\breport\b/i.test(h.content)) ||
    /\blet me know\b/i.test(h.content) && /\busername\b/i.test(h.content)
  );
}

export function sellerProfilePath(username: string): string {
  return `/seller/${normalizeUsername(username) || username}`;
}

export function sellerProfileDisplayLabel(username: string): string {
  const u = normalizeUsername(username) || username;
  return u.charAt(0).toUpperCase() + u.slice(1);
}

export type SellerProfileNavShortcut = {
  reply: string;
  navigateTo: string;
  source: "rules";
};

/** Navigate to /seller/[username] for report or profile requests. */
export function trySellerProfileNavigationShortcut(
  message: string,
  history: SkyAiHistoryItem[] = []
): SellerProfileNavShortcut | null {
  const username = extractSellerUsernameFromMessage(message, history);
  if (!username) return null;

  const reportIntent =
    /\breport\b/i.test(message) ||
    hasRecentReportUserContext(history) ||
    /\busername\s+is\b/i.test(message);

  const navigateIntent =
    /\b(take me|go to|show me|username is)\b/i.test(message) ||
    /\bopen\s+(?:the|their|@)\b/i.test(message) ||
    reportIntent;

  if (!navigateIntent) return null;

  const label = sellerProfileDisplayLabel(username);
  const path = sellerProfilePath(username);

  if (reportIntent) {
    return {
      reply: `I can report **${label}** for you — tell me the reason (Scam/fraud, Fake item, Suspicious price, Stolen images, Harassment/abuse, or Other).`,
      navigateTo: path,
      source: "rules",
    };
  }

  return {
    reply: `Opening **${label}**'s profile now…`,
    navigateTo: path,
    source: "rules",
  };
}
