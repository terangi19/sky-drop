/**
 * Natural-language sell price extraction + BMW→PS5 draft isolation.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearSearchSession, searchSessionKey } from "./awhina-search-memory";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import {
  clearListingDraftSession,
  listingDraftSessionKey,
  parseListingPriceFromMessage,
  validateListingFillFields,
} from "./awhina-listing-fill-tools";
import { mergeListingFillWithDraft } from "./sky-ai-draft-merge";
import { isExplicitNewSellListingMessage } from "./sky-ai-intent";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

function wipe(id: string) {
  clearSearchSession(searchSessionKey({ conversationId: id }));
  clearTaskScope(taskScopeKey({ conversationId: id }));
  clearListingDraftSession(listingDraftSessionKey({ conversationId: id }));
}

/** Mirrors route.ts finalizeListingFill fresh-draft behavior for unit tests. */
function simulateFinalizeListingFill(
  message: string,
  listingContext: SkyAiListingFill | null,
  listingFill: SkyAiListingFill
): SkyAiListingFill {
  const fresh =
    listingFill.replaceDraft === true || isExplicitNewSellListingMessage(message);
  if (fresh) return { ...listingFill, replaceDraft: true };
  return mergeListingFillWithDraft(listingContext, listingFill);
}

describe("natural language price extraction", () => {
  const cases: [string, string | null][] = [
    ["200 bucks", "200"],
    ["200 dollars", "200"],
    ["200 nzd", "200"],
    ["asking 200", "200"],
    ["asking price 200", "200"],
    ["want 200 for it", "200"],
    ["sell it for 200", "200"],
    ["200 ono", "200"],
    ["sell my 2007 BMW for 15000", "15000"],
    ["iphone 15 128gb 900 bucks", "900"],
    ["want to list my ps5 its brand new 200 bucks pick up auckland", "200"],
    ["find me a BMW 335i 2007 under 15k Auckland", null],
    ["actually make it 250", "250"],
    ["bmw 335i 2007", null],
  ];

  for (const [msg, expected] of cases) {
    it(`${JSON.stringify(msg)} → ${expected}`, () => {
      expect(parseListingPriceFromMessage(msg)).toBe(expected);
    });
  }

  it("year stays year when selling 2007 BMW for 15000", () => {
    const r = processCanonicalAwhina("sell my 2007 BMW for 15000 Auckland", {
      conversationId: "year-vs-price",
      pathname: "/",
    });
    wipe("year-vs-price");
    expect(r.listingFill?.price).toBe("15000");
    expect(r.listingFill?.vehicleYear).toBe("2007");
    expect(r.listingFill?.price).not.toBe("2007");
  });

  it("128gb is storage not price", () => {
    const r = processCanonicalAwhina("selling iphone 15 128gb 900 bucks auckland", {
      conversationId: "storage-vs-price",
      pathname: "/",
    });
    wipe("storage-vs-price");
    expect(r.listingFill?.price).toBe("900");
    expect(r.listingFill?.price).not.toBe("128");
  });
});

describe("BMW search → PS5 sell: price 200 not 2007 + replaceDraft", () => {
  const id = "bmw-ps5-2007-bug";

  beforeEach(() => wipe(id));

  it("exact repro: find BMW then list PS5 → price 200, no BMW fields, replaceDraft", () => {
    const buy = processCanonicalAwhina("find me a BMW 335i 2007 under 15k Auckland", {
      conversationId: id,
      pathname: "/",
    });
    expect(buy.tool).toBe("searchListings");
    expect(buy.navigateTo).toMatch(/year=2007/);

    const sell = processCanonicalAwhina(
      "want to list my ps5 its brand new 200 bucks pick up auckland",
      { conversationId: id, pathname: "/" }
    );

    expect(sell.listingFill?.price).toBe("200");
    expect(sell.listingFill?.price).not.toBe("2007");
    expect(sell.listingFill?.replaceDraft).toBe(true);
    expect(sell.listingFill?.condition).toBe("New");
    expect(String(sell.listingFill?.title || "")).toMatch(/Brand New.*PlayStation\s*5/i);
    expect(JSON.stringify(sell.listingFill)).not.toMatch(/bmw|335i|2007|15000/i);
    expect(String(sell.listingFill?.description || "").length).toBeGreaterThan(40);
  });

  it("server finalize + client merge: stale 2007 draft does not win over replaceDraft", () => {
    const sell = processCanonicalAwhina(
      "want to list my ps5 its brand new 200 bucks pick up auckland",
      { conversationId: id, pathname: "/post/ai" }
    );
    expect(sell.listingFill?.price).toBe("200");
    expect(sell.listingFill?.replaceDraft).toBe(true);

    const stalePrior = {
      title: "BMW 335i",
      price: "2007",
      vehicleYear: "2007",
      vehicleMake: "BMW",
      vehicleModel: "335i",
      listingType: "vehicle",
      location: "Auckland",
      category: "Cars",
    };

    const finalized = simulateFinalizeListingFill(
      "want to list my ps5 its brand new 200 bucks pick up auckland",
      stalePrior,
      sell.listingFill!
    );
    expect(finalized.price).toBe("200");
    expect(finalized.replaceDraft).toBe(true);
    expect(finalized.vehicleMake).toBeUndefined();
    expect(JSON.stringify(finalized)).not.toMatch(/bmw|335i|2007/i);

    // Client simulate: replaceDraft → no merge
    const clientApplied =
      finalized.replaceDraft === true
        ? { ...finalized }
        : mergeListingFillWithDraft(stalePrior, finalized);
    expect(clientApplied.price).toBe("200");
    expect(clientApplied.vehicleMake).toBeUndefined();

    // Without replaceDraft, stale price would leak when fill omits price
    const leak = mergeListingFillWithDraft(stalePrior, {
      title: "PlayStation 5",
      condition: "New",
    });
    expect(leak.price).toBe("2007");
  });

  it("follow-up actually make it 250 → price 250 (merge, not fresh)", () => {
    processCanonicalAwhina(
      "want to list my ps5 its brand new 200 bucks pick up auckland",
      { conversationId: id, pathname: "/post/ai" }
    );
    const follow = processCanonicalAwhina("actually make it 250", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(follow.listingFill?.price).toBe("250");
    expect(follow.listingFill?.replaceDraft).not.toBe(true);
    expect(String(follow.listingFill?.title || "")).toMatch(/PlayStation\s*5/i);
  });
});

describe("validateListingFillFields preserves replaceDraft", () => {
  it("keeps replaceDraft through validation", () => {
    const validated = validateListingFillFields({
      title: "Brand New PlayStation 5 Console",
      price: "200",
      condition: "New",
      listingType: "physical",
      category: "Gaming",
      replaceDraft: true,
    });
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.fill.replaceDraft).toBe(true);
      expect(validated.fill.price).toBe("200");
    }
  });
});
