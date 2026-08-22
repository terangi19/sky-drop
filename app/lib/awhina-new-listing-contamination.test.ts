/**
 * REPLACE vs PATCH — new listing must never inherit prior item state.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  assessDraftTransition,
  assessTextObjectContinuity,
  isStructuredListingPaste,
} from "./awhina-draft-transition";
import { processCanonicalAwhina } from "./awhina-canonical";
import { processListingFillMessage } from "./awhina-listing-fill-tools";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { clearListingDraftFromSkyAi } from "./sky-ai-listing-context";
import type { SkyAiListingContext } from "./sky-ai-types";

const IPHONE_SEED = "i want to sell my iphone pro 15";
const IPHONE_RICH =
  "256GB, Natural Titanium, like-new condition, $1,250, Auckland. Battery health is 94%. Comes with the original box and a USB-C cable. Always used with a case and screen protector. No cracks, faults or repairs.";
const HILUX =
  "List my 2018 Toyota Hilux SR5, 128,000km, automatic, diesel, black, good condition. Has a canopy, tow bar, roof racks and 20-inch wheels. Full service history, recently serviced, no mechanical issues. A few small scratches from normal use. $34,500, located in Auckland.";
const SAMSUNG =
  "Sell my Samsung Galaxy S24 Ultra 512GB, excellent condition, $1,400, Wellington.";
const SKYLINE = "List my Nissan Skyline R34, manual, 132,000km, $85,000 Auckland";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
  clearListingDraftFromSkyAi();
  const store = new Map<string, string>();
  (globalThis as { sessionStorage?: Storage }).sessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}

function iphoneContext(): SkyAiListingContext {
  return {
    title: "iPhone Pro",
    listingType: "physical",
    category: "Tech",
    condition: "Used - Like New",
    price: "1250",
    location: "Auckland",
    description:
      "Like-new iPhone 15 Pro in Natural Titanium with 256GB storage. Battery health is 94%.",
    extras: [
      "storage:256GB",
      "colour:Natural Titanium",
      "mechanical:94% battery health",
      "included:original box and USB-C cable",
      "note:Always used with a case and screen protector",
    ],
  };
}

describe("assessDraftTransition", () => {
  it("iPhone → Hilux = REPLACE", () => {
    const t = assessDraftTransition({
      message: HILUX,
      priorDraft: iphoneContext(),
    });
    expect(t.mode).toBe("REPLACE");
    expect(t.replaceDraft).toBe(true);
  });

  it("iPhone → Samsung phone = REPLACE (same category)", () => {
    const t = assessDraftTransition({
      message: SAMSUNG,
      priorDraft: iphoneContext(),
    });
    expect(t.mode).toBe("REPLACE");
  });

  it("Hilux → Skyline = REPLACE (both vehicles)", () => {
    const prior = {
      title: "2018 Toyota Hilux SR5",
      listingType: "vehicle",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleYear: "2018",
      price: "34500",
    };
    const t = assessDraftTransition({ message: SKYLINE, priorDraft: prior });
    expect(t.mode).toBe("REPLACE");
  });

  it("change price to $1,200 = PATCH", () => {
    const t = assessDraftTransition({
      message: "change the price to $1,200",
      priorDraft: iphoneContext(),
    });
    expect(t.mode).toBe("PATCH");
    expect(t.replaceDraft).toBe(false);
  });

  it("actually it's the Pro Max = PATCH", () => {
    const t = assessDraftTransition({
      message: "actually it's the Pro Max",
      priorDraft: iphoneContext(),
    });
    expect(t.mode).toBe("PATCH");
  });

  it("structured Hilux paste detected", () => {
    expect(isStructuredListingPaste(HILUX)).toBe(true);
    expect(assessTextObjectContinuity(HILUX, iphoneContext())).toBe("NEW_OBJECT");
  });
});

describe("iPhone → Hilux contamination regression", () => {
  beforeEach(() => wipe("contamination-repro"));

  it("canonical path: Hilux replaces iPhone completely", () => {
    const id = "contamination-repro";
    processCanonicalAwhina(IPHONE_SEED, {
      conversationId: id,
      pathname: "/post/ai",
    });
    processCanonicalAwhina(IPHONE_RICH, {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: iphoneContext(),
    });

    const hilux = processCanonicalAwhina(HILUX, {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: iphoneContext(),
    });

    expect(hilux.handled).toBe(true);
    const fill = hilux.listingFill as Record<string, string> | undefined;
    expect(fill?.replaceDraft).toBe(true);
    expect(String(fill?.title || "")).toMatch(/hilux|toyota/i);
    expect(String(fill?.title || "")).not.toMatch(/iphone/i);
    expect(String(fill?.listingType || "")).toBe("vehicle");
    expect(String(fill?.vehicleYear || "")).toBe("2018");
    expect(String(fill?.vehicleMake || "")).toMatch(/toyota/i);
    expect(String(fill?.price || "")).toBe("34500");
    expect(String(fill?.description || "")).not.toMatch(/iphone|256\s*gb|battery|screen protector|usb-c/i);
    expect(hilux.reply).not.toMatch(/iphone pro/i);
    expect(hilux.reply).toMatch(/hilux|toyota|2018/i);
    const extras = Array.isArray(fill?.extras) ? fill!.extras!.join(" ") : "";
    expect(extras).not.toMatch(/256gb|battery|titanium|screen protector/i);
    expect(extras).toMatch(/canopy|tow bar|roof rack/i);
  });

  it("fill-tools path: replaceDraft + no iPhone extras leak", () => {
    const out = processListingFillMessage(HILUX, {
      pathname: "/post/ai",
      listingContext: iphoneContext(),
      freshStart: true,
    });
    expect(out.handled).toBe(true);
    if (!out.handled) return;
    expect(out.listingFill?.replaceDraft).toBe(true);
    expect(out.listingFill?.title).toMatch(/hilux|toyota/i);
    expect(out.listingFill?.vehicleYear).toBe("2018");
    expect(String(out.listingFill?.description || "")).not.toMatch(/iphone|256/i);
    const extras = (out.listingFill?.extras || []).join(" ");
    expect(extras).not.toMatch(/256gb|battery health|natural titanium/i);
  });

  it("patch keeps manual same-item edits", () => {
    const ctx = iphoneContext();
    const patch = processListingFillMessage("change the price to $1,200", {
      pathname: "/post/ai",
      listingContext: ctx,
    });
    expect(patch.handled).toBe(true);
    if (!patch.handled) return;
    expect(patch.listingFill?.replaceDraft).not.toBe(true);
    expect(patch.listingFill?.price).toBe("1200");
    expect(patch.listingFill?.title).toMatch(/iphone/i);
  });

  it("supplied year prevents Needs Year in reply", () => {
    const out = processListingFillMessage(HILUX, {
      pathname: "/post/ai",
      freshStart: true,
    });
    expect(out.handled).toBe(true);
    if (!out.handled) return;
    expect(out.listingFill?.vehicleYear).toBe("2018");
    expect(out.reply).not.toMatch(/what(?:'s| is) the year|needs year|need.*year/i);
  });
});
