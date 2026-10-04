import { describe, expect, it } from "vitest";
import {
  explainMultiTokenCoverage,
  rankListingsBySearch,
  scoreListingMatch,
  type ListingSearchRecord,
} from "./marketplace-fuzzy-search";
import {
  normalizeMarketplaceSearchQuery,
  processVoiceSearchTranscript,
  resolveSearchPageQuery,
} from "./voice-search-pipeline";

/* ── Fixtures ── */
const deskLamp: ListingSearchRecord = {
  id: "desk",
  title: "E2E Desk Lamp",
  description: "LED desk lamp for office",
  category: "Home",
  type: "physical",
};
// Real prod E2E seed (scripts/prod-e2e-signed-in.cjs): description mentions "Sky Drop messaging".
const deskLampProd: ListingSearchRecord = {
  id: "desk-prod",
  title: "E2E Desk Lamp abc123",
  description:
    "Throwaway E2E test listing for Sky Drop messaging V1. LED desk lamp, good condition, pickup Auckland CBD. Not a real sale.",
  category: "Home",
  type: "physical",
};
const ps5Clean: ListingSearchRecord = {
  id: "ps5clean",
  title: "Pink PS5 Controller",
  description: "dualsense wireless",
  category: "Electronics",
  type: "physical",
};
const ps5Polluted: ListingSearchRecord = {
  id: "ps5polluted",
  title: "Pink PS5 Controller",
  description:
    "gaming desk setup with RGB lamp vibes. Throwaway E2E test listing for Sky Drop messaging.",
  category: "Electronics",
  type: "physical",
  aiKeywords: ["desk", "lamp", "gaming", "sky", "drop"],
};
const ps5Empty: ListingSearchRecord = {
  id: "ps5empty",
  title: "Pink PS5 Controller",
  description: "",
  category: "Electronics",
};
const bmwTitled: ListingSearchRecord = {
  id: "bmw",
  title: "BMW 335i M Sport",
  description: "Great car",
  category: "Vehicles",
  vehicleMake: "BMW",
  vehicleModel: "335i",
};
// Title does NOT contain the make; make lives only in vehicleMake.
const bmwMakeFieldOnly: ListingSearchRecord = {
  id: "bmw-fields",
  title: "2008 335i coupe",
  description: "Great car",
  category: "Vehicles",
  vehicleMake: "BMW",
  vehicleModel: "335i",
};
const iphone: ListingSearchRecord = {
  id: "iphone",
  title: "iPhone 15 Pro 256GB",
  description: "Unlocked",
  category: "Electronics",
};

const ids = (listings: ListingSearchRecord[], q: string, minScore = 3) =>
  rankListingsBySearch(listings, normalizeMarketplaceSearchQuery(q), { minScore }).map(
    (r) => r.listing.id
  );

