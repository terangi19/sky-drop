import { findByCompactPrefix, findBestDestination, getGuideReply, scoreDestination, type GuideDestination } from "./guide-assistant";
import { dispatchListingFill, type SkyAiListingFill } from "./sky-ai-listing-fill";
import { messageSellerOnPage, openListingByIndex, scrollDown, scrollToBottom, scrollToTop, scrollUp, switchTab } from "./awhina-voice-page-actions";
import { matchRoute, matchRouteStrict } from "./voice-route-registry";
import { resolvePhonetic } from "./voice-phonetic";

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

/* ── Debug Logger ── */

let _debugLogs: VoiceDebugLog[] = [];

export type VoiceDebugLog = {
  timestamp: string;
  transcript: string;
  matchedCommand: string;
  confidence: VoiceConfidence;
  targetRoute: string | null;
  navigationSuccess: boolean | null;
};

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

/* ── Intents ── */

const RESUME_INTENT = /\b(resume( listening)?|continue listening|i'?m back|keep listening|unpause)\b/i;
const VOICE_OFF_INTENT = /\b(stop listening|turn off voice|disable voice|exit voice( mode)?|stop voice|voice off|turn voice off)\b/i;

const OPEN_LISTING_INTENT =
  /\b(open|show|go to|view)\s+(the\s+)?(first|1st|second|2nd|third|3rd|top)\s+(listing|result|one|item|post)\b/i;

const MESSAGE_SELLER_INTENT =
  /\b(message|contact|chat with|talk to)\s+(the\s+)?(seller|owner|them|vendor)\b/i;

const SEARCH_INTENT =
  /\b(find|search(?:ing)?|look(?:ing)?\s+for|show me|show|get me|hunt for|browse for|need a|want a|where can i find|i need a|i want a|looking for)\b/i;

const SELL_INTENT =
  /\b(sell|selling|list(?:ing)?|post|create a listing|advertise|for sale|i want to sell|make a listing|list an item)\b/i;

const UNDER_PRICE = /\b(?:under|below|less than|max|maximum|up to)\s*\$?\s*([\d,]+(?:\.\d{2})?)/i;
const OVER_PRICE = /\b(?:over|above|more than|min|minimum|at least)\s*\$?\s*([\d,]+(?:\.\d{2})?)/i;
const IN_LOCATION =
  /\b(?:in|near|around|from)\s+(auckland|wellington|christchurch|hamilton|tauranga|dunedin|palmerston north|napier|rotorua|nelson|invercargill|queenstown|new plymouth|whangarei|gisborne|timaru|taupo|north shore|manukau|waitakere|canterbury|waikato|otago|hawke'?s bay)\b/i;

/* ── Context-aware command intents ── */

const GO_BACK_INTENT = /\b(go back|back|previous|go previous|go back a page|go back one|navigate back)\b/i;
const GO_HOME_INTENT = /\b(go home|home page|back to home|go to home)\b/i;
const SCROLL_DOWN_INTENT = /\b(scroll down|page down|move down|go down|scroll down a bit)\b/i;
const SCROLL_UP_INTENT = /\b(scroll up|page up|move up|go up|scroll up a bit)\b/i;
const SCROLL_TOP_INTENT = /\b(scroll to top|go to top|top of page|back to top)\b/i;
const SCROLL_BOTTOM_INTENT = /\b(scroll to bottom|go to bottom|bottom of page)\b/i;
const CLOSE_INTENT = /\b(close this|close|dismiss|close page|go away|exit)\b/i;
const CANCEL_INTENT = /\b(cancel|never mind|forget it|scratch that|stop|abort)\b/i;
const REFRESH_INTENT = /\b(refresh|reload|refresh page|reload page)\b/i;

/* ── Parse helpers ── */

function parsePrice(raw: string): number | undefined {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractSearchTerms(text: string): string {
  let q = text.trim();
  q = q.replace(
    /^(please\s+)?(can you\s+)?(find|search(?: for|ing)?|look(?:ing)?\s+for|show me|show|get me|i need|i want|hunt for|browse for)\s+(me\s+)?(a|an|some)?\s*/i,
    ""
  );
  q = q.replace(UNDER_PRICE, "");
  q = q.replace(OVER_PRICE, "");
  q = q.replace(IN_LOCATION, "");
  q = q.replace(/\b(in new zealand|on sky drop|on skydrop)\b/gi, "");
  return q.replace(/\s+/g, " ").trim();
}

function buildSearchPath(text: string): { path: string; query: string; status: string; targetTitle: string } | null {
  if (!SEARCH_INTENT.test(text)) return null;

  const query = extractSearchTerms(text);
  if (!query || query.length < 2) return null;

  const params = new URLSearchParams();
  params.set("q", query);

  const under = text.match(UNDER_PRICE);
  const over = text.match(OVER_PRICE);
  const loc = text.match(IN_LOCATION);

  if (under) params.set("maxPrice", String(parsePrice(under[1])));
  if (over) params.set("minPrice", String(parsePrice(over[1])));
  if (loc) params.set("location", loc[1]);

  const locLabel = loc ? ` in ${loc[1][0].toUpperCase()}${loc[1].slice(1)}` : "";
  const priceLabel = under ? ` under $${under[1]}` : over ? ` over $${over[1]}` : "";

  return {
    path: `/search?${params.toString()}`,
    query,
    status: `Looking for ${query}${locLabel}${priceLabel}…`,
    targetTitle: `Search: ${query}`,
  };
}

function buildListingAction(text: string): VoiceCommandAction | null {
  if (!SELL_INTENT.test(text)) return null;
  const hasDetail =
    SELL_INTENT.test(text) &&
    (/\$[\d,]+/.test(text) ||
      /\b(ps5|iphone|laptop|car|toyota|honda|mazda|bike|couch|service|rental|digital)\b/i.test(text) ||
      text.split(/\s+/).length >= 6);

  if (!hasDetail && !/\b(sell|listing|post)\b/i.test(text)) return null;

  return {
    type: "listing",
    path: "/post/ai",
    status: `Opening Sell — filling your listing…`,
    confidence: "high",
    heard: text,
    targetTitle: "Sell",
    message: text,
  };
}

function listingIndexFromText(text: string): number {
  if (/\b(second|2nd)\b/i.test(text)) return 1;
  if (/\b(third|3rd)\b/i.test(text)) return 2;
  return 0;
}

/* ── Nav Prefix Stripping ── */

const NAV_PREFIXES = [
  "take me to", "go to", "open", "show me", "show",
  "navigate to", "bring me to", "send me to", "guide me to",
  "bring up", "go into", "view", "head to", "get me to",
  "take me into", "show me the", "let me see", "i want to go to",
  "i need to go to", "can you take me to", "can you open",
  "go to the", "take me", "bring me",
];

const NAV_PREFIX_REGEX = new RegExp(
  `^(?:please\\s+)?(?:can you\\s+)?(?:${NAV_PREFIXES.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ).join("|")})\\s+`,
  "i"
);

/* ── Display Helpers ── */

function compactSpeech(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripNavPrefix(text: string): string {
  return text.replace(NAV_PREFIX_REGEX, "").trim();
}

function hasNavPrefix(text: string): boolean {
  return NAV_PREFIX_REGEX.test(text);
}

/* ── Confidence Scoring ── */

function computeConfidence(text: string, dest: GuideDestination | null, destScore: number): VoiceConfidence {
  if (!dest || destScore < 2) return "low";
  if (destScore >= 5) return "high";
  if (destScore >= 3) return "medium";
  return "low";
}

/* ── Page-Level Actions ── */

function buildPageAction(text: string, pathname: string): VoiceCommandAction | null {
  if (VOICE_OFF_INTENT.test(text)) {
    return { type: "voice_off", status: "Turning off Voice Mode…", confidence: "high", heard: text };
  }

  if (RESUME_INTENT.test(text)) {
    return { type: "resume", status: "Resuming…", confidence: "high", heard: text };
  }

  if (OPEN_LISTING_INTENT.test(text)) {
    const index = listingIndexFromText(text);
    return {
      type: "page",
      status: index === 0 ? "Opening the first listing…" : `Opening listing ${index + 1}…`,
      confidence: "high",
      heard: text,
      targetTitle: index === 0 ? "first listing" : `listing ${index + 1}`,
      run: () => {
        const result = openListingByIndex(index);
        return result.ok ? { ok: true, path: result.path } : { ok: false };
      },
    };
  }

  if (MESSAGE_SELLER_INTENT.test(text)) {
    return {
      type: "page",
      status: "Opening messages…",
      confidence: "high",
      heard: text,
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

  // In-page tab navigation
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
    const words = text.toLowerCase().match(/\b(\w+)\b/g) || [];
    for (const word of words) {
      const label = page.aliases[word];
      if (label) {
        return {
          type: "page",
          status: `Opening ${label}…`,
          confidence: "high",
          heard: text,
          targetTitle: label,
          run: () => switchTab(label),
        };
      }
    }
  }

  return null;
}

/* ── Context-aware page actions ── */

function buildContextAction(text: string): VoiceCommandAction | null {
  const trimmed = text.trim();

  if (GO_BACK_INTENT.test(trimmed)) {
    return {
      type: "page",
      status: "Going back…",
      confidence: "high",
      heard: trimmed,
      targetTitle: "previous page",
      run: () => {
        window.history.back();
        return { ok: true, path: document.referrer || undefined };
      },
    };
  }

  if (GO_HOME_INTENT.test(trimmed)) {
    return {
      type: "navigate",
      path: "/",
      status: "Going home…",
      confidence: "high",
      heard: trimmed,
      targetTitle: "Home",
    };
  }

  if (SCROLL_DOWN_INTENT.test(trimmed)) {
    return {
      type: "page",
      status: "Scrolling down…",
      confidence: "high",
      heard: trimmed,
      targetTitle: "scroll down",
      run: scrollDown,
    };
  }

  if (SCROLL_UP_INTENT.test(trimmed)) {
    return {
      type: "page",
      status: "Scrolling up…",
      confidence: "high",
      heard: trimmed,
      targetTitle: "scroll up",
      run: scrollUp,
    };
  }

  if (SCROLL_TOP_INTENT.test(trimmed)) {
    return {
      type: "page",
      status: "Going to top…",
      confidence: "high",
      heard: trimmed,
      targetTitle: "top of page",
      run: scrollToTop,
    };
  }

  if (SCROLL_BOTTOM_INTENT.test(trimmed)) {
    return {
      type: "page",
      status: "Going to bottom…",
      confidence: "high",
      heard: trimmed,
      targetTitle: "bottom of page",
      run: scrollToBottom,
    };
  }

  if (REFRESH_INTENT.test(trimmed)) {
    return {
      type: "page",
      status: "Refreshing…",
      confidence: "high",
      heard: trimmed,
      targetTitle: "refresh",
      run: () => {
        window.location.reload();
        return { ok: true };
      },
    };
  }

  return null;
}

/* ── Route Registry Integration ── */

/**
 * Fast match from the central route registry.
 * Returns a navigate action if a route is matched with high confidence.
 */
function matchFromRegistry(text: string, pathname: string): VoiceCommandAction | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return null;

  // Try strict match first (score >= 5)
  const strict = matchRouteStrict(trimmed);
  if (strict) {
    if (pathname === strict.path || (strict.path.includes("#") && pathname === strict.path.split("#")[0])) {
      return {
        type: "reply",
        status: `You're already on ${strict.title}.`,
        confidence: "medium",
        heard: trimmed,
        targetTitle: strict.title,
        message: `You're already on **${strict.title}**. What else can I help with?`,
      };
    }
    return {
      type: "navigate",
      path: strict.path,
      status: `Opening ${strict.title}…`,
      confidence: "high",
      heard: trimmed,
      targetTitle: strict.title,
    };
  }

  // Try fuzzy match (score >= 3) — requires nav prefix for medium confidence
  const fuzzy = matchRoute(trimmed);
  if (fuzzy && fuzzy.score >= 4 && hasNavPrefix(trimmed)) {
    if (pathname === fuzzy.path || (fuzzy.path.includes("#") && pathname === fuzzy.path.split("#")[0])) {
      return {
        type: "reply",
        status: `You're already on ${fuzzy.title}.`,
        confidence: "medium",
        heard: trimmed,
        targetTitle: fuzzy.title,
        message: `You're already on **${fuzzy.title}**. What else can I help with?`,
      };
    }
    return {
      type: "navigate",
      path: fuzzy.path,
      status: `Opening ${fuzzy.title}…`,
      confidence: "medium",
      heard: trimmed,
      targetTitle: fuzzy.title,
    };
  }

  // Try phonetic match on the text to see if it corrects to a known route
  const corrected = resolvePhonetic(trimmed);
  if (corrected !== trimmed) {
    const phoneticMatch = matchRouteStrict(corrected);
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

  // Try prefix-stripped version for nav phrases
  if (hasNavPrefix(trimmed)) {
    const navTarget = stripNavPrefix(trimmed);
    if (navTarget && navTarget !== trimmed) {
      const strippedMatch = matchRouteStrict(navTarget);
      if (strippedMatch) {
        return {
          type: "navigate",
          path: strippedMatch.path,
          status: `Opening ${strippedMatch.title}…`,
          confidence: "high",
          heard: trimmed,
          targetTitle: strippedMatch.title,
        };
      }
    }
  }

  return null;
}

/* ── Main Command Resolver ── */

export function resolveVoiceCommand(text: string, pathname: string): VoiceCommandAction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Context-aware page actions (go back, go home, scroll, refresh)
  const contextAction = buildContextAction(trimmed);
  if (contextAction) {
    voiceLog(trimmed, contextAction);
    return contextAction;
  }

  // 2. Page actions (highest priority — voice_off, resume, open listing, message seller, tab switch)
  const pageAction = buildPageAction(trimmed, pathname);
  if (pageAction) {
    voiceLog(trimmed, pageAction);
    return pageAction;
  }

  // 3. Compact prefix match — fast path for short nav phrases
  if (trimmed.split(/\s+/).length <= 5) {
    const navTarget = stripNavPrefix(trimmed);
    const compact = compactSpeech(navTarget);
    const prefixDest = findByCompactPrefix(compact);
    if (prefixDest) {
      if (pathname === prefixDest.path || (prefixDest.path.includes("#") && pathname === prefixDest.path.split("#")[0])) {
        const action: VoiceCommandAction = {
          type: "reply",
          status: `You're already on ${prefixDest.title}.`,
          confidence: "high",
          heard: trimmed,
          targetTitle: prefixDest.title,
          message: `You're already on **${prefixDest.title}**. What else can I help with?`,
        };
        voiceLog(trimmed, action);
        return action;
      }
      const action: VoiceCommandAction = {
        type: "navigate",
        path: prefixDest.path,
        status: `Opening ${prefixDest.title}…`,
        confidence: "high",
        heard: trimmed,
        targetTitle: prefixDest.title,
      };
      voiceLog(trimmed, action);
      return action;
    }
  }

  // 4. Route registry match — central phrase → route mapping
  const registryMatch = matchFromRegistry(trimmed, pathname);
  if (registryMatch) {
    voiceLog(trimmed, registryMatch);
    return registryMatch;
  }

  // 5. Search intent — "search BMW 335i", "find iphone under $500"
  if (SEARCH_INTENT.test(trimmed)) {
    const search = buildSearchPath(trimmed);
    if (search) {
      const action: VoiceCommandAction = {
        type: "search",
        path: search.path,
        status: search.status,
        confidence: "high",
        heard: trimmed,
        targetTitle: search.targetTitle,
        query: search.query,
      };
      voiceLog(trimmed, action);
      return action;
    }
  }

  // 6. Selling intent — "sell my ps5", "create a listing"
  const listing = buildListingAction(trimmed);
  if (listing) {
    voiceLog(trimmed, listing);
    return listing;
  }

  // 7. Destination matching with confidence (legacy guide-assistant fallback)
  const navTarget = stripNavPrefix(trimmed);
  const hasNav = hasNavPrefix(trimmed);
  const dest = findBestDestination(trimmed) ?? (navTarget !== trimmed ? findBestDestination(navTarget) : null);
  const destScore = dest ? Math.max(scoreDestination(trimmed, dest), scoreDestination(navTarget, dest)) : 0;

  const compactTrimmed = compactSpeech(trimmed);
  const compactTarget = compactSpeech(navTarget);
  const matchesDestination = (d: GuideDestination) =>
    compactSpeech(d.id) === compactTrimmed ||
    compactSpeech(d.id) === compactTarget ||
    d.keywords.some((kw) => {
      const c = compactSpeech(kw);
      return c === compactTrimmed || c === compactTarget;
    });

  const barePageName =
    dest &&
    trimmed.split(/\s+/).length <= 5 &&
    matchesDestination(dest);

  const myXPhrase = /^my\s+\w+/i.test(trimmed) && trimmed.split(/\s+/).length <= 3;

  const wantsNav =
    hasNav ||
    /\b(take me|go to|open|show me|show|navigate|bring me|send me|guide me|bring up|go into|view|head to|my messages|my purchases|my sales|my profile|my listings|my watchlist|my orders)\b/i.test(trimmed) ||
    destScore >= 3 ||
    barePageName ||
    myXPhrase;

  if (dest && wantsNav) {
    const same =
      pathname === dest.path ||
      (dest.path.includes("#") && pathname === dest.path.split("#")[0]);

    if (same) {
      const action: VoiceCommandAction = {
        type: "reply",
        status: `You're already on ${dest.title}.`,
        confidence: "high",
        heard: trimmed,
        targetTitle: dest.title,
        message: `You're already on **${dest.title}**. What else can I help with?`,
      };
      voiceLog(trimmed, action);
      return action;
    }

    const confidence = computeConfidence(trimmed, dest, destScore);
    const action: VoiceCommandAction = {
      type: "navigate",
      path: dest.path,
      status: `Opening ${dest.title}…`,
      confidence,
      heard: trimmed,
      targetTitle: dest.title,
    };
    voiceLog(trimmed, action);
    return action;
  }

  // 8. Guide assistant fallback
  const guide = getGuideReply(trimmed, pathname);
  if (guide.navigateTo) {
    const destTitle = guide.destination?.title ?? "that page";
    const action: VoiceCommandAction = {
      type: "navigate",
      path: guide.navigateTo,
      status: guide.destination ? `Opening ${guide.destination.title}…` : "On my way…",
      confidence: "medium",
      heard: trimmed,
      targetTitle: destTitle,
    };
    voiceLog(trimmed, action);
    return action;
  }

  if (guide.text && !guide.text.includes("Tell me what you need")) {
    const action: VoiceCommandAction = {
      type: "reply",
      status: "Here's what I found…",
      confidence: "medium",
      heard: trimmed,
      message: guide.text.replace(/\*\*([^*]+)\*\*/g, "$1"),
    };
    voiceLog(trimmed, action);
    return action;
  }

  voiceLog(trimmed, null);
  return null;
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
