import { describe, expect, it } from "vitest";
import { phoneticSimilarity } from "./voice-phonetic";
import {
  normalizeMarketplaceSearchQuery,
  processVoiceSearchTranscript,
  resolveSearchPageQuery,
  typedSearchQuery,
} from "./voice-search-pipeline";
import { rankListingsBySearch, scoreListingMatch } from "./marketplace-fuzzy-search";

/* ── Fixtures ── */
const deskLamp = {
  id: "desk",
  title: "E2E Desk Lamp",
  description: "LED",
  category: "Home",
  type: "physical",
};
// Closer to the real prod E2E listing (scripts/prod-e2e-signed-in.cjs): description mentions "Sky Drop".
const deskLampProd = {
  id: "desk-prod",
  title: "E2E Desk Lamp abc123",
  description:
    "Throwaway E2E test listing for Sky Drop messaging V1. LED desk lamp, good condition, pickup Auckland CBD. Not a real sale.",
  category: "Home",
  type: "physical",
};
const pinkPs5 = {
  id: "ps5",
  title: "Pink PS5 Controller",
  description: "dualsense",
  category: "Electronics",
  type: "physical",
};
const bmwListing = {
  id: "bmw",
  title: "BMW 335i M Sport",
  description: "Great car",
  category: "Vehicles",
  type: "physical",
  vehicleMake: "BMW",
  vehicleModel: "335i",
};
const iphoneListing = {
  id: "iphone",
  title: "iPhone 15 Pro 256GB",
  description: "Unlocked",
  category: "Electronics",
  type: "physical",
};

const DESK_PS5 = [deskLamp, pinkPs5];
const ALL = [deskLamp, pinkPs5, bmwListing, iphoneListing];

const idsFor = (listings: Record<string, unknown>[], q: string) =>
  rankListingsBySearch(listings, normalizeMarketplaceSearchQuery(q), { minScore: 3 }).map(
    (r) => (r.listing as { id: string }).id
  );

const brandCorrections = (q: string) =>
  (processVoiceSearchTranscript(q, { allowBrandFuzzy: false })?.corrections ?? []).filter(
    (c) => c.reason === "brand_fuzzy" || c.reason === "model_fuzzy"
  );

describe("M9 phoneticSimilarity: empty / short norms never match", () => {
  it("returns 0 for empty, symbol-only and single-char norms", () => {
    expect(phoneticSimilarity("", "bmw")).toBe(0);
    expect(phoneticSimilarity("bmw", "")).toBe(0);
    expect(phoneticSimilarity("###", "bmw")).toBe(0);
    expect(phoneticSimilarity("z", "mazda")).toBe(0);
    expect(phoneticSimilarity("zzzz", "mazda")).toBe(0); // "zzzz" collapses to "z"
    expect(phoneticSimilarity("a", "toyota")).toBe(0);
  });
  it("still scores real matches", () => {
    expect(phoneticSimilarity("bmw", "bmw")).toBe(1);
    expect(phoneticSimilarity("toyoda", "toyota")).toBeGreaterThanOrEqual(0.72);
  });
});

describe("M9 Lead-exact: zzzz_sky_drop_nonexistent_2026", () => {
  const q = "zzzz_sky_drop_nonexistent_2026";
  it("is not rewritten to mazda and has no brand/model_fuzzy corrections", () => {
    const n = normalizeMarketplaceSearchQuery(q);
    expect(n).not.toMatch(/mazda/i);
    expect(n).toBe("zzzz sky drop nonexistent 2026");
    expect(brandCorrections(q)).toEqual([]);
    expect(resolveSearchPageQuery(q, "").intent?.corrections ?? []).toEqual([]);
  });
  it("ranks 0 results against desk-lamp + PS5 fixtures", () => {
    expect(idsFor(DESK_PS5, q)).toEqual([]);
    expect(idsFor(ALL, q)).toEqual([]);
    const { intent, rankQuery } = resolveSearchPageQuery(q, "");
    expect(rankListingsBySearch(DESK_PS5, intent ?? rankQuery, { minScore: 3 })).toHaveLength(0);
  });
  it("never surfaces PS5 or a brand listing, even for a desk listing whose description says 'Sky Drop'", () => {
    const ids = idsFor([deskLampProd, pinkPs5, bmwListing, iphoneListing], q);
    expect(ids).not.toContain("ps5");
    expect(ids).not.toContain("bmw");
    expect(ids).not.toContain("iphone");
  });
  // Honest word overlap: "sky" + "drop" appear in the prod E2E desk-lamp DESCRIPTION, so M9 alone
  // can still rank it (score ~6.4). Needs the M1 multi-token title-coverage gate to reach 0.
  it.todo("M1: zero results even when a description contains 'sky drop' (needs title coverage gate)");
});

describe("M9 Lead-exact: ###", () => {
  it("is not rewritten to bmw and has no brand_fuzzy", () => {
    expect(normalizeMarketplaceSearchQuery("###")).not.toMatch(/bmw/i);
    expect(normalizeMarketplaceSearchQuery("###")).toBe("###");
    expect(brandCorrections("###")).toEqual([]);
  });
  it("ranks 0 results against desk + PS5 (and does not pull the BMW listing)", () => {
    expect(idsFor(DESK_PS5, "###")).toEqual([]);
    expect(idsFor(ALL, "###")).toEqual([]);
  });
  it("!!!@@@### also stays out of brand space", () => {
    expect(normalizeMarketplaceSearchQuery("!!!@@@###")).not.toMatch(/bmw/i);
    expect(idsFor(ALL, "!!!@@@###")).toEqual([]);
  });
  it("pure punctuation resolves to an empty rankQuery (page shows 0, not all listings)", () => {
    expect(resolveSearchPageQuery("!!!", "").rankQuery).toBe("");
  });
});