describe("M1 Desk Lamp: description / keyword pollution no longer clears the bar", () => {
  it("real desk lamp keeps its score; polluted and clean PS5 are 0", () => {
    expect(scoreListingMatch(deskLamp, "Desk Lamp")).toBeCloseTo(25.9, 1);
    expect(scoreListingMatch(deskLampProd, "Desk Lamp")).toBeGreaterThan(10);
    expect(scoreListingMatch(ps5Clean, "Desk Lamp")).toBe(0);
    expect(scoreListingMatch(ps5Polluted, "Desk Lamp")).toBe(0);
    expect(scoreListingMatch(ps5Empty, "Desk Lamp")).toBe(0);
  });
  it("polluted PS5 is not ranked, even with minScore 0.1", () => {
    expect(rankListingsBySearch([ps5Polluted], "Desk Lamp", { minScore: 3 })).toHaveLength(0);
    expect(rankListingsBySearch([ps5Polluted], "Desk Lamp", { minScore: 0.1 })).toHaveLength(0);
  });
  it("real desk lamp ranks first; no PS5 in results", () => {
    expect(ids([ps5Polluted, ps5Clean, deskLamp, ps5Empty], "Desk Lamp")).toEqual(["desk"]);
    expect(ids([ps5Polluted, deskLampProd, ps5Clean, deskLamp], "Desk Lamp")).toEqual(
      expect.arrayContaining(["desk", "desk-prod"])
    );
    expect(ids([ps5Polluted, deskLampProd, ps5Clean, deskLamp], "Desk Lamp")).not.toContain(
      "ps5polluted"
    );
    expect(ids([ps5Polluted, deskLampProd, ps5Clean, deskLamp], "Desk Lamp")).not.toContain(
      "ps5clean"
    );
  });
  it("page path (resolveSearchPageQuery typed intent) behaves the same", () => {
    const { intent, rankQuery } = resolveSearchPageQuery("Desk Lamp", "");
    const r = rankListingsBySearch([ps5Polluted, deskLampProd], intent ?? rankQuery, {
      minScore: 3,
    });
    expect(r.map((x) => x.listing.id)).toEqual(["desk-prod"]);
  });
  it("keywords alone are not a substitute for the title", () => {
    const kwOnly = { id: "kw", title: "Gaming Chair", description: "", aiKeywords: ["desk", "lamp"] };
    expect(scoreListingMatch(kwOnly, "Desk Lamp")).toBe(0);
  });
});

describe("M1 Lead pass criterion: zzzz_sky_drop_nonexistent_2026 -> 0 results", () => {
  const q = "zzzz_sky_drop_nonexistent_2026";
  it("0 for the E2E Desk Lamp seed whose description says 'Sky Drop messaging'", () => {
    expect(scoreListingMatch(deskLampProd, q)).toBe(0);
    expect(ids([deskLampProd], q)).toEqual([]);
    expect(rankListingsBySearch([deskLampProd], q, { minScore: 0.1 })).toHaveLength(0);
  });
  it("0 for Pink PS5 (clean and polluted), BMW and iPhone", () => {
    const all = [deskLamp, deskLampProd, ps5Clean, ps5Polluted, ps5Empty, bmwTitled, iphone];
    expect(ids(all, q)).toEqual([]);
    expect(rankListingsBySearch(all, q, { minScore: 0.1 })).toHaveLength(0);
  });
  it("0 via the page path (typed intent) too", () => {
    const { intent, rankQuery } = resolveSearchPageQuery(q, "");
    const all = [deskLamp, deskLampProd, ps5Clean, ps5Polluted];
    expect(rankListingsBySearch(all, intent ?? rankQuery, { minScore: 3 })).toHaveLength(0);
  });
});

describe("M1 single-token queries unchanged", () => {
  it("PS5 still matches Pink PS5 (13.7) and not the desk lamp", () => {
    expect(scoreListingMatch(ps5Clean, "PS5")).toBeCloseTo(13.7, 1);
    expect(scoreListingMatch(ps5Polluted, "PS5")).toBeCloseTo(13.7, 1);
    expect(scoreListingMatch(ps5Empty, "PS5")).toBeCloseTo(13.7, 1);
    expect(scoreListingMatch(deskLamp, "PS5")).toBe(0);
    expect(ids([deskLamp, ps5Clean, ps5Polluted], "PS5").sort()).toEqual(["ps5clean", "ps5polluted"]);
  });
  it("single 'lamp' / 'desk' can still be satisfied by description (single-token behaviour not gated)", () => {
    expect(scoreListingMatch(ps5Polluted, "lamp")).toBeGreaterThan(0);
    expect(scoreListingMatch(deskLamp, "lamp")).toBeGreaterThan(10);
  });
  it("'pink ps5' (2 tokens, both in title) still scores high", () => {
    expect(scoreListingMatch(ps5Clean, "Pink PS5")).toBeGreaterThan(15);
    expect(scoreListingMatch(deskLamp, "Pink PS5")).toBe(0);
  });
});

