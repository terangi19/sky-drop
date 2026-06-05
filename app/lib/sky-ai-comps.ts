import type { SkyAiListingContext } from "./sky-ai-types";
import {
  guessSearchType,
  searchListings,
  type SkyAiSearchMatch,
} from "./sky-ai-listing-search";

/** Sold > accepted offer > active — higher multiplier = more influence on median */
export type CompSourceKind = "sold" | "accepted_offer" | "active";

export type SkyAiCompListing = {
  id: string;
  title: string;
  price: number;
  location?: string;
  condition?: string;
  matchTier?: "exact" | "make" | "similar";
  sourceKind?: CompSourceKind;
};

export type SkyAiPriceBand = {
  low: number;
  high: number;
};

export type MarketDataQuality = "poor" | "limited" | "moderate" | "strong";

export type SkyAiPricingInsight = {
  query: string;
  matchLabel: string;
  /** Exact make+model matches found */
  compCount: number;
  makeCompCount: number;
  /** Comps actually used in median after quality filters */
  compsUsed: number;
  outliersIgnored: number;
  duplicatesIgnored: number;
  unrelatedIgnored: number;
  recentSalesCount: number;
  soldCompCount: number;
  marketReference?: number;
  /** True when fewer than 3 comps — use reference framing, not fair-market precision */
  useMarketReference: boolean;
  fairMarketLabel: string;
  marketDataQuality: MarketDataQuality;
  limitedDataNotice?: string;
  manualJudgementWarning?: string;
  retailEstimate?: number;
  quickSale: SkyAiPriceBand;
  fairMarket: SkyAiPriceBand;
  maxRealistic: SkyAiPriceBand;
  confidence: number;
  confidenceReason: string;
  reasoning: string;
  recommendedTier: "quickSale" | "fairMarket" | "maxRealistic";
  comps: SkyAiCompListing[];
  ignoredComps: SkyAiCompListing[];
};

const PRICING_INTENT =
  /\b(price|pricing|how much|worth|value|list (?:it|this|for)|sell (?:it|this) for|what should i (?:ask|charge|list|sell)|estimate|valuation|comps?|market rate|nzd range|quick sale|fair market)\b/i;

const VEHICLE_MAKES = [
  "bmw",
  "toyota",
  "honda",
  "ford",
  "mazda",
  "nissan",
  "subaru",
  "volkswagen",
  "audi",
  "mercedes",
  "holden",
  "hyundai",
  "kia",
  "mitsubishi",
  "suzuki",
  "lexus",
  "volvo",
  "porsche",
  "jeep",
  "land rover",
  "mg",
  "tesla",
  "ferrari",
  "lamborghini",
  "mini",
  "mclaren",
  "bentley",
  "jaguar",
  "range rover",
];

/** Sold listings carry 3× the influence of active asking prices when available */
const SOURCE_WEIGHT: Record<CompSourceKind, number> = {
  sold: 3.0,
  accepted_offer: 1.5,
  active: 1.0,
};

const MIN_RELEVANCE_WEIGHT = 0.2;
const EXACT_BASE = 1;
const MAKE_BASE = 0.4;

type CompTarget = {
  listingType?: string;
  make?: string;
  model?: string;
  year?: number;
  odometer?: number;
  title?: string;
  query: string;
  label: string;
};

type ScoredComp = {
  comp: SkyAiCompListing;
  relevanceWeight: number;
  tier: "exact" | "make" | "similar";
  sourceKind: CompSourceKind;
};

/** Auction/listing setup phrases that mention "price" but are not pricing requests. */
const AUCTION_SETUP_CONTEXT =
  /\b(starting\s+bid|reserve\s+price|auction\s+duration|auction\s+ends?)\b/i;

