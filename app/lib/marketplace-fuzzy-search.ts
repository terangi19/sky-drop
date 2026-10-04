/**
 * Marketplace-aware fuzzy search with ranking.
 * Searches title, description, category, vehicle fields, tags, and keywords.
 */

import { phoneticSimilarity } from "./voice-phonetic";
import {
  normalizeMarketplaceSearchQuery,
  processVoiceSearchTranscript,
  type VoiceSearchIntent,
} from "./voice-search-pipeline";

export type ListingSearchRecord = Record<string, unknown> & {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  type?: string;
  tags?: string[];
  keywords?: string[];
  searchKeywords?: string[];
  aiKeywords?: string[];
  vehicleMake?: string;
  vehicleModel?: string;
  make?: string;
  model?: string;
  vehicleYear?: string | number;
  year?: string | number;
  location?: string;
  servicePricingType?: string;
  serviceDuration?: string;
  rentalSubType?: string;
  rentalDeposit?: string | number;
  rentalAvailableDate?: string;
  rentalPriceWeekly?: string | number;
  rentalPriceMonthly?: string | number;
};

export type RankedListing = {
  listing: ListingSearchRecord;
  score: number;
  matchType: "exact" | "close" | "similar" | "partial";
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function tokenSimilarity(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (!al || !bl) return 0;
  if (al === bl) return 1;
  if (al.includes(bl) || bl.includes(al)) return 0.88;
  const dist = levenshtein(al, bl);
  const maxLen = Math.max(al.length, bl.length);
  const levScore = maxLen > 0 ? 1 - dist / maxLen : 0;
  const phonScore = phoneticSimilarity(al, bl);
  return Math.max(levScore, phonScore);
}

/**
 * Identity text = fields that say WHAT the listing is: title, vehicle make/model, category,
 * type (+ its service/rental synonyms) and location. Free text (description) and keyword
 * arrays (tags / keywords / searchKeywords / aiKeywords) are deliberately excluded.
 */
function listingIdentityText(listing: ListingSearchRecord): string {
  const type = String(listing.type ?? "").toLowerCase();
  const typeSynonyms =
    type === "service" ? ["service", "provider", "hire"] : type === "rental" ? ["rental", "rent", "hire"] : [];
  return [
    listing.title,
    listing.vehicleMake,
    listing.vehicleModel,
    listing.make,
    listing.model,
    listing.category,
    listing.type,
    ...typeSynonyms,
    listing.location,
  ]
    .filter((x) => x != null && x !== "")
    .map(String)
    .join(" ");
}

/**
 * Filler words ignored by the multi-token coverage gate (they say nothing about WHAT the
 * item is, and rarely appear in titles). Deliberately small and conservative: no product,
 * brand, colour, size or category words. Ignoring a word only ever LOOSENS the gate; the
 * remaining content tokens must still all be covered.
 */
const COVERAGE_STOPWORDS: ReadonlySet<string> = new Set([
  "for", "the", "and", "with", "near", "sale", "cheap", "used", "new", "best",
  "good", "great", "buy", "selling", "wanted", "secondhand",
]);

/** Two-word filler phrases removed before single-word stopword filtering. */
const COVERAGE_STOP_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ["second", "hand"],
  ["brand", "new"],
];

/** Tokens the coverage gate must see in the listing's identity text (len >= 3, not filler). */
function contentTokensForCoverage(tokens: string[]): string[] {
  const lower = tokens.map((x) => x.toLowerCase());
  const out: string[] = [];
  for (let i = 0; i < lower.length; i++) {
    const next = lower[i + 1];
    if (next && COVERAGE_STOP_PHRASES.some(([x, y]) => lower[i] === x && next === y)) {
      i++;
      continue;
    }
    const t = lower[i];
    if (t.length >= 3 && !COVERAGE_STOPWORDS.has(t)) out.push(t);
  }
  return out;
}

/** True when a and b have the same length (>= 4) and differ only by one adjacent swap ("lmap"/"lamp"). */
function isAdjacentTransposition(a: string, b: string): boolean {
  if (a.length !== b.length || a.length < 4 || a === b) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return (
    i + 1 < a.length && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
  );
}