describe("M1 multi-token tolerance (documented behaviour)", () => {
  it("plural / suffix: 'desk lamps' and 'desks lamp' still match the desk lamp", () => {
    expect(scoreListingMatch(deskLamp, "desk lamps")).toBeGreaterThan(10);
    expect(scoreListingMatch(deskLamp, "desks lamp")).toBeGreaterThan(10);
    expect(scoreListingMatch(ps5Polluted, "desk lamps")).toBe(0);
  });
  it("token order and extra title words don't matter ('lamp desk', 'e2e desk lamp')", () => {
    expect(scoreListingMatch(deskLamp, "lamp desk")).toBeGreaterThan(10);
    expect(scoreListingMatch(deskLamp, "e2e desk lamp")).toBeGreaterThan(10);
  });
  it("substring rule: partial token inside a title word still covers ('desk lam' -> 'Lamp')", () => {
    expect(scoreListingMatch(deskLamp, "desk lam")).toBeGreaterThan(10);
  });
  it("typo tolerance: 'desk lmap' (adjacent swap) and 'dsk lamp' (vowel-less shorthand) still match the desk lamp", () => {
    expect(scoreListingMatch(deskLamp, "desk lmap")).toBeGreaterThan(5);
    expect(scoreListingMatch(deskLampProd, "desk lmap")).toBeGreaterThan(5);
    expect(scoreListingMatch(deskLamp, "dsk lamp")).toBeGreaterThan(5);
    expect(scoreListingMatch(deskLampProd, "dsk lamp")).toBeGreaterThan(5);
    expect(ids([ps5Polluted, deskLamp], "desk lmap")).toEqual(["desk"]);
    expect(ids([ps5Polluted, deskLamp], "dsk lamp")).toEqual(["desk"]);
  });
  it("...and the same typo queries still score 0 on the polluted / clean PS5", () => {
    for (const q of ["desk lmap", "dsk lamp", "desk lamps", "desk lamp for sale"]) {
      expect(scoreListingMatch(ps5Polluted, q)).toBe(0);
      expect(scoreListingMatch(ps5Clean, q)).toBe(0);
      expect(scoreListingMatch(ps5Empty, q)).toBe(0);
    }
  });
  it("single-token partial ('lam') is not gated by M1", () => {
    expect(scoreListingMatch(deskLamp, "lam")).toBeGreaterThan(5);
  });
  it("similarity >= 0.8 path (tokens >= 4 chars): single-char typos on longer title words match", () => {
    const l = { id: "x", title: "Mechanical Keyboard Wireless", description: "", category: "Electronics" };
    expect(scoreListingMatch(l, "mechanical keyboerd")).toBeGreaterThan(3);
    expect(scoreListingMatch(l, "mechanicak keyboard")).toBeGreaterThan(3);
    expect(scoreListingMatch(l, "mecanical keyboard")).toBeGreaterThan(3); // dropped letter
  });
  it("short tokens (< 3 chars) are not counted toward the 2-token rule or title coverage", () => {
    const tvDesk = { id: "tvdesk", title: "Walnut Desk", description: "tv stand", category: "Home" };
    // 'tv' is < 3 chars => only 'desk' is significant (1 token) => gate off, tv hit via description counts
    expect(scoreListingMatch(tvDesk, "tv desk")).toBeGreaterThan(5);
    // 'a' and 'b' tokens: no significant tokens => gate off (existing behaviour)
    expect(scoreListingMatch(ps5Polluted, "pc ps5")).toBeGreaterThan(0);
    // 'ps5 tv': 'tv' short => not required in title
    expect(scoreListingMatch(ps5Clean, "ps5 tv")).toBeGreaterThan(5);
  });
});

