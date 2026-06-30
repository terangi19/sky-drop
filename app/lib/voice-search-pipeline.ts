/**
 * Intelligent voice search pipeline.
 *
 * Speech → STT transcript → normalize → correct → extract intent → search query
 * Never search using the raw transcript alone.
 */

import { phoneticNormalize, phoneticSimilarity } from "./voice-phonetic";

export type VoiceSearchCorrection = { from: string; to: string; reason: string };

export type VoiceSearchIntent = {
  rawTranscript: string;
  normalizedTranscript: string;
  correctedTranscript: string;
  searchQuery: string;
  tokens: string[];
  categoryHint?: string;
  brandHint?: string;
  modelHint?: string;
  corrections: VoiceSearchCorrection[];
  confidence: "high" | "medium" | "low";
};

/* ── Search intent prefixes (stripped before matching) ── */

const SEARCH_PREFIX =
  /^(?:please\s+)?(?:can you\s+)?(?:could you\s+)?(?:i(?:'m| am)\s+)?(?:looking for|searching for|search for|find(?: me)?|look(?:ing)? for|show me|get me|hunt for|browse for|need(?: a)?|want(?: a)?|i need a|i want a|i'd like(?: a)?)\s+(?:me\s+)?(?:a|an|some|the)?\s*/i;

const TRAILING_NOISE = /\b(?:please|thanks|thank you|on sky drop|on skydrop|in new zealand)\s*$/gi;

/* ── STT mistake map (heard → intended) ── */

const STT_PHRASE_FIXES: Array<{ pattern: RegExp; replacement: string; reason: string }> = [
  { pattern: /\bb\s*(?:and|n|&)\s*w\b/gi, replacement: "bmw", reason: "brand" },
  { pattern: /\bplay\s*station\s*(?:5|five)\b/gi, replacement: "playstation 5", reason: "product" },
  { pattern: /\bplay\s*station\s*(?:4|four)\b/gi, replacement: "playstation 4", reason: "product" },
  { pattern: /\bplay\s*station\b/gi, replacement: "playstation", reason: "product" },
  { pattern: /\bps\s*(?:5|five)\b/gi, replacement: "ps5", reason: "product" },
  { pattern: /\bps\s*(?:4|four)\b/gi, replacement: "ps4", reason: "product" },
  { pattern: /\bmac\s*book\b/gi, replacement: "macbook", reason: "product" },
  { pattern: /\biphone\s*(?:1\s*5|fifteen)\b/gi, replacement: "iphone 15", reason: "product" },
  { pattern: /\biphone\s*(?:1\s*4|fourteen)\b/gi, replacement: "iphone 14", reason: "product" },
  { pattern: /\bsamsung\s*galaxy\b/gi, replacement: "samsung galaxy", reason: "product" },
  { pattern: /\bnintendo\s*switch\b/gi, replacement: "nintendo switch", reason: "product" },
  { pattern: /\bchrome\s*rims?\b/gi, replacement: "chrome rims", reason: "product" },
  { pattern: /\bair\s*fryer\b/gi, replacement: "air fryer", reason: "product" },
  { pattern: /\blawn\s*mower\b/gi, replacement: "lawn mower", reason: "product" },
  { pattern: /\bpressure\s*washer\b/gi, replacement: "pressure washer", reason: "product" },
  { pattern: /\bjet\s*ski\b/gi, replacement: "jet ski", reason: "product" },
  { pattern: /\bmountain\s*bike\b/gi, replacement: "mountain bike", reason: "product" },
  { pattern: /\bdining\s*table\b/gi, replacement: "dining table", reason: "product" },
];

const STT_WORD_FIXES: Record<string, string> = {
  beemer: "bmw",
  beamer: "bmw",
  "b.m.w": "bmw",
  bmws: "bmw",
  toyata: "toyota",
  totota: "toyota",
  hunda: "honda",
  honnda: "honda",
  mazda: "mazda",
  nisan: "nissan",
  nissian: "nissan",
  suburu: "subaru",
  volkswagon: "volkswagen",
  vw: "volkswagen",
  merc: "mercedes",
  mercedez: "mercedes",
  hilux: "hilux",
  highlux: "hilux",
  corrola: "corolla",
  civik: "civic",
  playstation: "playstation",
  xbox: "xbox",
  macbook: "macbook",
  ipad: "ipad",
  iphone: "iphone",
  ps5: "ps5",
  ps4: "ps4",
  rims: "rims",
  rim: "rims",
};

/* ── Known brands / models for token correction ── */

const KNOWN_BRANDS = new Set([
  "bmw", "toyota", "honda", "mazda", "nissan", "subaru", "ford", "audi", "mercedes",
  "lexus", "volkswagen", "hyundai", "kia", "mitsubishi", "suzuki", "holden",
  "apple", "samsung", "sony", "microsoft", "nintendo", "dell", "hp", "lenovo",
]);

const KNOWN_MODELS = new Set([
  "hilux", "ranger", "corolla", "civic", "accord", "camry", "landcruiser", "land cruiser",
  "335i", "330i", "320i", "m3", "m5", "e90", "e92", "f30", "g20", "n54", "n55",
  "iphone", "macbook", "ipad", "playstation", "ps5", "ps4", "xbox", "switch",
  "galaxy", "airpods",
]);

const CATEGORY_HINTS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(car|cars|vehicle|vehicles|suv|ute|truck|bmw|toyota|honda|mazda|hilux|ranger)\b/i, category: "Cars" },
  { pattern: /\b(iphone|samsung|galaxy|macbook|ipad|laptop|phone|tech|playstation|ps5|xbox)\b/i, category: "Tech" },
  { pattern: /\b(game|gaming|ps5|xbox|nintendo|switch)\b/i, category: "Gaming" },
  { pattern: /\b(sofa|couch|table|chair|bed|furniture)\b/i, category: "Home" },
  { pattern: /\b(bike|bicycle|mountain bike)\b/i, category: "Sports" },
  { pattern: /\b(jacket|shoes|clothing|dress|shirt)\b/i, category: "Clothing" },
];

