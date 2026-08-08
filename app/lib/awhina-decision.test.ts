/**
 * Decision layer + context precedence + tool gating + self-check.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  buildAwhinaDecision,
  collectIgnoredStaleContext,
  extractTurnEntities,
  isToolAllowedByDecision,
  pickPrecedentedValue,
  selfCheckBeforeToolResponse,
  tryResolvePendingClarification,
} from "./awhina-decision";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearSearchSession, searchSessionKey } from "./awhina-search-memory";
import { clearTaskScope, setActiveTask, taskScopeKey } from "./awhina-task-scope";
import { clearListingDraftSession, listingDraftSessionKey } from "./awhina-listing-fill-tools";
import { composeListingTitleAndDescription } from "./awhina-listing-composer";
import {
  buildGroundedCompareReply,
  resolveGroundedCompare,
} from "./awhina-product-ux";

function wipe(id: string) {
  clearSearchSession(searchSessionKey({ conversationId: id }));
  clearTaskScope(taskScopeKey({ conversationId: id }));
  clearListingDraftSession(listingDraftSessionKey({ conversationId: id }));
}

describe("extractTurnEntities", () => {
  it("parses PS5 sell facts", () => {
    const e = extractTurnEntities(
      "want to list my ps5 its brand new 200 bucks pick up auckland"
    );
    expect(e.item?.toLowerCase()).toMatch(/ps5/);
    expect(e.price).toBe("200");
    expect(e.condition).toBe("New");
    expect(e.location).toBe("Auckland");
  });

  it("parses iPhone storage vs price", () => {
    const e = extractTurnEntities("selling iphone 15 128gb 900 bucks auckland");
    expect(e.storage).toMatch(/128/i);
    expect(e.price).toBe("900");
  });

  it("parses BMW search year + budget", () => {
    const e = extractTurnEntities("bmw 335i 2007 budget 15k auckland");
    expect(e.make).toBe("BMW");
    expect(e.model?.toLowerCase()).toBe("335i");
    expect(e.year).toBe("2007");
    expect(e.maxPrice).toBe("15000");
  });
});

describe("context precedence + ignoredStaleContext", () => {
  it("marks BMW/2007/15k stale on PS5 sell after shopping", () => {
    const decision = buildAwhinaDecision({
      message: "want to list my ps5 its brand new 200 bucks pick up auckland",
      pathname: "/",
      session: { task: "shopping", updatedAt: Date.now() },
      searchFilters: {
        query: "BMW 335i",
        make: "BMW",
        model: "335i",
        year: "2007",
        maxPrice: "15000",
        location: "Auckland",
      },
    });
    expect(decision.activeTask).toBe("selling");
    expect(decision.freshSellStart).toBe(true);
    expect(decision.ignoredStaleContext.join(" ")).toMatch(/2007|15000|bmw|year|maxPrice/i);
    expect(decision.currentTurnEntities.price).toBe("200");
    expect(decision.currentTurnEntities.item?.toLowerCase()).toMatch(/ps5/);
  });

  it("pickPrecedentedValue prefers current over stale same-task", () => {
    expect(
      pickPrecedentedValue({
        current: "200",
        sameTaskContext: "2007",
        stale: true,
      })
    ).toBe("200");
    expect(
      pickPrecedentedValue({
        current: undefined,
        activeTaskValue: "Auckland",
        sameTaskContext: "Wellington",
      })
    ).toBe("Auckland");
  });

  it("collectIgnoredStaleContext lists search year/maxPrice", () => {
    const stale = collectIgnoredStaleContext({
      activeTask: "selling",
      priorTask: "shopping",
      freshSellStart: true,
      searchFilters: { make: "BMW", year: "2007", maxPrice: "15000" },
      currentEntities: { item: "ps5", price: "200" },
    });
    expect(stale.some((s) => /2007|year/i.test(s))).toBe(true);
    expect(stale.some((s) => /15000|maxPrice/i.test(s))).toBe(true);
  });
});

describe("tool gating from decision", () => {
  it("blocks createListing while shopping", () => {
    const d = buildAwhinaDecision({
      message: "want a bmw",
      pathname: "/",
      session: null,
      intentHint: "marketplace_search",
    });
    expect(isToolAllowedByDecision("searchListings", d)).toBe(true);
    expect(isToolAllowedByDecision("createListing", d)).toBe(false);
    expect(isToolAllowedByDecision("updateListingDraft", d)).toBe(false);
  });

  it("education blocks navigate/openMessages", () => {
    const d = buildAwhinaDecision({
      message: "how to stay safe meeting for pickup",
      pathname: "/",
      session: null,
      intentHint: "education",
    });
    expect(isToolAllowedByDecision("openMessages", d)).toBe(false);
    expect(isToolAllowedByDecision("navigate", d)).toBe(false);
  });

  it("self-check catches stale 2007 price on PS5 fill", () => {
    const d = buildAwhinaDecision({
      message: "want to list my ps5 its brand new 200 bucks",
      pathname: "/",
      session: { task: "shopping", updatedAt: Date.now() },
      searchFilters: { year: "2007", maxPrice: "15000", make: "BMW" },
    });
    const check = selfCheckBeforeToolResponse({
      decision: d,
      tool: "createListing",
      listingFill: { title: "PlayStation 5", price: "2007", vehicleMake: "BMW" },
    });
    expect(check.ok).toBe(false);
    expect(check.reasons.some((r) => /stale/i.test(r))).toBe(true);
  });
});

describe("listing composer", () => {
  it("Premium Plus PS5 title + description from facts", () => {
    const c = composeListingTitleAndDescription({
      item: "ps5",
      condition: "New",
      price: "200",
      location: "Auckland",
      pickupAvailable: true,
    });
    expect(c.title).toMatch(/Brand New.*PlayStation\s*5/i);
    expect((c.description || "").length).toBeGreaterThan(40);
    expect(c.description || "").not.toMatch(/Condition:\s*/i);
    expect(c.category).toBe("Gaming");
  });

  it("vehicle composer keeps year as year not price", () => {
    const c = composeListingTitleAndDescription({
      item: "BMW 335i",
      condition: "Used - Good",
      price: "15000",
      location: "Auckland",
      vehicleYear: "2007",
      vehicleMake: "BMW",
      vehicleModel: "335i",
      listingType: "vehicle",
    });
    expect(c.title).toMatch(/2007/);
    expect(c.description).toMatch(/2007|BMW|335i/i);
    expect(c.description).toMatch(/\$15000|Asking \$15000/i);
  });
});