describe("M1 filler words (stopwords) are ignored by the coverage gate", () => {
  it("'desk lamp for sale' matches the desk lamp, not the polluted PS5 (whose description may even say 'for sale')", () => {
    expect(scoreListingMatch(deskLamp, "desk lamp for sale")).toBeGreaterThan(10);
    expect(scoreListingMatch(deskLampProd, "desk lamp for sale")).toBeGreaterThan(10);
    expect(scoreListingMatch(ps5Polluted, "desk lamp for sale")).toBe(0);
  });
  it.each([
    "cheap desk lamp",
    "used desk lamp",
    "new desk lamp",
    "best desk lamp",
    "good desk lamp",
    "buy desk lamp",
    "wanted desk lamp",
    "selling desk lamp",
    "desk lamp near me",
    "the desk and lamp with e2e",
    "second hand desk lamp",
    "secondhand desk lamp",
    "brand new desk lamp",
    "great desk lamp for sale",
  ])("filler query %j still finds the desk lamp and never the polluted PS5", (q) => {
    expect(scoreListingMatch(deskLamp, q)).toBeGreaterThan(5);
    expect(scoreListingMatch(ps5Polluted, q)).toBe(0);
    expect(ids([ps5Polluted, ps5Clean, deskLamp], q)).toEqual(["desk"]);
  });
  it("fewer than 2 content tokens after filler removal falls back to the single-token rule (gate off)", () => {
    // 'for sale' -> 0 content tokens; 'new desk' -> ['desk'] -> single-token behaviour (description may match)
    expect(explainMultiTokenCoverage(deskLamp, ["for", "sale"])).toEqual([]);
    expect(explainMultiTokenCoverage(deskLamp, ["new", "desk"])).toEqual([]);
    expect(scoreListingMatch(ps5Polluted, "new desk")).toBeGreaterThan(0); // single-token: description still counts
    expect(scoreListingMatch(ps5Polluted, "desk")).toBeGreaterThan(0);
  });
  it("filler words are not a free pass: remaining content tokens must still be covered", () => {
    expect(scoreListingMatch(deskLamp, "cheap used zzzz lamp")).toBe(0);
    expect(scoreListingMatch(ps5Polluted, "cheap used desk lamp for sale")).toBe(0);
  });
  it("real product words are NOT treated as filler ('pink ps5 controller', 'bmw 335i', 'iphone 15 pro')", () => {
    expect(explainMultiTokenCoverage(ps5Clean, ["pink", "ps5", "controller"]).map((d) => d.token)).toEqual([
      "pink",
      "ps5",
      "controller",
    ]);
    expect(scoreListingMatch(ps5Clean, "pink ps5 controller")).toBeGreaterThan(15);
    expect(scoreListingMatch(iphone, "iphone 15 pro")).toBeGreaterThan(10);
  });
});

describe("M1 nonsense tokens still fail the gate (typo tolerance is not a free pass)", () => {
  const all = [deskLamp, deskLampProd, ps5Clean, ps5Polluted, ps5Empty, bmwTitled, bmwMakeFieldOnly, iphone];
  it.each(["qwxzv", "zzzz", "lorem", "ipsum", "xyzzy", "asdfgh", "nonexistent", "2026"])(
    "token %j is never covered by any fixture's identity text when paired with a real word",
    (junk) => {
      for (const l of all) {
        const decisions = explainMultiTokenCoverage(l, [junk, "zzzzzz"]);
        expect(decisions[0].covered, `${junk} vs ${l.id}`).toBe(false);
      }
    }
  );
  it("'qwxzv lamp', 'desk qwxzv', 'zzzz lamp', 'lorem ipsum' score 0 on every fixture", () => {
    for (const q of ["qwxzv lamp", "desk qwxzv", "zzzz lamp", "lorem ipsum", "qwxzv zzzz"]) {
      for (const l of all) expect(scoreListingMatch(l, q), `${q} vs ${l.id}`).toBe(0);
      expect(rankListingsBySearch(all, q, { minScore: 0.1 })).toHaveLength(0);
    }
  });
  it("short identity words do not 'cover' long nonsense (length guard): 'one'/'ent' vs 'nonexistent'", () => {
    const l = { id: "one", title: "One Plus ENT Kit", description: "", category: "Tech" };
    expect(explainMultiTokenCoverage(l, ["nonexistent", "kit"])[0].covered).toBe(false);
    expect(scoreListingMatch(l, "nonexistent kit")).toBe(0);
  });
});

