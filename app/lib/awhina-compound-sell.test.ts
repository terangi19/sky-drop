/**
 * Exact regression: compound sell turns + list-it action grammar.
 * sell my skyline → r34 gtr write a good description → list it
 */
import { describe, it, expect, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { getVariantExtra } from "./awhina-pending-slots";
import { getListingReadinessState } from "./awhina-listing-readiness";
import { detectActiveDraftCommands } from "./awhina-active-draft-commands";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

describe("compound sell turn — skyline exact session", () => {
  const id = "compound-skyline-e2e";

  beforeEach(() => wipe(id));

  it("sell my skyline → r34 gtr write a good description → list it", () => {
    const t1 = processCanonicalAwhina("sell my skyline", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(t1.handled).toBe(true);
    expect(t1.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(t1.listingFill?.vehicleModel || "")).toMatch(/^Skyline$/i);
    expect(String(t1.reply || "")).toMatch(/R32|R33|R34|generation/i);
    expect(String(t1.reply || "")).not.toMatch(/clearer title/i);
    expect(String(t1.reply || "")).not.toMatch(/Could you clarify/i);

    const t2 = processCanonicalAwhina("r34 gtr write a good description", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(t2.handled).toBe(true);
    expect(String(t2.reply || "")).not.toMatch(/Could you clarify/i);
    expect(t2.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(t2.listingFill?.vehicleModel || "")).toMatch(/^Skyline$/i);
    expect(String(t2.listingFill?.vehicleGeneration || "")).toMatch(/R34/i);
    expect(getVariantExtra(t2.listingFill || {})).toBe("GT-R");
    expect(String(t2.listingFill?.title || "")).toMatch(/Nissan\s+Skyline\s+R34/i);
    expect(String(t2.listingFill?.title || "")).toMatch(/GT-?R/i);
    expect(String(t2.listingFill?.description || "").trim().length).toBeGreaterThan(10);
    expect(String(t2.reply || "")).toMatch(/year/i);
    expect(getListingReadinessState(t2.listingFill || {})).not.toBe("READY_TO_PUBLISH");

    const t3 = processCanonicalAwhina("list it", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t2.listingFill as never,
    });
    expect(t3.handled).toBe(true);
    expect(String(t3.listingFill?.title || "")).not.toMatch(/^It\b/i);
    expect(String(t3.listingFill?.title || "")).toMatch(/Nissan\s+Skyline\s+R34/i);
    expect(String(t3.listingFill?.title || "")).toMatch(/GT-?R/i);
    expect(t3.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(t3.listingFill?.vehicleModel || "")).toMatch(/^Skyline$/i);
    expect(String(t3.listingFill?.vehicleGeneration || "")).toMatch(/R34/i);
    expect(getVariantExtra(t3.listingFill || {})).toBe("GT-R");
    expect(String(t3.reply || "")).not.toMatch(/Listing ready/i);
    expect(String(t3.reply || "")).toMatch(/year/i);
    expect(getListingReadinessState(t3.listingFill || {})).toBe("IN_PROGRESS");
  });
});

describe("compound sell turns — generalized domains", () => {
  it("cards: PSA 10 and write a better description", () => {
    const id = "compound-card-e2e";
    wipe(id);
    const t1 = processCanonicalAwhina("sell Lionel Messi Topps Chrome card", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(t1.handled).toBe(true);
    const t2 = processCanonicalAwhina("PSA 10 and write a better description", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(t2.handled).toBe(true);
    expect(String(t2.reply || "")).not.toMatch(/Could you clarify/i);
    const extras = (Array.isArray(t2.listingFill?.extras) ? t2.listingFill.extras : []).join(" ");
    expect(extras).toMatch(/PSA\s*10/i);
    expect(String(t2.listingFill?.description || "").trim().length).toBeGreaterThan(10);
  });

  it("phone: 256gb make it $900 and improve title", () => {
    const id = "compound-phone-e2e";
    wipe(id);
    const t1 = processCanonicalAwhina("sell iPhone 15 Pro", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("256gb make it $900 and improve title", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(t2.handled).toBe(true);
    expect(t2.listingFill?.price).toBe("900");
    expect((Array.isArray(t2.listingFill?.extras) ? t2.listingFill.extras : []).join(" ")).toMatch(/256\s*GB/i);
    expect(String(t2.listingFill?.title || "")).toMatch(/iPhone/i);
    expect(String(t2.listingFill?.title || "")).not.toMatch(/^It\b/i);
  });

  it("shoes: size 10 brand new write description", () => {
    const id = "compound-shoes-e2e";
    wipe(id);
    const t1 = processCanonicalAwhina("sell Jordan 4", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("size 10 brand new write description", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(t2.handled).toBe(true);
    expect(t2.listingFill?.condition).toMatch(/New/i);
    expect((Array.isArray(t2.listingFill?.extras) ? t2.listingFill.extras : []).join(" ")).toMatch(/size:10/i);
    expect(String(t2.listingFill?.description || "").trim().length).toBeGreaterThan(5);
  });

  it("rental: 60 a day Auckland write a description", () => {
    const id = "compound-rental-e2e";
    wipe(id);
    const t1 = processCanonicalAwhina("rent my trailer for hire", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(t1.handled).toBe(true);
    const t2 = processCanonicalAwhina("60 a day Auckland write a description", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: (t1.listingFill || {
        title: "Trailer",
        listingType: "rental",
      }) as never,
    });
    expect(t2.handled).toBe(true);
    expect(String(t2.reply || "")).not.toMatch(/Could you clarify/i);
    expect(t2.listingFill?.location).toMatch(/Auckland/i);
    expect(
      t2.listingFill?.price === "60" || t2.listingFill?.rentalPriceDaily === "60"
    ).toBe(true);
  });

  it("service: 50 per lawn Auckland make the description better", () => {
    const id = "compound-service-e2e";
    wipe(id);
    const t1 = processCanonicalAwhina("I mow lawns for customers", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(t1.handled).toBe(true);
    const t2 = processCanonicalAwhina("50 per lawn Auckland make the description better", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: (t1.listingFill || {
        title: "Lawn mowing",
        listingType: "service",
      }) as never,
    });
    expect(t2.handled).toBe(true);
    expect(t2.listingFill?.price).toBe("50");
    expect(t2.listingFill?.location).toMatch(/Auckland/i);
  });
});

describe("compound multi-field pending-slot replies", () => {
  it("PS5 exact: 200 new auckland fills price + condition + location", () => {
    const id = "compound-ps5-e2e";
    wipe(id);
    const t1 = processCanonicalAwhina("sell my ps5", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(t1.handled).toBe(true);
    expect(String(t1.listingFill?.title || "")).toMatch(/ps5|playstation/i);
    expect(String(t1.reply || "")).toMatch(/price|condition|location/i);

    const t2 = processCanonicalAwhina("200 new auckland", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(t2.handled).toBe(true);
    expect(String(t2.listingFill?.price || "")).toBe("200");
    expect(String(t2.listingFill?.condition || "")).toMatch(/^New$/i);
    expect(String(t2.listingFill?.location || "")).toMatch(/Auckland/i);
    expect(String(t2.reply || "")).toMatch(/\$200/);
    expect(String(t2.reply || "")).toMatch(/brand new/i);
    expect(String(t2.reply || "")).toMatch(/Auckland/i);
    expect(String(t2.reply || "")).not.toMatch(/What condition|asking price|Where is it located/i);
    expect(t2.sessionState?.pendingSlot).not.toBe("price");
    expect(t2.sessionState?.pendingSlot).not.toBe("condition");
    expect(t2.sessionState?.pendingSlot).not.toBe("location");
  });

  it("new auckland 200 still merges all three when condition is active", () => {
    const id = "compound-ps5-reorder";
    wipe(id);
    const t1 = processCanonicalAwhina("sell my ps5", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("new auckland 200", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(String(t2.listingFill?.price || "")).toBe("200");
    expect(String(t2.listingFill?.condition || "")).toMatch(/^New$/i);
    expect(String(t2.listingFill?.location || "")).toMatch(/Auckland/i);
  });

  it("phone: 256gb used 900 hamilton", () => {
    const id = "compound-phone-multi";
    wipe(id);
    const t1 = processCanonicalAwhina("sell iPhone 14", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("256gb used 900 hamilton", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(t2.listingFill?.price).toBe("900");
    expect(String(t2.listingFill?.condition || "")).toMatch(/used|good/i);
    expect(String(t2.listingFill?.location || "")).toMatch(/Hamilton/i);
    expect((Array.isArray(t2.listingFill?.extras) ? t2.listingFill.extras : []).join(" ")).toMatch(/256\s*GB/i);
  });

  it("vehicle: 1999 190k manual black 50k auckland", () => {
    const id = "compound-vehicle-multi";
    wipe(id);
    const t1 = processCanonicalAwhina("sell my toyota corolla", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("1999 190k manual black 50k auckland", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect(String(t2.listingFill?.vehicleYear || "")).toBe("1999");
    expect(String(t2.listingFill?.vehicleOdometer || "")).toBe("190000");
    expect(String(t2.listingFill?.vehicleTransmission || "")).toMatch(/Manual/i);
    expect(String(t2.listingFill?.vehicleColour || "")).toMatch(/Black/i);
    expect(String(t2.listingFill?.price || "")).toBe("50000");
    expect(String(t2.listingFill?.location || "")).toMatch(/Auckland/i);
  });

  it("card: psa 10 numbered 25 300", () => {
    const id = "compound-card-multi";
    wipe(id);
    const t1 = processCanonicalAwhina("sell pokemon charizard card", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("psa 10 numbered 25 300", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    expect((Array.isArray(t2.listingFill?.extras) ? t2.listingFill.extras : []).join(" ")).toMatch(/PSA\s*10/i);
    expect((Array.isArray(t2.listingFill?.extras) ? t2.listingFill.extras : []).join(" ")).toMatch(/numbered:25/i);
    expect(String(t2.listingFill?.price || "")).toBe("300");
  });

  it("service: 50 an hour auckland", () => {
    const id = "compound-service-hourly";
    wipe(id);
    const t1 = processCanonicalAwhina("I offer handyman services", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("50 an hour auckland", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: (t1.listingFill || {
        title: "Handyman",
        listingType: "service",
      }) as never,
    });
    expect(String(t2.listingFill?.price || "")).toBe("50");
    expect(String(t2.listingFill?.location || "")).toMatch(/Auckland/i);
  });

  it("rental: 60 a day henderson", () => {
    const id = "compound-rental-henderson";
    wipe(id);
    const t1 = processCanonicalAwhina("rent my trailer for hire", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("60 a day henderson", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: (t1.listingFill || {
        title: "Trailer",
        listingType: "rental",
      }) as never,
    });
    expect(
      t2.listingFill?.price === "60" || t2.listingFill?.rentalPriceDaily === "60"
    ).toBe(true);
    expect(String(t2.listingFill?.location || "")).toMatch(/Henderson/i);
  });

  it("write a better description is edit command, not listing data", () => {
    const id = "compound-desc-edit";
    wipe(id);
    const t1 = processCanonicalAwhina("sell my ps5", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("200 new auckland", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t1.listingFill as never,
    });
    const before = {
      price: t2.listingFill?.price,
      condition: t2.listingFill?.condition,
      location: t2.listingFill?.location,
    };
    const t3 = processCanonicalAwhina("write a better description", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: t2.listingFill as never,
    });
    expect(t3.listingFill?.price).toBe(before.price);
    expect(t3.listingFill?.condition).toBe(before.condition);
    expect(t3.listingFill?.location).toBe(before.location);
    expect(String(t3.listingFill?.description || "").trim().length).toBeGreaterThan(10);
    expect(t3.listingFill?.forceDescriptionRewrite).toBe(true);
  });
});

describe("active-draft command grammar", () => {
  it("strips write description and keeps residual facts", () => {
    const r = detectActiveDraftCommands("r34 gtr write a good description");
    expect(r.commands).toContain("regenerate_description");
    expect(r.residualMessage.toLowerCase()).toMatch(/r34/);
    expect(r.residualMessage.toLowerCase()).toMatch(/gtr/);
  });

  it("list it is action-only", () => {
    const r = detectActiveDraftCommands("list it..");
    expect(r.commands).toContain("list_publish");
    expect(r.isActionOnly).toBe(true);
  });
});
