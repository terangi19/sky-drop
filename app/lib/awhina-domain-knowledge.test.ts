import { describe, expect, it } from "vitest";
import {
  applyAwhinaDomainKnowledge,
  getAwhinaDomainRule,
  normalizeAwhinaObjectType,
  selectDomainKnowledgeQuestions,
} from "./awhina-domain-knowledge";

describe("Āwhina domain knowledge ontology", () => {
  it.each([
    ["Topps Premier League Booster Display", "booster_display"],
    ["Riftbound booster box", "booster_box"],
    ["Topps individual card", "individual_card"],
    ["PSA 10 graded card", "graded_card"],
    ["Pokémon Elite Trainer Box", "etb"],
    ["Razer gaming mouse", "gaming_mouse"],
    ["Sony DualSense controller", "controller"],
    ["Apple iPhone 15", "phone"],
    ["iPhone phone case", "phone_case"],
    ["BMW 335i", "vehicle"],
    ["BMW diecast model car", "toy_vehicle"],
    ["Nike shoes", "shoes"],
    ["LEGO boxed set", "lego_sealed_set"],
  ])("normalizes %s", (label, expected) => {
    expect(normalizeAwhinaObjectType(label)).toBe(expected);
  });

  it("removes card-only attributes from sealed products", () => {
    const result = applyAwhinaDomainKnowledge({
      title: "Topps Premier League Booster Box",
      extras: ["productFormat:booster box", "subject:LeBron James", "parallelColor:purple", "serial:14/25", "packsPerBox:24"],
    });
    expect(result.extras).toEqual(["productFormat:booster box", "packsPerBox:24"]);
  });

  it("removes impossible electronics attributes", () => {
    expect(
      applyAwhinaDomainKnowledge({
        title: "Razer Gaming Mouse",
        extras: ["storage:1TB", "batteryHealth:90%", "colour:Black"],
      }).extras
    ).toEqual(["colour:Black"]);
    expect(
      applyAwhinaDomainKnowledge({
        title: "iPhone phone case",
        extras: ["batteryHealth:90%", "storage:1TB", "material:Silicone"],
      }).extras
    ).toEqual(["material:Silicone"]);
  });

  it("selects relevant questions for sealed products, cards, phones, and mice", () => {
    expect(
      selectDomainKnowledgeQuestions({
        title: "Topps Premier League Booster Box",
        extras: ["productFormat:booster box"],
      })
    ).toEqual(["price", "condition", "location"]);
    expect(selectDomainKnowledgeQuestions({ title: "Topps individual card" })).toContain("subject");
    expect(selectDomainKnowledgeQuestions({ title: "Apple iPhone 15" })).toContain("storage");
    expect(selectDomainKnowledgeQuestions({ title: "Razer gaming mouse" })).not.toContain("storage");
  });

  it("keeps the sealed-product rule distinct from the individual-card rule", () => {
    expect(getAwhinaDomainRule("booster_box")?.forbiddenAttributes).toContain("grade");
    expect(getAwhinaDomainRule("booster_box")?.forbiddenAttributes).toContain("subject");
    expect(getAwhinaDomainRule("individual_card")?.allowedAttributes).toContain("grade");
  });
});
