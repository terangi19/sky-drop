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
  if (al === bl) return 1;
  if (al.includes(bl) || bl.includes(al)) return 0.88;
  const dist = levenshtein(al, bl);
  const maxLen = Math.max(al.length, bl.length);
  const levScore = maxLen > 0 ? 1 - dist / maxLen : 0;
  const phonScore = phoneticSimilarity(al, bl);
  return Math.max(levScore, phonScore);
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
    listing.title,
    listing.description,
    listing.category,
    listing.type,
    listing.vehicleMake,
    listing.vehicleModel,
    listing.make,
    listing.model,
    listing.vehicleYear != null ? String(listing.vehicleYear) : "",
    listing.year != null ? String(listing.year) : "",
    listing.location,
  ];

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

/** Score a single listing against a search intent or query string. */
export function scoreListingMatch(
  listing: ListingSearchRecord,
  queryOrIntent: string | VoiceSearchIntent
): number {
  const intent =
    typeof queryOrIntent === "string"
      ? processVoiceSearchTranscript(queryOrIntent)
      : queryOrIntent;

  const query =
    intent?.searchQuery ?? normalizeMarketplaceSearchQuery(String(queryOrIntent));
  const tokens = intent?.tokens ?? query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  const blob = buildListingSearchBlob(listing);
  if (!blob) return 0;

  const make = String(listing.vehicleMake ?? listing.make ?? "").toLowerCase();
  const model = String(listing.vehicleModel ?? listing.model ?? "").toLowerCase();
  const blobTokens = blob.split(/\s+/);
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
      ? processVoiceSearchTranscript(queryOrIntent)
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
