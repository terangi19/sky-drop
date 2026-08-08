/**
 * Pending-slot canonical wiring: short answers must be consumed via
 * getActiveListingSlot + parseShortReplyForPendingSlot in processCanonicalAwhina.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import {
  clearTaskScope,
  taskScopeKey,
  toClientTaskScope,
  getTaskScope,
  getPersistedPendingSlot,
} from "./awhina-task-scope";
import {
  getActiveListingSlot,
  parseShortReplyForPendingSlot,
  type ListingMissingSlot,
} from "./awhina-pending-slots";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

describe("canonical pending-slot wiring — skyline E2E", () => {
  const id = "canonical-slot-skyline-e2e";

  beforeEach(() => wipe(id));

  it("sell my skyline r34 → 1999 → 50k → 190k (no generic clarify)", () => {
    const t1 = processCanonicalAwhina("sell my skyline r34", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(t1.handled).toBe(true);
    expect(t1.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(t1.listingFill?.vehicleModel || "")).toMatch(/Skyline/i);
    expect(String(t1.listingFill?.vehicleGeneration || "")).toMatch(/R34/i);
    expect(t1.sessionState?.pendingSlot).toBeTruthy();
    expect(String(t1.reply || "")).not.toMatch(/Could you clarify what you'd like me to do/i);

    const t2 = processCanonicalAwhina("1999", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(t2.listingFill?.vehicleYear).toBe("1999");
    expect(String(t2.reply || "")).toMatch(/Got it — 1999/i);
    expect(String(t2.reply || "")).not.toMatch(/year 1999/i);
    expect(t2.sessionState?.pendingSlot).toBe("price");

    const t3 = processCanonicalAwhina("50k", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t2.listingFill as never,
    });
    expect(String(t3.listingFill?.price || "")).toBe("50000");
    expect(String(t3.reply || "")).toMatch(/Got it — \$50,000/i);
    expect(String(t3.reply || "")).not.toMatch(/price \$50000/i);
    // CRITICAL: pendingSlot after price response
    expect(t3.sessionState?.pendingSlot).toBe("odometer");
    expect(getActiveListingSlot(t3.sessionState?.task?.pendingClarification || null)).toBe(
      "odometer"
    );

    // Round-trip: wipe server memory, rehydrate via clientTask (production cold start)
    const clientTask = toClientTaskScope(getTaskScope(taskScopeKey({ conversationId: id })));
    expect(getPersistedPendingSlot(clientTask)).toBe("odometer");
    clearTaskScope(taskScopeKey({ conversationId: id }));
    clearAllListingDraftCacheForTests();

    const t4 = processCanonicalAwhina("190k", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t3.listingFill as never,
      clientTask: clientTask || null,
    });
    // pendingSlot received on 190k request must be consumed
    expect(String(t4.reply || "")).not.toMatch(/Could you clarify what you'd like me to do/i);
    expect(String(t4.listingFill?.vehicleOdometer || "")).toBe("190000");
    expect(String(t4.reply || "")).toMatch(/190,000\s*km/i);
    expect(t4.sessionState?.pendingSlot).toBe("condition");
    expect(t4.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(t4.listingFill?.vehicleModel || "")).toMatch(/Skyline/i);
    expect(t4.listingFill?.vehicleYear).toBe("1999");
    expect(String(t4.listingFill?.price || "")).toBe("50000");

    const t5 = processCanonicalAwhina("good", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t4.listingFill as never,
    });
    expect(String(t5.listingFill?.condition || "")).toMatch(/good/i);
    expect(String(t5.reply || "")).not.toMatch(/Could you clarify/i);
    expect(t5.sessionState?.pendingSlot).toBe("colour");

    const t5b = processCanonicalAwhina("black", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t5.listingFill as never,
    });
    expect(String(t5b.listingFill?.vehicleColour || "")).toMatch(/black/i);
    expect(t5b.sessionState?.pendingSlot).toBe("transmission");

    const t6 = processCanonicalAwhina("manual", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t5b.listingFill as never,
    });
    expect(String(t6.listingFill?.vehicleTransmission || "")).toMatch(/manual/i);
    expect(String(t6.reply || "")).not.toMatch(/Could you clarify/i);
    expect(t6.sessionState?.pendingSlot).toBe("location");

    const t7 = processCanonicalAwhina("Auckland", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t6.listingFill as never,
    });
    expect(String(t7.listingFill?.location || "")).toMatch(/Auckland/i);
    expect(String(t7.reply || "")).not.toMatch(/Could you clarify what you'd like me to do/i);
  });

  it("140k miles → 140000 mi unit", () => {
    wipe(id + "-mi");
    const t1 = processCanonicalAwhina("sell my skyline r34", {
      conversationId: id + "-mi",
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("1999", {
      conversationId: id + "-mi",
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    const t3 = processCanonicalAwhina("50k", {
      conversationId: id + "-mi",
      pathname: "/post/ai",
      listingContext: t2.listingFill as never,
    });
    expect(t3.sessionState?.pendingSlot).toBe("odometer");
    const t4 = processCanonicalAwhina("140k miles", {
      conversationId: id + "-mi",
      pathname: "/post/ai",
      listingContext: t3.listingFill as never,
    });
    expect(String(t4.listingFill?.vehicleOdometer || "")).toBe("140000");
    expect(String(t4.reply || "")).toMatch(/140,000\s*mi/i);
    expect(String(t4.reply || "")).not.toMatch(/Could you clarify/i);
  });

  it("compound: 190k good condition fills odo + condition", () => {
    wipe(id + "-cmp");
    const t1 = processCanonicalAwhina("sell my skyline r34", {
      conversationId: id + "-cmp",
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("1999", {
      conversationId: id + "-cmp",
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    const t3 = processCanonicalAwhina("50k", {
      conversationId: id + "-cmp",
      pathname: "/post/ai",
      listingContext: t2.listingFill as never,
    });
    const t4 = processCanonicalAwhina("190k good condition", {
      conversationId: id + "-cmp",
      pathname: "/post/ai",
      listingContext: t3.listingFill as never,
    });
    expect(String(t4.listingFill?.vehicleOdometer || "")).toBe("190000");
    expect(String(t4.listingFill?.condition || "")).toMatch(/good/i);
    expect(t4.sessionState?.pendingSlot).not.toBe("odometer");
    expect(t4.sessionState?.pendingSlot).not.toBe("condition");
    expect(String(t4.reply || "")).not.toMatch(/Could you clarify/i);
  });
});

describe("table-driven pending-slot short answers", () => {
  const cases: Array<{
    slot: ListingMissingSlot;
    message: string;
    assert: (r: ReturnType<typeof parseShortReplyForPendingSlot>) => void;
  }> = [
    {
      slot: "year",
      message: "1999",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(r.partial.vehicleYear).toBe("1999");
      },
    },
    {
      slot: "price",
      message: "50k",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(r.partial.price).toBe("50000");
      },
    },
    {
      slot: "odometer",
      message: "190k",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(r.partial.vehicleOdometer).toBe("190000");
      },
    },
    {
      slot: "condition",
      message: "good",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(String(r.partial.condition || "")).toMatch(/good/i);
      },
    },
    {
      slot: "colour",
      message: "black",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(String(r.partial.vehicleColour || "")).toMatch(/black/i);
      },
    },
    {
      slot: "transmission",
      message: "manual",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(String(r.partial.vehicleTransmission || "")).toMatch(/manual/i);
      },
    },
    {
      slot: "location",
      message: "Auckland",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(r.partial.location).toBe("Auckland");
      },
    },
    {
      slot: "generation",
      message: "r34",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(r.partial.vehicleGeneration).toBe("R34");
      },
    },
    {
      slot: "variant",
      message: "gtr",
      assert: (r) => {
        expect(r.matched).toBe(true);
      },
    },
    {
      slot: "storage",
      message: "256gb",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect((r.partial.extras || []).join(" ")).toMatch(/256/i);
      },
    },
    {
      slot: "grade",
      message: "psa 10",
      assert: (r) => {
        expect(r.matched).toBe(true);
      },
    },
    {
      slot: "rental_rate",
      message: "60",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(r.partial.price).toBe("60");
      },
    },
    {
      slot: "service_rate",
      message: "50",
      assert: (r) => {
        expect(r.matched).toBe(true);
        expect(r.partial.price).toBe("50");
      },
    },
  ];

  for (const c of cases) {
    it(`${c.slot}: ${c.message}`, () => {
      const r = parseShortReplyForPendingSlot(c.message, c.slot);
      c.assert(r);
    });
  }
});
