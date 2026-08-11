/**
 * Camera-first vision adapter tests — no OpenAI calls.
 * Scenarios: PS5, iPhone, Samsung, Nike, sofa, drill, card, BMW, unbranded,
 * damaged, ambiguous; multi-photo; USER correction; photo+text compound.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  adaptVisionObservationToListing,
  observationToListingFacts,
} from "./awhina-vision-adapter";
import {
  mapVisibleConditionToListing,
  mayPopulateFromVision,
  parseVisionObservation,
  type VisionListingObservation,
  type VisionObservedField,
} from "./awhina-vision-observation";
import { mergeVisionWithSellerText } from "./awhina-vision-compound";
import {
  clearVisionCacheForTests,
  fingerprintVisionImages,
  getVisionCache,
  setVisionCache,
  visionCacheKey,
} from "./awhina-vision-cache";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { enrichObservationWithKnowledge } from "./awhina-vision-knowledge";
import { retrieveKnowledgePack } from "./awhina-knowledge-packs";

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

beforeEach(() => {
  clearVisionCacheForTests();
  clearAllListingDraftCacheForTests();
});

describe("confidence policy", () => {
  it("HIGH VISIBLE may populate; LOW must not", () => {
    expect(mayPopulateFromVision(field("PS5", "HIGH", "VISIBLE"))).toBe(true);
    expect(mayPopulateFromVision(field("maybe sofa", "LOW", "VISIBLE"))).toBe(false);
  });

  it("INFERENCE never populates even at HIGH", () => {
    expect(mayPopulateFromVision(field("256GB", "HIGH", "INFERENCE"))).toBe(false);
  });

  it("MEDIUM suggests unless allowMedium", () => {
    expect(mayPopulateFromVision(field("Nike", "MEDIUM", "VISIBLE"))).toBe(false);
    expect(
      mayPopulateFromVision(field("Nike", "MEDIUM", "VISIBLE"), { allowMedium: true })
    ).toBe(true);
  });
});

describe("condition — never uncertain → Like New", () => {
  it("does not map vague good/like-new from vision", () => {
    expect(
      mapVisibleConditionToListing(field("looks like new", "MEDIUM", "VISIBLE"))
    ).toBeUndefined();
    expect(
      mapVisibleConditionToListing(field("good condition", "HIGH", "INFERENCE"))
    ).toBeUndefined();
  });

  it("maps sealed packaging and clear damage", () => {
    expect(
      mapVisibleConditionToListing(field("factory sealed in box", "HIGH", "VISIBLE"))
    ).toBe("New");
    expect(
      mapVisibleConditionToListing(field("cracked screen damaged", "HIGH", "VISIBLE"))
    ).toBe("Used - Fair");
  });
});

describe("identity scenarios", () => {
  it("PS5 multi-photo → one PlayStation 5 listing", () => {
    const adapted = adaptVisionObservationToListing(
      obs({
        displayIdentity: "PlayStation 5",
        itemIdentity: field("PlayStation 5", "HIGH", "VISIBLE"),
        brand: field("Sony", "HIGH", "READABLE"),
        product: field("PlayStation 5", "HIGH", "VISIBLE"),
        category: field("Gaming", "HIGH", "VISIBLE"),
        visualDescription: "Black PlayStation 5 console visible in photos.",
        overallConfidence: "HIGH",
      })
    );
    expect(adapted.listingFill.title).toMatch(/PlayStation 5/i);
    expect(adapted.listingFill.listingType).toBe("physical");
    expect(adapted.listingFill.category).toMatch(/Gaming/i);
    expect(adapted.displayIdentity).toMatch(/PlayStation 5/i);
    expect(adapted.foundReply).toMatch(/Āwhina found it/i);
  });

  it("iPhone / Samsung / Nike / sofa / drill / card / BMW", () => {
    const cases = [
      { id: "iPhone 15 Pro", cat: "Tech" },
      { id: "Samsung Galaxy S24", cat: "Tech" },
      { id: "Nike Air Force 1", cat: "Fashion" },
      { id: "Grey fabric sofa", cat: "Home" },
      { id: "Cordless drill", cat: "Home" },
      { id: "Lionel Messi Topps card", cat: "Sports" },
      { id: "BMW 3 Series", cat: "Cars", type: "vehicle" },
    ];
    for (const c of cases) {
      const adapted = adaptVisionObservationToListing(
        obs({
          displayIdentity: c.id,
          itemIdentity: field(c.id, "HIGH", "VISIBLE"),
          category: field(c.cat, "HIGH", "VISIBLE"),
          listingType: field(c.type || "physical", "HIGH", "VISIBLE"),
          overallConfidence: "HIGH",
        })
      );
      expect(adapted.listingFill.title).toContain(c.id.split(" ")[0]);
    }
  });

  it("unbranded item keeps generic identity, low model omitted", () => {
    const { omitted, facts } = observationToListingFacts(
      obs({
        displayIdentity: "Wooden side table",
        itemIdentity: field("Wooden side table", "MEDIUM", "VISIBLE"),
        brand: field("", "LOW", "UNKNOWN"),
        model: field("Oak-9000", "LOW", "INFERENCE"),
        overallConfidence: "MEDIUM",
      })
    );
    expect(facts.fields.model).toBeUndefined();
    expect(omitted).toContain("model");
  });

  it("damaged item keeps visual clues without inventing Like New", () => {
    const adapted = adaptVisionObservationToListing(
      obs({
        displayIdentity: "iPhone",
        itemIdentity: field("iPhone", "HIGH", "VISIBLE"),
        visibleCondition: field("cracked screen heavy wear", "HIGH", "VISIBLE"),
        overallConfidence: "HIGH",
      })
    );
    expect(adapted.listingFill.condition).toBe("Used - Fair");
    expect(adapted.listingFill.condition).not.toMatch(/Like New/i);
  });

  it("ambiguous overall → needs identity confirm", () => {
    const adapted = adaptVisionObservationToListing(
      obs({
        displayIdentity: "Black game console",
        itemIdentity: field("game console", "MEDIUM", "VISIBLE"),
        overallConfidence: "MEDIUM",
        uncertainties: ["Could be PS5 or Xbox"],
      })
    );
    expect(adapted.needsIdentityConfirm).toBe(true);
  });
});

describe("USER provenance outranks vision", () => {
  it("existing USER title/price survive vision when provenance locked", () => {
    const adapted = adaptVisionObservationToListing(
      obs({
        displayIdentity: "PlayStation 5",
        itemIdentity: field("PlayStation 5", "HIGH", "VISIBLE"),
        overallConfidence: "HIGH",
      }),
      {
        title: "My custom PS5 bundle",
        price: "450",
        location: "Auckland",
      },
      {
        fieldProvenance: {
          title: "USER",
          price: "USER",
          location: "USER",
        },
      }
    );
    expect(adapted.listingFill.title).toBe("My custom PS5 bundle");
    expect(adapted.listingFill.price).toBe("450");
    expect(adapted.listingFill.location).toBe("Auckland");
  });

  it("NEW unrelated photo does not inherit prior Panini brand/price/New", () => {
    const adapted = adaptVisionObservationToListing(
      obs({
        domain: "trading-cards",
        displayIdentity: "Topps Chrome Inter Milan orange parallel",
        itemIdentity: field("Topps Chrome football card", "HIGH", "VISIBLE"),
        brand: field("Topps", "HIGH", "READABLE"),
        product: field("Topps Chrome", "HIGH", "READABLE"),
        cardSet: field("Topps Chrome", "HIGH", "READABLE"),
        colour: field("orange", "HIGH", "VISIBLE"),
        parallel: field("refractor", "MEDIUM", "VISIBLE"),
        serialNumber: field("14/25", "HIGH", "READABLE"),
        category: field("Sports", "HIGH", "VISIBLE"),
        visibleFeatures: ["orange background", "shiny surface", "player image"],
        visibleCondition: field("looks clean", "MEDIUM", "VISIBLE"),
        overallConfidence: "HIGH",
      }),
      {
        title: "panini",
        description: "Brand new panini in Auckland, asking $20.",
        category: "Other",
        condition: "New",
        price: "20",
        location: "Auckland",
      }
    );
    expect(adapted.continuity).toBe("NEW_OBJECT");
    expect(adapted.replaceDraft).toBe(true);
    expect(adapted.listingFill.title?.toLowerCase()).not.toBe("panini");
    expect(adapted.listingFill.title?.toLowerCase()).not.toMatch(/^panini$/);
    expect(String(adapted.listingFill.title || "")).toMatch(/topps/i);
    expect(adapted.listingFill.price).toBeUndefined();
    expect(adapted.listingFill.condition).not.toBe("New");
    expect(adapted.listingFill.category).toBe("Sports");
    expect(adapted.listingFill.location).toMatch(/Auckland/i);
    const extras = (adapted.listingFill.extras || []).join(" ");
    expect(extras).not.toMatch(/^attr:/im);
    expect(extras).not.toMatch(/Attr:/i);
    expect(extras).toMatch(/serial:14\/25|14\/25/i);
  });
});

describe("photo + text compound", () => {
  it("PS5 vision + yep 500 pickup auckland → price and location", () => {
    const vision = adaptVisionObservationToListing(
      obs({
        displayIdentity: "PlayStation 5",
        itemIdentity: field("PlayStation 5", "HIGH", "VISIBLE"),
        category: field("Gaming", "HIGH", "VISIBLE"),
        visualDescription: "Black PlayStation 5 console.",
        overallConfidence: "HIGH",
      })
    );
    const merged = mergeVisionWithSellerText(vision, "yep 500 pickup auckland");
    expect(merged.textApplied).toBe(true);
    expect(merged.listingFill.title).toMatch(/PlayStation 5/i);
    expect(String(merged.listingFill.price)).toMatch(/500/);
    expect(String(merged.listingFill.location)).toMatch(/Auckland/i);
    expect(merged.listingFill.pickupAvailable).toBe(true);
  });

  it("photo + want 850 pickup henderson", () => {
    const vision = adaptVisionObservationToListing(
      obs({
        displayIdentity: "iPhone 15",
        itemIdentity: field("iPhone 15", "HIGH", "VISIBLE"),
        overallConfidence: "HIGH",
      })
    );
    const merged = mergeVisionWithSellerText(vision, "want 850 pickup henderson");
    expect(String(merged.listingFill.price)).toMatch(/850/);
    expect(String(merged.listingFill.location).toLowerCase()).toMatch(/henderson/);
  });
});

describe("cache — one batch one recognition", () => {
  it("fingerprints images and returns cache hit", () => {
    const imgs = ["data:image/jpeg;base64,aaa", "data:image/jpeg;base64,bbb"];
    const fp = fingerprintVisionImages(imgs);
    const key = visionCacheKey("draft1", fp);
    const adapted = adaptVisionObservationToListing(
      obs({
        displayIdentity: "Nike shoe",
        itemIdentity: field("Nike shoe", "HIGH", "VISIBLE"),
        overallConfidence: "HIGH",
      })
    );
    setVisionCache(key, {
      observation: obs({ displayIdentity: "Nike shoe" }),
      adapted,
      imageFingerprint: fp,
      draftKey: "draft1",
    });
    expect(getVisionCache(key)?.adapted.displayIdentity).toBe("Nike shoe");
    expect(fingerprintVisionImages(imgs)).toBe(fp);
  });
});

describe("never invent high-risk fields from vision", () => {
  it("does not set price/location/mileage from observation alone", () => {
    const adapted = adaptVisionObservationToListing(
      obs({
        displayIdentity: "BMW 320i",
        itemIdentity: field("BMW 320i", "HIGH", "VISIBLE"),
        listingType: field("vehicle", "HIGH", "VISIBLE"),
        usefulFacts: ["looks like 80,000km", "worth about $12000"],
        overallConfidence: "HIGH",
      })
    );
    expect(adapted.listingFill.price).toBeUndefined();
    expect(adapted.listingFill.location).toBeUndefined();
    expect(adapted.listingFill.vehicleOdometer).toBeUndefined();
  });
});

describe("shared knowledge enrichment", () => {
  it("PS5 / Xbox / iPhone / Skyline / cards / unbranded", () => {
    expect(retrieveKnowledgePack({ identityText: "three PS5 photos" }).canonicalIdentity).toMatch(
      /PlayStation 5/i
    );
    expect(retrieveKnowledgePack({ identityText: "Xbox Series S" }).packId).toBe("gaming");
    expect(retrieveKnowledgePack({ identityText: "iPhone 15" }).packId).toBe("phones");
    expect(retrieveKnowledgePack({ identityText: "Skyline R34 GTR" }).generation).toMatch(/R34/i);
    expect(retrieveKnowledgePack({ identityText: "PSA 10 Messi card" }).packId).toMatch(
      /trading-cards|collectibles|generic/
    );
    expect(retrieveKnowledgePack({ identityText: "random unbranded widget" }).matched).toBe(
      false
    );
  });

  it("enrichment → adapter stays one listing brain", () => {
    const enriched = enrichObservationWithKnowledge(
      obs({
        displayIdentity: "PS5",
        itemIdentity: field("PS5", "HIGH", "VISIBLE"),
        category: field("Gaming", "MEDIUM", "VISIBLE"),
        overallConfidence: "HIGH",
        visibleFacts: ["black console"],
      })
    );
    expect(enriched.domain).toBe("gaming");
    const adapted = adaptVisionObservationToListing(enriched.observation);
    expect(adapted.listingFill.title).toMatch(/PlayStation 5/i);
  });
});
