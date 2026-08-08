/**
 * Knowledge pack targeted retrieval - gaming / phones / vehicles first.
 */
import { describe, it, expect } from "vitest";
import { retrieveKnowledgePack } from "./index";
import { enrichObservationWithKnowledge } from "../awhina-vision-knowledge";
import { parseVisionObservation } from "../awhina-vision-observation";
import { adaptVisionObservationToListing } from "../awhina-vision-adapter";

describe("knowledge packs - first domains", () => {
  it("gaming: PS5 / Xbox / Switch", () => {
    expect(retrieveKnowledgePack({ identityText: "PS5 disc" }).canonicalIdentity).toMatch(
      /PlayStation 5/i
    );
    expect(retrieveKnowledgePack({ identityText: "Xbox Series X" }).packId).toBe("gaming");
    expect(retrieveKnowledgePack({ identityText: "Switch OLED" }).canonicalIdentity).toMatch(
      /OLED/i
    );
  });

  it("phones: iPhone / Samsung", () => {
    const iphone = retrieveKnowledgePack({ identityText: "iPhone 15 Pro" });
    expect(iphone.packId).toBe("phones");
    expect(iphone.canonicalIdentity).toMatch(/iPhone 15 Pro/i);
    expect(JSON.stringify(iphone)).not.toMatch(/128GB|256GB/);
    expect(retrieveKnowledgePack({ identityText: "Samsung Galaxy S24" }).matched).toBe(true);
  });

  it("vehicles: Skyline / BMW", () => {
    const sky = retrieveKnowledgePack({ identityText: "Nissan Skyline R34" });
    expect(sky.packId).toBe("vehicles");
    expect(sky.generation).toMatch(/R34/i);
    expect(retrieveKnowledgePack({ identityText: "BMW 335i" }).canonicalIdentity).toMatch(
      /BMW 335i/i
    );
  });

  it("unknown never blocks", () => {
    const hit = retrieveKnowledgePack({ identityText: "wooden side table" });
    expect(hit.packId).toBe("generic");
    expect(hit.matched).toBe(false);
  });
});

describe("vision + knowledge shared pipeline", () => {
  it("enriches PS5 observation via gaming pack", () => {
    const raw = parseVisionObservation({
      domain: "gaming",
      displayIdentity: "PS5",
      itemIdentity: { value: "PS5", confidence: "HIGH", evidence: "VISIBLE", note: "" },
      brand: { value: "", confidence: "LOW", evidence: "UNKNOWN", note: "" },
      product: { value: "", confidence: "LOW", evidence: "UNKNOWN", note: "" },
      model: { value: "", confidence: "LOW", evidence: "UNKNOWN", note: "" },
      variant: { value: "", confidence: "LOW", evidence: "UNKNOWN", note: "" },
      category: { value: "Gaming", confidence: "MEDIUM", evidence: "VISIBLE", note: "" },
      colour: { value: "black", confidence: "HIGH", evidence: "VISIBLE", note: "" },
      listingType: { value: "physical", confidence: "HIGH", evidence: "VISIBLE", note: "" },
      visibleCondition: { value: "", confidence: "LOW", evidence: "UNKNOWN", note: "" },
      visibleFacts: ["black console"],
      readableFacts: [],
      inferredFacts: [],
      unknowns: ["edition"],
      overallConfidence: "HIGH",
      visualDescription: "Black console visible.",
    });
    const { observation, knowledge } = enrichObservationWithKnowledge(raw);
    expect(knowledge.packId).toBe("gaming");
    expect(observation.displayIdentity).toMatch(/PlayStation 5/i);
    const adapted = adaptVisionObservationToListing(observation);
    expect(adapted.listingFill.title).toMatch(/PlayStation 5/i);
  });
});
