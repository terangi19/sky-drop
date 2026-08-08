/**
 * Search follow-up session memory.
 * Accumulates refinements: "BMWs" → "Only Auckland" → "Under 15k" → "Manual only"
 * Server-safe; keyed by conversation / uid / anonymous session.
 * Maps are cache only — hydrate from client context when cold.
 */

import {
  buildFindSearchPath,
  extractFindSearchTerm,
  parseFindBudget,
  parseFindCity,
  parseVehicleMake,
  parseVehicleModel,
  parseVehicleYear,
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
  /** Vehicle entity fields — year ≠ price */
  make?: string;
  model?: string;
  year?: string;
  minYear?: string;
  maxYear?: string;
};

export type SearchSession = {
  filters: SearchSessionFilters;
  updatedAt: number;
};

export type ClientSearchContext = {
  filters?: SearchSessionFilters;
  updatedAt?: number;
};

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 500;
const sessions = new Map<string, SearchSession>();

const TRANSMISSION_RE =
  /\b(manual(?:\s+only)?|automatic(?:\s+only)?|auto(?:\s+only)?|cvt)\b/i;
const CONDITION_RE =
  /\b(new|used|like new|excellent|good|fair|refurbished)\b/i;
const LOCATION_ONLY_RE =
  /\b(?:only|just|in|near|around|location(?:\s+is)?|located(?:\s+in)?)\s+(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|new plymouth|rotorua|queenstown|invercargill|nelson|whangarei|gisborne)\b/i;
const BARE_CITY_RE =
  /^(only\s+)?(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|new plymouth|rotorua|queenstown|invercargill|nelson|whangarei|gisborne)\s*(only)?$/i;
