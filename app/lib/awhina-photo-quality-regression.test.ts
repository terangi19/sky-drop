/**
 * Photo-to-listing quality regressions:
 * - Panini must not leak into new Topps Chrome photo
 * - Attr: never reaches public copy
 * - Stale $20 / unsupported New cleared on NEW_OBJECT
 * - Category not Other for trading cards (→ Collectibles)
 * - Cross-domain Nike→iPhone, BMW→PS5
 */

import { describe, it, expect } from "vitest";
import {
  adaptVisionObservationToListing,
  observationToListingFacts,
} from "./awhina-vision-adapter";
import {
  parseVisionObservation,
  type VisionListingObservation,
  type VisionObservedField,
} from "./awhina-vision-observation";
import { prepareVisionConversationBridge } from "./awhina-vision-conversation-bridge";
import {
  assessTitleQuality,
  composeTradingCardTitle,
  gatePublicListingCopy,
  isInternalCopyFragment,
  sanitizePublicCopyText,
} from "./awhina-public-copy-gate";
import { assessObjectContinuity } from "./awhina-object-continuity";
import { factsToListingFill } from "./awhina-listing-facts";
import { buildListingDescriptionFromFacts } from "./awhina-listing-description";
import { inferPhysicalCategoryFromText } from "./sky-ai-listing-fill";

function field(
  value: string,
  confidence: "HIGH" | "MEDIUM" | "LOW",
  evidence: VisionObservedField["evidence"] = "VISIBLE"
): VisionObservedField {
  return { value, confidence, evidence, note: "" };
}

function obs(partial: Partial<VisionListingObservation>): VisionListingObservation {
  const base = parseVisionObservation({});
  return {
    ...base,
    ...partial,
    listingType: partial.listingType || field("physical", "HIGH"),
    overallConfidence: partial.overallConfidence || "HIGH",
  };
}

const TOPPS_CHROME_OBS = obs({
  domain: "trading-cards",
  displayIdentity: "Topps Chrome Inter Milan orange parallel",
  itemIdentity: field("Topps Chrome football card", "HIGH", "VISIBLE"),
  brand: field("Topps", "HIGH", "READABLE"),
  product: field("Topps Chrome", "HIGH", "READABLE"),
  cardSet: field("Topps Chrome", "HIGH", "READABLE"),
  colour: field("orange", "HIGH", "VISIBLE"),
  parallel: field("refractor", "MEDIUM", "VISIBLE"),
  serialNumber: field("14/25", "HIGH", "READABLE"),
  category: field("Sports", "MEDIUM", "VISIBLE"),
  visibleFeatures: ["orange background", "shiny surface", "player image"],
  visibleCondition: field("looks clean shiny", "MEDIUM", "VISIBLE"),
  unknowns: ["player name"],
  overallConfidence: "HIGH",
});

describe("public copy gate", () => {
  it("strips Attr: and internal metadata from description", () => {
    const cleaned = sanitizePublicCopyText(
      "Brand new panini. Attr:orange background. Attr:shiny surface. Attr:player image. Feel free to message me."
    );
    expect(cleaned).not.toMatch(/Attr:/i);
    expect(cleaned).not.toMatch(/orange background/i);
    expect(isInternalCopyFragment("Attr:orange background")).toBe(true);
  });

  it("rejects lone manufacturer titles", () => {
    expect(assessTitleQuality("panini").ok).toBe(false);
    expect(assessTitleQuality("Topps").ok).toBe(false);
    expect(assessTitleQuality("Topps Chrome Inter Milan").ok).toBe(true);
  });

  it("composes trading card title from structured facts", () => {
    const title = composeTradingCardTitle({
      manufacturer: "Topps",
      productLine: "Topps Chrome",
      team: "Inter Milan",
      parallelColour: "orange",
      serialNumber: "14/25",
    });
    expect(title.toLowerCase()).not.toBe("panini");
    expect(title).toMatch(/Topps/i);
    expect(title).toMatch(/14\/25|Inter/i);
  });
});

