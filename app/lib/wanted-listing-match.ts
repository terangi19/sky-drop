export type MatchmakingListingLike = {
  title?: string;
  description?: string;
  category?: string;
  type?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  [key: string]: unknown;
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "your", "this", "that", "have", "has", "are", "was",
  "will", "can", "any", "all", "not", "but", "you", "our", "their", "about", "into", "over",
  "want", "wanted", "wants", "looking", "need", "needs", "search", "searching", "find",
  "buy", "buying", "purchase", "iso", "after", "around", "under", "budget", "please", "thanks",
  "sale", "sell", "selling", "item", "items", "listing", "listings", "nz", "new", "zealand",
  "good", "great", "best", "nice", "clean", "well", "must", "should", "would", "could",
]);

/** User wants a complete vehicle (not parts/accessories). */
const WHOLE_VEHICLE_TERMS = [
  "car", "cars", "vehicle", "vehicles", "automobile", "automobiles",
  "suv", "sedan", "hatchback", "hatch", "wagon", "estate", "ute", "pickup", "truck",
  "van", "minivan", "motorcycle", "motorbike", "scooter",
];

/** Parts, spares, accessories — not a whole vehicle. */
const PARTS_TERMS = [
  "part", "parts", "spare", "spares", "accessory", "accessories", "component", "components",
  "panel", "panels", "bumper", "bonnet", "hood", "guard", "fender", "headlight", "taillight",
  "mirror", "radiator", "alternator", "gearbox", "transmission", "engine", "motor",
  "rim", "rims", "tyre", "tyres", "tire", "tires", "wheel", "wheels", "brake", "brakes",
  "filter", "filters", "suspension", "exhaust", "muffler", "catalyst", "catalytic", "wrecking",
  "dismantling", "scrap", "breaking", "mat", "mats", "cover", "covers", "liner", "liners",
];

const PARTS_CATEGORIES = [
  "parts", "part", "spares", "accessories", "auto parts", "car parts", "vehicle parts",
  "wrecking", "dismantling",
];

const MIN_TOKEN_LENGTH = 3;

function listingTextBlob(listing: MatchmakingListingLike): string {
  return [
    listing.title,
    listing.description,
    listing.category,
    listing.vehicleMake,
    listing.vehicleModel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(w));
}

/** Meaningful search tokens for matchmaking (no stop words). */
export function extractMatchKeywords(listing: MatchmakingListingLike): string[] {
  const words = new Set<string>();

  for (const source of [
    listing.title,
    listing.description,
    listing.category,
    listing.vehicleMake,
    listing.vehicleModel,
  ]) {
    if (!source) continue;
    for (const token of tokenize(String(source))) {
      words.add(token);
    }
  }

  if (listing.vehicleMake && listing.vehicleModel) {
    const make = String(listing.vehicleMake).toLowerCase().trim();
    const model = String(listing.vehicleModel).toLowerCase().trim();
    words.add(make);
    words.add(model);
    words.add(`${make} ${model}`);
  }

  return [...words];
}

function containsWholeWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => containsWholeWord(text, term));
}

function categoryLooksLikeParts(category: string | undefined): boolean {
  if (!category) return false;
  const lower = category.toLowerCase();
  return PARTS_CATEGORIES.some((c) => lower.includes(c));
}

/** Detect incompatible intent: e.g. wanted BMW car vs BMW brake part. */
export function hasWantedListingIntentConflict(
  source: MatchmakingListingLike,
  candidate: MatchmakingListingLike,
): boolean {
  const sourceText = listingTextBlob(source);
  const candidateText = listingTextBlob(candidate);

  const sourceWantsWhole =
    source.type === "vehicle" ||
    hasAnyTerm(sourceText, WHOLE_VEHICLE_TERMS) ||
    String(source.category || "").toLowerCase().includes("car");

  const sourceWantsParts = hasAnyTerm(sourceText, PARTS_TERMS) || categoryLooksLikeParts(source.category);

  const candidateIsWhole =
    candidate.type === "vehicle" ||
    hasAnyTerm(candidateText, WHOLE_VEHICLE_TERMS);

  const candidateIsParts =
    hasAnyTerm(candidateText, PARTS_TERMS) ||
    categoryLooksLikeParts(candidate.category);

  if (sourceWantsWhole && !sourceWantsParts && candidateIsParts && !candidateIsWhole) {
    return true;
  }

  if (sourceWantsParts && !sourceWantsWhole && candidateIsWhole && !candidateIsParts) {
    return true;
  }

  return false;
}