/** "How much should I start bidding at for my BMW?" — pricing advice, not param entry. */
const STARTING_BID_ADVICE =
  /\b(how much|what should i|what's a good)\b.*\b(start|starting)\b.*\b(bid|bidding|auction)\b/i;

export function detectPricingIntent(message: string): boolean {
  const q = message.trim();
  if (STARTING_BID_ADVICE.test(q)) return true;
  if (AUCTION_SETUP_CONTEXT.test(q)) return false;
  return PRICING_INTENT.test(q);
}

export function buildCompsSearchQuery(
  context: SkyAiListingContext | null,
  message: string
): string | null {
  const parts: string[] = [];
  if (context?.vehicleMake) parts.push(context.vehicleMake);
  if (context?.vehicleModel) parts.push(context.vehicleModel);
  if (context?.title) parts.push(context.title);
  else if (context?.category && context.category !== "Other") parts.push(context.category);
  if (parts.length > 0) return parts.join(" ").slice(0, 100);

  const cleaned = message
    .replace(PRICING_INTENT, " ")
    .replace(/\b(for|my|this|the|a|an|please|nz|nzd|sky drop)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 3) return cleaned.slice(0, 100);
  return null;
}

function normToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return normToken(s)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function parseNum(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function findMakeInText(text: string): string | undefined {
  const lower = normToken(text);
  for (const make of VEHICLE_MAKES) {
    if (lower.includes(make)) return make;
  }
  return undefined;
}

function inferModelFromText(text: string, make?: string): string | undefined {
  const lower = normToken(text);
  if (make) {
    const afterMake = lower.split(make)[1]?.trim();
    if (afterMake && afterMake.length >= 2) {
      return afterMake.split(/\s+/).slice(0, 4).join(" ");
    }
  }
  const parts = tokens(text);
  const makeIdx = make ? parts.findIndex((p) => p === make || p.startsWith(make)) : -1;
  if (makeIdx >= 0 && parts.length > makeIdx + 1) {
    return parts.slice(makeIdx + 1, makeIdx + 5).join(" ");
  }
  return parts.length >= 2 ? parts.slice(1, 4).join(" ") : undefined;
}

function inferYearFromText(text: string): number | undefined {
  const m = text.match(/\b(19|20)\d{2}\b/);
  if (!m) return undefined;
  const y = Number(m[0]);
  return y >= 1950 && y <= new Date().getFullYear() + 2 ? y : undefined;
}

function buildCompTarget(
  query: string,
  context?: SkyAiListingContext | null
): CompTarget {
  const blob = [context?.vehicleMake, context?.vehicleModel, context?.title, query]
    .filter(Boolean)
    .join(" ");
  const make =
    normToken(context?.vehicleMake || "") ||
    findMakeInText(blob) ||
    undefined;
  const model =
    normToken(context?.vehicleModel || "") ||
    (make ? inferModelFromText(blob, make) : undefined);
  const year =
    parseNum(context?.vehicleYear) || inferYearFromText(blob) || undefined;
  const odometer = parseNum(context?.vehicleOdometer);

  const label = [context?.vehicleMake || make, context?.vehicleModel || model]
    .filter(Boolean)
    .map((s) =>
      String(s)
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    )
    .join(" ")
    .trim() || context?.title || query;

  return {
    listingType: context?.listingType,
    make: make || undefined,
    model: model || undefined,
    year,
    odometer,
    title: context?.title,
    query,
    label,
  };
}

function resolveCompSource(match: SkyAiSearchMatch): CompSourceKind {
  const status = String(match.status || "").toLowerCase();
  if (status === "sold" || match.soldAt) return "sold";
  if (status === "accepted_offer" || match.acceptedOfferPrice) return "accepted_offer";
  return "active";
}

function makesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const na = normToken(a);
  const nb = normToken(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function modelsMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const na = normToken(a);
  const nb = normToken(b);
  if (na === nb) return true;
  const aParts = na.split(/\s+/).filter((p) => p.length >= 2);
  const bParts = nb.split(/\s+/).filter((p) => p.length >= 2);
  if (aParts.length === 0 || bParts.length === 0) return false;
  const overlap = aParts.filter((p) => nb.includes(p)).length;
  const need = Math.min(2, Math.min(aParts.length, bParts.length));
  return overlap >= need || na.includes(nb) || nb.includes(na);
}

function yearSimilarityBoost(targetYear?: number, compYear?: number): number {
  if (!targetYear || !compYear) return 0.88;
  const diff = Math.abs(targetYear - compYear);
  if (diff === 0) return 1;
  if (diff <= 1) return 0.96;
  if (diff <= 3) return 0.88;
  if (diff <= 5) return 0.72;
  return 0.55;
}

function mileageSimilarityBoost(targetKm?: number, compKm?: number): number {
  if (!targetKm || !compKm) return 0.9;
  const diff = Math.abs(targetKm - compKm);
  const base = Math.max(targetKm, compKm, 1);
  const pct = diff / base;
  if (pct <= 0.12) return 1;
  if (pct <= 0.25) return 0.92;
  if (pct <= 0.4) return 0.8;
  return 0.65;
}

function compVehicleFields(match: SkyAiSearchMatch): {
  make?: string;
  model?: string;
  year?: number;
  odometer?: number;
} {
  let make = match.vehicleMake ? normToken(String(match.vehicleMake)) : undefined;
  let model = match.vehicleModel ? normToken(String(match.vehicleModel)) : undefined;
  const title = [match.title, match.description].filter(Boolean).join(" ");
  if (!make) make = findMakeInText(title);
  if (!model && make) model = inferModelFromText(title, make);
  const year = parseNum(match.vehicleYear) || inferYearFromText(title);
  const odometer = parseNum(match.vehicleOdometer);
  return { make, model, year, odometer };
}

function toCompListing(
  match: SkyAiSearchMatch,
  price: number,
  tier: ScoredComp["tier"],
  sourceKind: CompSourceKind
): SkyAiCompListing {
  return {
    id: match.id,
    title: match.title || "Listing",
    price,
    location: match.location ? String(match.location) : undefined,
    condition: match.condition ? String(match.condition) : undefined,
    matchTier: tier,
    sourceKind,
  };
}

function scoreVehicleComp(match: SkyAiSearchMatch, target: CompTarget): ScoredComp | null {
  const price = parsePrice(match.price);
  if (price == null) return null;

  const sourceKind = resolveCompSource(match);
  const { make: cMake, model: cModel, year: cYear, odometer: cKm } =
    compVehicleFields(match);
  const tMake = target.make;
  const tModel = target.model;

  let base = 0.05;
  let tier: ScoredComp["tier"] = "similar";

  if (tMake && cMake) {
    if (!makesMatch(tMake, cMake)) return null;
    if (tModel && cModel && modelsMatch(tModel, cModel)) {
      base = EXACT_BASE;
      tier = "exact";
    } else {
      base = MAKE_BASE;
      tier = "make";
    }
  } else if (tMake && !cMake) {
    const hay = normToken(`${match.title} ${match.description || ""}`);
    if (!hay.includes(normToken(tMake))) return null;
    if (tModel && hay.includes(normToken(tModel).split(" ")[0]!)) {
      base = 0.85;
      tier = "exact";
    } else {
      base = MAKE_BASE;
      tier = "make";
    }
  } else {
    const overlap = tokenOverlapScore(
      tokens(`${target.query} ${target.title || ""}`),
      tokens(`${match.title} ${match.description || ""}`)
    );
    if (overlap < 0.35) return null;
    base = overlap;
    tier = overlap >= 0.7 ? "exact" : "similar";
  }

  const yearBoost = yearSimilarityBoost(target.year, cYear);
  const kmBoost = mileageSimilarityBoost(target.odometer, cKm);
  const relevanceWeight =
    base * yearBoost * kmBoost * SOURCE_WEIGHT[sourceKind];

  if (relevanceWeight < MIN_RELEVANCE_WEIGHT) return null;

  return {
    relevanceWeight,
    tier,
    sourceKind,
    comp: toCompListing(match, price, tier, sourceKind),
  };
}

function tokenOverlapScore(target: string[], hay: string[]): number {
  if (target.length === 0 || hay.length === 0) return 0;
  const haySet = new Set(hay);
  let hits = 0;
  for (const t of target) {
    if (haySet.has(t)) hits += 1;
  }
  return hits / target.length;
}

function scoreGeneralComp(match: SkyAiSearchMatch, target: CompTarget): ScoredComp | null {
  const price = parsePrice(match.price);
  if (price == null) return null;

  const sourceKind = resolveCompSource(match);
  const targetTokens = tokens(`${target.query} ${target.title || ""}`);
  const hayTokens = tokens(`${match.title} ${match.description || ""} ${match.category || ""}`);
  const overlap = tokenOverlapScore(targetTokens, hayTokens);

  if (overlap < 0.4) return null;

  const base = overlap >= 0.75 ? 1 : overlap >= 0.55 ? 0.55 : 0.35;
  const tier: ScoredComp["tier"] = base >= 0.9 ? "exact" : base >= 0.5 ? "make" : "similar";
  const relevanceWeight = base * SOURCE_WEIGHT[sourceKind];

  return {
    relevanceWeight,
    tier,
    sourceKind,
    comp: toCompListing(match, price, tier, sourceKind),
  };
}

function scoreComp(
  match: SkyAiSearchMatch,
  target: CompTarget,
  listingType?: string | null
): ScoredComp | null {
  const type = listingType || match.type || guessSearchType(target.query);
  if (type === "vehicle" || target.make) {
    return scoreVehicleComp(match, target);
  }
  return scoreGeneralComp(match, target);
}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function roundPrice(n: number): number {
  if (n >= 1000) return Math.round(n / 10) * 10;
  if (n >= 100) return Math.round(n / 5) * 5;
  return Math.round(n);
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx]!;
}

function effectiveWeight(s: ScoredComp): number {
  return s.relevanceWeight;
}

/** Expand each comp by weight for approximate weighted median */
function weightedMedian(scored: ScoredComp[]): number {
  if (scored.length === 0) return 0;
  const expanded: number[] = [];
  for (const s of scored) {
    const reps = Math.max(1, Math.round(effectiveWeight(s) * 10));
    for (let i = 0; i < reps; i++) expanded.push(s.comp.price);
  }
  expanded.sort((a, b) => a - b);
  return median(expanded);
}

function dedupeComps(scored: ScoredComp[]): { kept: ScoredComp[]; duplicates: number } {
  const seen = new Set<string>();
  const kept: ScoredComp[] = [];
  let duplicates = 0;
  for (const s of scored) {
    const key = `${normToken(s.comp.title)}|${roundPrice(s.comp.price)}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    kept.push(s);
  }
  return { kept, duplicates };
}

function detectOutliers(scored: ScoredComp[]): {
  kept: ScoredComp[];
  removed: ScoredComp[];
  hadHighVariance: boolean;
} {
  if (scored.length <= 1) {
    return { kept: scored, removed: [], hadHighVariance: false };
  }

  const prices = scored.map((s) => s.comp.price).sort((a, b) => a - b);
  const lo = prices[0]!;
  const hi = prices[prices.length - 1]!;
  const spreadRatio = hi / Math.max(lo, 1);
  const hadHighVariance = spreadRatio > 2;

  if (scored.length === 2 && spreadRatio > 2.5) {
    const removed = scored.filter((s) => s.comp.price === hi);
    const kept = scored.filter((s) => s.comp.price !== hi);
    return { kept, removed, hadHighVariance: true };
  }

  const med = median(prices);
  const q1 = percentile(prices, 0.25);
  const q3 = percentile(prices, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const deviations = prices.map((p) => Math.abs(p - med));
  const mad = median(deviations) || 0;

  const kept: ScoredComp[] = [];
  const removed: ScoredComp[] = [];

  for (const s of scored) {
    const p = s.comp.price;
    let isOutlier = false;

    if (iqr > 0 && (p < lowerFence || p > upperFence)) {
      isOutlier = true;
    }

    if (!isOutlier && mad > 0) {
      const modZ = (0.6745 * (p - med)) / mad;
      if (Math.abs(modZ) > 3.5) isOutlier = true;
    }

    if (!isOutlier && med > 0) {
      const ratio = p / med;
      if (ratio > 2 || ratio < 0.5) isOutlier = true;
    }

    if (isOutlier) removed.push(s);
    else kept.push(s);
  }

  if (kept.length === 0) {
    const closest = [...scored].sort(
      (a, b) => Math.abs(a.comp.price - med) - Math.abs(b.comp.price - med)
    );
    return {
      kept: [closest[0]!],
      removed: closest.slice(1),
      hadHighVariance: true,
    };
  }

  return { kept, removed, hadHighVariance };
}

function pricingPoolFromScored(scored: ScoredComp[]): {
  pool: ScoredComp[];
  poolKind: "exact" | "make" | "none";
} {
  const exact = scored.filter((s) => s.tier === "exact");
  if (exact.length > 0) return { pool: exact, poolKind: "exact" };
  const make = scored.filter((s) => s.tier === "make");
  if (make.length > 0) return { pool: make, poolKind: "make" };
  return { pool: [], poolKind: "none" };
}

function spreadRatio(prices: number[]): number {
  if (prices.length < 2) return 1;
  const sorted = [...prices].sort((a, b) => a - b);
  return sorted[sorted.length - 1]! / Math.max(sorted[0]!, 1);
}

function confidenceCap(usedCount: number): number | null {
  if (usedCount >= 5) return null;
  if (usedCount >= 3) return 65;
  if (usedCount === 2) return 40;
  if (usedCount === 1) return 20;
  return 15;
}

function resolveMarketDataQuality(usedCount: number): MarketDataQuality {
  if (usedCount <= 1) return "poor";
  if (usedCount === 2) return "limited";
  if (usedCount <= 4) return "moderate";
  return "strong";
}

function computeConfidence(input: {
  usedCount: number;
  poolKind: "exact" | "make" | "none";
  spread: number;
  outliersRemoved: number;
  hadHighVariance: boolean;
  soldCount: number;
}): { confidence: number; reason: string } {
  const { usedCount, poolKind, spread, outliersRemoved, hadHighVariance, soldCount } =
    input;

  let base = 22;

  if (usedCount >= 5) {
    if (poolKind === "exact") {
      if (usedCount >= 10) base = 80;
      else if (usedCount >= 8) base = 74;
      else base = 62;
    } else if (poolKind === "make") {
      base = usedCount >= 8 ? 58 : 52;
    }
    if (spread > 1.35) base -= 8;
    if (spread > 1.75) base -= 12;
    if (outliersRemoved > 0) base -= 4;
    if (hadHighVariance) base -= 8;
    if (soldCount >= 3) base += 8;
    else if (soldCount >= 1) base += 4;
  } else {
    if (poolKind === "exact") {
      if (usedCount >= 3) base = 48;
      else if (usedCount === 2) base = 32;
      else base = 16;
    } else {
      base = usedCount >= 3 ? 28 : usedCount === 2 ? 22 : 14;
    }
    if (spread > 1.5) base -= 6;
    if (outliersRemoved > 0) base -= 4;
    if (hadHighVariance) base -= 8;
    if (soldCount >= 1) base += 3;
  }

  let confidence = Math.round(base);
  const cap = confidenceCap(usedCount);
  if (cap != null) confidence = Math.min(confidence, cap);
  confidence = Math.max(12, Math.min(85, confidence));

  const reasons: string[] = [];
  if (usedCount === 1) {
    reasons.push("Only one high-quality comparable listing was found");
    reasons.push("Use manual judgement due to limited market data");
  } else if (usedCount < 3) {
    reasons.push("Use manual judgement due to limited market data");
  }
  if (usedCount < 5) reasons.push("Limited comparable data available");
  if (spread > 1.5) reasons.push("Wide price spread between comps");
  if (outliersRemoved > 0) reasons.push("Outliers excluded from estimate");
  if (hadHighVariance) reasons.push("Inconsistent asking prices detected");
  if (soldCount > 0) {
    reasons.push(`${soldCount} sold listing${soldCount === 1 ? "" : "s"} weighted 3× higher`);
  }

  return {
    confidence,
    reason: reasons.length > 0 ? reasons.join(". ") + "." : "Solid comparable sample.",
  };
}

function buildPriceTiers(used: ScoredComp[]): {
  quickSale: SkyAiPriceBand;
  fairMarket: SkyAiPriceBand;
  maxRealistic: SkyAiPriceBand;
  fairMid: number;
  retailEstimate?: number;
} {
  const prices = used.map((s) => s.comp.price).sort((a, b) => a - b);
  const fairMid = weightedMedian(used);
  const usedCount = used.length;

  if (usedCount === 1) {
    const ref = fairMid;
    return {
      quickSale: {
        low: roundPrice(ref * 0.806),
        high: roundPrice(ref * 0.917),
      },
      fairMarket: {
        low: roundPrice(ref * 0.917),
        high: roundPrice(ref * 1.083),
      },
      maxRealistic: {
        low: roundPrice(ref * 1.083),
        high: roundPrice(ref * 1.25),
      },
      fairMid: ref,
      retailEstimate: roundPrice(ref * 1.3),
    };
  }

  if (usedCount === 2) {
    const ref = fairMid;
    return {
      quickSale: {
        low: roundPrice(ref * 0.82),
        high: roundPrice(ref * 0.92),
      },
      fairMarket: {
        low: roundPrice(ref * 0.92),
        high: roundPrice(ref * 1.08),
      },
      maxRealistic: {
        low: roundPrice(ref * 1.08),
        high: roundPrice(ref * 1.2),
      },
      fairMid: ref,
      retailEstimate: roundPrice(Math.max(...prices) * 1.25),
    };
  }

  const p25 = percentile(prices, 0.25);
  const p75 = percentile(prices, 0.75);
  const min = prices[0]!;
  const max = prices[prices.length - 1]!;

  const fairMarket: SkyAiPriceBand = {
    low: roundPrice(Math.max(min, Math.min(p25, fairMid * 0.97))),
    high: roundPrice(Math.min(max, Math.max(p75, fairMid * 1.03))),
  };

  const quickSale: SkyAiPriceBand = {
    low: roundPrice(fairMid * 0.8),
    high: roundPrice(fairMid * 0.9),
  };

  const maxRealistic: SkyAiPriceBand = {
    low: roundPrice(Math.max(fairMid, p75)),
    high: roundPrice(Math.min(max * 1.04, fairMid * 1.15)),
  };

  return {
    quickSale,
    fairMarket,
    maxRealistic,
    fairMid,
    retailEstimate: roundPrice(max * 1.25),
  };
}

function buildReasoning(input: {
  target: CompTarget;
  exactFound: number;
  makeFound: number;
  compsUsed: number;
  outliersIgnored: number;
  duplicatesIgnored: number;
  unrelatedIgnored: number;
  recentSales: number;
  poolKind: "exact" | "make" | "none";
  fairMid: number;
}): string {
  const {
    target,
    exactFound,
    makeFound,
    compsUsed,
    outliersIgnored,
    duplicatesIgnored,
    unrelatedIgnored,
    recentSales,
    poolKind,
    fairMid,
  } = input;

  const lines: string[] = [];

  if (poolKind === "exact" && exactFound > 0) {
    lines.push(
      `Used ${compsUsed} relevant ${target.label} listing${compsUsed === 1 ? "" : "s"}.`
    );
    if (exactFound > compsUsed) {
      lines.push(
        `Found ${exactFound} exact match${exactFound === 1 ? "" : "es"}; ${compsUsed} passed quality filters.`
      );
    }
  } else if (poolKind === "make" && makeFound > 0) {
    lines.push(
      `Used ${compsUsed} same-make listing${compsUsed === 1 ? "" : "s"} (different model).`
    );
  }

  if (outliersIgnored > 0) {
    lines.push(
      `Ignored ${outliersIgnored} outlier listing${outliersIgnored === 1 ? "" : "s"}.`
    );
  }
  if (duplicatesIgnored > 0) {
    lines.push(
      `Skipped ${duplicatesIgnored} duplicate listing${duplicatesIgnored === 1 ? "" : "s"}.`
    );
  }
  if (unrelatedIgnored > 0) {
    lines.push(
      `Excluded ${unrelatedIgnored} unrelated listing${unrelatedIgnored === 1 ? "" : "s"}.`
    );
  }

  lines.push(
    `${recentSales} recent sale${recentSales === 1 ? "" : "s"} on Sky Drop (sold data weighted higher when available).`
  );

  if (compsUsed > 0 && fairMid > 0) {
    const ref = roundPrice(fairMid).toLocaleString();
    if (compsUsed === 1) {
      lines.push(`Estimated market reference: ~${ref}.`);
      lines.push("Only one high-quality comparable listing was found.");
    } else if (compsUsed < 3) {
      lines.push(`Estimated market reference: ~${ref} from filtered comps.`);
    } else {
      lines.push(`Fair market median: ${ref} from filtered comps.`);
    }
  }

  if (compsUsed < 3) {
    lines.push("Use manual judgement due to limited market data.");
  }

  return lines.join(" ");
}

export async function getPricingInsight(
  rawQuery: string,
  context?: SkyAiListingContext | null
): Promise<SkyAiPricingInsight | null> {
  const query = rawQuery.trim();
  if (!query) return null;

  const target = buildCompTarget(query, context);
  const listingType = context?.listingType || null;
  const type = listingType || guessSearchType(query);

  const matches = await searchListings(query, type, 40);
  const unrelatedIgnored = matches.length;

  const scored = matches
    .map((m) => scoreComp(m, target, type))
    .filter((s): s is ScoredComp => s != null)
    .sort((a, b) => b.relevanceWeight - a.relevanceWeight);

  const unrelatedIgnoredActual = unrelatedIgnored - scored.length;

  const exactScored = scored.filter((s) => s.tier === "exact");
  const makeScored = scored.filter((s) => s.tier === "make");
  const { pool, poolKind } = pricingPoolFromScored(scored);

  const recentSalesCount = scored.filter((s) => s.sourceKind === "sold").length;

  const emptyInsight = (reason: string): SkyAiPricingInsight => ({
    query,
    matchLabel: target.label,
    compCount: exactScored.length,
    makeCompCount: makeScored.length,
    compsUsed: 0,
    outliersIgnored: 0,
    duplicatesIgnored: 0,
    unrelatedIgnored: unrelatedIgnoredActual,
    recentSalesCount: 0,
    soldCompCount: 0,
    useMarketReference: true,
    fairMarketLabel: "Market Reference",
    marketDataQuality: "poor",
    quickSale: { low: 0, high: 0 },
    fairMarket: { low: 0, high: 0 },
    maxRealistic: { low: 0, high: 0 },
    confidence: 12,
    confidenceReason: reason,
    reasoning: reason,
    recommendedTier: "fairMarket",
    comps: [],
    ignoredComps: [],
  });

  if (pool.length === 0) {
    return emptyInsight(
      "No close comparable listings found. Unrelated vehicles were excluded."
    );
  }

  const { kept: deduped, duplicates } = dedupeComps(pool);
  const { kept: used, removed: outliers, hadHighVariance } = detectOutliers(deduped);

  if (used.length === 0) {
    return emptyInsight(
      "Comparable listings were too inconsistent or unreliable to price confidently."
    );
  }

  const tiers = buildPriceTiers(used);
  const usedPrices = used.map((s) => s.comp.price);
  const spread = spreadRatio(usedPrices);
  const soldCompCount = used.filter((s) => s.sourceKind === "sold").length;

  const { confidence, reason: confidenceReason } = computeConfidence({
    usedCount: used.length,
    poolKind,
    spread,
    outliersRemoved: outliers.length,
    hadHighVariance,
    soldCount: soldCompCount,
  });

  const reasoning = buildReasoning({
    target,
    exactFound: exactScored.length,
    makeFound: makeScored.length,
    compsUsed: used.length,
    outliersIgnored: outliers.length,
    duplicatesIgnored: duplicates,
    unrelatedIgnored: unrelatedIgnoredActual,
    recentSales: recentSalesCount,
    poolKind,
    fairMid: tiers.fairMid,
  });

  const displayComps = used
    .sort((a, b) => b.relevanceWeight - a.relevanceWeight)
    .slice(0, 5)
    .map((s) => s.comp);

  const ignoredComps = outliers
    .sort((a, b) => b.comp.price - a.comp.price)
    .slice(0, 3)
    .map((s) => s.comp);

  const compsUsed = used.length;
  const useMarketReference = compsUsed < 3;
  const fairMarketLabel = useMarketReference ? "Market Reference" : "Fair Market";
  const marketDataQuality = resolveMarketDataQuality(compsUsed);

  const limitedDataNotice =
    compsUsed === 1
      ? "Only one high-quality comparable listing was found."
      : undefined;

  const manualJudgementWarning = useMarketReference
    ? "Use manual judgement due to limited market data."
    : undefined;

  return {
    query,
    matchLabel: target.label,
    compCount: exactScored.length,
    makeCompCount: makeScored.length,
    compsUsed,
    outliersIgnored: outliers.length,
    duplicatesIgnored: duplicates,
    unrelatedIgnored: unrelatedIgnoredActual,
    recentSalesCount,
    soldCompCount,
    marketReference: tiers.fairMid > 0 ? roundPrice(tiers.fairMid) : undefined,
    useMarketReference,
    fairMarketLabel,
    marketDataQuality,
    limitedDataNotice,
    manualJudgementWarning,
    retailEstimate: tiers.retailEstimate,
    quickSale: tiers.quickSale,
    fairMarket: tiers.fairMarket,
    maxRealistic: tiers.maxRealistic,
    confidence,
    confidenceReason,
    reasoning,
    recommendedTier: useMarketReference ? "quickSale" : "fairMarket",
    comps: displayComps,
    ignoredComps,
  };
}

export function buildPricingReply(insight: SkyAiPricingInsight): string {
  if (insight.compsUsed === 0) {
    return `I couldn't build a reliable price for **${insight.matchLabel}**. ${insight.reasoning}`;
  }

  const outlierNote =
    insight.outliersIgnored > 0
      ? ` Ignored **${insight.outliersIgnored}** outlier${insight.outliersIgnored === 1 ? "" : "s"}.`
      : "";

  const refLine =
    insight.useMarketReference && insight.marketReference
      ? `Estimated market reference: **~${insight.marketReference.toLocaleString()}** (wide uncertainty bands — not a precise fair market price).\n\n`
      : "";

  const limitedLine = insight.limitedDataNotice ? `${insight.limitedDataNotice}\n\n` : "";
  const manualLine = insight.manualJudgementWarning
    ? `${insight.manualJudgementWarning}\n\n`
    : "";

  return (
    `${insight.compsUsed === 1 ? "Based on a single comparable listing" : `Here's **NZD pricing** for **${insight.matchLabel}** from **${insight.compsUsed}** filtered comps`}, market data quality is **${insight.marketDataQuality}**.${outlierNote}\n\n` +
    refLine +
    limitedLine +
    manualLine +
    `${insight.reasoning}\n\n` +
    `**${insight.confidence}%** confidence — ${insight.confidenceReason}\n\n` +
    `Tap **Apply** on a tier below — treat as a guide, not a guarantee.`
  );
}

export async function resolvePricingForRequest(
  message: string,
  context: SkyAiListingContext | null
): Promise<{ insight: SkyAiPricingInsight; reply: string } | null> {
  if (!detectPricingIntent(message)) return null;

  const query = buildCompsSearchQuery(context, message);
  if (!query) return null;

  const insight = await getPricingInsight(query, context);
  if (!insight) return null;

  return { insight, reply: buildPricingReply(insight) };
}
