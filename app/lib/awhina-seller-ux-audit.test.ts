/**
 * Seller UX audit — exact multi-turn flows through production canonical path.
 * Fail if form and description disagree, facts drop, or "ready" fires too early.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { getListingReadinessState } from "./awhina-listing-readiness";
import { computeMissingListingSlots } from "./awhina-pending-slots";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

function turn(id: string, message: string, prev?: { listingFill?: SkyAiListingFill | null; awhinaSession?: unknown }) {
  return processCanonicalAwhina(message, {
    conversationId: id,
    pathname: "/post/ai",
    listingContext: (prev?.listingFill as never) || undefined,
    clientTask: (prev as { clientTask?: never })?.clientTask,
  });
}

function extrasBlob(fill: SkyAiListingFill | null | undefined): string {
  return Array.isArray(fill?.extras) ? fill!.extras!.join(" | ") : String(fill?.extras || "");
}

function assertFormDescAgree(fill: SkyAiListingFill, keys: Array<"condition" | "price" | "location">) {
  const desc = String(fill.description || "");
  for (const key of keys) {
    const value = String(fill[key] || "").trim();
    expect(value, `form.${key} blank`).toBeTruthy();
    if (key === "condition") {
      if (/like\s*new/i.test(value)) expect(desc).toMatch(/like[- ]new/i);
      else if (/^new$/i.test(value)) expect(desc).toMatch(/brand new|\bnew\b/i);
      else if (/good/i.test(value)) expect(desc).toMatch(/good used|good condition/i);
      else if (/fair/i.test(value)) expect(desc).toMatch(/fair/i);
    }
    if (key === "location") {
      expect(desc.toLowerCase()).toMatch(new RegExp(value.split(",")[0].trim(), "i"));
    }
  }
  // Price stays on the form field — never "asking $…" in buyer copy
  expect(desc).not.toMatch(/\$\s*[\d,]+|asking\s+\$/i);
}

function assertNoFiller(desc: string) {
  expect(desc).not.toMatch(/for sale in/i);
  expect(desc).not.toMatch(/the seller confirms?|seller states?|according to the seller/i);
  expect(desc).not.toMatch(/perfect for|latest features|advanced capabilities|reliable performance/i);
  expect(desc).not.toMatch(/details?\s+(?:are|were|was)\s+not\s+provided/i);
  expect(desc).not.toMatch(/great choice|solid choice|must-have|don'?t miss/i);
  expect(desc).not.toMatch(
    /LISTING CREATION REQUEST|LISTING_FILL|Sell page|Parse everything|respond ONLY|Generate a complete listing|general chat advice/i
  );
}

function assertNotReadyWhileMissing(reply: string, fill: SkyAiListingFill) {
  const missing = computeMissingListingSlots(fill);
  const readiness = getListingReadinessState(fill);
  // Only READY_TO_PUBLISH may say "ready". STARTED / IN_PROGRESS / READY_TO_REVIEW
  // still have work left on the form.
  if (missing.length > 0 || readiness !== "READY_TO_PUBLISH") {
    expect(reply).not.toMatch(/listing(?:'s| is) ready/i);
  }
}

describe("seller UX audit — exact production flows", () => {
  describe("iPhone rich follow-up", () => {
    const id = "audit-iphone";
    beforeEach(() => wipe(id));

    it("seed then rich answer: every fact survives form + description", () => {
      const t1 = turn(id, "I want to sell my iPhone 15 Pro");
      expect(t1.handled).toBe(true);
      expect(String(t1.listingFill?.title || "")).toMatch(/iPhone\s*15\s*Pro/i);
      expect(String(t1.listingFill?.title || "")).not.toMatch(/I want to sell/i);
      expect(t1.reply || "").not.toMatch(/listing(?:'s| is) ready/i);
      assertNotReadyWhileMissing(t1.reply || "", t1.listingFill || {});

      const t2 = turn(
        id,
        "256GB, Natural Titanium, like-new condition, $1,250, Auckland. Battery health is 94%. Comes with the original box and USB-C cable. Always used with a case and screen protector. No cracks, faults or repairs.",
        { listingFill: t1.listingFill }
      );
      const fill = t2.listingFill!;
      expect(fill.condition).toBe("Used - Like New");
      expect(fill.price).toBe("1250");
      expect(fill.location).toBe("Auckland");
      const extras = extrasBlob(fill);
      expect(extras).toMatch(/storage:256GB/i);
      expect(extras + " " + String(fill.vehicleColour || "")).toMatch(/titanium/i);
      expect(extras).toMatch(/94%|battery/i);
      expect(extras).toMatch(/box|usb|cable/i);
      expect(extras).toMatch(/case|protector/i);
      expect(extras).toMatch(/crack|fault|repair/i);

      const desc = String(fill.description || "");
      expect(desc.length).toBeGreaterThan(40);
      expect(desc).toMatch(/like[- ]new/i);
      expect(desc).toMatch(/256\s*GB/i);
      expect(desc).toMatch(/titanium/i);
      expect(desc).toMatch(/94\s*%|battery/i);
      expect(desc).toMatch(/box/i);
      expect(desc).toMatch(/cable|usb/i);
      expect(desc).toMatch(/case|protector/i);
      expect(desc).toMatch(/crack|fault|repair/i);
      expect(desc).toMatch(/auckland/i);
      expect((desc.match(/no cracks/gi) || []).length).toBeLessThanOrEqual(1);
      assertNoFiller(desc);
      assertFormDescAgree(fill, ["condition", "price", "location"]);

      // Must not re-ask for facts already in the draft
      expect(t2.reply || "").not.toMatch(/storage|condition|colour|color|asking price|where is it/i);
      const missing = computeMissingListingSlots(fill);
      expect(missing.filter((s) => ["condition", "price", "location", "storage"].includes(s))).toEqual([]);
    });
  });

  describe("R34 rich follow-up", () => {
    const id = "audit-r34";
    beforeEach(() => wipe(id));

    it("seed then rich answer: vehicle facts + mods survive", () => {
      const t1 = turn(id, "I want to sell my Nissan Skyline R34");
      expect(String(t1.listingFill?.title || "")).toMatch(/Skyline/i);
      expect(String(t1.listingFill?.title || "")).not.toMatch(/I want to sell/i);
      expect(t1.reply || "").not.toMatch(/listing(?:'s| is) ready/i);

      const t2 = turn(
        id,
        "1999, 145,000 km, manual, petrol, silver, good used condition, asking $38,000, located in Auckland. Aftermarket exhaust, intake, coilovers and wheels. Recently serviced with new oil and filters. Tidy interior, a few stone chips on the front bumper, no known mechanical faults.",
        { listingFill: t1.listingFill }
      );
      const fill = t2.listingFill!;
      expect(fill.listingType).toBe("vehicle");
      expect(fill.vehicleYear).toBe("1999");
      expect(fill.vehicleOdometer).toBe("145000");
      expect(String(fill.vehicleTransmission || "")).toMatch(/manual/i);
      expect(String(fill.vehicleFuelType || "")).toMatch(/petrol/i);
      expect(String(fill.vehicleColour || "")).toMatch(/silver/i);
      expect(fill.condition).toBe("Used - Good");
      expect(fill.price).toBe("38000");
      expect(fill.location).toBe("Auckland");

      const extras = extrasBlob(fill);
      expect(extras).toMatch(/exhaust/i);
      expect(extras).toMatch(/intake/i);
      expect(extras).toMatch(/coilover/i);
      expect(extras).toMatch(/wheel/i);
      expect(extras).toMatch(/servic|oil|filter/i);
      expect(extras).toMatch(/tidy|stone chip|bumper|mark/i);
      expect(extras).toMatch(/no known mechanical faults|mechanical/i);

      const desc = String(fill.description || "");
      expect(desc).toMatch(/exhaust|intake|coilover|wheel/i);
      expect(desc).toMatch(/servic|oil|filter/i);
      expect(desc).toMatch(/tidy|stone chip|bumper|mark/i);
      expect(desc).toMatch(/fault|mechanical/i);
      expect(desc).toMatch(/auckland|silver/i);
      expect(desc).not.toMatch(/\$38,?000|asking/i);
      assertNoFiller(desc);
      assertFormDescAgree(fill, ["condition", "price", "location"]);
      expect(t2.reply || "").not.toMatch(/year.*mileage.*transmission.*condition.*asking price/i);
    });
  });

  describe("PS5 rich follow-up", () => {
    const id = "audit-ps5";
    beforeEach(() => wipe(id));

    it("seed then rich answer: accessories + like-new survive", () => {
      const t1 = turn(id, "I want to sell my PS5");
      expect(String(t1.listingFill?.title || "")).toMatch(/PlayStation|PS5/i);
      expect(String(t1.listingFill?.title || "")).not.toMatch(/I want to sell/i);

      const t2 = turn(
        id,
        "Like new, $550, Auckland. Comes with one controller and all cables. No faults or damage.",
        { listingFill: t1.listingFill }
      );
      const fill = t2.listingFill!;
      expect(fill.condition).toBe("Used - Like New");
      expect(fill.price).toBe("550");
      expect(fill.location).toBe("Auckland");
      const extras = extrasBlob(fill);
      expect(extras).toMatch(/controller/i);
      expect(extras).toMatch(/cable/i);
      expect(extras).toMatch(/fault|damage/i);

      const desc = String(fill.description || "");
      expect(desc).toMatch(/like[- ]new/i);
      expect(desc).toMatch(/controller/i);
      expect(desc).toMatch(/cable/i);
      expect(desc).toMatch(/fault|damage/i);
      expect(desc).toMatch(/auckland/i);
      assertNoFiller(desc);
      assertFormDescAgree(fill, ["condition", "price", "location"]);
      expect(t2.reply || "").not.toMatch(/what condition|asking price|where is it/i);
    });
  });

  describe("service and rental", () => {
    it("lawn mowing service: type + rate + location, no invented benefits", () => {
      const id = "audit-service";
      wipe(id);
      const t1 = turn(id, "I want to offer lawn mowing in Auckland for $50 per hour");
      const fill = t1.listingFill!;
      expect(fill.listingType).toBe("service");
      expect(String(fill.title || "")).toMatch(/lawn/i);
      expect(String(fill.title || "")).not.toMatch(/I want to/i);
      expect(fill.location).toMatch(/Auckland/i);
      expect(fill.price || fill.servicePricingType).toBeTruthy();
      const desc = String(fill.description || "");
      if (desc) {
        expect(desc).not.toMatch(/^Looking for\b/i);
        assertNoFiller(desc);
      }
    });

    it("trailer hire rental: type + rate + location", () => {
      const id = "audit-rental";
      wipe(id);
      const t1 = turn(id, "I want to hire out my trailer in Auckland for $40 a day");
      const fill = t1.listingFill!;
      expect(fill.listingType).toBe("rental");
      expect(String(fill.title || "")).toMatch(/trailer/i);
      expect(String(fill.title || "")).not.toMatch(/I want to/i);
      expect(fill.location).toMatch(/Auckland/i);
      expect(fill.price || fill.rentalPriceDaily || fill.rentalPriceWeekly).toBeTruthy();
      const desc = String(fill.description || "");
      if (desc) assertNoFiller(desc);
    });
  });

  describe("ready gate honesty", () => {
    it("does not say ready when high-value slots are still missing", () => {
      const id = "audit-ready";
      wipe(id);
      const t1 = turn(id, "I want to sell my iPhone 15 Pro");
      expect(t1.reply || "").not.toMatch(/listing(?:'s| is) ready/i);
      const missing = computeMissingListingSlots(t1.listingFill || {});
      expect(missing.length).toBeGreaterThan(0);
      assertNotReadyWhileMissing(t1.reply || "", t1.listingFill || {});
    });
  });

  describe("no draft reset on type refinement", () => {
    it("keeps price/location when follow-up adds vehicle details to a seeded car", () => {
      const id = "audit-no-reset";
      wipe(id);
      const t1 = turn(id, "sell my Mazda Axela Auckland $11500");
      expect(t1.listingFill?.price).toBe("11500");
      expect(t1.listingFill?.location).toMatch(/Auckland/i);
      const t2 = turn(id, "2015, blue, 128000km, good condition", {
        listingFill: t1.listingFill,
      });
      expect(t2.listingFill?.price).toBe("11500");
      expect(t2.listingFill?.location).toMatch(/Auckland/i);
      expect(t2.listingFill?.vehicleYear).toBe("2015");
      expect(t2.listingFill?.condition).toBe("Used - Good");
    });
  });
});
