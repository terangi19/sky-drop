/**
 * Cross-listing contamination matrix — Hilux→BMW and siblings.
 * Exact repro from production: BMW description must never inherit Hilux facts.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { processListingFillMessage, clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { clearListingDraftFromSkyAi } from "./sky-ai-listing-context";
import type { SkyAiListingContext } from "./sky-ai-types";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { validateDescriptionQualityContract } from "./awhina-description-quality";

const HILUX =
  "2018 Toyota Hilux SR5 128000km automatic diesel black good condition full service history canopy tow bar Auckland";
const BMW =
  "2007 BMW 335i coupe 145000km automatic grey modified twin turbos intercooler downpipes intakes Auckland good condition";
const IPHONE = "iPhone 15 Pro 256GB Natural Titanium 94% battery Auckland";
const PS5 = "PS5 Slim like new $550 Auckland one controller all cables";
const COUCH = "Grey 3-seater couch $300 Henderson small mark on arm";
const MAZDA = "2010 Mazda 3 automatic petrol red 160000km Auckland";
const LAWN = "Lawn mowing West Auckland $45 per section green waste available";
const RENTAL = "2 bedroom unit Massey $590/week pets negotiable";

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

function asFill(out: { listingFill?: Record<string, unknown> | SkyAiListingFill | null }): SkyAiListingFill {
  return (out.listingFill || {}) as SkyAiListingFill;
}

function assertNoHiluxBleed(fill: SkyAiListingFill) {
  const blob = [
    fill.title,
    fill.description,
    fill.vehicleMake,
    fill.vehicleModel,
    fill.vehicleFuelType,
    ...(fill.extras || []),
  ]
    .join(" ")
    .toLowerCase();
  expect(blob).not.toMatch(/\btoyota\b/);
  expect(blob).not.toMatch(/\bhilux\b/);
  expect(blob).not.toMatch(/\bdiesel\b/);
  expect(blob).not.toMatch(/\bcanopy\b/);
  expect(blob).not.toMatch(/\btow\s*bar\b/);
  expect(blob).not.toMatch(/full service history/);
}

describe("TEST A — Hilux → BMW vehicle switch", () => {
  beforeEach(() => wipe("matrix-a"));

  it("canonical: BMW replaces Hilux with zero Hilux evidence", () => {
    const id = "matrix-a";
    const t1 = processCanonicalAwhina(HILUX, { conversationId: id, pathname: "/post/ai" });
    expect(t1.handled).toBe(true);
    expect(String(asFill(t1).vehicleMake || "")).toMatch(/toyota/i);

    const t2 = processCanonicalAwhina(BMW, {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: asFill(t1) as SkyAiListingContext,
    });
    expect(t2.handled).toBe(true);
    const fill = asFill(t2);
    expect(fill.replaceDraft).toBe(true);
    expect(String(fill.vehicleMake || "")).toMatch(/bmw/i);
    expect(String(fill.vehicleModel || "")).toMatch(/335i/i);
    expect(String(fill.vehicleYear || "")).toBe("2007");
    expect(String(fill.vehicleOdometer || "")).toMatch(/145000/);
    expect(String(fill.vehicleTransmission || "")).toMatch(/automatic/i);
    expect(String(fill.vehicleColour || "")).toMatch(/grey|gray/i);
    expect(String(fill.condition || "")).toMatch(/good/i);
    expect(String(fill.location || "")).toMatch(/auckland/i);

    const desc = String(fill.description || "");
    expect(desc).toMatch(/bmw/i);
    expect(desc).toMatch(/335i/i);
    expect(desc).toMatch(/145/);
    expect(desc).toMatch(/automatic/i);
    expect(desc).toMatch(/grey|gray/i);
    expect(desc).toMatch(/twin turbo|intercooler|downpipe|intake/i);
    expect(desc).toMatch(/auckland/i);
    expect(desc).not.toMatch(/happy to arrange a viewing/i);
    assertNoHiluxBleed(fill);

    const extras = (fill.extras || []).join(" ").toLowerCase();
    expect(extras).toMatch(/turbo|intercooler|downpipe|intake/);
    expect(extras).not.toMatch(/canopy|tow bar|service history/);
  });

  it("fill-tools with prior Hilux context: same guarantee", () => {
    const prior: SkyAiListingContext = {
      title: "2018 Toyota Hilux SR5",
      listingType: "vehicle",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleYear: "2018",
      vehicleFuelType: "Diesel",
      location: "Auckland",
      condition: "Used - Good",
      extras: [
        "maintenance:full service history",
        "included:canopy",
        "included:tow bar",
      ],
      description:
        "2018 Toyota Hilux SR5 diesel with canopy and tow bar. Full service history.",
    };
    const out = processListingFillMessage(BMW, {
      pathname: "/post/ai",
      listingContext: prior,
    });
    expect(out.handled).toBe(true);
    if (!out.handled) return;
    assertNoHiluxBleed(out.listingFill || {});
    expect(out.listingFill?.replaceDraft).toBe(true);
    expect(out.listingFill?.vehicleMake).toMatch(/bmw/i);
  });
});

describe("TEST B — iPhone → PS5", () => {
  beforeEach(() => wipe("matrix-b"));
  it("PS5 inherits zero iPhone facts", () => {
    const id = "matrix-b";
    const t1 = processCanonicalAwhina(IPHONE, { conversationId: id, pathname: "/post/ai" });
    const t2 = processCanonicalAwhina(PS5, {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: asFill(t1) as SkyAiListingContext,
    });
    const fill = asFill(t2);
    const blob = `${fill.title} ${fill.description} ${(fill.extras || []).join(" ")}`.toLowerCase();
    expect(blob).toMatch(/ps5|playstation/);
    expect(blob).not.toMatch(/iphone|titanium|256\s*gb|battery/);
  });
});

describe("TEST C — couch → Mazda", () => {
  beforeEach(() => wipe("matrix-c"));
  it("Mazda inherits zero couch facts", () => {
    const id = "matrix-c";
    const t1 = processCanonicalAwhina(COUCH, { conversationId: id, pathname: "/post/ai" });
    const t2 = processCanonicalAwhina(MAZDA, {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: asFill(t1) as SkyAiListingContext,
    });
    const fill = asFill(t2);
    const blob = `${fill.title} ${fill.description} ${(fill.extras || []).join(" ")}`.toLowerCase();
    expect(blob).toMatch(/mazda/);
    expect(blob).not.toMatch(/couch|sofa|arm|3-seater|henderson/);
  });
});

describe("TEST D — lawn service → rental", () => {
  beforeEach(() => wipe("matrix-d"));
  it("rental inherits zero service facts", () => {
    const id = "matrix-d";
    const t1 = processCanonicalAwhina(LAWN, { conversationId: id, pathname: "/post/ai" });
    const t2 = processCanonicalAwhina(RENTAL, {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: asFill(t1) as SkyAiListingContext,
    });
    const fill = asFill(t2);
    const blob = `${fill.title} ${fill.description} ${(fill.extras || []).join(" ")}`.toLowerCase();
    expect(String(fill.listingType || "")).toMatch(/rental/i);
    expect(blob).not.toMatch(/lawn|mowing|green waste|per section/);
  });
});

describe("TEST E — same-item BMW correction", () => {
  beforeEach(() => wipe("matrix-e"));
  it("keeps BMW and patches odometer/colour", () => {
    const id = "matrix-e";
    const t1 = processCanonicalAwhina(
      "2007 BMW 335i grey 145000km automatic Auckland good condition",
      { conversationId: id, pathname: "/post/ai" }
    );
    const prior = asFill(t1);
    expect(prior.vehicleMake).toMatch(/bmw/i);

    const t2 = processCanonicalAwhina("Actually it's 154000km and black", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: prior as SkyAiListingContext,
    });
    const fill = asFill(t2);
    expect(fill.replaceDraft).not.toBe(true);
    expect(String(fill.vehicleMake || prior.vehicleMake)).toMatch(/bmw/i);
    expect(String(fill.vehicleModel || prior.vehicleModel)).toMatch(/335i/i);
    expect(String(fill.vehicleOdometer || "")).toMatch(/154000/);
    expect(String(fill.vehicleColour || "")).toMatch(/black/i);
  });
});

describe("identity mismatch description guard", () => {
  it("rejects BMW fill with Toyota Hilux prose", () => {
    const result = validateDescriptionQualityContract(
      "2007 Toyota Hilux. Fitted with twin turbos. Comes with canopy.",
      {
        listingType: "vehicle",
        vehicleMake: "BMW",
        vehicleModel: "335i",
        vehicleYear: "2007",
        title: "2007 BMW 335i",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("identity_mismatch");
  });
});
