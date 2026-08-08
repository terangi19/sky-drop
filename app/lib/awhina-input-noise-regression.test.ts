/**
 * Exact regressions: input normalization + unknown-stays-unknown sell facts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { normalizeAwhinaInput } from "./awhina-input-normalize";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import {
  clearTaskScope,
  taskScopeKey,
  getPersistedPendingSlot,
  toClientTaskScope,
  getTaskScope,
} from "./awhina-task-scope";
import { getActiveListingSlot } from "./awhina-pending-slots";
import { hasListingSellIntent, detectSkyAiIntent } from "./sky-ai-intent";
import {
  buildConfirmedListingContext,
  scrubLegacyFormPollution,
} from "./listing-draft-confirmed";
import { hasActiveListingDraft } from "./sky-ai-draft-merge";
import { hasInlineAwhinaAssistant } from "./awhina-ui-surface";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

function assertNoInventedVehicleDefaults(fill: Record<string, unknown> | null | undefined) {
  expect(fill?.condition).toBeFalsy();
  expect(fill?.vehicleTransmission).toBeFalsy();
  expect(fill?.vehicleFuelType).toBeFalsy();
  expect(fill?.vehicleBodyType).toBeFalsy();
  const blob = JSON.stringify(fill || {}).toLowerCase();
  expect(blob).not.toMatch(/brand\s*new/);
  expect(blob).not.toMatch(/"vehicletransmission":"automatic"/);
  expect(blob).not.toMatch(/"vehiclefueltype":"petrol"/);
  expect(blob).not.toMatch(/"vehiclebodytype":"suv"/);
}

describe("normalizeAwhinaInput", () => {
  const cases = [
    ["SE.LL MY SKYLINE R34", /sell my skyline r34/i],
    ["se.ll my skyline", /sell my skyline/i],
    ["Sell   my   skyline", /sell my skyline/i],
    ["sell-my-skyline", /sell my skyline/i],
    ["sel my skyline", /sell my skyline/i],
    ["li.st my messi card", /list my messi card/i],
    ["f.ind ps5", /find ps5/i],
    ["phon 15 pro", /iphone 15 pro/i],
    ["iphon 15 pro", /iphone 15 pro/i],
    ["iphone 15 pro", /iphone 15 pro/i],
    ["sell my skyline r 34", /r34/i],
  ] as const;

  for (const [raw, expectRe] of cases) {
    it(`normalizes: ${raw}`, () => {
      const { raw: kept, normalized } = normalizeAwhinaInput(raw);
      expect(kept).toBe(raw);
      expect(normalized).toMatch(expectRe);
    });
  }

  it("is idempotent for clean sell text", () => {
    const once = normalizeAwhinaInput("sell my skyline r34").normalized;
    const twice = normalizeAwhinaInput(once).normalized;
    expect(twice).toBe(once);
  });

  it("does not destroy GT-R style tokens", () => {
    const n = normalizeAwhinaInput("sell my skyline r34 GT-R").normalized;
    expect(n).toMatch(/GT-R|gtr/i);
  });
});

describe("SE.LL MY SKYLINE R34 — exact live smoke", () => {
  const id = "sell-noise-skyline-e2e";

  beforeEach(() => wipe(id));

  it("routes SELL + VEHICLE + Nissan Skyline R34 without invented defaults", () => {
    expect(hasListingSellIntent("SE.LL MY SKYLINE R34")).toBe(true);
    expect(detectSkyAiIntent("SE.LL MY SKYLINE R34")).toBe("sell_list");

    const t1 = processCanonicalAwhina("SE.LL MY SKYLINE R34", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(t1.handled).toBe(true);
    expect(String(t1.reply || "")).not.toMatch(/Could you clarify what you'd like me to do/i);
    expect(t1.listingFill?.listingType).toBe("vehicle");
    expect(t1.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(t1.listingFill?.vehicleModel || "")).toMatch(/Skyline/i);
    expect(String(t1.listingFill?.vehicleGeneration || t1.listingFill?.vehicleModel || "")).toMatch(/R34/i);
    assertNoInventedVehicleDefaults(t1.listingFill as never);

    const t2 = processCanonicalAwhina("1999", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(t2.listingFill?.vehicleYear).toBe("1999");
    assertNoInventedVehicleDefaults({
      ...t2.listingFill,
      vehicleYear: undefined,
    } as never);

    const t3 = processCanonicalAwhina("50k", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t2.listingFill as never,
    });
    expect(String(t3.listingFill?.price || "")).toMatch(/^50000$/);
    assertNoInventedVehicleDefaults({
      ...t3.listingFill,
      vehicleYear: undefined,
      price: undefined,
    } as never);

    const t4 = processCanonicalAwhina("140k miles", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t3.listingFill as never,
    });
    expect(String(t4.listingFill?.vehicleOdometer || "")).toMatch(/140000/);
    assertNoInventedVehicleDefaults({
      ...t4.listingFill,
      vehicleYear: undefined,
      price: undefined,
      vehicleOdometer: undefined,
    } as never);
  });

  it.each([
    "sell my skyline",
    "SE.LL MY SKYLINE",
    "se.ll my skyline",
    "Sell   my   skyline",
    "sell-my-skyline",
    "sel my skyline",
  ])("input-noise sell routes: %s", (msg) => {
    wipe(`noise-${msg}`);
    const r = processCanonicalAwhina(msg, {
      conversationId: `noise-${msg}`,
      pathname: "/post/ai",
    });
    expect(r.handled).toBe(true);
    expect(String(r.reply || "")).not.toMatch(/Could you clarify what you'd like me to do/i);
    expect(r.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(r.listingFill?.vehicleModel || "")).toMatch(/Skyline/i);
  });
});

describe("unknown stays unknown — cross category", () => {
  it("SE.LL MY IPHONE — no invented condition/storage/colour/price/shipping", () => {
    wipe("unk-iphone");
    const r = processCanonicalAwhina("SE.LL MY IPHONE", {
      conversationId: "unk-iphone",
      pathname: "/post/ai",
    });
    expect(r.handled).toBe(true);
    expect(String(r.reply || "")).not.toMatch(/Could you clarify what you'd like me to do/i);
    expect(r.listingFill?.condition).toBeFalsy();
    expect(r.listingFill?.price).toBeFalsy();
    expect(r.listingFill?.shippingAvailable).not.toBe(true);
    const extras = Array.isArray(r.listingFill?.extras)
      ? r.listingFill.extras.join(" ").toLowerCase()
      : "";
    expect(extras).not.toMatch(/\d+\s*gb/);
    expect(JSON.stringify(r.listingFill || "").toLowerCase()).not.toMatch(
      /"condition":"new"/
    );
  });

  it("LIST MY MESSI CARD — no invented condition/grade", () => {
    wipe("unk-messi");
    const r = processCanonicalAwhina("LIST MY MESSI CARD", {
      conversationId: "unk-messi",
      pathname: "/post/ai",
    });
    expect(r.handled).toBe(true);
    expect(r.listingFill?.condition).toBeFalsy();
    const extras = Array.isArray(r.listingFill?.extras)
      ? r.listingFill.extras.join(" ")
      : "";
    expect(extras).not.toMatch(/PSA\s*10/i);
  });

  it("RENT MY TRAILER — no invented rate/period/condition", () => {
    wipe("unk-trailer");
    const r = processCanonicalAwhina("RENT MY TRAILER", {
      conversationId: "unk-trailer",
      pathname: "/post/ai",
    });
    expect(r.handled).toBe(true);
    expect(r.listingFill?.condition).toBeFalsy();
    expect(r.listingFill?.price).toBeFalsy();
    expect(r.listingFill?.rentalPriceWeekly).toBeFalsy();
    expect(r.listingFill?.rentalPriceMonthly).toBeFalsy();
  });

  it("I OFFER CLEANING — no invented fixed pricing/location", () => {
    wipe("unk-cleaning");
    const r = processCanonicalAwhina("I OFFER CLEANING", {
      conversationId: "unk-cleaning",
      pathname: "/post/ai",
    });
    expect(r.handled).toBe(true);
    expect(r.listingFill?.price).toBeFalsy();
    expect(r.listingFill?.location).toBeFalsy();
  });
});

describe("form defaults must not become listingContext facts", () => {
  it("untouched New/SUV/Petrol/Automatic do not sync", () => {
    const ctx = buildConfirmedListingContext(
      {
        condition: "New",
        vehicleBodyType: "SUV",
        vehicleFuelType: "Petrol",
        vehicleTransmission: "Automatic",
        category: "Other",
        listingType: "physical",
        paymentType: "contact",
      },
      {}
    );
    expect(ctx.condition).toBeUndefined();
    expect(ctx.vehicleBodyType).toBeUndefined();
    expect(ctx.vehicleFuelType).toBeUndefined();
    expect(ctx.vehicleTransmission).toBeUndefined();
    expect(ctx.category).toBeUndefined();
    expect(hasActiveListingDraft(ctx)).toBe(false);
  });

  it("USER-confirmed Automatic does sync", () => {
    const ctx = buildConfirmedListingContext(
      {
        title: "Nissan Skyline R34",
        vehicleMake: "Nissan",
        vehicleModel: "Skyline R34",
        vehicleTransmission: "Automatic",
        listingType: "vehicle",
      },
      {
        title: "USER",
        vehicleMake: "AWHINA",
        vehicleModel: "AWHINA",
        vehicleTransmission: "USER",
        listingType: "AWHINA",
      }
    );
    expect(ctx.vehicleTransmission).toBe("Automatic");
    expect(ctx.condition).toBeUndefined();
    expect(ctx.vehicleBodyType).toBeUndefined();
  });

  it("scrubs classic pollution cluster from legacy drafts", () => {
    const scrubbed = scrubLegacyFormPollution({
      title: "Nissan Skyline R34",
      vehicleMake: "Nissan",
      vehicleModel: "Skyline R34",
      condition: "New",
      vehicleBodyType: "SUV",
      vehicleFuelType: "Petrol",
      vehicleTransmission: "Automatic",
    });
    expect(scrubbed?.vehicleBodyType).toBeUndefined();
    expect(scrubbed?.vehicleFuelType).toBeUndefined();
    expect(scrubbed?.vehicleTransmission).toBeUndefined();
    expect(scrubbed?.condition).toBeUndefined();
    expect(scrubbed?.vehicleMake).toBe("Nissan");
  });
});

describe("typed pendingSlot persists across surfaces", () => {
  const id = "pending-slot-persist-e2e";

  beforeEach(() => wipe(id));

  it("exposes pendingSlot on sessionState after sell ask", () => {
    const t1 = processCanonicalAwhina("SE.LL MY SKYLINE R34", {
      conversationId: id,
      pathname: "/",
    });
    expect(t1.handled).toBe(true);
    expect(t1.listingFill?.vehicleMake).toBe("Nissan");
    const slot = t1.sessionState?.pendingSlot;
    expect(slot).toBeTruthy();
    expect(["year", "price", "odometer", "location", "condition"]).toContain(slot);
    expect(t1.sessionState?.task?.pendingClarification?.pendingSlot).toBe(slot);
    expect(getActiveListingSlot(t1.sessionState?.task?.pendingClarification || null)).toBe(
      slot
    );
  });

  it("survives cold Map + global→/post/ai via clientTask echo", () => {
    const t1 = processCanonicalAwhina("SE.LL MY SKYLINE R34", {
      conversationId: id,
      pathname: "/",
    });
    const clientTask = toClientTaskScope(getTaskScope(taskScopeKey({ conversationId: id }))!);
    expect(clientTask?.pendingClarification?.pendingSlot).toBeTruthy();
    const pendingSlot = getPersistedPendingSlot(clientTask);
    expect(pendingSlot).toBeTruthy();

    // Simulate serverless cold start + navigation to inline sell page
    clearTaskScope(taskScopeKey({ conversationId: id }));
    expect(getTaskScope(taskScopeKey({ conversationId: id }))).toBeNull();

    const t2 = processCanonicalAwhina("1999", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
      clientTask,
    });
    expect(t2.listingFill?.vehicleYear).toBe("1999");
    assertNoInventedVehicleDefaults({
      ...t2.listingFill,
      vehicleYear: undefined,
    } as never);
  });

  it("hasInlineAwhinaAssistant marks /post/ai for bubble→inline focus", () => {
    expect(hasInlineAwhinaAssistant("/post/ai")).toBe(true);
    expect(hasInlineAwhinaAssistant("/post/ai?edit=1")).toBe(true);
    expect(hasInlineAwhinaAssistant("/search")).toBe(false);
  });
});
