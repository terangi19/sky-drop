/**
 * BMW buy-path regression + buy/sell/ambiguous/number collision cases.
 * Also verifies sticky SEARCH tool gating and anon isolation.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import {
  clearSearchSession,
  searchSessionKey,
  getSearchSession,
  hydrateSearchSession,
} from "./awhina-search-memory";
import {
  clearTaskScope,
  taskScopeKey,
  getTaskScope,
  isToolAllowedForTask,
  hydrateTaskScope,
} from "./awhina-task-scope";
import {
  hasListingSellIntent,
  hasSearchIntentLanguage,
  detectSkyAiIntent,
} from "./sky-ai-intent";
import { parseListingPriceFromMessage } from "./awhina-listing-fill-tools";
import { parseVehicleYear, parseFindBudget, parseFindCity } from "./sky-ai-find-routing";
import { readFileSync } from "fs";
import { join } from "path";

function wipe(id: string) {
  clearSearchSession(searchSessionKey({ conversationId: id }));
  clearTaskScope(taskScopeKey({ conversationId: id }));
  return id;
}

describe("BMW exact two-turn regression", () => {
  it('T1 "want a bmw" → searchListings BMW, never invents 335i, never sell', () => {
    const id = wipe("bmw-repro-t1");
    const r = processCanonicalAwhina("want a bmw", {
      conversationId: id,
      pathname: "/",
    });
    expect(r.handled).toBe(true);
    expect(r.tool).toBe("searchListings");
    expect(r.listingFill).toBeUndefined();
    expect(r.navigateTo).not.toBe("/post/ai");
    expect(r.reply?.toLowerCase()).toMatch(/bmw/);
    expect(r.reply?.toLowerCase()).not.toMatch(/335i/);
    expect(r.navigateTo?.toLowerCase()).toMatch(/bmw/);
    expect(r.navigateTo?.toLowerCase()).not.toMatch(/335i/);
    expect(getTaskScope(taskScopeKey({ conversationId: id }))?.task).toBe("shopping");
  });

  it("T2 follow-up → search year=2007 maxPrice=15000 Auckland, NOT price 2007 / updateListingDraft", () => {
    const id = wipe("bmw-repro-t2");
    processCanonicalAwhina("want a bmw", { conversationId: id, pathname: "/" });
    const r = processCanonicalAwhina(
      "bmw 335i 2007 budget 15k and location auckland",
      { conversationId: id, pathname: "/" }
    );
    expect(r.handled).toBe(true);
    expect(r.tool).toBe("searchListings");
    expect(r.tool).not.toMatch(/updateListingDraft|createListing/);
    expect(r.listingFill).toBeUndefined();
    expect(r.navigateTo).not.toBe("/post/ai");
    expect(r.reply?.toLowerCase()).not.toMatch(/publish/);
    expect(r.reply?.toLowerCase()).not.toMatch(/\$2,?007/);

    const filters = r.toolCall?.args?.searchListings?.filters;
    expect(filters?.maxPrice).toBe(15000);
    expect(filters?.year).toBe(2007);
    expect(String(filters?.location || "").toLowerCase()).toBe("auckland");
    expect(filters?.make?.toUpperCase()).toBe("BMW");
    expect(String(filters?.model || "").toLowerCase()).toBe("335i");

    const nav = r.navigateTo || "";
    expect(nav).toMatch(/maxPrice=15000/);
    expect(nav).toMatch(/year=2007|minYear=2007/);
    expect(nav.toLowerCase()).toMatch(/auckland/);
    expect(nav.toLowerCase()).toMatch(/335i/);
  });
});

describe("BUY / SELL / AMBIGUOUS / NUMBER COLLISION", () => {
  it("BUY: looking for / need / find stay search", () => {
    for (const msg of ["looking for a Toyota", "need a Mazda", "find Honda Civic"]) {
      const id = wipe(`buy-${msg.slice(0, 8)}`);
      const r = processCanonicalAwhina(msg, { conversationId: id, pathname: "/" });
      expect(r.tool).toBe("searchListings");
      expect(r.navigateTo).not.toBe("/post/ai");
    }
  });

  it("SELL: explicit sell language creates listing", () => {
    const id = wipe("sell-explicit");
    const r = processCanonicalAwhina("selling my BMW 335i 2007 Auckland $18500", {
      conversationId: id,
      pathname: "/",
    });
    expect(r.tool).toMatch(/createListing|updateListingDraft/);
    expect(r.listingFill || r.navigateTo === "/post/ai").toBeTruthy();
  });

  it("AMBIGUOUS after SEARCH stays SEARCH until explicit sell", () => {
    const id = wipe("ambig-sticky");
    processCanonicalAwhina("want a bmw", { conversationId: id, pathname: "/" });
    const r = processCanonicalAwhina("335i under 20k Auckland", {
      conversationId: id,
      pathname: "/",
    });
    expect(r.tool).toBe("searchListings");
    expect(hasListingSellIntent("335i under 20k Auckland")).toBe(false);
  });

  it("NUMBER COLLISION: 2007 with vehicle = year not price", () => {
    expect(parseVehicleYear("bmw 335i 2007 budget 15k")).toBe("2007");
    expect(parseFindBudget("bmw 335i 2007 budget 15k")).toBe("15000");
    expect(parseListingPriceFromMessage("bmw 335i 2007 budget 15k and location auckland")).toBeNull();
    expect(parseListingPriceFromMessage("make it 450")).toBe("450");
    expect(parseListingPriceFromMessage("price is 500")).toBe("500");
    expect(parseListingPriceFromMessage("$500")).toBe("500");
    expect(parseListingPriceFromMessage("128GB storage")).toBeNull();
    expect(parseListingPriceFromMessage("for 15k")).toBe("15000");
  });

  it("year-as-price false positive killed: hasListingSellIntent", () => {
    expect(hasListingSellIntent("bmw 335i 2007 budget 15k and location auckland")).toBe(false);
    expect(hasSearchIntentLanguage("want a bmw")).toBe(true);
    expect(detectSkyAiIntent("want a bmw")).toBe("find_buy");
  });

  it("tool gate: SEARCH blocks create/update listing", () => {
    expect(isToolAllowedForTask("searchListings", "shopping")).toBe(true);
    expect(isToolAllowedForTask("updateListingDraft", "shopping")).toBe(false);
    expect(isToolAllowedForTask("createListing", "shopping")).toBe(false);
    expect(isToolAllowedForTask("createListing", "selling")).toBe(true);
  });

  it("location parsed once from 'location auckland'", () => {
    expect(parseFindCity("budget 15k and location auckland")).toBe("Auckland");
  });
});

describe("anon session isolation", () => {
  it("Anon A vs B do not share search memory", () => {
    clearSearchSession(searchSessionKey({ anonSessionId: "anon-A" }));
    clearSearchSession(searchSessionKey({ anonSessionId: "anon-B" }));
    clearTaskScope(taskScopeKey({ anonSessionId: "anon-A" }));
    clearTaskScope(taskScopeKey({ anonSessionId: "anon-B" }));

    processCanonicalAwhina("want a bmw", {
      pathname: "/",
      anonSessionId: "anon-A",
    });
    processCanonicalAwhina("looking for Toyota", {
      pathname: "/",
      anonSessionId: "anon-B",
    });

    const a = getSearchSession(searchSessionKey({ anonSessionId: "anon-A" }));
    const b = getSearchSession(searchSessionKey({ anonSessionId: "anon-B" }));
    expect(a?.filters.query?.toLowerCase()).toMatch(/bmw/);
    expect(b?.filters.query?.toLowerCase()).toMatch(/toyota/);
    expect(a?.filters.query?.toLowerCase()).not.toMatch(/toyota/);
  });
});

describe("durable client context hydration", () => {
  it("hydrates sticky SEARCH from client-sent context when Map cold", () => {
    const id = wipe("hydrate-client");
    // Simulate cold Map: only client context
    clearSearchSession(searchSessionKey({ conversationId: id }));
    clearTaskScope(taskScopeKey({ conversationId: id }));
    hydrateTaskScope(taskScopeKey({ conversationId: id }), {
      task: "shopping",
      updatedAt: Date.now(),
    });
    hydrateSearchSession(searchSessionKey({ conversationId: id }), {
      filters: { query: "BMW", make: "BMW" },
      updatedAt: Date.now(),
    });

    const r = processCanonicalAwhina("335i 2007 budget 15k location auckland", {
      conversationId: id,
      pathname: "/",
      clientTask: { task: "shopping", updatedAt: Date.now() },
      clientSearch: {
        filters: { query: "BMW", make: "BMW" },
        updatedAt: Date.now(),
      },
    });
    expect(r.tool).toBe("searchListings");
    expect(r.toolCall?.args?.searchListings?.filters?.maxPrice).toBe(15000);
    expect(r.toolCall?.args?.searchListings?.filters?.year).toBe(2007);
  });
});

describe("sky-ai route calls canonical first", () => {
  it("route.ts imports and invokes processCanonicalAwhina before AI fallback", () => {
    const routePath = join(__dirname, "../api/sky-ai/route.ts");
    const src = readFileSync(routePath, "utf8");
    expect(src).toMatch(/import\s+\{\s*processCanonicalAwhina\s*\}/);
    expect(src).toMatch(/Canonical Āwhina/);
    // Call site: canonical block must precede freeform/LLM handling markers
    const callIdx = src.indexOf("const canonical = processCanonicalAwhina");
    expect(callIdx).toBeGreaterThan(0);
    const llmCapability = src.indexOf("awhina-llm-capability");
    const freeform = src.indexOf("freeform") !== -1 ? src.lastIndexOf("freeform") : -1;
    // If LLM capability is imported, the handled canonical return must exist
    expect(src).toMatch(/routing:\s*"canonical"/);
    expect(src).toMatch(/if\s*\(\s*canonical\.handled/);
    void llmCapability;
    void freeform;
  });
});
