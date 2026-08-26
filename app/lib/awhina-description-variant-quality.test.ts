/**
 * Generic description quality: variant/trim retention + accessory grouping.
 * No product-specific hardcoding in the production path under test.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { extractVehicleVariantTrim, resolveVehicleIdentity } from "./sky-ai-find-routing";
import {
  extractCompoundListingFacts,
  getVariantExtra,
  composeVehicleIdentityTitle,
} from "./awhina-pending-slots";
import { composeSellerEvidenceProse, groupedSellerEvidenceFromExtras } from "./awhina-seller-evidence";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { executeListingOperation } from "./awhina-listing-operation";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

const HILUX =
  "2018 Toyota Hilux SR5 128000km automatic diesel black good condition full service history canopy tow bar Auckland";
const RANGER =
  "2017 Ford Ranger Wildtrak 95000km automatic diesel blue good condition leather seats tow bar canopy Christchurch";
const BMW =
  "2007 BMW 335i coupe 145000km automatic grey good condition upgraded twin turbos intercooler downpipes intakes Auckland";
const PHONE =
  "iPhone 15 Pro 256GB Natural Titanium like-new 94% battery original box USB-C cable case screen protector Auckland";
const CONSOLE =
  "PS5 Slim like new one controller HDMI cable power cable original box Auckland";
const COUCH =
  "Grey 3-seater couch good used condition small mark on left arm no tears Henderson";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

function assertNoRepetitiveComesWith(description: string) {
  const comes = description.match(/\bComes with\b/gi) || [];
  expect(comes.length, description).toBeLessThanOrEqual(1);
}

function assertNoRepetitiveFittedWith(description: string) {
  const fitted = description.match(/\bFitted with\b/gi) || [];
  expect(fitted.length, description).toBeLessThanOrEqual(1);
}

describe("extractVehicleVariantTrim (generic)", () => {
  it("captures trim tokens after model without a hardcoded catalogue", () => {
    expect(extractVehicleVariantTrim(HILUX, "Hilux")).toBe("SR5");
    expect(extractVehicleVariantTrim(RANGER, "Ranger")).toBe("Wildtrak");
    expect(extractVehicleVariantTrim("VW Golf GTI 2019 Auckland", "Golf")).toBe("GTI");
    expect(
      extractVehicleVariantTrim("Mercedes C63 AMG 2015 Auckland", "C63")
    ).toMatch(/AMG/i);
  });

  it("does not treat body/fuel/colour/km as trim", () => {
    expect(extractVehicleVariantTrim(BMW, "335i")).toBeUndefined();
    expect(
      extractVehicleVariantTrim(
        "2018 Toyota Hilux automatic diesel black Auckland",
        "Hilux"
      )
    ).toBeUndefined();
  });
});

describe("variant survives extraction → canonical → description", () => {
  it("Hilux: SR5 present at every boundary and accessories are grouped", () => {
    const identity = resolveVehicleIdentity(HILUX);
    expect(identity.model).toMatch(/Hilux/i);
    // resolveVehicleIdentity itself does not return variant — compound does
    expect(extractVehicleVariantTrim(HILUX, identity.model)).toBe("SR5");

    const compound = extractCompoundListingFacts(HILUX, {
      baseDraft: {
        listingType: "vehicle",
        vehicleMake: identity.make,
        vehicleModel: identity.model,
        vehicleYear: identity.year,
      },
    });
    expect(getVariantExtra(compound.partial)).toBe("SR5");
    const title = composeVehicleIdentityTitle({
      vehicleMake: identity.make,
      vehicleModel: identity.model,
      vehicleYear: identity.year,
      extras: compound.partial.extras,
    });
    expect(title).toMatch(/SR5/i);

    const fill: SkyAiListingFill = {
      listingType: "vehicle",
      category: "Cars",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleYear: "2018",
      vehicleOdometer: "128000",
      vehicleTransmission: "Automatic",
      vehicleFuelType: "Diesel",
      vehicleColour: "Black",
      condition: "Used - Good",
      location: "Auckland",
      extras: compound.partial.extras,
      title,
      descriptionSource: "ai",
    };
    const final = finalizeAwhinaListingDescription(fill, { force: true });
    expect(final.title).toMatch(/SR5/i);
    expect(final.description).toMatch(/SR5/i);
    expect(final.description).toMatch(/128,?000/i);
    expect(final.description).toMatch(/Diesel/i);
    expect(final.description).toMatch(/[Aa]utomatic/i);
    expect(final.description).toMatch(/[Bb]lack/i);
    expect(final.description).toMatch(/good used|good condition/i);
    expect(final.description).toMatch(/service history/i);
    expect(final.description).toMatch(/canopy/i);
    expect(final.description).toMatch(/tow\s*bar/i);
    expect(final.description).toMatch(/Auckland/i);
    assertNoRepetitiveComesWith(final.description || "");
    expect(final.description || "").not.toMatch(/Comes with[\s\S]{0,40}Comes with/i);
  });

  it("Ranger retains Wildtrak", () => {
    const identity = resolveVehicleIdentity(RANGER);
    const compound = extractCompoundListingFacts(RANGER, {
      baseDraft: {
        listingType: "vehicle",
        vehicleMake: identity.make,
        vehicleModel: identity.model,
        vehicleYear: identity.year,
      },
    });
    expect(getVariantExtra(compound.partial)).toMatch(/Wildtrak/i);
    const fill: SkyAiListingFill = {
      listingType: "vehicle",
      category: "Cars",
      vehicleMake: identity.make || "Ford",
      vehicleModel: identity.model || "Ranger",
      vehicleYear: identity.year || "2017",
      vehicleOdometer: compound.partial.vehicleOdometer || "95000",
      vehicleTransmission: compound.partial.vehicleTransmission || "Automatic",
      vehicleFuelType: compound.partial.vehicleFuelType || "Diesel",
      vehicleColour: compound.partial.vehicleColour || "Blue",
      condition: compound.partial.condition || "Used - Good",
      location: compound.partial.location || "Christchurch",
      extras: compound.partial.extras,
      title: composeVehicleIdentityTitle({
        ...compound.partial,
        vehicleMake: identity.make,
        vehicleModel: identity.model,
        vehicleYear: identity.year,
      }),
      descriptionSource: "ai",
    };
    const final = finalizeAwhinaListingDescription(fill, { force: true });
    expect(final.description).toMatch(/Wildtrak/i);
    assertNoRepetitiveComesWith(final.description || "");
  });

  it("BMW retains 335i + coupe and groups modifications", () => {
    const created = executeListingOperation(
      { type: "CREATE", message: BMW, reason: "test" },
      null
    );
    const desc = created.fill.description || "";
    expect(desc).toMatch(/335i/i);
    expect(desc).toMatch(/coupe/i);
    expect(desc).toMatch(/turbo/i);
    expect(desc).toMatch(/intercooler/i);
    expect(desc).toMatch(/downpipe/i);
    expect(desc).toMatch(/intake/i);
    assertNoRepetitiveFittedWith(desc);
    expect(desc).not.toMatch(/Fitted with[\s\S]{0,40}Fitted with/i);
  });
});

describe("accessory grouping prose", () => {
  it("groups bare included nouns into one Comes with sentence", () => {
    const prose = composeSellerEvidenceProse(
      groupedSellerEvidenceFromExtras([
        "included:canopy",
        "included:tow bar",
        "maintenance:Full service history",
      ])
    );
    expect(prose).toMatch(/Comes with canopy and tow bar/i);
    expect((prose.match(/\bComes with\b/gi) || []).length).toBe(1);
  });
});

describe("non-vehicle matrix", () => {
  it("phone keeps storage/colour/accessories without repetitive Comes with", async () => {
    wipe("desc-phone");
    // Prefer create path when available
    const created = executeListingOperation(
      { type: "CREATE", message: PHONE, reason: "test" },
      null
    );
    const desc = created.fill.description || "";
    expect(desc).toMatch(/256\s*GB/i);
    expect(desc).toMatch(/Natural Titanium|titanium/i);
    expect(desc).toMatch(/94\s*%/i);
    expect(desc).toMatch(/box/i);
    expect(desc).toMatch(/USB-?C|cable/i);
    expect(desc).toMatch(/Auckland/i);
    assertNoRepetitiveComesWith(desc);
  });

  it("console groups accessories", () => {
    const created = executeListingOperation(
      { type: "CREATE", message: CONSOLE, reason: "test" },
      null
    );
    const desc = created.fill.description || "";
    expect(desc).toMatch(/controller/i);
    expect(desc).toMatch(/box/i);
    expect(desc).toMatch(/Auckland/i);
    assertNoRepetitiveComesWith(desc);
  });

  it("furniture retains honest defect", () => {
    const created = executeListingOperation(
      { type: "CREATE", message: COUCH, reason: "test" },
      null
    );
    const desc = created.fill.description || "";
    expect(desc).toMatch(/mark/i);
    expect(desc).not.toMatch(/perfect|immaculate|pristine/i);
  });
});

describe("cross-listing isolation still holds", () => {
  it("Hilux → BMW drops Hilux-only facts", () => {
    wipe("desc-cross");
    const hilux = executeListingOperation(
      { type: "CREATE", message: HILUX, reason: "test" },
      null
    );
    expect(hilux.fill.description).toMatch(/SR5/i);

    const bmw = executeListingOperation(
      {
        type: "CREATE",
        message: BMW,
        reason: "identity_conflict_new_listing",
      },
      hilux.listing
    );
    const desc = bmw.fill.description || "";
    expect(desc).toMatch(/335i/i);
    expect(desc).not.toMatch(/Hilux|SR5|canopy|tow\s*bar|service history|diesel/i);
  });
});