const REFINEMENT_HINT =
  /\b(under|up to|max|budget|only|just|filter|manual|automatic|auto|cvt|near|around|in|below|less than|cheapest|newest|nearby|hide sold|excellent|actually|location|year|model)\b/i;

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
  anonSessionId?: string;
}): string {
  if (opts.conversationId) return `c:${opts.conversationId}`;
  if (opts.uid) return `u:${opts.uid}`;
  if (opts.anonSessionId) return `anon:${opts.anonSessionId}`;
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

export function hydrateSearchSession(
  key: string,
  client?: ClientSearchContext | null
): SearchSession | null {
  if (!client?.filters) return getSearchSession(key);
  const existing = getSearchSession(key);
  if (existing && existing.updatedAt >= (client.updatedAt || 0)) return existing;
  const next: SearchSession = {
    filters: client.filters,
    updatedAt: client.updatedAt || Date.now(),
  };
  sessions.set(key, next);
  return next;
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

function buildVehicleQuery(filters: SearchSessionFilters): string | undefined {
  const parts = [filters.make, filters.model, filters.year].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return filters.query;
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

  const make = parseVehicleMake(message);
  if (make) filters.make = make;
  const model = parseVehicleModel(message);
  if (model) filters.model = model;
  const year = parseVehicleYear(message);
  if (year) {
    filters.year = year;
    filters.minYear = year;
    filters.maxYear = year;
  }

  const term = extractFindSearchTerm(message);
  if (term !== "what you're after" && term.length >= 2) {
    const isPureRefine =
      REFINEMENT_HINT.test(message) &&
      !/\b(bmw|bmws|toyota|mazda|honda|ford|iphone|ps5|xbox|laptop|cars?|utes?|vans?|335i|330i)\b/i.test(
        message
      ) &&
      (Boolean(budget) ||
        Boolean(city) ||
        Boolean(transmission) ||
        Boolean(sortBy) ||
        Boolean(hideSold) ||
        Boolean(condition) ||
        BARE_CITY_RE.test(message.trim()));
    if (!isPureRefine && !brand) {
      // Never keep dialogue-only residue in the canonical query
      const sanitized = term
        .replace(
          /(^|\s)(yes|yep|yeah|yup|ok|okay|sure|alright|cool|please)(?=\s|$)/gi,
          " "
        )
        .replace(/\s+/g, " ")
        .trim();
      if (sanitized.length >= 2) filters.query = sanitized;
    }
  }

  // Prefer structured vehicle query over loose term when make/model present
  const vehicleQ = buildVehicleQuery(filters);
  if (vehicleQ && (filters.make || filters.model)) {
    filters.query = vehicleQ;
  }

  return filters;
}

export function mergeSearchFilters(
  prior: SearchSessionFilters,
  next: SearchSessionFilters
): SearchSessionFilters {
  const merged: SearchSessionFilters = {
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
    make: next.make ?? prior.make,
    model: next.model ?? prior.model,
    year: next.year ?? prior.year,
    minYear: next.minYear ?? prior.minYear,
    maxYear: next.maxYear ?? prior.maxYear,
  };
  // Rebuild query from make/model/year when entities updated
  if (next.make || next.model || next.year) {
    const vq = buildVehicleQuery(merged);
    if (vq) merged.query = vq;
  }
  return merged;
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
    !session?.filters?.sortBy &&
    !session?.filters?.make
  ) {
    return false;
  }
  const m = message.trim();
  if (!m || m.length > 160) return false;
  if (BARE_CITY_RE.test(m)) return true;
  if (parseFindBudget(m) || parseFindCity(m) || parseTransmission(m)) return true;
  if (parseVehicleYear(m) || parseVehicleModel(m) || parseVehicleMake(m)) return true;
  if (parseSearchSort(m) || parseHideSold(m) || parseBrandStrict(m)) return true;
  if (EXCELLENT_ONLY_RE.test(m) || parseConditionFilter(m)) return true;
  if (REFINEMENT_HINT.test(m) && m.split(/\s+/).length <= 16) return true;
  // Vehicle refinement while shopping (make/model/year/budget/location)
  if (
    session.filters.make ||
    /\bbmw|toyota|mazda|honda|ford\b/i.test(session.filters.query || "")
  ) {
    if (/\b(budget|location|manual|automatic|\d{4}|15k|under)\b/i.test(m)) return true;
  }
  return false;
}

export function buildSearchPathFromFilters(filters: SearchSessionFilters): string {
  const params = new URLSearchParams();
  const q = buildVehicleQuery(filters) || filters.query;
  if (q) params.set("q", q);
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters.minPrice) params.set("minPrice", filters.minPrice);
  if (filters.location) params.set("location", filters.location);
  if (filters.category) params.set("category", filters.category);
  if (filters.transmission) params.set("transmission", filters.transmission);
  if (filters.condition) params.set("condition", filters.condition);
  if (filters.make) params.set("make", filters.make);
  if (filters.model) params.set("model", filters.model);
  if (filters.year) params.set("year", filters.year);
  if (filters.minYear) params.set("minYear", filters.minYear);
  if (filters.maxYear) params.set("maxYear", filters.maxYear);
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
  const displayQuery = buildVehicleQuery(filters) || filters.query;
  const path = displayQuery
    ? buildSearchPathFromFilters(filters)
    : buildFindSearchPath({
        q: filters.query || "",
        maxPrice: filters.maxPrice,
        location: filters.location,
      });

  let line: string;
  if (filters.sortBy === "price-low" && displayQuery) {
    line = `Cheapest **${displayQuery}** first`;
  } else if (filters.sortBy === "newest" && displayQuery) {
    line = `Newest **${displayQuery}** first`;
  } else if (filters.sortBy === "distance" && displayQuery) {
    line = filters.location
      ? `Closest **${displayQuery}** near **${filters.location}**`
      : `Closest **${displayQuery}**`;
  } else if (displayQuery) {
    line = `**${displayQuery}** listings`;
  } else {
    line = "Search results";
  }

  if (filters.maxPrice) {
    line += ` under **$${Number(filters.maxPrice).toLocaleString("en-NZ")}**`;
  }
  if (filters.location && filters.sortBy !== "distance") {
    line += ` in **${filters.location}**`;
  }
  if (filters.year && !displayQuery?.includes(filters.year)) {
    line += ` · **${filters.year}**`;
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

  let navigateTo = path;
  if (!displayQuery) {
    navigateTo = buildSearchPathFromFilters(filters);
  } else if (
    filters.sortBy ||
    filters.hideSold ||
    filters.brandStrict ||
    filters.make ||
    filters.year
  ) {
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
  const delta = extractSearchRefinement(message);
  const next: SearchSessionFilters = {
    query:
      delta.query ||
      (route.searchTerm !== "what you're after" ? route.searchTerm : undefined),
    maxPrice: parseFindBudget(message),
    location: parseFindCity(message) || delta.location,
    transmission: parseTransmission(message),
    condition: parseConditionFilter(message),
    sortBy: parseSearchSort(message),
    hideSold: parseHideSold(message),
    brandStrict: parseBrandStrict(message)?.brandStrict,
    make: delta.make,
    model: delta.model,
    year: delta.year,
    minYear: delta.minYear,
    maxYear: delta.maxYear,
  };
  const brand = parseBrandStrict(message);
  if (brand?.query) next.query = brand.query;
  const vq = buildVehicleQuery(next);
  if (vq && (next.make || next.model)) next.query = vq;
  return updateSearchSession(key, next);
}

export function toClientSearchContext(session: SearchSession | null): ClientSearchContext | undefined {
  if (!session?.filters) return undefined;
  return { filters: session.filters, updatedAt: session.updatedAt };
}
