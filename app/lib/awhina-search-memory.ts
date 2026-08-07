/**
 * Search follow-up session memory.
 * Accumulates refinements: "BMWs" → "Only Auckland" → "Under 15k" → "Manual only"
 * Server-safe; keyed by conversation / uid / anonymous session.
 */

import {
  buildFindSearchPath,
  extractFindSearchTerm,
  parseFindBudget,
  parseFindCity,
  resolveFindBrowseRoute,
} from "./sky-ai-find-routing";

export type SearchSessionFilters = {
  query?: string;
  maxPrice?: string;
  minPrice?: string;
  location?: string;
  category?: string;
  transmission?: string;
  condition?: string;
};

export type SearchSession = {
  filters: SearchSessionFilters;
  updatedAt: number;
};

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 500;
const sessions = new Map<string, SearchSession>();

const TRANSMISSION_RE =
  /\b(manual(?:\s+only)?|automatic(?:\s+only)?|auto(?:\s+only)?|cvt)\b/i;
const CONDITION_RE =
  /\b(new|used|like new|excellent|good|fair|refurbished)\b/i;
const LOCATION_ONLY_RE =
  /\b(?:only|just|in|near|around)\s+(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|new plymouth|rotorua|queenstown|invercargill|nelson|whangarei|gisborne)\b/i;
const BARE_CITY_RE =
  /^(only\s+)?(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|new plymouth|rotorua|queenstown|invercargill|nelson|whangarei|gisborne)\s*(only)?$/i;
const REFINEMENT_HINT =
  /\b(under|up to|max|budget|only|just|filter|manual|automatic|auto|cvt|near|around|in|below|less than)\b/i;

function pruneSessions(): void {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now - v.updatedAt > SESSION_TTL_MS) sessions.delete(k);
  }
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (let i = 0; i < oldest.length - MAX_SESSIONS; i++) {
      sessions.delete(oldest[i][0]);
    }
  }
}

export function searchSessionKey(opts: {
  conversationId?: string;
  uid?: string | null;
  pathname?: string;
}): string {
  if (opts.conversationId) return `c:${opts.conversationId}`;
  if (opts.uid) return `u:${opts.uid}`;
  return `anon:${opts.pathname || "/"}`;
}

export function getSearchSession(key: string): SearchSession | null {
  pruneSessions();
  const s = sessions.get(key);
  if (!s) return null;
  if (Date.now() - s.updatedAt > SESSION_TTL_MS) {
    sessions.delete(key);
    return null;
  }
  return s;
}

export function clearSearchSession(key: string): void {
  sessions.delete(key);
}

export function parseTransmission(message: string): string | undefined {
  const m = message.match(TRANSMISSION_RE);
  if (!m) return undefined;
  const raw = m[1].toLowerCase();
  if (raw.startsWith("manual")) return "manual";
  if (raw.startsWith("cvt")) return "cvt";
  return "automatic";
}

export function parseConditionFilter(message: string): string | undefined {
  const m = message.match(CONDITION_RE);
  return m ? m[1].toLowerCase() : undefined;
}

/** Extract incremental filter deltas from a message. */
export function extractSearchRefinement(message: string): SearchSessionFilters {
  const filters: SearchSessionFilters = {};
  const budget = parseFindBudget(message);
  if (budget) filters.maxPrice = budget;

  const city = parseFindCity(message) || (() => {
    const bare = message.trim().match(BARE_CITY_RE) || message.match(LOCATION_ONLY_RE);
    if (!bare) return undefined;
    const cityRaw = (bare[2] || bare[1] || "").trim();
    if (!cityRaw) return undefined;
    return cityRaw
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  })();
  if (city) filters.location = city;

  const transmission = parseTransmission(message);
  if (transmission) filters.transmission = transmission;

  const condition = parseConditionFilter(message);
  if (condition) filters.condition = condition;

  const term = extractFindSearchTerm(message);
  if (term !== "what you're after" && term.length >= 2) {
    // Don't treat pure refinement phrases as a new query
    const isPureRefine =
      REFINEMENT_HINT.test(message) &&
      !/\b(bmw|bmws|toyota|mazda|honda|ford|iphone|ps5|laptop|cars?|utes?|vans?)\b/i.test(message) &&
      (Boolean(budget) || Boolean(city) || Boolean(transmission) || BARE_CITY_RE.test(message.trim()));
    if (!isPureRefine) {
      filters.query = term;
    }
  }

  return filters;
}

export function mergeSearchFilters(
  prior: SearchSessionFilters,
  next: SearchSessionFilters
): SearchSessionFilters {
  return {
    query: next.query ?? prior.query,
    maxPrice: next.maxPrice ?? prior.maxPrice,
    minPrice: next.minPrice ?? prior.minPrice,
    location: next.location ?? prior.location,
    category: next.category ?? prior.category,
    transmission: next.transmission ?? prior.transmission,
    condition: next.condition ?? prior.condition,
  };
}

export function updateSearchSession(
  key: string,
  next: SearchSessionFilters
): SearchSessionFilters {
  pruneSessions();
  const prior = sessions.get(key)?.filters || {};
  const merged = mergeSearchFilters(prior, next);
  sessions.set(key, { filters: merged, updatedAt: Date.now() });
  return merged;
}

export function isSearchFollowUp(
  message: string,
  session: SearchSession | null
): boolean {
  if (!session?.filters?.query && !session?.filters?.location && !session?.filters?.maxPrice) {
    return false;
  }
  const m = message.trim();
  if (!m || m.length > 80) return false;
  if (BARE_CITY_RE.test(m)) return true;
  if (parseFindBudget(m) || parseFindCity(m) || parseTransmission(m)) return true;
  if (REFINEMENT_HINT.test(m) && m.split(/\s+/).length <= 6) return true;
  return false;
}

export function buildSearchPathFromFilters(filters: SearchSessionFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters.minPrice) params.set("minPrice", filters.minPrice);
  if (filters.location) params.set("location", filters.location);
  if (filters.category) params.set("category", filters.category);
  if (filters.transmission) params.set("transmission", filters.transmission);
  if (filters.condition) params.set("condition", filters.condition);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function buildSearchFollowUpReply(filters: SearchSessionFilters): {
  text: string;
  navigateTo: string;
} {
  const path = filters.query
    ? buildSearchPathFromFilters(filters)
    : buildFindSearchPath({
        q: filters.query || "",
        maxPrice: filters.maxPrice,
        location: filters.location,
      });

  let line = filters.query
    ? `Opening **${filters.query}** listings`
    : "Opening search results";

  if (filters.maxPrice) {
    line += ` under **$${Number(filters.maxPrice).toLocaleString("en-NZ")}**`;
  }
  if (filters.location) {
    line += ` in **${filters.location}**`;
  }
  if (filters.transmission) {
    line += ` · **${filters.transmission}**`;
  }
  if (filters.condition) {
    line += ` · **${filters.condition}**`;
  }

  return {
    text: `${line}... [[NAV:${path}]]`,
    navigateTo: path,
  };
}

/** Start or refresh a search session from a primary find message. */
export function rememberPrimarySearch(
  key: string,
  message: string
): SearchSessionFilters {
  const route = resolveFindBrowseRoute(message, {
    budget: parseFindBudget(message),
    city: parseFindCity(message),
  });
  const next: SearchSessionFilters = {
    query: route.searchTerm !== "what you're after" ? route.searchTerm : undefined,
    maxPrice: parseFindBudget(message),
    location: parseFindCity(message),
    transmission: parseTransmission(message),
    condition: parseConditionFilter(message),
  };
  return updateSearchSession(key, next);
}
