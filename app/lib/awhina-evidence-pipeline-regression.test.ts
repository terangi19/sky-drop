/**
 * Positive-classification evidence pipeline — composite raw fragments rejected.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { extractCompoundListingFacts } from "./awhina-pending-slots";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests, processListingFillMessage } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { enforcePublicListingDescription } from "./awhina-listing-composer";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  groupedSellerEvidenceFromExtras,
  harvestSellerEvidenceFromStructuredContext,
  isCompositeStructuredExtra,
  sanitizeListingExtras,
  sellerEvidenceItemCount,
  structuredFactContextFromFill,
} from "./awhina-seller-evidence";

const HILUX_MESSAGE =
  "2018 Toyota Hilux SR5 128000km automatic diesel black good condition full service history canopy tow bar Auckland";

const BMW_MESSAGE =
  "2007 BMW 335i coupe 145000km automatic grey modified twin turbos intercooler downpipes intakes Auckland good condition";

const LAWN =
  "Lawn mowing West Auckland small lawns from $40 larger lawns quoted fortnightly mowing green waste removal";

const OLIVETTI =
  "1960s Olivetti Lettera 32 typewriter new ribbon case included all keys working Greymouth";

const VEHICLE_COMPOSITE_REJECT = [
  "Toyota Hilux SR5 diesel black full service history canopy tow bar",
  "2018 Toyota Hilux SR5 128000km automatic",
  BMW_MESSAGE,
];

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

function evidenceExtras(fill: Partial<SkyAiListingFill>): string[] {
  return (fill.extras || []).filter((e) =>
    /^(modification|maintenance|conditiondetail|mechanical|compliance|included|logistics|note):/i.test(e)
  );
}

describe("positive-classification evidence pipeline", () => {
  it("Hilux one-shot yields exactly 3 seller evidence items", () => {
    const extracted = extractCompoundListingFacts(HILUX_MESSAGE, {
      baseDraft: {
        title: "2018 Toyota Hilux SR5",
        listingType: "vehicle",
        vehicleMake: "Toyota",
        vehicleModel: "Hilux",
      },
    });
    const fill = {
      title: "2018 Toyota Hilux SR5",
      listingType: "vehicle" as const,
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      ...extracted.partial,
    };
    expect(fill.vehicleYear).toBe("2018");
    expect(fill.vehicleMake).toMatch(/Toyota/i);
    expect(fill.vehicleModel).toMatch(/Hilux/i);
    expect(fill.vehicleOdometer).toBe("128000");
    expect(fill.vehicleTransmission).toMatch(/Automatic/i);
    expect(fill.vehicleFuelType).toMatch(/Diesel/i);
    expect(fill.vehicleColour).toMatch(/Black/i);
    expect(fill.condition).toMatch(/Good/i);
    expect(fill.location).toMatch(/Auckland/i);

    const evidence = evidenceExtras(fill);
    expect(evidence).toHaveLength(3);
    expect(evidence.join(" | ")).toMatch(/maintenance:.*full service history/i);
    expect(evidence.join(" | ")).toMatch(/included:.*canopy/i);
    expect(evidence.join(" | ")).toMatch(/included:.*tow bar/i);
    expect(evidence.join(" | ")).not.toMatch(/Toyota Hilux SR5 diesel black/i);
    expect(evidence.join(" | ")).not.toMatch(/128000km automatic/i);

    const grouped = groupedSellerEvidenceFromExtras(fill.extras, undefined, fill);
    expect(sellerEvidenceItemCount(grouped)).toBe(3);
  });

  it.each(VEHICLE_COMPOSITE_REJECT)(
    "rejects composite raw fragment: %s",
    (fragment) => {
      const ctx = structuredFactContextFromFill({
        title: "2018 Toyota Hilux SR5",
        listingType: "vehicle",
        vehicleMake: "Toyota",
        vehicleModel: "Hilux",
        vehicleYear: "2018",
        vehicleOdometer: "128000",
        vehicleTransmission: "Automatic",
        vehicleFuelType: "Diesel",
        vehicleColour: "Black",
        condition: "Used - Good",
        location: "Auckland",
      });
      expect(isCompositeStructuredExtra(fragment, ctx)).toBe(true);
      const harvested = harvestSellerEvidenceFromStructuredContext(fragment, {
        title: "2018 Toyota Hilux SR5",
        listingType: "vehicle",
        vehicleMake: "Toyota",
        vehicleModel: "Hilux",
        vehicleYear: "2018",
        vehicleOdometer: "128000",
        vehicleTransmission: "Automatic",
        vehicleFuelType: "Diesel",
        vehicleColour: "Black",
        condition: "Used - Good",
        location: "Auckland",
      });
      const blob = harvested.map((i) => i.text).join(" | ");
      expect(blob).not.toBe(fragment);
      expect(harvested.every((item) => !isCompositeStructuredExtra(item.text, ctx))).toBe(true);
    }
  );

  it("sanitizeListingExtras drops unclassified note blobs", () => {
    const fill: SkyAiListingFill = {
      title: "2018 Toyota Hilux SR5",
      listingType: "vehicle",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleYear: "2018",
      vehicleOdometer: "128000",
      vehicleTransmission: "Automatic",
      vehicleFuelType: "Diesel",
      vehicleColour: "Black",
      condition: "Used - Good",
      location: "Auckland",
      extras: [
        "maintenance:full service history",
        "included:canopy",
        "included:tow bar",
        "note:Toyota Hilux SR5 diesel black full service history canopy tow bar",
        "note:2018 Toyota Hilux SR5 128000km automatic",
      ],
    };
    const cleaned = sanitizeListingExtras(fill);
    expect(cleaned.some((e) => /note:Toyota Hilux/i.test(e))).toBe(false);
    expect(cleaned.some((e) => /note:2018 Toyota/i.test(e))).toBe(false);
    expect(cleaned.filter((e) => e.startsWith("maintenance:")).length).toBe(1);
    expect(cleaned.filter((e) => e.startsWith("included:")).length).toBe(2);
  });

  it("LAWN and Olivetti messages do not classify as Hilux vehicle evidence", () => {
    for (const fragment of [LAWN, OLIVETTI]) {
      const harvested = harvestSellerEvidenceFromStructuredContext(fragment, {
        title: "2018 Toyota Hilux SR5",
        listingType: "vehicle",
        vehicleMake: "Toyota",
        vehicleModel: "Hilux",
        vehicleYear: "2018",
        vehicleOdometer: "128000",
        vehicleTransmission: "Automatic",
        vehicleFuelType: "Diesel",
        vehicleColour: "Black",
        condition: "Used - Good",
        location: "Auckland",
      });
      const blob = harvested.map((i) => `${i.kind}:${i.text}`).join(" | ");
      expect(blob).not.toMatch(/Olivetti|typewriter|Lawn mowing|fortnightly/i);
    }
  });
});

describe("Lawn mowing → Olivetti → BMW → Hilux isolation", () => {
  beforeEach(() => wipe("evidence-chain"));

  it("final Hilux draft has zero prior-listing facts and exact evidence", () => {
    const id = "evidence-chain";
    let ctx: SkyAiListingFill | undefined;
    for (const msg of [LAWN, OLIVETTI, BMW_MESSAGE]) {
      const step = processCanonicalAwhina(msg, {
        conversationId: id,
        pathname: "/post/ai",
        listingContext: ctx as never,
      });
      expect(step.handled).toBe(true);
      if (step.listingFill) {
        ctx = { ...(ctx || {}), ...(step.listingFill as SkyAiListingFill) } as SkyAiListingFill;
      }
    }
    const hiluxStep = processListingFillMessage(HILUX_MESSAGE, {
      pathname: "/post/ai",
      listingContext: ctx,
    });
    expect(hiluxStep.handled).toBe(true);
    if (!hiluxStep.handled) return;
    const fill = hiluxStep.listingFill!;
    expect(fill.replaceDraft).toBe(true);
    expect(String(fill.title || "")).toMatch(/Hilux|Toyota/i);
    expect(String(fill.title || "")).not.toMatch(/Olivetti|BMW|335i|Lawn|mowing/i);
    expect(fill.vehicleYear).toBe("2018");
    expect(fill.vehicleMake).toMatch(/Toyota/i);
    expect(fill.vehicleModel).toMatch(/Hilux/i);

    const blob = [
      fill.title,
      fill.description,
      ...(fill.extras || []),
      fill.vehicleMake,
      fill.vehicleModel,
      fill.location,
    ]
      .filter(Boolean)
      .join(" ");
    expect(blob).not.toMatch(/Olivetti|typewriter|335i|BMW|twin turbos|Lawn mowing|fortnightly/i);
    expect(blob).not.toMatch(/256\s*GB|iPhone|Natural Titanium/i);

    const evidence = evidenceExtras(fill);
    expect(evidence).toHaveLength(3);
    expect(evidence.join(" | ")).toMatch(/maintenance:.*full service history/i);
    expect(evidence.join(" | ")).toMatch(/included:.*canopy/i);
    expect(evidence.join(" | ")).toMatch(/included:.*tow bar/i);

    const finalized = enforcePublicListingDescription(fill, { force: true });
    const desc = String(finalized.description || "");
    expect(desc).toMatch(/Hilux|Toyota|128,?000/i);
    expect(desc).not.toMatch(/Olivetti|BMW|335i|Lawn mowing|twin turbos|intercooler/i);
    expect(desc).toMatch(/full service history|canopy|tow bar/i);
  });
});
