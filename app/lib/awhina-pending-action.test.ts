/**
 * Pending-action routing — production regression:
 * stale "booster pack" search must NEVER run after photo sell confirm + "Yes".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import {
  buildSearchPendingAction,
  buildStartSellingPendingAction,
  classifyConfirmationReply,
  clearPendingActionStoreForTests,
  mayExecuteAction,
  pendingActionKey,
  resolvePendingActionTurn,
  setPendingAction,
  shouldInvalidateSearchOnEvidence,
} from "./awhina-pending-action";
import {
  clearSearchSession,
  rememberPrimarySearch,
  searchSessionKey,
  updateSearchSession,
} from "./awhina-search-memory";
import {
  buildOpenSearchSlotClarification,
  setActiveTask,
  taskScopeKey,
} from "./awhina-task-scope";

beforeEach(() => {
  clearPendingActionStoreForTests();
});

describe("classifyConfirmationReply", () => {
  it("affirms common yes variants", () => {
    for (const m of ["Yes", "yeah", "yep", "sure", "ok", "do it", "okay"]) {
      expect(classifyConfirmationReply(m), m).toBe("AFFIRM");
    }
  });
  it("rejects no variants", () => {
    for (const m of ["No", "nah", "nope", "don't"]) {
      expect(classifyConfirmationReply(m), m).toBe("REJECT");
    }
  });
  it("does not treat sell facts as confirmation", () => {
    expect(
      classifyConfirmationReply("200 15/25 pick up auckland psa 10")
    ).toBe("NOT_CONFIRMATION");
  });
});

describe("PRODUCTION BUG: Yes after Want to sell it? must not search booster pack", () => {
  it("exact live sequence — START_SELLING wins over stale search", () => {
    const conversationId = `bug_${Math.random().toString(36).slice(2, 10)}`;
    const scopeKey = taskScopeKey({ conversationId });
    const memKey = searchSessionKey({ conversationId });
    const paKey = pendingActionKey({ conversationId });

    // Historical: searched booster pack
    rememberPrimarySearch(memKey, "find booster pack");
    updateSearchSession(memKey, { query: "booster pack" });
    setActiveTask(scopeKey, "shopping", {
      pendingItem: "booster pack",
      pendingClarification: buildOpenSearchSlotClarification({
        priorMessage: "find booster pack",
        item: "booster pack",
        missingSlots: ["budget", "location"],
      }),
    });

    // Photo sell offer established pendingAction START_SELLING (client contract)
    const fill = {
      title: "PSA 10 Panini football card",
      price: "200",
      location: "Auckland",
      listingType: "physical" as const,
      category: "Collectibles",
      extras: ["grade:PSA 10", "serial:15/25"],
    };
    setPendingAction(
      paKey,
      buildStartSellingPendingAction({
        identity: "PSA 10 Panini football card",
        listingFill: fill,
        prompt: "Want to sell it?",
      })
    );
    // New photo evidence also clears stale search on server
    expect(
      shouldInvalidateSearchOnEvidence({ hasImages: true, message: "200 psa 10" })
    ).toBe(true);

    const yes = processCanonicalAwhina("Yes", {
      conversationId,
      pathname: "/",
      clientPendingAction: {
        ...buildStartSellingPendingAction({
          identity: "PSA 10 Panini football card",
          listingFill: fill,
        }),
        id: "pa_test",
        status: "active",
        createdAt: Date.now(),
      },
      hasImages: false,
    });

    expect(yes.handled).toBe(true);
    expect(yes.tool).not.toBe("searchListings");
    expect(yes.navigateTo || "").not.toMatch(/search/i);
    expect(yes.intent).toMatch(/listing/i);
    expect(yes.reply || "").not.toMatch(/booster/i);
    expect(yes.reply || "").not.toMatch(/Searching for/i);
    expect(yes.listingFill?.price || fill.price).toBe("200");
    expect(JSON.stringify(yes.listingFill || fill)).toMatch(/15\/25|serial/i);
  });

  it("stale search query alone never authorizes searchListings on Yes", () => {
    const conversationId = `stale_${Math.random().toString(36).slice(2, 10)}`;
    const memKey = searchSessionKey({ conversationId });
    rememberPrimarySearch(memKey, "find booster pack");
    clearSearchSession(memKey); // simulate invalidate
    rememberPrimarySearch(memKey, "find booster pack");

    // No pendingAction, no open clarification — orphan Yes must not search
    const yes = processCanonicalAwhina("Yes", {
      conversationId,
      pathname: "/",
      clientSearch: {
        filters: { query: "booster pack" },
        updatedAt: Date.now(),
      },
      clientTask: {
        task: "shopping",
        pendingItem: "booster pack",
        updatedAt: Date.now(),
      },
    });

    expect(yes.tool).not.toBe("searchListings");
    expect(yes.reply || "").not.toMatch(/booster pack/i);
    expect(yes.reply || "").toMatch(/confirming|looking for|want to/i);
  });
});

describe("confirmation cross-wire prevention", () => {
  it("Want me to search for PS5s? / yes → SEARCH PS5", () => {
    const conversationId = `ps5_${Math.random().toString(36).slice(2, 10)}`;
    const paKey = pendingActionKey({ conversationId });
    setPendingAction(paKey, buildSearchPendingAction({ searchQuery: "PS5" }));

    const yes = processCanonicalAwhina("yes", {
      conversationId,
      pathname: "/",
      clientPendingAction: {
        ...buildSearchPendingAction({ searchQuery: "PS5" }),
        id: "pa_ps5",
        status: "active",
        createdAt: Date.now(),
      },
    });
    expect(yes.tool).toBe("searchListings");
    expect(yes.reply || "").toMatch(/PS5/i);
    expect(yes.reply || "").not.toMatch(/booster/i);
  });

  it("Want to sell this? / yes → START SELLING not search", () => {
    const conversationId = `sell_${Math.random().toString(36).slice(2, 10)}`;
    const yes = processCanonicalAwhina("yes", {
      conversationId,
      pathname: "/",
      clientPendingAction: {
        ...buildStartSellingPendingAction({
          identity: "iPhone 15",
          listingFill: { title: "iPhone 15", price: "800", listingType: "physical" },
        }),
        id: "pa_iphone",
        status: "active",
        createdAt: Date.now(),
      },
      clientTask: {
        task: "shopping",
        pendingItem: "booster pack",
        updatedAt: Date.now(),
      },
      clientSearch: {
        filters: { query: "booster pack" },
        updatedAt: Date.now(),
      },
    });
    expect(yes.tool).not.toBe("searchListings");
    expect(yes.intent).toMatch(/listing/i);
    expect(yes.listingFill?.price).toBe("800");
  });

  it("rapid switch: find booster → iPhone sell confirm → yes lists iPhone", () => {
    const conversationId = `rapid_${Math.random().toString(36).slice(2, 10)}`;
    const memKey = searchSessionKey({ conversationId });
    rememberPrimarySearch(memKey, "find booster packs");

    const yes = processCanonicalAwhina("yes", {
      conversationId,
      pathname: "/",
      hasImages: true,
      clientPendingAction: {
        ...buildStartSellingPendingAction({
          identity: "iPhone",
          listingFill: {
            title: "iPhone",
            price: "800",
            listingType: "physical",
          },
        }),
        id: "pa_rapid",
        status: "active",
        createdAt: Date.now(),
      },
    });
    expect(yes.tool).not.toBe("searchListings");
    expect(JSON.stringify(yes)).not.toMatch(/booster/i);
    expect(yes.listingFill?.price).toBe("800");
  });
});

describe("mayExecuteAction safety gate", () => {
  it("blocks search without current turn or pending SEARCH", () => {
    expect(
      mayExecuteAction({
        tool: "searchListings",
        requestedByCurrentTurn: false,
      }).ok
    ).toBe(false);
  });
  it("blocks search when pending is START_SELLING", () => {
    expect(
      mayExecuteAction({
        tool: "searchListings",
        requestedByCurrentTurn: false,
        resolvingPendingAction: {
          ...buildStartSellingPendingAction({
            identity: "card",
            listingFill: {},
          }),
          id: "x",
          status: "active",
          createdAt: Date.now(),
        },
      }).ok
    ).toBe(false);
  });
  it("allows search on explicit current-turn request", () => {
    expect(
      mayExecuteAction({
        tool: "searchListings",
        requestedByCurrentTurn: true,
      }).ok
    ).toBe(true);
  });
});

describe("resolvePendingActionTurn", () => {
  it("yes resolves active START_SELLING", () => {
    const r = resolvePendingActionTurn({
      message: "Yes",
      pendingAction: {
        ...buildStartSellingPendingAction({
          identity: "card",
          listingFill: { price: "200" },
        }),
        id: "1",
        status: "active",
        createdAt: Date.now(),
      },
    });
    expect(r.kind).toBe("CONFIRM");
    if (r.kind === "CONFIRM") expect(r.action.type).toBe("START_SELLING");
  });
});
