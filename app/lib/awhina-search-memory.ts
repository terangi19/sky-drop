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

export type SearchSortBy = "price-low" | "price-high" | "newest" | "distance" | "relevance";

export type SearchSessionFilters = {
  query?: string;
  maxPrice?: string;
  minPrice?: string;
  location?: string;
  category?: string;
  transmission?: string;
  condition?: string;
  /** Natural sort: cheapest, newest, nearby */
  sortBy?: SearchSortBy;
  /** Hide sold / ended listings when true */
  hideSold?: boolean;
  /** Strict brand match e.g. "actually Xbox" */
  brandStrict?: boolean;
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
  /\b(under|up to|max|budget|only|just|filter|manual|automatic|auto|cvt|near|around|in|below|less than|cheapest|newest|nearby|hide sold|excellent|actually)\b/i;

const CHEAPEST_RE =
  /\b(cheapest|lowest price|best deals?|sort by price|price low to high|make it cheaper)\b/i;
const NEWEST_RE = /\b(newest(?:\s+first)?|most recent|latest|just listed|newly listed)\b/i;
const NEARBY_RE = /\b(nearby|closest|near me|close to me|nearest)\b/i;
const HIDE_SOLD_RE = /\b(hide sold|without sold|exclude sold|active only|not sold|available only)\b/i;
const BRAND_STRICT_RE =
  /\b(?:actually|only|just|strictly)\s+(xbox|playstation|ps5|ps4|iphone|samsung|bmw|toyota|mazda|honda|nintendo|switch)\b/i;
const EXCELLENT_ONLY_RE =
  /\b(excellent(?:\s+condition)?(?:\s+only)?|only excellent|mint(?:\s+condition)?(?:\s+only)?)\b/i;

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
  if (EXCELLENT_ONLY_RE.test(message)) return "excellent";
  const m = message.match(CONDITION_RE);
  return m ? m[1].toLowerCase() : undefined;
}

export function parseSearchSort(message: string): SearchSortBy | undefined {
  if (CHEAPEST_RE.test(message)) return "price-low";
  if (NEWEST_RE.test(message)) return "newest";
  if (NEARBY_RE.test(message)) return "distance";
  return undefined;
}

export function parseHideSold(message: string): boolean | undefined {
  if (HIDE_SOLD_RE.test(message)) return true;
  return undefined;
}

export function parseBrandStrict(message: string): { brandStrict: true; query?: string } | undefined {
  const m = message.match(BRAND_STRICT_RE);
  if (!m) return undefined;
  const brand = m[1];
  const normalized =
    /^ps/i.test(brand) || /playstation/i.test(brand)
      ? brand.toUpperCase().replace("PLAYSTATION", "PlayStation")
      : brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
  return { brandStrict: true, query: normalized === "Xbox" ? "Xbox" : normalized };
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

  const sortBy = parseSearchSort(message);
  if (sortBy) filters.sortBy = sortBy;

  const hideSold = parseHideSold(message);
  if (hideSold) filters.hideSold = true;

  const brand = parseBrandStrict(message);
  if (brand) {
    filters.brandStrict = true;
    if (brand.query) filters.query = brand.query;
  }

  const term = extractFindSearchTerm(message);
  if (term !== "what you're after" && term.length >= 2) {
    // Don't treat pure refinement phrases as a new query
    const isPureRefine =
      REFINEMENT_HINT.test(message) &&
      !/\b(bmw|bmws|toyota|mazda|honda|ford|iphone|ps5|xbox|laptop|cars?|utes?|vans?)\b/i.test(message) &&
      (Boolean(budget) ||
        Boolean(city) ||
        Boolean(transmission) ||
        Boolean(sortBy) ||
        Boolean(hideSold) ||
        Boolean(condition) ||
        BARE_CITY_RE.test(message.trim()));
    if (!isPureRefine && !brand) {
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
    sortBy: next.sortBy ?? prior.sortBy,
    hideSold: next.hideSold ?? prior.hideSold,
    brandStrict: next.brandStrict ?? prior.brandStrict,
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
  if (
    !session?.filters?.query &&
    !session?.filters?.location &&
    !session?.filters?.maxPrice &&
    !session?.filters?.sortBy
  ) {
    return false;
  }
  const m = message.trim();
  if (!m || m.length > 80) return false;
  if (BARE_CITY_RE.test(m)) return true;
  if (parseFindBudget(m) || parseFindCity(m) || parseTransmission(m)) return true;
  if (parseSearchSort(m) || parseHideSold(m) || parseBrandStrict(m)) return true;
  if (EXCELLENT_ONLY_RE.test(m) || parseConditionFilter(m)) return true;
  if (REFINEMENT_HINT.test(m) && m.split(/\s+/).length <= 8) return true;
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
  if (filters.sortBy && filters.sortBy !== "relevance") {
    params.set("sortBy", filters.sortBy);
  }
  if (filters.hideSold) params.set("hideSold", "1");
  if (filters.brandStrict) params.set("brandStrict", "1");
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

  // Natural / delight phrasing
  let line: string;
  if (filters.sortBy === "price-low" && filters.query) {
    line = `Cheapest **${filters.query}** first`;
  } else if (filters.sortBy === "newest" && filters.query) {
    line = `Newest **${filters.query}** first`;
  } else if (filters.sortBy === "distance" && filters.query) {
    line = filters.location
      ? `Closest **${filters.query}** near **${filters.location}**`
      : `Closest **${filters.query}**`;
  } else if (filters.query) {
    line = `**${filters.query}** listings`;
  } else {
    line = "Search results";
  }

  if (filters.maxPrice) {
    line += ` under **$${Number(filters.maxPrice).toLocaleString("en-NZ")}**`;
  }
  if (filters.location && filters.sortBy !== "distance") {
    line += ` in **${filters.location}**`;
  }
  if (filters.transmission) {
    line += ` · **${filters.transmission}**`;
  }
  if (filters.condition) {
    line += ` · **${filters.condition}**`;
  }
  if (filters.hideSold) {
    line += ` · hiding sold`;
  }
  if (filters.brandStrict) {
    line += ` · exact brand`;
  }

  // Append sort params even when path came from buildFindSearchPath
  let navigateTo = path;
  if (!filters.query) {
    navigateTo = buildSearchPathFromFilters(filters);
  } else if (filters.sortBy || filters.hideSold || filters.brandStrict) {
    navigateTo = buildSearchPathFromFilters(filters);
  }

  return {
    text: `${line}. [[NAV:${navigateTo}]]`,
    navigateTo,
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
    sortBy: parseSearchSort(message),
    hideSold: parseHideSold(message),
    brandStrict: parseBrandStrict(message)?.brandStrict,
  };
  const brand = parseBrandStrict(message);
  if (brand?.query) next.query = brand.query;
  return updateSearchSession(key, next);
}
