/**
 * Local Command Engine — runs entirely on the client.
 *
 * Pipeline:
 *   1. Context actions (go back, go home, scroll, refresh, close)
 *   2. Voice toggle (stop listening, resume)
 *   3. Page actions (open listing, message seller, tab switch)
 *   4. Short phrase nav (1-5 words — treat as high-confidence navigation)
 *   5. Route registry match with prefix stripping
 *   6. Phonetic correction + fuzzy match
 *   7. Search intent parsing
 *   8. Listing/sell intent parsing
 *   9. Return null → send to AI
 */

import { matchRouteFromRegistry } from "./command-registry";
import { openListingByIndex, messageSellerOnPage, scrollDown, scrollToBottom, scrollToTop, scrollUp, switchTab } from "./awhina-voice-page-actions";
import { phoneticNormalize, resolvePhonetic } from "./voice-phonetic";
import { logCommand } from "./command-logger";

/* ── Types ── */

export type LocalCommandConfidence = "high" | "medium";

export type LocalCommandAction = {
  type: "navigate" | "search" | "page" | "resume" | "voice_off";
  status: string;
  confidence: LocalCommandConfidence;
  heard: string;
  targetTitle?: string;
  path?: string;
  query?: string;
  run?: () => { ok: boolean; path?: string };
};

/* ── Intent Regexes ── */

