/**
 * GENERAL sell one-shot + BUY→SELL isolation regressions.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearSearchSession, searchSessionKey, getSearchSession } from "./awhina-search-memory";
import { clearTaskScope, taskScopeKey, getTaskScope } from "./awhina-task-scope";
import {
  clearListingDraftSession,
  listingDraftSessionKey,
  parseListingPriceFromMessage,
} from "./awhina-listing-fill-tools";

function wipe(id: string) {
  clearSearchSession(searchSessionKey({ conversationId: id }));
  clearTaskScope(taskScopeKey({ conversationId: id }));
  clearListingDraftSession(listingDraftSessionKey({ conversationId: id }));
}

describe("BUY→SELL hard reset (BMW search → PS5 sell)", () => {
  const id = "buy-sell-ps5-isolation";

  beforeEach(() => wipe(id));

  it("exact: BMW search then list PS5 → price 200 not 2007, premium title, no BMW leak", () => {
    const buy = processCanonicalAwhina("want a BMW 335i 2007 under 15k Auckland", {
      conversationId: id,
      pathname: "/",
    });
    expect(buy.tool).toBe("searchListings");
    expect(buy.navigateTo).toMatch(/year=2007/);
    expect(buy.navigateTo).toMatch(/maxPrice=15000/);

    const sell = processCanonicalAwhina(
      "want to list my ps5 its brand new 200 bucks pick up auckland",
      { conversationId: id, pathname: "/" }
    );

    expect(sell.tool).toMatch(/createListing|updateListingDraft/);
    expect(sell.listingFill?.price).toBe("200");
    expect(sell.listingFill?.price).not.toBe("2007");
    expect(sell.listingFill?.condition).toBe("New");
    expect(String(sell.listingFill?.title || "")).toMatch(/PlayStation\s*5/i);
    expect(String(sell.listingFill?.title || "").toLowerCase()).not.toMatch(/its brand/);
    expect(String(sell.listingFill?.title || "").toLowerCase()).not.toMatch(/bmw|335i/);
    expect(String(sell.listingFill?.location || "").toLowerCase()).toMatch(/auckland/);
    expect(sell.listingFill?.pickupAvailable).toBe(true);
    expect(sell.listingFill?.category).toBe("Gaming");
    expect(String(sell.listingFill?.description || "").length).toBeGreaterThan(40);
    expect(sell.reply).toMatch(/listing(?:'s| is) ready/i);
    expect(sell.reply).not.toMatch(/^Updated:/i);
    expect(JSON.stringify(sell.listingFill)).not.toMatch(/bmw|335i|2007|15000/i);

    // SEARCH memory must not drive SELL draft
    const search = getSearchSession(searchSessionKey({ conversationId: id }));
    const task = getTaskScope(taskScopeKey({ conversationId: id }));
    expect(task?.task).toBe("selling");
    // Search session may exist but must not contaminate fill
    if (search?.filters) {
      expect(sell.listingFill?.price).not.toBe(search.filters.year);
      expect(sell.listingFill?.price).not.toBe(search.filters.maxPrice);
    }
  });
});

describe("price extraction: bucks / brand new", () => {
  it("200 bucks → 200", () => {
    expect(parseListingPriceFromMessage("brand new 200 bucks")).toBe("200");
  });
  it("does not treat 2007 as price in sell PS5 message", () => {
    expect(
      parseListingPriceFromMessage("want to list my ps5 its brand new 200 bucks pick up auckland")
    ).toBe("200");
  });
});

describe("one-shot sell regressions", () => {
  const cases = [
    {
      id: "sell-iphone",
      msg: "selling iPhone 15 Pro 128GB like new $950 Auckland pickup",
      price: "950",
      titleRe: /iPhone\s*15\s*Pro/i,
      category: "Tech",
    },
    {
      id: "sell-bmw",
      msg: "selling my 2018 BMW 320i 85000km Auckland $18500",
      price: "18500",
      titleRe: /BMW\s*320i|2018\s*BMW/i,
      listingType: "vehicle",
    },
    {
      id: "sell-couch",
      msg: "list my 3 seater couch good condition 250 bucks wellington pickup",
      price: "250",
      titleRe: /couch|sofa/i,
      category: "Home",
    },
    {
      id: "sell-airpods",
      msg: "selling AirPods Pro 2 brand new 280 dollars auckland",
      price: "280",
      titleRe: /AirPods/i,
      category: "Tech",
    },
  ] as const;

  for (const c of cases) {
    it(`one-shot: ${c.id}`, () => {
      wipe(c.id);
      const r = processCanonicalAwhina(c.msg, { conversationId: c.id, pathname: "/" });
      expect(r.listingFill?.price).toBe(c.price);
      expect(String(r.listingFill?.title || "")).toMatch(c.titleRe);
      expect(String(r.listingFill?.description || "").length).toBeGreaterThan(20);
      if ("category" in c && c.category) {
        expect(r.listingFill?.category).toBe(c.category);
      }
      if ("listingType" in c && c.listingType) {
        expect(r.listingFill?.listingType).toBe(c.listingType);
      }
      expect(JSON.stringify(r.listingFill)).not.toMatch(/stripe|buy now/i);
    });
  }
});

describe("SELL→BUY isolation", () => {
  const id = "sell-then-buy";
  beforeEach(() => wipe(id));

  it("after selling PS5, find BMW stays search without PS5 draft leak", () => {
    processCanonicalAwhina("want to list my ps5 brand new 200 bucks auckland", {
      conversationId: id,
      pathname: "/",
    });
    const buy = processCanonicalAwhina("find me BMW 335i under 15k", {
      conversationId: id,
      pathname: "/",
    });
    expect(buy.tool).toBe("searchListings");
    expect(buy.navigateTo).toMatch(/bmw/i);
    expect(buy.listingFill).toBeUndefined();
    expect(buy.navigateTo).not.toMatch(/ps5|playstation/i);
  });
});
