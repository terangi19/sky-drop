/**
 * CRITICAL: generation must persist as vehicleGeneration and never be re-asked.
 * Exact production regression after 7a48f23: r34 parsed → "Got it — generation."
 * then year/price merges dropped generation and re-asked.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import {
  clearTaskScope,
  taskScopeKey,
  toClientTaskScope,
  getTaskScope,
} from "./awhina-task-scope";
import {
  isListingSlotComplete,
  composeVehicleIdentityTitle,
  hydrateVehicleGeneration,
  parseShortReplyForPendingSlot,
} from "./awhina-pending-slots";
import { buildConfirmedListingContext } from "./listing-draft-confirmed";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

describe("vehicleGeneration canonical persistence", () => {
  const id = "gen-canonical-e2e";

  beforeEach(() => wipe(id));

  it("parse r34 → vehicleGeneration=R34 (not stuffed only into model)", () => {
    const r = parseShortReplyForPendingSlot("r34", "generation");
    expect(r.matched).toBe(true);
    expect(r.partial.vehicleGeneration).toBe("R34");
    expect(String(r.partial.vehicleModel || "")).toMatch(/^Skyline$/i);
  });

  it("isListingSlotComplete(generation) uses vehicleGeneration only", () => {
    expect(
      isListingSlotComplete("generation", {
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
      })
    ).toBe(false);
    expect(
      isListingSlotComplete("generation", {
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
        vehicleGeneration: "R34",
      })
    ).toBe(true);
    // Legacy hydrate: model embeds R34 → treated complete after hydrate
    expect(
      isListingSlotComplete("generation", {
        vehicleMake: "Nissan",
        vehicleModel: "Skyline R34",
      })
    ).toBe(true);
  });

  it("title: year make model generation (+ variant)", () => {
    expect(
      composeVehicleIdentityTitle({
        vehicleYear: "1999",
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
        vehicleGeneration: "R34",
      })
    ).toBe("1999 Nissan Skyline R34");
    expect(
      composeVehicleIdentityTitle({
        vehicleYear: "1999",
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
        vehicleGeneration: "R34",
        extras: ["variant:GT-R"],
      })
    ).toBe("1999 Nissan Skyline R34 GT-R");
  });

  it("E2E: sell skyline → r34 → 1999 → 50k → 190k → good → black → manual → Auckland (never re-ask generation)", () => {
    const t1 = processCanonicalAwhina("sell my skyline", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(t1.sessionState?.pendingSlot).toBe("generation");
    expect(t1.listingFill?.vehicleGeneration).toBeFalsy();

    const t2 = processCanonicalAwhina("r34", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(t2.listingFill?.vehicleGeneration).toBe("R34");
    expect(String(t2.listingFill?.vehicleModel || "")).toMatch(/^Skyline$/i);
    expect(String(t2.reply || "")).toMatch(/Got it — R34/i);
    expect(String(t2.reply || "")).not.toMatch(/Got it — generation/i);
    expect(t2.sessionState?.pendingSlot).toBe("year");
    expect(String(t2.listingFill?.title || "")).toMatch(/Nissan\s+Skyline\s+R34/i);

    // Cold serverless + form-confirmed context (no server Map)
    const clientTask2 = toClientTaskScope(getTaskScope(taskScopeKey({ conversationId: id })));
    const formCtx = buildConfirmedListingContext(
      {
        title: t2.listingFill?.title,
        listingType: t2.listingFill?.listingType,
        category: t2.listingFill?.category,
        vehicleMake: t2.listingFill?.vehicleMake,
        vehicleModel: t2.listingFill?.vehicleModel,
        vehicleGeneration: t2.listingFill?.vehicleGeneration,
        paymentType: t2.listingFill?.paymentType,
      },
      {
        title: "AWHINA",
        listingType: "AWHINA",
        category: "AWHINA",
        vehicleMake: "AWHINA",
        vehicleModel: "AWHINA",
        vehicleGeneration: "AWHINA",
        paymentType: "AWHINA",
      }
    );
    expect(formCtx.vehicleGeneration).toBe("R34");
    wipe(id);

    const t3 = processCanonicalAwhina("1999", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: formCtx as never,
      clientTask: clientTask2,
    });
    expect(t3.listingFill?.vehicleYear).toBe("1999");
    expect(t3.listingFill?.vehicleGeneration).toBe("R34");
    expect(t3.sessionState?.pendingSlot).not.toBe("generation");
    expect(t3.sessionState?.pendingSlot).toBe("price");
    expect(String(t3.reply || "")).toMatch(/Got it — 1999/i);
    expect(String(t3.reply || "")).not.toMatch(/generation/i);
    expect(String(t3.listingFill?.title || "")).toMatch(/1999\s+Nissan\s+Skyline\s+R34/i);

    const t4 = processCanonicalAwhina("50k", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t3.listingFill as never,
    });
    expect(String(t4.listingFill?.price || "")).toBe("50000");
    expect(t4.listingFill?.vehicleGeneration).toBe("R34");
    expect(t4.sessionState?.pendingSlot).toBe("odometer");
    expect(String(t4.reply || "")).toMatch(/Got it — \$50,000/i);
    expect(String(t4.reply || "")).not.toMatch(/generation/i);

    const t5 = processCanonicalAwhina("190k", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t4.listingFill as never,
    });
    expect(String(t5.listingFill?.vehicleOdometer || "")).toBe("190000");
    expect(t5.listingFill?.vehicleGeneration).toBe("R34");
    expect(t5.sessionState?.pendingSlot).toBe("condition");

    const t6 = processCanonicalAwhina("good", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t5.listingFill as never,
    });
    expect(t6.listingFill?.vehicleGeneration).toBe("R34");
    expect(t6.sessionState?.pendingSlot).toBe("colour");

    const t7 = processCanonicalAwhina("black", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t6.listingFill as never,
    });
    expect(String(t7.listingFill?.vehicleColour || "")).toMatch(/black/i);
    expect(t7.listingFill?.vehicleGeneration).toBe("R34");
    expect(t7.sessionState?.pendingSlot).toBe("transmission");

    const t8 = processCanonicalAwhina("manual", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t7.listingFill as never,
    });
    expect(String(t8.listingFill?.vehicleTransmission || "")).toMatch(/manual/i);
    expect(t8.listingFill?.vehicleGeneration).toBe("R34");
    expect(t8.sessionState?.pendingSlot).toBe("location");

    const t9 = processCanonicalAwhina("Auckland", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t8.listingFill as never,
    });
    expect(String(t9.listingFill?.location || "")).toMatch(/Auckland/i);
    expect(t9.listingFill?.vehicleGeneration).toBe("R34");
    expect(t9.sessionState?.pendingSlot).not.toBe("generation");
  });

  it("table-driven slot persistence: each advance keeps prior slots", () => {
    const steps: Array<{ msg: string; assert: (f: Record<string, unknown>) => void; next?: string }> = [
      {
        msg: "r34",
        assert: (f) => {
          expect(f.vehicleGeneration).toBe("R34");
          expect(f.vehicleMake).toBe("Nissan");
        },
        next: "year",
      },
      {
        msg: "1999",
        assert: (f) => {
          expect(f.vehicleGeneration).toBe("R34");
          expect(f.vehicleYear).toBe("1999");
        },
        next: "price",
      },
      {
        msg: "50k",
        assert: (f) => {
          expect(f.vehicleGeneration).toBe("R34");
          expect(f.vehicleYear).toBe("1999");
          expect(String(f.price)).toBe("50000");
        },
        next: "odometer",
      },
      {
        msg: "190k",
        assert: (f) => {
          expect(f.vehicleGeneration).toBe("R34");
          expect(String(f.vehicleOdometer)).toBe("190000");
        },
        next: "condition",
      },
      {
        msg: "good",
        assert: (f) => {
          expect(f.vehicleGeneration).toBe("R34");
          expect(String(f.condition || "")).toMatch(/good/i);
        },
        next: "colour",
      },
      {
        msg: "black",
        assert: (f) => {
          expect(f.vehicleGeneration).toBe("R34");
          expect(String(f.vehicleColour || "")).toMatch(/black/i);
        },
        next: "transmission",
      },
      {
        msg: "manual",
        assert: (f) => {
          expect(f.vehicleGeneration).toBe("R34");
          expect(String(f.vehicleTransmission || "")).toMatch(/manual/i);
        },
        next: "location",
      },
      {
        msg: "Auckland",
        assert: (f) => {
          expect(f.vehicleGeneration).toBe("R34");
          expect(String(f.location || "")).toMatch(/Auckland/i);
        },
      },
    ];

    let fill = processCanonicalAwhina("sell my skyline", {
      conversationId: id,
      pathname: "/post/ai",
    }).listingFill as Record<string, unknown>;

    for (const step of steps) {
      const r = processCanonicalAwhina(step.msg, {
        conversationId: id,
        pathname: "/post/ai",
        listingContext: fill as never,
      });
      fill = (r.listingFill || {}) as Record<string, unknown>;
      step.assert(fill);
      if (step.next) expect(r.sessionState?.pendingSlot).toBe(step.next);
      expect(r.sessionState?.pendingSlot).not.toBe("generation");
    }
  });

  it("hydrate strips R34 from legacy vehicleModel into vehicleGeneration", () => {
    const h = hydrateVehicleGeneration({
      vehicleMake: "Nissan",
      vehicleModel: "Skyline R34",
      title: "Nissan Skyline R34",
    });
    expect(h.vehicleGeneration).toBe("R34");
    expect(String(h.vehicleModel || "")).toMatch(/^Skyline$/i);
  });
});