function vehicleFieldsAlign(
  source: MatchmakingListingLike,
  candidate: MatchmakingListingLike,
): boolean {
  const makeA = String(source.vehicleMake || "").trim().toLowerCase();
  const makeB = String(candidate.vehicleMake || "").trim().toLowerCase();
  const modelA = String(source.vehicleModel || "").trim().toLowerCase();
  const modelB = String(candidate.vehicleModel || "").trim().toLowerCase();

  if (makeA && makeB && makeA !== makeB) return false;
  if (modelA && modelB && modelA !== modelB) return false;
  if ((makeA && makeB) || (modelA && modelB)) return true;
  return false;
}

export type WantedMatchResult = {
  match: boolean;
  matchedKeywords: string[];
  score: number;
};

/**
 * Score whether a listing/wanted pair should trigger auto-match notifications.
 * Stricter than naive substring search — avoids BMW car ↔ BMW part false positives.
 */
export function scoreWantedListingMatch(
  source: MatchmakingListingLike,
  candidate: MatchmakingListingLike,
): WantedMatchResult {
  if (hasWantedListingIntentConflict(source, candidate)) {
    return { match: false, matchedKeywords: [], score: 0 };
  }

  const keywords = extractMatchKeywords(source);
  if (keywords.length === 0) {
    return { match: false, matchedKeywords: [], score: 0 };
  }

  const candidateText = listingTextBlob(candidate);
  const matchedKeywords = keywords.filter((kw) => candidateText.includes(kw.toLowerCase()));

  if (matchedKeywords.length === 0) {
    return { match: false, matchedKeywords: [], score: 0 };
  }

  if (vehicleFieldsAlign(source, candidate)) {
    return { match: true, matchedKeywords, score: 100 };
  }

  const sourceText = listingTextBlob(source);
  const sourceWantsWhole =
    source.type === "vehicle" ||
    hasAnyTerm(sourceText, WHOLE_VEHICLE_TERMS) ||
    String(source.category || "").toLowerCase().includes("car");

  const candidateIsWhole =
    candidate.type === "vehicle" ||
    hasAnyTerm(listingTextBlob(candidate), WHOLE_VEHICLE_TERMS);

  // Multiple keywords in wanted post → need multiple hits (avoids Toyota Corolla ↔ Toyota mats)
  if (keywords.length >= 2 && matchedKeywords.length < 2) {
    const vehicleListingException =
      sourceWantsWhole && candidateIsWhole && candidate.type === "vehicle" && matchedKeywords.length >= 1;
    if (!vehicleListingException) {
      return { match: false, matchedKeywords, score: 0 };
    }
    return { match: true, matchedKeywords, score: 70 };
  }

  // Phrase match (e.g. "mazda axela")
  const phraseMatch = matchedKeywords.some((kw) => kw.includes(" "));
  if (phraseMatch) {
    return { match: true, matchedKeywords, score: 90 };
  }

  // Require at least two significant keyword overlaps (brand alone is not enough)
  if (matchedKeywords.length >= 2) {
    const score = Math.min(50 + matchedKeywords.length * 15, 95);
    return { match: true, matchedKeywords, score };
  }

  // Single long/specific token (e.g. "corolla", "playstation")
  const only = matchedKeywords[0];
  if (only.length >= 6) {
    return { match: true, matchedKeywords, score: 60 };
  }

  // Same vehicle type when both sides are vehicles
  if (
    source.type === "vehicle" &&
    candidate.type === "vehicle" &&
    matchedKeywords.length >= 1
  ) {
    return { match: true, matchedKeywords, score: 55 };
  }

  return { match: false, matchedKeywords, score: 0 };
}

export function isWantedListingMatch(
  source: MatchmakingListingLike,
  candidate: MatchmakingListingLike,
): boolean {
  return scoreWantedListingMatch(source, candidate).match;
}