/* ── Helpers ── */

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s+#.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

function closestKnownToken(word: string, dictionary: Set<string>): string | null {
  const w = word.toLowerCase();
  if (dictionary.has(w)) return w;

  let best: string | null = null;
  let bestScore = 0;
  for (const entry of dictionary) {
    const score = phoneticSimilarity(w, entry);
    if (score > bestScore && score >= 0.72) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

function correctWordToken(word: string, corrections: VoiceSearchCorrection[]): string {
  const lower = word.toLowerCase();
  const direct = STT_WORD_FIXES[lower];
  if (direct && direct !== lower) {
    corrections.push({ from: word, to: direct, reason: "stt_word" });
    return direct;
  }

  const brand = closestKnownToken(lower, KNOWN_BRANDS);
  if (brand && brand !== lower) {
    corrections.push({ from: word, to: brand, reason: "brand_fuzzy" });
    return brand;
  }

  const model = closestKnownToken(lower, KNOWN_MODELS);
  if (model && model !== lower) {
    corrections.push({ from: word, to: model, reason: "model_fuzzy" });
    return model;
  }

  return word;
}

function extractSearchQuery(text: string): string {
  let q = text.trim();
  q = q.replace(SEARCH_PREFIX, "");
  q = q.replace(TRAILING_NOISE, "");
  q = q.replace(/\b(under|below|over|above|less than|more than|max|min)\s+\$?[\d,]+/gi, "");
  q = q.replace(
    /\b(?:in|near|around|from)\s+(auckland|wellington|christchurch|hamilton|tauranga|dunedin|queenstown)\b/gi,
    ""
  );
  return q.replace(/\s+/g, " ").trim();
}

function detectCategoryHint(text: string): string | undefined {
  for (const { pattern, category } of CATEGORY_HINTS) {
    if (pattern.test(text)) return category;
  }
  return undefined;
}

function detectBrandModel(tokens: string[]): { brand?: string; model?: string } {
  const brand = tokens.find((t) => KNOWN_BRANDS.has(t.toLowerCase()));
  const model = tokens.find((t) => KNOWN_MODELS.has(t.toLowerCase()) && t !== brand);
  return {
    brand: brand?.toLowerCase(),
    model: model?.toLowerCase(),
  };
}

function confidenceFrom(
  raw: string,
  corrected: string,
  corrections: VoiceSearchCorrection[],
  tokens: string[]
): VoiceSearchIntent["confidence"] {
  if (tokens.length === 0) return "low";
  if (corrections.length === 0 && tokens.length >= 2) return "high";
  if (corrections.length > 0 && tokens.some((t) => KNOWN_BRANDS.has(t) || KNOWN_MODELS.has(t))) {
    return "high";
  }
  if (phoneticNormalize(raw) === phoneticNormalize(corrected)) return "medium";
  return corrections.length > 2 ? "low" : "medium";
}

/* ── Public API ── */

/** Full voice search pipeline — use this instead of raw STT text. */
export function processVoiceSearchTranscript(raw: string): VoiceSearchIntent | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = normalizeText(trimmed);
  if (!normalized) return null;

  const corrections: VoiceSearchCorrection[] = [];
  let corrected = normalized;

  for (const fix of STT_PHRASE_FIXES) {
    if (fix.pattern.test(corrected)) {
      const before = corrected;
      corrected = corrected.replace(fix.pattern, fix.replacement);
      if (before !== corrected) {
        corrections.push({ from: before, to: corrected, reason: fix.reason });
      }
    }
  }

  const rawTokens = tokenize(extractSearchQuery(corrected));
  if (rawTokens.length === 0) return null;

  const tokens = rawTokens.map((t) => correctWordToken(t, corrections));
  corrected = tokens.join(" ");

  const searchQuery = tokens.join(" ").trim();
  if (searchQuery.length < 2) return null;

  const { brand, model } = detectBrandModel(tokens);

  return {
    rawTranscript: trimmed,
    normalizedTranscript: normalized,
    correctedTranscript: corrected,
    searchQuery,
    tokens,
    categoryHint: detectCategoryHint(corrected),
    brandHint: brand,
    modelHint: model,
    corrections,
    confidence: confidenceFrom(trimmed, corrected, corrections, tokens),
  };
}

/** Normalize any search box / URL query through the same correction pipeline. */
export function normalizeMarketplaceSearchQuery(query: string): string {
  const intent = processVoiceSearchTranscript(query);
  return intent?.searchQuery ?? normalizeText(query);
}

/** True when text looks like a product/search query (not a page nav). */
export function isProductSearchPhrase(text: string): boolean {
  const intent = processVoiceSearchTranscript(text);
  if (!intent) return false;
  if (intent.tokens.length >= 2) return true;
  const t = intent.tokens[0]?.toLowerCase() ?? "";
  return KNOWN_BRANDS.has(t) || KNOWN_MODELS.has(t) || t.length >= 4;
}