/** Vowel-less shorthand: "dsk" (3-4 letters, a-z only) is the consonant skeleton of "desk". */
function isConsonantSkeletonOf(token: string, word: string): boolean {
  if (token.length < 3 || token.length > 4 || !/^[a-z]+$/.test(token) || !/^[a-z]+$/.test(word)) return false;
  if (/[aeiou]/.test(token) || word.length <= token.length) return false;
  return word.replace(/[aeiou]/g, "") === token;
}

export type TokenCoverageDecision = {
  token: string;
  covered: boolean;
  via: "substring" | "similarity" | "plural" | "transposition" | "skeleton" | "none";
  word?: string;
  similarity?: number;
};

/**
 * Does the identity text cover this query token? (token is already lower-case, len >= 3)
 *  - substring of the identity text; or
 *  - best word similarity (existing tokenSimilarity): >= 0.8 for tokens of length >= 4,
 *    >= 0.9 for length 3, only against words of comparable length (shorter/longer >= 0.8); or
 *  - light plural/suffix match (short side is a prefix; 1 extra char if the shorter side is 3 chars, <= 2 if >= 4); or
 *  - (length >= 4) a single adjacent-letter swap ("lmap" ~ "lamp"); or
 *  - (length 3-4) a vowel-less skeleton ("dsk" ~ "desk").
 */
function explainTokenCoverage(identityText: string, token: string): TokenCoverageDecision {
  const t = token.toLowerCase();
  const hay = identityText.toLowerCase();
  if (hay.includes(t)) return { token: t, covered: true, via: "substring" };
  const need = t.length >= 4 ? 0.8 : 0.9;
  let best: TokenCoverageDecision = { token: t, covered: false, via: "none", similarity: 0 };
  for (const ht of hay.split(/\s+/).filter(Boolean)) {
    const sim = tokenSimilarity(t, ht);
    // Length guard: tokenSimilarity scores ANY containment as 0.88, so without this a short
    // identity word ("one", "ent") would "cover" a long nonsense token ("nonexistent").
    const comparable = Math.min(t.length, ht.length) / Math.max(t.length, ht.length) >= 0.8;
    if (comparable && sim >= need) return { token: t, covered: true, via: "similarity", word: ht, similarity: sim };
    const [short, long] = t.length <= ht.length ? [t, ht] : [ht, t];
    const extra = long.length - short.length;
    if (short.length >= 3 && extra <= (short.length >= 4 ? 2 : 1) && long.startsWith(short)) {
      return { token: t, covered: true, via: "plural", word: ht, similarity: sim };
    }
    if (isAdjacentTransposition(t, ht)) return { token: t, covered: true, via: "transposition", word: ht, similarity: sim };
    if (isConsonantSkeletonOf(t, ht)) return { token: t, covered: true, via: "skeleton", word: ht, similarity: sim };
    if (sim > (best.similarity ?? 0)) best = { token: t, covered: false, via: "none", word: ht, similarity: sim };
  }
  return best;
}

/**
 * Per-token coverage decisions for a multi-token query (exported for tests / diagnostics).
 * Returns [] when the query has fewer than 2 content tokens (gate does not apply).
 */
export function explainMultiTokenCoverage(
  listing: ListingSearchRecord,
  tokens: string[]
): TokenCoverageDecision[] {
  const content = contentTokensForCoverage(tokens);
  if (content.length < 2) return [];
  const identityText = listingIdentityText(listing);
  return content.map((t) => explainTokenCoverage(identityText, t));
}

/**
 * Multi-token queries must cover EVERY content token (len >= 3, filler words like "for sale"
 * ignored) in the listing's identity text (see listingIdentityText), with typo tolerance
 * (explainTokenCoverage). Description and keyword arrays alone must NOT clear minScore
 * ("...for Sky Drop messaging..." pollution). Fewer than 2 content tokens => gate off, i.e.
 * the original single-token behaviour.
 */
function meetsMultiTokenTitleCoverage(
  listing: ListingSearchRecord,
  tokens: string[]
): boolean {
  return explainMultiTokenCoverage(listing, tokens).every((d) => d.covered);
}