describe("grounded compare pathway", () => {
  it("uses real facts in one pass — no invent", () => {
    const { reply, grounded } = buildGroundedCompareReply({
      message: "compare these",
      pageListings: [
        {
          title: "BMW 335i",
          price: 12000,
          year: 2007,
          condition: "Used - Good",
          location: "Auckland",
          mileage: 128000,
        },
        {
          title: "BMW 320i",
          price: 14000,
          year: 2010,
          condition: "Used - Like New",
          location: "Wellington",
          mileage: 90000,
        },
      ],
    });
    expect(grounded).toBe(true);
    expect(reply).toMatch(/12000|12,000/);
    expect(reply).not.toMatch(/\bI think\b|\bprobably\b/i);
  });

  it("needsEnrichment when only titles", () => {
    const r = resolveGroundedCompare({
      message: "compare BMW 335i and Toyota Corolla",
      pageListings: [],
    });
    expect(r.needsEnrichment).toBe(true);
    expect(r.grounded).toBe(false);
  });
});

describe("canonical wires decision on sell/search", () => {
  beforeEach(() => wipe("decision-wire"));

  it("search sets _decision marketplace_search", () => {
    const r = processCanonicalAwhina("want a bmw", {
      conversationId: "decision-wire",
      pathname: "/",
    });
    expect(r.tool).toBe("searchListings");
    expect(r._decision?.intent).toBe("marketplace_search");
    expect(r._decision?.allowedTools).toContain("searchListings");
    expect(r._decision?.blockedTools).toContain("createListing");
  });

  it("BMW→PS5 sell marks stale + price 200", () => {
    processCanonicalAwhina("find me a BMW 335i 2007 under 15k Auckland", {
      conversationId: "decision-wire",
      pathname: "/",
    });
    const sell = processCanonicalAwhina(
      "want to list my ps5 its brand new 200 bucks pick up auckland",
      { conversationId: "decision-wire", pathname: "/" }
    );
    expect(sell.listingFill?.price).toBe("200");
    expect(sell._decision?.freshSellStart).toBe(true);
    expect(sell._decision?.ignoredStaleContext.length).toBeGreaterThan(0);
    expect(JSON.stringify(sell.listingFill)).not.toMatch(/bmw|335i|2007/i);
  });

  it("education never navigates to /messages", () => {
    const r = processCanonicalAwhina("is this safe to buy from a stranger", {
      conversationId: "decision-wire",
      pathname: "/",
    });
    expect(r.intent).toBe("education");
    expect(r.navigateTo).toBeUndefined();
    expect(r.tool).not.toBe("openMessages");
  });
});

