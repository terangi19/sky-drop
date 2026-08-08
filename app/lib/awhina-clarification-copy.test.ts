/**
 * Clarification copy — type-aware wording (no pickup language for services).
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  buildClarificationCopy,
  inferClarificationSearchType,
  clarificationForbidsPickup,
} from "./awhina-clarification-copy";
import {
  buildProactiveShoppingClarify,
  buildPendingSearchSlotAsk,
} from "./awhina-product-ux";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearSearchSession, searchSessionKey } from "./awhina-search-memory";
import { clearTaskScope, taskScopeKey, getTaskScope } from "./awhina-task-scope";

function conv(id: string) {
  clearSearchSession(searchSessionKey({ conversationId: id }));
  clearTaskScope(taskScopeKey({ conversationId: id }));
  return id;
}

const PICKUP_RE = /\bpick[\s-]?up\b/i;

describe("inferClarificationSearchType", () => {
  it("maps service labour nouns", () => {
    expect(inferClarificationSearchType("want a cleaner", "cleaner")).toBe("service");
    expect(inferClarificationSearchType("need a plumber", "plumber")).toBe("service");
    expect(inferClarificationSearchType("need a photographer", "photographer")).toBe(
      "service"
    );
    expect(inferClarificationSearchType("looking for a tutor", "tutor")).toBe("service");
    expect(inferClarificationSearchType("need lawn mowing", "lawn mowing")).toBe("service");
  });

  it("keeps lawn mower physical", () => {
    expect(inferClarificationSearchType("need a mower", "mower")).toBe("physical");
    expect(inferClarificationSearchType("need a lawn mower", "lawn mower")).toBe("physical");
  });

  it("maps vehicles and rentals", () => {
    expect(inferClarificationSearchType("find a BMW", "BMW")).toBe("vehicle");
    expect(inferClarificationSearchType("need a car", "car")).toBe("vehicle");
    expect(inferClarificationSearchType("rent a trailer", "trailer")).toBe("rental");
  });
});

describe("buildClarificationCopy rules", () => {
  it("service location never says pickup", () => {
    const loc = buildClarificationCopy({
      searchType: "service",
      item: "cleaner",
      missingSlots: ["location"],
      phase: "proactive",
    });
    expect(loc).toMatch(/area|city|suburb|service/i);
    expect(loc).not.toMatch(PICKUP_RE);

    const both = buildClarificationCopy({
      searchType: "service",
      item: "plumber",
      missingSlots: ["budget", "location"],
      phase: "proactive",
    });
    expect(both).toMatch(/rough budget|area/i);
    expect(both).not.toMatch(PICKUP_RE);

    const budget = buildClarificationCopy({
      searchType: "service",
      item: "tutor",
      missingSlots: ["budget"],
      phase: "proactive",
    });
    expect(budget).toMatch(/rough budget/i);
    expect(budget).not.toMatch(PICKUP_RE);
  });

  it("physical location may use pickup", () => {
    const loc = buildClarificationCopy({
      searchType: "physical",
      item: "mower",
      missingSlots: ["location"],
      phase: "proactive",
    });
    expect(loc).toMatch(PICKUP_RE);

    const both = buildClarificationCopy({
      searchType: "physical",
      item: "mower",
      missingSlots: ["budget", "location"],
      phase: "followup",
    });
    expect(both).toMatch(PICKUP_RE);
    expect(both).toMatch(/budget/i);
  });

  it("vehicle uses city/region not service-area wording", () => {
    const both = buildClarificationCopy({
      searchType: "vehicle",
      item: "BMW",
      message: "find a BMW",
      missingSlots: ["budget", "location"],
      phase: "proactive",
    });
    expect(both).toMatch(/city or region/i);
    expect(both).not.toMatch(/need the service/i);
    expect(both).not.toMatch(/suburb do you need the service/i);
  });

  it("rental uses area (pickup only for collection gear)", () => {
    const area = buildClarificationCopy({
      searchType: "rental",
      item: "apartment",
      message: "rent a flat",
      missingSlots: ["location"],
      phase: "proactive",
    });
    expect(area).toMatch(/area/i);
    expect(area).not.toMatch(PICKUP_RE);

    const trailer = buildClarificationCopy({
      searchType: "rental",
      item: "trailer",
      message: "rent a trailer",
      missingSlots: ["location"],
      phase: "proactive",
    });
    expect(trailer).toMatch(PICKUP_RE);
  });

  it("wanted uses buyer/request language", () => {
    const both = buildClarificationCopy({
      searchType: "wanted",
      item: "PS5",
      missingSlots: ["budget", "location"],
      phase: "proactive",
    });
    expect(both).toMatch(/looking in|rough budget/i);
    expect(both).not.toMatch(PICKUP_RE);
    expect(clarificationForbidsPickup("wanted")).toBe(true);
  });
});

describe("clarification copy regressions (canonical)", () => {
  beforeEach(() => {
    // isolate
  });

  it('"want a cleaner" → never mention pickup; yes keeps service wording', () => {
    const id = conv("copy-cleaner");
    const ask = processCanonicalAwhina("want a cleaner", {
      conversationId: id,
      pathname: "/",
    });
    expect(ask.source).toBe("clarify");
    expect(ask.reply?.toLowerCase() || "").not.toMatch(PICKUP_RE);
    expect(ask.reply?.toLowerCase() || "").toMatch(/budget|area/);
    expect(getTaskScope(taskScopeKey({ conversationId: id }))?.pendingClarification?.knownEntities?.searchType).toBe(
      "service"
    );

    const yes = processCanonicalAwhina("yes", { conversationId: id, pathname: "/" });
    expect(yes.source).toBe("clarify");
    expect(yes.reply?.toLowerCase() || "").not.toMatch(PICKUP_RE);
    expect(yes.reply?.toLowerCase() || "").toMatch(/budget|area/);
  });

  it('"need a plumber" → never mention pickup', () => {
    const id = conv("copy-plumber");
    const ask = processCanonicalAwhina("need a plumber", {
      conversationId: id,
      pathname: "/",
    });
    expect(ask.source).toBe("clarify");
    expect(ask.reply?.toLowerCase() || "").not.toMatch(PICKUP_RE);
  });

  it('"need a mower" → pickup/location wording OK', () => {
    const id = conv("copy-mower");
    const ask = processCanonicalAwhina("need a mower", {
      conversationId: id,
      pathname: "/",
    });
    expect(ask.source).toBe("clarify");
    expect(ask.reply?.toLowerCase() || "").toMatch(/pickup|pick up|budget|city/);
    const proactive = buildProactiveShoppingClarify("need a mower");
    expect(proactive.searchType).toBe("physical");
    expect(proactive.reply).toMatch(PICKUP_RE);
  });

  it('"find a BMW" copy uses city/region not service-area', () => {
    const { reply, searchType } = buildProactiveShoppingClarify("find a BMW");
    // May or may not be vague enough for canonical clarify — copy rules still apply
    expect(searchType).toBe("vehicle");
    expect(reply).toMatch(/city or region/i);
    expect(reply).not.toMatch(/need the service|suburb do you need the service/i);
    expect(
      buildPendingSearchSlotAsk("BMW", ["budget", "location"], {
        message: "find a BMW",
        searchType: "vehicle",
      })
    ).toMatch(/city or region/i);
  });

  it('"rent a trailer" → rental-appropriate wording', () => {
    const copy = buildClarificationCopy({
      message: "rent a trailer",
      item: "trailer",
      searchType: inferClarificationSearchType("rent a trailer", "trailer"),
      missingSlots: ["budget", "location"],
      phase: "proactive",
    });
    expect(inferClarificationSearchType("rent a trailer", "trailer")).toBe("rental");
    expect(copy.toLowerCase()).toMatch(/budget|pick up|area/);
    // Collection rental may say pickup; must not use service phrasing
    expect(copy).not.toMatch(/need the service/i);
  });
});