function fieldWeight(field: string): number {
  switch (field) {
    case "title":
      return 5.0; // Increased from 3.2 to prioritize exact title matches
    case "vehicleMake":
    case "vehicleModel":
    case "make":
    case "model":
      return 4.0; // Increased from 2.8
    case "category":
      return 3.0; // Increased from 2.2
    case "tags":
    case "keywords":
    case "searchKeywords":
    case "aiKeywords":
      return 2.5; // Increased from 2
    case "description":
      return 1.0; // Decreased from 1.4 to reduce weight of description matches
    case "type":
      return 1.2;
    default:
      return 1;
  }
}

/** Build a searchable text blob from all listing fields. */
export function buildListingSearchBlob(listing: ListingSearchRecord): string {
  const parts: string[] = [
    listing.title || "",
    listing.description || "",
    listing.category || "",
    listing.type || "",
    listing.vehicleMake || "",
    listing.vehicleModel || "",
    listing.make || "",
    listing.model || "",
    listing.vehicleYear != null ? String(listing.vehicleYear) : "",
    listing.year != null ? String(listing.year) : "",
    listing.location || "",
    listing.servicePricingType || "",
    listing.serviceDuration || "",
    listing.rentalSubType || "",
    listing.rentalDeposit != null ? String(listing.rentalDeposit) : "",
    listing.rentalAvailableDate || "",
    listing.rentalPriceWeekly != null ? String(listing.rentalPriceWeekly) : "",
    listing.rentalPriceMonthly != null ? String(listing.rentalPriceMonthly) : "",
  ];
  // Synonyms so "photographer" / "trailer rental" / "cleaner" hit typed listings
  const t = (listing.type || "").toLowerCase();
  if (t === "service") parts.push("service", "provider", "hire");
  if (t === "rental") parts.push("rental", "rent", "hire", "for hire");

  for (const key of ["tags", "keywords", "searchKeywords", "aiKeywords"] as const) {
    const val = listing[key];
    if (Array.isArray(val)) parts.push(...val.map(String));
    else if (typeof val === "string") parts.push(val);
  }

  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchTypeFromScore(score: number): RankedListing["matchType"] {
  if (score >= 10) return "exact";
  if (score >= 6) return "close";
  if (score >= 3.5) return "similar";
  return "partial";
}

/**
 * Score a single listing against a search intent or query string.
 * A plain string is treated as TYPED text (no brand_fuzzy/model_fuzzy); pass a
 * VoiceSearchIntent from processVoiceSearchTranscript for the full voice pipeline.
 */
export function scoreListingMatch(
  listing: ListingSearchRecord,
  queryOrIntent: string | VoiceSearchIntent
): number {
  const intent =
    typeof queryOrIntent === "string"
      ? processVoiceSearchTranscript(queryOrIntent, { allowBrandFuzzy: false })
      : queryOrIntent;

  const query =
    intent?.searchQuery ?? normalizeMarketplaceSearchQuery(String(queryOrIntent));
  const tokens = intent?.tokens ?? query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  const blob = buildListingSearchBlob(listing);
  if (!blob) return 0;

  // M1: multi-token queries need title coverage for every significant token, so
  // description / aiKeywords pollution ("...Sky Drop messaging...") cannot clear minScore.
  if (!meetsMultiTokenTitleCoverage(listing, tokens)) return 0;

  const make = String(listing.vehicleMake ?? listing.make ?? "").toLowerCase();
  const model = String(listing.vehicleModel ?? listing.model ?? "").toLowerCase();
  const blobTokens = blob.split(/\s+/).filter(Boolean);
  let score = 0;

  // Full phrase bonus
  if (blob.includes(query)) score += 6;

  // Per-token field-weighted matching
  for (const token of tokens) {
    if (token.length < 2) continue;

    const title = (listing.title ?? "").toLowerCase();
    const desc = (listing.description ?? "").toLowerCase();
    const cat = (listing.category ?? "").toLowerCase();

    if (title.includes(token)) score += fieldWeight("title") * 1.1;
    if (make.includes(token) || model.includes(token)) score += fieldWeight("make");
    if (cat.includes(token)) score += fieldWeight("category");
    if (desc.includes(token)) score += fieldWeight("description");

    let bestTokenSim = 0;
    for (const bt of blobTokens) {
      const sim = tokenSimilarity(token, bt);
      if (sim > bestTokenSim) bestTokenSim = sim;
      if (bestTokenSim >= 0.95) break;
    }
    if (bestTokenSim >= 0.72) score += bestTokenSim * 2.2;
  }

  // Category hint boost
  if (intent?.categoryHint && listing.category?.toLowerCase() === intent.categoryHint.toLowerCase()) {
    score += 3.0; // Increased from 1.5 to prioritize category matches
  }

  // Auto-detect category from query and boost matching listings
  if (!intent?.categoryHint) {
    const queryLower = query.toLowerCase();
    const categoryLower = (listing.category ?? "").toLowerCase();
    
    // Vehicle-related terms
    if (queryLower.match(/\b(bmw|toyota|honda|ford|audi|mercedes|car|vehicle|suv|truck|van|ute|sedan|hatchback|coupe|convertible|wagon)\b/)) {
      if (categoryLower.includes("vehicle") || categoryLower.includes("car")) {
        score += 2.5;
      }
    }
    
    // Electronics-related terms
    if (queryLower.match(/\b(iphone|samsung|phone|laptop|macbook|ipad|ps5|playstation|xbox|tv|television|camera|gaming|console)\b/)) {
      if (categoryLower.includes("electronics") || categoryLower.includes("tech") || categoryLower.includes("computers")) {
        score += 2.5;
      }
    }
    
    // Home-related terms
    if (queryLower.match(/\b(sofa|couch|table|chair|bed|desk|furniture|dining|kitchen|appliance)\b/)) {
      if (categoryLower.includes("home") || categoryLower.includes("furniture") || categoryLower.includes("living")) {
        score += 2.5;
      }
    }

    // Service queries (photographer, cleaner, lawn mowing, etc.)
    if (
      /\b(photographer|photography|cleaner|cleaning|lawn|mowing|handyman|tutor|tutoring|plumber|electrician|service)\b/.test(
        queryLower
      )
    ) {
      if ((listing.type || "").toLowerCase() === "service") score += 3.5;
    }

    // Rental / hire queries
    if (/\b(rent|rental|hire|trailer|bond|per day|\/day)\b/.test(queryLower)) {
      if ((listing.type || "").toLowerCase() === "rental") score += 3.5;
    }
    // Service-related terms
    if (queryLower.match(/\b(service|design|cleaning|mowing|repair|install|consult|freelance)\b/)) {
      if (categoryLower.includes("service") || categoryLower.includes("services")) {
        score += 2.5;
      }
    }
  }

  // Brand + model combo boost (e.g. BMW + 335i)
  if (intent?.brandHint && intent?.modelHint) {
    const blobCompact = blob.replace(/\s+/g, "");
    const combo = `${intent.brandHint}${intent.modelHint}`.replace(/\s+/g, "");
    if (blobCompact.includes(combo) || (make.includes(intent.brandHint) && model.includes(intent.modelHint))) {
      score += 3;
    }
  }

  return score;
}

/** Filter and rank listings by fuzzy relevance. */
export function rankListingsBySearch(
  listings: ListingSearchRecord[],
  queryOrIntent: string | VoiceSearchIntent,
  options?: { minScore?: number; limit?: number }
): RankedListing[] {
  const minScore = options?.minScore ?? 1.8;
  const intent =
    typeof queryOrIntent === "string"
      ? processVoiceSearchTranscript(queryOrIntent, { allowBrandFuzzy: false })
      : queryOrIntent;

  const query = intent?.searchQuery ?? normalizeMarketplaceSearchQuery(String(queryOrIntent));
  if (!query || query.length < 2) return [];

  const ranked: RankedListing[] = [];

  for (const listing of listings) {
    const score = scoreListingMatch(listing, intent ?? query);
    if (score >= minScore) {
      ranked.push({
        listing,
        score,
        matchType: matchTypeFromScore(score),
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  if (options?.limit && options.limit > 0) {
    return ranked.slice(0, options.limit);
  }
  return ranked;
}

/** Convenience: return listings only, sorted by relevance. */
export function fuzzyFilterListings(
  listings: ListingSearchRecord[],
  query: string,
  options?: { minScore?: number; limit?: number }
): ListingSearchRecord[] {
  return rankListingsBySearch(listings, query, options).map((r) => r.listing);
}

/** Check if listing matches query (for filter predicates). */
export function listingMatchesFuzzySearch(
  listing: ListingSearchRecord,
  query: string,
  minScore = 1.8
): boolean {
  return scoreListingMatch(listing, query) >= minScore;
}