describe("service offering decision — no clarify regression", () => {
  beforeEach(() => wipe("service-offer"));

  it("I mow lawns for $50 → SELL service, high confidence, no clarify", () => {
    const d = buildAwhinaDecision({
      message: "I mow lawns for $50",
      pathname: "/",
      session: null,
    });
    expect(d.activeTask).toBe("selling");
    expect(d.intent).toBe("listing_create");
    expect(d.currentTurnEntities.listingType).toBe("service");
    expect(d.currentTurnEntities.item).toMatch(/lawn mowing/i);
    expect(d.currentTurnEntities.price).toBe("50");
    expect(d.requiresClarification).toBe(false);
    expect(d.confidence).toBeGreaterThanOrEqual(0.88);
  });

  it.each([
    ["I clean houses for $80", "House Cleaning"],
    ["photographer $120/hour", "Photographer"],
    ["I'm a tutor $40", "Tutoring"],
    ["plumbing from $80", "Plumbing"],
    ["I fix computers for $60", "Computer Repair"],
    ["I walk dogs for $25", "Dog Walking"],
    ["I build decks for $500", "Deck Building"],
    ["I paint houses for $200", "House Painting"],
  ])("%s → service sell no clarify", (msg, titleBit) => {
    const d = buildAwhinaDecision({ message: msg, pathname: "/", session: null });
    expect(d.activeTask).toBe("selling");
    expect(d.currentTurnEntities.listingType).toBe("service");
    expect(d.requiresClarification).toBe(false);
    expect(d.currentTurnEntities.item || "").toMatch(new RegExp(titleBit.split(" ")[0], "i"));
  });

  it("rent out / hire out → rental", () => {
    const d = buildAwhinaDecision({
      message: "rent out my trailer available to hire $60/day",
      pathname: "/",
      session: null,
    });
    expect(d.activeTask).toBe("selling");
    expect(d.currentTurnEntities.listingType).toBe("rental");
    expect(d.requiresClarification).toBe(false);
  });

  it("sell / for sale → physical sell", () => {
    const d = buildAwhinaDecision({
      message: "sell pressure washer for sale $300",
      pathname: "/",
      session: null,
    });
    expect(d.activeTask).toBe("selling");
    expect(d.currentTurnEntities.listingType).not.toBe("service");
  });

  it("canonical: I mow lawns for $50 starts service listing fill", () => {
    const r = processCanonicalAwhina("I mow lawns for $50", {
      conversationId: "service-offer",
      pathname: "/",
    });
    expect(r.handled).toBe(true);
    expect(r.source).not.toBe("clarify");
    expect(r.listingFill?.listingType).toBe("service");
    expect(r.listingFill?.price).toBe("50");
    expect(String(r.listingFill?.title || "")).toMatch(/lawn mowing/i);
    expect(r.listingFill?.servicePricingType).toBe("fixed");
    expect(r._decision?.requiresClarification).toBe(false);
  });

  it("clarification answer it's a service resolves once — never twice", () => {
    const id = "service-offer-clarify";
    wipe(id);
    setActiveTask(taskScopeKey({ conversationId: id }), "none", {
      pendingClarification: {
        kind: "buy_vs_sell",
        priorMessage: "lawns $50",
        askedAt: Date.now(),
      },
    });
    const first = processCanonicalAwhina("it's a service", {
      conversationId: id,
      pathname: "/",
      history: [
        { role: "user", content: "lawns $50" },
        { role: "assistant", content: "Are you selling a service or looking to buy?" },
      ],
    });
    expect(first.handled).toBe(true);
    expect(first.source).not.toBe("clarify");
    expect(first.listingFill?.listingType).toBe("service");
    expect(first.clarificationQuestion).toBeUndefined();

    const second = processCanonicalAwhina("it's a service", {
      conversationId: id,
      pathname: "/",
      history: [
        { role: "user", content: "lawns $50" },
        { role: "assistant", content: "Are you selling a service or looking to buy?" },
        { role: "user", content: "it's a service" },
        { role: "assistant", content: first.reply || "ok" },
      ],
    });
    // No pending left — must not re-ask the same clarify
    expect(second.source).not.toBe("clarify");
    expect(second.clarificationQuestion).toBeUndefined();
  });

  it("tryResolvePendingClarification merges prior + answer", () => {
    const r = tryResolvePendingClarification({
      message: "it's a service",
      pending: {
        kind: "listing_type",
        priorMessage: "I mow lawns for $50",
        askedAt: Date.now(),
      },
    });
    expect(r.resolved).toBe(true);
    expect(r.resolution?.listingType).toBe("service");
    expect(r.combinedMessage).toMatch(/mow lawns/i);
  });
});