describe("M9 plain nonsense / bare / empty", () => {
  it("zzzz is unchanged and ranks 0", () => {
    expect(normalizeMarketplaceSearchQuery("zzzz")).toBe("zzzz");
    expect(typedSearchQuery("zzzz")).toBe("zzzz");
    expect(brandCorrections("zzzz")).toEqual([]);
    expect(idsFor(ALL, "zzzz")).toEqual([]);
  });
  it("bare strings handed straight to rankListingsBySearch (no normalize) are typed-safe too", () => {
    expect(rankListingsBySearch(ALL, "zzzz", { minScore: 3 })).toHaveLength(0);
    expect(rankListingsBySearch(ALL, "###", { minScore: 3 })).toHaveLength(0);
    expect(rankListingsBySearch(ALL, "zzzz_sky_drop_nonexistent_2026", { minScore: 3 })).toHaveLength(0);
    expect(scoreListingMatch(bmwListing, "###")).toBeLessThan(3);
    expect(scoreListingMatch(deskLamp, "zzzz")).toBeLessThan(3);
  });
  it("empty string / whitespace", () => {
    expect(processVoiceSearchTranscript("")).toBeNull();
    expect(processVoiceSearchTranscript("   ")).toBeNull();
    expect(normalizeMarketplaceSearchQuery("")).toBe("");
    expect(rankListingsBySearch(ALL, "", { minScore: 3 })).toEqual([]);
    expect(resolveSearchPageQuery("", "")).toEqual({ isVoice: false, intent: null, rankQuery: "" });
  });
});

describe("M9 non-regression: legitimate typed searches", () => {
  it("typed bmw finds the BMW listing", () => {
    expect(normalizeMarketplaceSearchQuery("bmw")).toBe("bmw");
    expect(idsFor(ALL, "bmw")).toEqual(["bmw"]);
    expect(idsFor(ALL, "BMW")).toEqual(["bmw"]);
  });
  it("typed PS5 finds Pink PS5 and not the desk lamp", () => {
    expect(normalizeMarketplaceSearchQuery("PS5")).toBe("ps5");
    expect(idsFor(ALL, "PS5")).toEqual(["ps5"]);
  });
  it("typed Desk Lamp finds the desk lamp (heading is raw q, so no rewrite)", () => {
    expect(normalizeMarketplaceSearchQuery("Desk Lamp")).toBe("desk lamp");
    expect(idsFor(ALL, "Desk Lamp")).toEqual(["desk"]);
  });
  // DOCUMENTED BEHAVIOUR CHANGE: typed text is no longer brand/model-corrected.
  it("typed 'iphon' is not rewritten to 'iphone' but still finds the iPhone via substring ranking", () => {
    expect(normalizeMarketplaceSearchQuery("iphon")).toBe("iphon");
    expect(brandCorrections("iphon")).toEqual([]);
    expect(idsFor(ALL, "iphon")).toEqual(["iphone"]);
  });
  it("typed 'iphne' (non-prefix typo) no longer auto-corrects -> 0 results (accepted trade-off)", () => {
    expect(normalizeMarketplaceSearchQuery("iphne")).toBe("iphne");
    expect(idsFor(ALL, "iphne")).toEqual([]);
  });
  it("typed STT word fixes still apply (beemer -> bmw; existing behaviour, unchanged by M9)", () => {
    expect(normalizeMarketplaceSearchQuery("beemer")).toBe("bmw");
  });
});

describe("M9 voice path (heard=) keeps the full pipeline", () => {
  it("processVoiceSearchTranscript default still STT-fixes beemer -> bmw", () => {
    const intent = processVoiceSearchTranscript("beemer");
    expect(intent?.searchQuery).toBe("bmw");
    expect(intent?.corrections.some((c) => c.reason === "stt_word")).toBe(true);
    expect(processVoiceSearchTranscript("beemer", { allowBrandFuzzy: true })?.searchQuery).toBe("bmw");
  });
  it("voice still applies brand_fuzzy (toyoda -> toyota)", () => {
    const intent = processVoiceSearchTranscript("find me a toyoda");
    expect(intent?.searchQuery).toBe("toyota");
    expect(intent?.corrections.some((c) => c.reason === "brand_fuzzy")).toBe(true);
  });
  it("search page: q=bmw&heard=beemer -> voice, bmw, finds BMW listing", () => {
    const r = resolveSearchPageQuery("bmw", "beemer");
    expect(r.isVoice).toBe(true);
    expect(r.intent?.searchQuery).toBe("bmw");
    expect(r.rankQuery).toBe("bmw");
    expect(rankListingsBySearch(ALL, r.intent!, { minScore: 3 }).map((x) => (x.listing as { id: string }).id)).toEqual(["bmw"]);
  });
  it("search page: q=toyota&heard=find me a toyoda -> voice brand_fuzzy preserved", () => {
    const r = resolveSearchPageQuery("toyota", "find me a toyoda");
    expect(r.isVoice).toBe(true);
    expect(r.intent?.searchQuery).toBe("toyota");
  });
  it("search page: same fuzzy text WITHOUT heard is typed (no brand_fuzzy)", () => {
    const r = resolveSearchPageQuery("toyoda", "");
    expect(r.isVoice).toBe(false);
    expect(r.intent?.searchQuery).toBe("toyoda");
    expect(r.intent?.corrections ?? []).toEqual([]);
  });
  it("search page: typed junk with empty heard= is typed", () => {
    const r = resolveSearchPageQuery("###", "   ");
    expect(r.isVoice).toBe(false);
    expect(r.rankQuery).toBe("###");
  });
});