describe("M1 per-token coverage decisions for the zzzz Lead query", () => {
  const q = "zzzz_sky_drop_nonexistent_2026";
  const toks = processVoiceSearchTranscript(q, { allowBrandFuzzy: false })!.tokens;
  it("tokens are zzzz, sky, drop, nonexistent, 2026", () => {
    expect(toks).toEqual(["zzzz", "sky", "drop", "nonexistent", "2026"]);
  });
  it.each([
    ["E2E Desk Lamp seed (description says 'Sky Drop messaging')", deskLampProd],
    ["polluted Pink PS5", ps5Polluted],
    ["real desk lamp", deskLamp],
    ["clean Pink PS5", ps5Clean],
  ])("every token is uncovered vs %s", (_name, listing) => {
    const d = explainMultiTokenCoverage(listing as ListingSearchRecord, toks);
    expect(d.map((x) => x.token)).toEqual(toks);
    expect(d.every((x) => !x.covered)).toBe(true);
    // 'sky' / 'drop' exist only in the description / keywords, never in the identity text
    expect(d.find((x) => x.token === "sky")!.via).toBe("none");
    expect(d.find((x) => x.token === "drop")!.via).toBe("none");
  });
  it("typo-query decisions are explained (substring / transposition / skeleton / plural)", () => {
    const via = (l: ListingSearchRecord, t: string[]) => explainMultiTokenCoverage(l, t).map((d) => d.via);
    expect(via(deskLamp, ["desk", "lmap"])).toEqual(["substring", "transposition"]);
    expect(via(deskLamp, ["dsk", "lamp"])).toEqual(["skeleton", "substring"]);
    expect(via(deskLamp, ["desk", "lamps"])).toEqual(["substring", "similarity"]);
    expect(explainMultiTokenCoverage(ps5Polluted, ["desk", "lmap"]).every((d) => !d.covered)).toBe(true);
  });
});

describe("M1 vehicle make/model fields count as title identity", () => {
  it("'bmw 335i' finds a listing whose title lacks 'bmw' but vehicleMake is BMW", () => {
    expect(scoreListingMatch(bmwMakeFieldOnly, "bmw 335i")).toBeGreaterThan(10);
    expect(scoreListingMatch(bmwTitled, "bmw 335i")).toBeGreaterThan(10);
  });
  it("...but not when the make appears only in the description", () => {
    const l = { id: "x", title: "Sport coupe", description: "bmw 335i style", category: "Vehicles" };
    expect(scoreListingMatch(l, "bmw 335i")).toBe(0);
  });
});

describe("M1 identity fields (category / type / location) count alongside the title", () => {
  const photographer = {
    id: "photo",
    title: "Wedding photographer",
    description: "Portraits and events",
    category: "Photography",
    type: "service",
    location: "Ponsonby, Auckland",
  };
  const trailer = {
    id: "trailer",
    title: "Single axle trailer",
    description: "Trailer hire daily",
    category: "Vehicles",
    type: "rental",
  };
  const phoneCase = { id: "case", title: "Phone case", description: "Clear case", category: "Tech", type: "physical" };
  it("'photographer auckland' matches via title + location; 'trailer rental' via title + type", () => {
    expect(scoreListingMatch(photographer, "photographer auckland")).toBeGreaterThan(5);
    expect(scoreListingMatch(trailer, "trailer rental")).toBeGreaterThan(5);
    expect(scoreListingMatch(trailer, "trailer hire")).toBeGreaterThan(5); // 'hire' type synonym
    expect(scoreListingMatch(phoneCase, "photographer auckland")).toBe(0);
    expect(scoreListingMatch(phoneCase, "trailer rental")).toBe(0);
  });
  it("category counts: 'photography wedding' matches", () => {
    expect(scoreListingMatch(photographer, "wedding photography")).toBeGreaterThan(5);
  });
  it("a location token that the listing never states fails the gate ('photographer wellington')", () => {
    expect(scoreListingMatch(photographer, "photographer wellington")).toBe(0);
  });
  it("description / keyword text still does not count ('trailer daily' with 'daily' only in description)", () => {
    expect(scoreListingMatch(trailer, "trailer daily")).toBe(0);
  });
});