const RESUME_INTENT = /\b(resume( listening)?|continue listening|i'?m back|keep listening|unpause)\b/i;
const VOICE_OFF_INTENT = /\b(stop listening|turn off voice|disable voice|exit voice( mode)?|stop voice|voice off|turn voice off)\b/i;

const OPEN_LISTING_INTENT =
  /\b(open|show|go to|view)\s+(the\s+)?(first|1st|second|2nd|third|3rd|top)\s+(listing|result|one|item|post)\b/i;

const MESSAGE_SELLER_INTENT =
  /\b(message|contact|chat with|talk to)\s+(the\s+)?(seller|owner|them|vendor)\b/i;

const SEARCH_INTENT =
  /\b(find|search(?:ing)?|look(?:ing)?\s+for|show me|show|get me|need a|want a|where can i find|i need a|i want a|i want to|i'd like|i'd like to|need to|looking for|hunt for|browse for)\b/i;

const UNDER_PRICE = /\b(?:under|below|less than|max|maximum|up to)\s*\$?\s*([\d,]+(?:\.\d{2})?)/i;
const OVER_PRICE = /\b(?:over|above|more than|min|minimum|at least)\s*\$?\s*([\d,]+(?:\.\d{2})?)/i;
const IN_LOCATION =
  /\b(?:in|near|around|from)\s+(auckland|wellington|christchurch|hamilton|tauranga|dunedin|palmerston north|napier|rotorua|nelson|invercargill|queenstown|new plymouth|whangarei|gisborne|timaru|taupo|north shore|manukau|waitakere|canterbury|waikato|otago|hawke'?s bay)\b/i;

/* ── Context-Aware Actions ── */

const GO_BACK_INTENT = /\b(go back|back|previous|go previous|go back a page|go back one|navigate back|go to previous page)\b/i;
const GO_HOME_INTENT = /\b(go home|home page|back to home|go to home|bring me home|take me home)\b/i;
const SCROLL_DOWN_INTENT = /\b(scroll down|page down|move down|go down|scroll down a bit|scroll down a little)\b/i;
const SCROLL_UP_INTENT = /\b(scroll up|page up|move up|go up|scroll up a bit|scroll up a little)\b/i;
const SCROLL_TOP_INTENT = /\b(scroll to top|go to top|top of page|back to top)\b/i;
const SCROLL_BOTTOM_INTENT = /\b(scroll to bottom|go to bottom|bottom of page)\b/i;
const CLOSE_INTENT = /\b(close this|close|dismiss|close page|go away|exit)\b/i;
const CANCEL_INTENT = /\b(cancel|never mind|forget it|scratch that|stop|abort)\b/i;
const REFRESH_INTENT = /\b(refresh|reload|refresh page|reload page)\b/i;

/* ── Nav Prefix Stripping ── */

const NAV_PREFIXES = [
  "take me to", "go to", "open", "show me", "show",
  "navigate to", "bring me to", "send me to", "guide me to",
  "bring up", "go into", "view", "head to", "get me to",
  "take me into", "show me the", "let me see", "i want to go to",
  "i need to go to", "i want to see",
  "can you take me to", "can you open",
  "go to the", "take me", "bring me",
  "can you show me", "can you take me",
];

const NAV_PREFIX_REGEX = new RegExp(
  `^(?:please\\s+)?(?:can you\\s+)?(?:could you\\s+)?(?:${NAV_PREFIXES.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ).join("|")})\\s+`,
  "i"
);

function hasNavPrefix(text: string): boolean {
  return NAV_PREFIX_REGEX.test(text);
}

function stripNavPrefix(text: string): string {
  return text.replace(NAV_PREFIX_REGEX, "").trim();
}

/* ── Helpers ── */

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function parsePrice(raw: string): number | undefined {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function listingIndexFromText(text: string): number {
  if (/\b(second|2nd)\b/i.test(text)) return 1;
  if (/\b(third|3rd)\b/i.test(text)) return 2;
  return 0;
}

/* ── Context Actions ── */

function buildContextAction(text: string): LocalCommandAction | null {
  const t = text.trim();

  if (GO_BACK_INTENT.test(t)) {
    return {
      type: "page",
      status: "Going back…",
      confidence: "high",
      heard: t,
      targetTitle: "previous page",
      run: () => {
        window.history.back();
        return { ok: true, path: document.referrer || undefined };
      },
    };
  }

  if (GO_HOME_INTENT.test(t)) {
    return {
      type: "navigate",
      path: "/",
      status: "Going home…",
      confidence: "high",
      heard: t,
      targetTitle: "Home",
    };
  }

  if (SCROLL_DOWN_INTENT.test(t)) {
    return {
      type: "page", status: "Scrolling down…", confidence: "high", heard: t,
      targetTitle: "scroll down", run: scrollDown,
    };
  }

  if (SCROLL_UP_INTENT.test(t)) {
    return {
      type: "page", status: "Scrolling up…", confidence: "high", heard: t,
      targetTitle: "scroll up", run: scrollUp,
    };
  }

  if (SCROLL_TOP_INTENT.test(t)) {
    return {
      type: "page", status: "Going to top…", confidence: "high", heard: t,
      targetTitle: "top of page", run: scrollToTop,
    };
  }

  if (SCROLL_BOTTOM_INTENT.test(t)) {
    return {
      type: "page", status: "Going to bottom…", confidence: "high", heard: t,
      targetTitle: "bottom of page", run: scrollToBottom,
    };
  }

  if (REFRESH_INTENT.test(t)) {
    return {
      type: "page", status: "Refreshing…", confidence: "high", heard: t,
      targetTitle: "refresh",
      run: () => {
        window.location.reload();
        return { ok: true };
      },
    };
  }

  if (CLOSE_INTENT.test(t) || CANCEL_INTENT.test(t)) {
    return {
      type: "page", status: "Closing…", confidence: "high", heard: t,
      targetTitle: "close",
      run: () => {
        window.history.back();
        return { ok: true, path: document.referrer || undefined };
      },
    };
  }

  return null;
}

/* ── Voice Toggle Actions ── */

function buildVoiceToggleAction(text: string): LocalCommandAction | null {
  const t = text.trim();

  if (VOICE_OFF_INTENT.test(t)) {
    return { type: "voice_off", status: "Turning off Voice Mode…", confidence: "high", heard: t };
  }

  if (RESUME_INTENT.test(t)) {
    return { type: "resume", status: "Resuming…", confidence: "high", heard: t };
  }

  return null;
}

/* ── Page Actions ── */

function buildPageAction(text: string, pathname: string): LocalCommandAction | null {
  const t = text.trim();

  if (OPEN_LISTING_INTENT.test(t)) {
    const index = listingIndexFromText(t);
    return {
      type: "page",
      status: index === 0 ? "Opening the first listing…" : `Opening listing ${index + 1}…`,
      confidence: "high",
      heard: t,
      targetTitle: index === 0 ? "first listing" : `listing ${index + 1}`,
      run: () => {
        const result = openListingByIndex(index);
        return result.ok ? { ok: true, path: result.path } : { ok: false };
      },
    };
  }

  if (MESSAGE_SELLER_INTENT.test(t)) {
    return {
      type: "page",
      status: "Opening messages…",
      confidence: "high",
      heard: t,
      targetTitle: "Messages",
      run: () => {
        const result = messageSellerOnPage();
        if (result.ok) return { ok: true, path: result.path };
        if (pathname.startsWith("/search") || pathname === "/") {
          const opened = openListingByIndex(0);
          if (opened.ok) return { ok: true, path: opened.path };
        }
        return { ok: false };
      },
    };
  }

  /* ── Tab switching ── */
  const TAB_PAGES: Array<{ prefix: string; aliases: Record<string, string> }> = [
    {
      prefix: "/profile",
      aliases: {
        settings: "Settings", verification: "Verification", payments: "Payments",
        payment: "Payments", notifications: "Notifications", notification: "Notifications",
        listings: "Listings", listing: "Listings", reviews: "Reviews", review: "Reviews",
        profile: "Profile", delete: "Delete", danger: "Delete",
      },
    },
  ];
  for (const page of TAB_PAGES) {
    if (!pathname.startsWith(page.prefix)) continue;
    const words = t.toLowerCase().match(/\b(\w+)\b/g) || [];
    for (const word of words) {
      const label = page.aliases[word];
      if (label) {
        return {
          type: "page",
          status: `Opening ${label}…`,
          confidence: "high",
          heard: t,
          targetTitle: label,
          run: () => switchTab(label),
        };
      }
    }
  }

  return null;
}

/* ── Route Registry Matching ── */

function registryMatchAction(text: string, pathname: string): LocalCommandAction | null {
  const t = normalize(text);
  if (!t || t.length < 2) return null;

  const nw = wordCount(t);

  // Try direct match first
  const match = matchRouteFromRegistry(t, nw <= 3 ? 5 : 4);
  if (match) {
    const samePath = pathname === match.path || (match.path.includes("#") && pathname === match.path.split("#")[0]);
    if (samePath) {
      return {
        type: "page",
        status: `You're already on ${match.title}.`,
        confidence: "high",
        heard: text,
        targetTitle: match.title,
        run: () => ({ ok: true }),
      };
    }
    return {
      type: "navigate",
      path: match.path,
      status: `Opening ${match.title}…`,
      confidence: nw <= 3 ? "high" : "medium",
      heard: text,
      targetTitle: match.title,
    };
  }

  // Try with nav prefix stripped
  if (hasNavPrefix(t)) {
    const stripped = stripNavPrefix(t);
    if (stripped && stripped !== t) {
      const strippedMatch = matchRouteFromRegistry(stripped, 5);
      if (strippedMatch) {
        const samePath = pathname === strippedMatch.path || (strippedMatch.path.includes("#") && pathname === strippedMatch.path.split("#")[0]);
        if (samePath) {
          return {
            type: "page",
            status: `You're already on ${strippedMatch.title}.`,
            confidence: "high",
            heard: text,
            targetTitle: strippedMatch.title,
            run: () => ({ ok: true }),
          };
        }
        return {
          type: "navigate",
          path: strippedMatch.path,
          status: `Opening ${strippedMatch.title}…`,
          confidence: "high",
          heard: text,
          targetTitle: strippedMatch.title,
        };
      }
    }
  }

  // Try phonetic correction
  const corrected = resolvePhonetic(t);
  if (corrected !== t) {
    const phoneticMatch = matchRouteFromRegistry(corrected, 5);
    if (phoneticMatch) {
      const samePath = pathname === phoneticMatch.path || (phoneticMatch.path.includes("#") && pathname === phoneticMatch.path.split("#")[0]);
      if (samePath) {
        return {
          type: "page",
          status: `You're already on ${phoneticMatch.title}.`,
          confidence: "high",
          heard: text,
          targetTitle: phoneticMatch.title,
          run: () => ({ ok: true }),
        };
      }
      return {
        type: "navigate",
        path: phoneticMatch.path,
        status: `Opening ${phoneticMatch.title}…`,
        confidence: "high",
        heard: text,
        targetTitle: phoneticMatch.title,
      };
    }
  }

  // Still no match — try phonetic normalization of the text
  const phoneticNorm = phoneticNormalize(t);
  if (phoneticNorm !== t) {
    const phoneticRouteMatch = matchRouteFromRegistry(phoneticNorm, 5);
    if (phoneticRouteMatch) {
      return {
        type: "navigate",
        path: phoneticRouteMatch.path,
        status: `Opening ${phoneticRouteMatch.title}…`,
        confidence: "high",
        heard: text,
        targetTitle: phoneticRouteMatch.title,
      };
    }
  }

  return null;
}

/* ── Search Intent ── */

function extractSearchTerms(text: string): string {
  let q = text.trim();
  q = q.replace(
    /^(please\s+)?(can you\s+)?(find|search(?: for|ing)?|look(?:ing)?\s+for|show me|show|get me|i need|i want|i want to|i'd like|i'd like to|hunt for|browse for)\s+(me\s+)?(a|an|some)?\s*/i,
    ""
  );
  q = q.replace(UNDER_PRICE, "");
  q = q.replace(OVER_PRICE, "");
  q = q.replace(IN_LOCATION, "");
  q = q.replace(/\b(in new zealand|on sky drop|on skydrop)\b/gi, "");
  return q.replace(/\s+/g, " ").trim();
}

function buildSearchAction(text: string): LocalCommandAction | null {
  const t = text.trim();
  if (!SEARCH_INTENT.test(t)) return null;

  const query = extractSearchTerms(t);
  if (!query || query.length < 2) return null;

  const params = new URLSearchParams();
  params.set("q", query);

  const under = t.match(UNDER_PRICE);
  const over = t.match(OVER_PRICE);
  const loc = t.match(IN_LOCATION);

  if (under) params.set("maxPrice", String(parsePrice(under[1])));
  if (over) params.set("minPrice", String(parsePrice(over[1])));
  if (loc) params.set("location", loc[1]);

  const locLabel = loc ? ` in ${loc[1][0].toUpperCase()}${loc[1].slice(1)}` : "";
  const priceLabel = under ? ` under $${under[1]}` : over ? ` over $${over[1]}` : "";

  return {
    type: "search",
    path: `/search?${params.toString()}`,
    status: `Looking for ${query}${locLabel}${priceLabel}…`,
    confidence: "high",
    heard: t,
    targetTitle: `Search: ${query}`,
    query,
  };
}

/* ── Main Public API ── */

/**
 * Try to match and execute a voice command locally.
 * Returns an action if matched, or null if it should go to the AI.
 */
export function matchLocalCommand(text: string, pathname: string): LocalCommandAction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const nw = wordCount(trimmed);

  // 1. Context actions (highest priority — go back, go home, scroll, refresh, close)
  const contextAction = buildContextAction(trimmed);
  if (contextAction) return contextAction;

  // 2. Voice toggle (stop listening, resume)
  const toggleAction = buildVoiceToggleAction(trimmed);
  if (toggleAction) return toggleAction;

  // 3. Page actions (open listing, message seller, tab switch)
  const pageAction = buildPageAction(trimmed, pathname);
  if (pageAction) return pageAction;

  // 4. Short phrases (1-5 words) → aggressive nav matching
  if (nw <= 5) {
    const navTarget = hasNavPrefix(trimmed) ? stripNavPrefix(trimmed) : trimmed;

    // Direct registry match on the raw/nav-stripped text
    const shortMatch = matchRouteFromRegistry(navTarget, nw <= 3 ? 5 : 4);
    if (shortMatch) {
      const samePath = pathname === shortMatch.path || (shortMatch.path.includes("#") && pathname === shortMatch.path.split("#")[0]);
      if (samePath) {
        return {
          type: "page",
          status: `You're already on ${shortMatch.title}.`,
          confidence: "high",
          heard: trimmed,
          targetTitle: shortMatch.title,
          run: () => ({ ok: true }),
        };
      }
      return {
        type: "navigate",
        path: shortMatch.path,
        status: `Opening ${shortMatch.title}…`,
        confidence: nw <= 3 ? "high" : "medium",
        heard: trimmed,
        targetTitle: shortMatch.title,
      };
    }

    // Phonetic match for short phrases
    const corrected = resolvePhonetic(navTarget);
    if (corrected !== navTarget) {
      const phoneticMatch = matchRouteFromRegistry(corrected, 5);
      if (phoneticMatch) {
        return {
          type: "navigate",
          path: phoneticMatch.path,
          status: `Opening ${phoneticMatch.title}…`,
          confidence: "high",
          heard: trimmed,
          targetTitle: phoneticMatch.title,
        };
      }
    }
  }

  // 5. Full registry match with prefix stripping
  const registryAction = registryMatchAction(trimmed, pathname);
  if (registryAction) return registryAction;

  // 6. Search intent — "find BMW 335i", "look for iPhone"
  const searchAction = buildSearchAction(trimmed);
  if (searchAction) return searchAction;

  // 7. "My X" phrases — short personalized navs
  const myXMatch = trimmed.match(/^my\s+(.+)$/i);
  if (myXMatch && nw <= 4) {
    const myTarget = myXMatch[1];
    const myRoute = matchRouteFromRegistry(`my ${myTarget}`, 5) ?? matchRouteFromRegistry(myTarget, 5);
    if (myRoute) {
      return {
        type: "navigate",
        path: myRoute.path,
        status: `Opening ${myRoute.title}…`,
        confidence: "high",
        heard: trimmed,
        targetTitle: myRoute.title,
      };
    }
  }

  // No local match — this should go to the AI
  return null;
}

/**
 * Quick check if text is a local command that should execute immediately.
 * Used by the end-of-speech timing to skip silence wait.
 */
export function isInstantLocalCommand(text: string, pathname: string): boolean {
  const match = matchLocalCommand(text, pathname);
  if (!match) return false;
  return match.type === "navigate" || match.type === "search" || match.type === "page" ||
         match.type === "resume" || match.type === "voice_off";
}

/**
 * Resolve with logging — wraps matchLocalCommand with analytics.
 */
export function resolveLocalCommand(
  text: string,
  pathname: string
): { action: LocalCommandAction | null; corrected: boolean } {
  const start = performance.now();

  // First try direct
  const direct = matchLocalCommand(text, pathname);
  if (direct) {
    const elapsed = Math.round(performance.now() - start);
    logCommand({
      rawTranscript: text,
      normalizedTranscript: normalize(text),
      matchedCommand: direct.type,
      confidence: direct.confidence,
      targetPath: direct.path ?? null,
      targetTitle: direct.targetTitle ?? null,
      executedAction: direct.type,
      route: pathname,
      executionTimeMs: elapsed,
      aiBypassed: true,
      phoneticCorrected: false,
      originalTranscript: text,
    });
    return { action: direct, corrected: false };
  }

  // Try with phonetic normalization
  const phonNorm = phoneticNormalize(text);
  if (phonNorm !== normalize(text)) {
    const withPhonetic = matchLocalCommand(phonNorm, pathname);
    if (withPhonetic) {
      const elapsed = Math.round(performance.now() - start);
      logCommand({
        rawTranscript: text,
        normalizedTranscript: phonNorm,
        matchedCommand: withPhonetic.type,
        confidence: withPhonetic.confidence,
        targetPath: withPhonetic.path ?? null,
        targetTitle: withPhonetic.targetTitle ?? null,
        executedAction: withPhonetic.type,
        route: pathname,
        executionTimeMs: elapsed,
        aiBypassed: true,
        phoneticCorrected: true,
        originalTranscript: text,
      });
      return { action: withPhonetic, corrected: true };
    }
  }

  const elapsed = Math.round(performance.now() - start);
  logCommand({
    rawTranscript: text,
    normalizedTranscript: normalize(text),
    matchedCommand: null,
    confidence: "none",
    targetPath: null,
    targetTitle: null,
    executedAction: "none",
    route: pathname,
    executionTimeMs: elapsed,
    aiBypassed: false,
    phoneticCorrected: false,
    originalTranscript: text,
  });

  return { action: null, corrected: false };
}