describe("Panini → Topps Chrome regression (eval fixture only)", () => {
  it("prior Panini draft does not contaminate Topps Chrome perception", () => {
    const continuity = assessObjectContinuity({
      observation: TOPPS_CHROME_OBS,
      priorDraft: {
        title: "panini",
        price: "20",
        condition: "New",
        category: "Other",
      },
    });
    expect(continuity.verdict).toBe("NEW_OBJECT");

    const adapted = adaptVisionObservationToListing(TOPPS_CHROME_OBS, {
      title: "panini",
      description:
        "Brand new panini in Auckland, asking $20. Attr:orange background. Attr:shiny surface. Attr:player image.",
      category: "Other",
      condition: "New",
      price: "20",
      location: "Auckland",
    });

    expect(adapted.continuity).toBe("NEW_OBJECT");
    expect(adapted.replaceDraft).toBe(true);
    expect(adapted.listingFill.title?.toLowerCase()).not.toMatch(/^panini$/);
    expect(String(adapted.listingFill.title)).toMatch(/topps/i);
    expect(adapted.listingFill.price).toBeUndefined();
    expect(adapted.listingFill.condition).not.toBe("New");
    expect(adapted.listingFill.category).toBe("Collectibles");
    expect(adapted.listingFill.location).toMatch(/Auckland/i);

    const bridge = prepareVisionConversationBridge({
      listingFill: adapted.listingFill,
      displayIdentity: adapted.displayIdentity,
      needsIdentityConfirm: adapted.needsIdentityConfirm,
      existingDraft: {
        title: "panini",
        price: "20",
        condition: "New",
        description: "Attr:orange background",
        location: "Auckland",
      },
      identityConfirmed: true,
    });

    expect(bridge.listingFill.description || "").not.toMatch(/Attr:/i);
    expect(bridge.listingFill.description || "").not.toMatch(/attr:/i);
    expect(bridge.listingFill.title?.toLowerCase()).not.toBe("panini");
    expect(bridge.listingFill.price).toBeUndefined();
  });

  it("visibleAttributes never become Attr: extras in factsToListingFill", () => {
    const { facts } = observationToListingFacts(TOPPS_CHROME_OBS);
    const fill = factsToListingFill(facts);
    expect((fill.extras || []).join(" ")).not.toMatch(/attr:/i);
    expect((fill.extras || []).join(" ")).not.toMatch(/player image/i);
  });

  it("description composer does not emit Attr: or brand-new from looks-clean", () => {
    const adapted = adaptVisionObservationToListing(TOPPS_CHROME_OBS);
    const desc = buildListingDescriptionFromFacts({
      ...adapted.listingFill,
      location: "Auckland",
      price: undefined,
      condition: undefined,
    });
    expect(desc).not.toMatch(/Attr:/i);
    expect(desc).not.toMatch(/brand new/i);
    expect(desc).not.toMatch(/Feel free to message me if you're interested\./i);
  });

  it("asks for player when unknown", () => {
    const adapted = adaptVisionObservationToListing(TOPPS_CHROME_OBS);
    expect(adapted.needsIdentityConfirm).toBe(true);
    expect(adapted.foundReply.toLowerCase()).toMatch(/player/);
  });
});

describe("cross-domain object continuity", () => {
  it("Nike draft → iPhone photo is NEW_OBJECT without Nike leak", () => {
    const adapted = adaptVisionObservationToListing(
      obs({
        domain: "phones",
        displayIdentity: "iPhone 15 Pro",
        itemIdentity: field("iPhone 15 Pro", "HIGH", "VISIBLE"),
        brand: field("Apple", "HIGH", "READABLE"),
        category: field("Tech", "HIGH", "VISIBLE"),
        overallConfidence: "HIGH",
      }),
      { title: "Nike Air Force 1", price: "20", condition: "New", category: "Fashion" }
    );
    expect(adapted.continuity).toBe("NEW_OBJECT");
    expect(adapted.listingFill.title).toMatch(/iPhone/i);
    expect(adapted.listingFill.title).not.toMatch(/Nike/i);
    expect(adapted.listingFill.price).toBeUndefined();
  });

  it("BMW draft → PS5 photo is NEW_OBJECT without BMW/$20", () => {
    const adapted = adaptVisionObservationToListing(
      obs({
        domain: "gaming",
        displayIdentity: "PlayStation 5",
        itemIdentity: field("PlayStation 5", "HIGH", "VISIBLE"),
        category: field("Gaming", "HIGH", "VISIBLE"),
        overallConfidence: "HIGH",
      }),
      {
        title: "BMW 320i",
        price: "20",
        listingType: "vehicle",
        vehicleMake: "BMW",
        vehicleModel: "320i",
        category: "Cars",
      }
    );
    expect(adapted.continuity).toBe("NEW_OBJECT");
    expect(adapted.listingFill.title).toMatch(/PlayStation 5/i);
    expect(adapted.listingFill.price).toBeUndefined();
    expect(adapted.listingFill.vehicleMake).toBeUndefined();
  });
});

describe("category mapping", () => {
  it("trading card text maps to Collectibles, never Sports", () => {
    expect(inferPhysicalCategoryFromText("Topps Chrome football trading card")).toBe(
      "Collectibles"
    );
    const gated = gatePublicListingCopy({ category: "Collectibles", title: "Card" });
    expect(gated.fill.category).toBe("Collectibles");
  });
});