describe("M1 voice object-intent path still works", () => {
  it("'beemer' -> bmw single token via processVoiceSearchTranscript result", () => {
    const intent = processVoiceSearchTranscript("beemer");
    expect(intent?.searchQuery).toBe("bmw");
    const r = rankListingsBySearch([deskLamp, ps5Clean, bmwTitled, iphone], intent!, { minScore: 3 });
    expect(r.map((x) => x.listing.id)).toEqual(["bmw"]);
  });
  it("'find me a beemer 335i' (2 sig tokens, voice intent) -> bmw titled and make-field-only listings", () => {
    const intent = processVoiceSearchTranscript("find me a beemer 335i");
    expect(intent?.searchQuery).toBe("bmw 335i");
    const r = rankListingsBySearch([deskLamp, ps5Polluted, bmwMakeFieldOnly, bmwTitled], intent!, {
      minScore: 3,
    });
    expect(r.map((x) => x.listing.id).sort()).toEqual(["bmw", "bmw-fields"]);
  });
  it("voice brand_fuzzy ('find me a toyoda') still works for a single token", () => {
    const intent = processVoiceSearchTranscript("find me a toyoda");
    expect(intent?.searchQuery).toBe("toyota");
    const toyota = { id: "t", title: "Toyota Corolla", description: "", category: "Vehicles" };
    expect(rankListingsBySearch([deskLamp, toyota], intent!, { minScore: 3 }).map((x) => x.listing.id)).toEqual(["t"]);
  });
  it("voice 2-token intent pollution is gated too ('desk lamp' heard)", () => {
    const intent = processVoiceSearchTranscript("looking for desk lamp");
    expect(intent?.searchQuery).toBe("desk lamp");
    expect(rankListingsBySearch([ps5Polluted, deskLamp], intent!, { minScore: 3 }).map((x) => x.listing.id)).toEqual(["desk"]);
  });
});

describe("M1 empty / punctuation / degenerate inputs", () => {
  it("empty, whitespace and punctuation-only queries rank nothing and never throw", () => {
    const all = [deskLamp, ps5Polluted, bmwTitled];
    for (const q of ["", "   ", "###", "!!!@@@###", "?", "a", "a b", "- -"]) {
      expect(() => rankListingsBySearch(all, q, { minScore: 3 })).not.toThrow();
      expect(rankListingsBySearch(all, q, { minScore: 3 })).toEqual([]);
    }
  });
  it("listings with empty / missing fields never throw and score 0 for multi-token", () => {
    const bare = { id: "bare" } as ListingSearchRecord;
    const blankTitle = { id: "bt", title: "", description: "desk lamp", category: "" };
    expect(scoreListingMatch(bare, "desk lamp")).toBe(0);
    expect(scoreListingMatch(blankTitle, "desk lamp")).toBe(0);
    expect(scoreListingMatch(bare, "ps5")).toBe(0);
  });
  it("double spaces / leading whitespace in listing text don't create empty blob tokens that match", () => {
    const l = { id: "sp", title: "  Desk   Lamp  ", description: "  ", category: " " };
    expect(scoreListingMatch(l, "desk lamp")).toBeGreaterThan(10);
  });
});
