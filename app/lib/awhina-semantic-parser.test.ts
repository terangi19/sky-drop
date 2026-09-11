import { beforeEach, describe, expect, it } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";
import { validateDescriptionQualityContract } from "./awhina-description-quality";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import {
  attachSellerFactModel,
  parseSellerMessageToFactModel,
  validateStructuredSellerFactModel,
} from "./awhina-semantic-parser";
import { PUBLIC_SELLER_MEANING_CLASSES } from "./awhina-semantic-fact-model";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

const MAKITA_INPUT =
  "selling my Makita drill and impact driver set had it couple years still works mint got drill impact driver 2 batteries charger and case one battery doesn't last as long anymore case pretty scratched west auckland paid 700 thinking maybe 250 make the listing professional recommend a price dont use what i paid";

describe("structured seller fact architecture", () => {
  beforeEach(() => clearAllListingDraftCacheForTests());

  it("atomizes an unpunctuated bundle with provenance and excluded intent", () => {
    const result = processCanonicalAwhina(MAKITA_INPUT, {
      conversationId: "semantic-makita-regression",
      pathname: "/post/ai",
    });
    const fill = result.listingFill as SkyAiListingFill;
    const model = fill.semanticFactModel!;
    const description = String(fill.description || "");

    expect(fill.title).toBe("Makita Drill and Impact Driver Set");
    for (const fact of [
      /2 batteries/i,
      /\bdrill\b/i,
      /impact driver/i,
      /charger/i,
      /\bcase\b/i,
      /one battery has reduced runtime/i,
      /case is scratched/i,
      /working order/i,
      /West Auckland/i,
    ]) {
      expect(description).toMatch(fact);
    }
    expect(fill.price).toBeUndefined();
    expect(model.price.confirmed).toBeNull();
    expect(model.price.tentative?.value).toBe("250");
    expect(model.price.historical?.value).toBe("700");
    expect(model.sellerInstructions.length).toBeGreaterThan(0);
    expect(description).not.toMatch(
      /paid 700|maybe 250|make the listing|recommend a price|what i paid/i,
    );

    for (const fact of model.publicFacts) {
      expect(PUBLIC_SELLER_MEANING_CLASSES.has(fact.class)).toBe(true);
      expect(fact.provenance.length).toBeGreaterThan(0);
      expect(fact.provenance.every((source) => Boolean(source.evidence))).toBe(
        true,
      );
    }
    expect(validateStructuredSellerFactModel(model)).toBe(true);
  });

  it("keeps tentative and historical prices out of confirmed price", () => {
    const model = parseSellerMessageToFactModel(
      "Ryobi saw paid $700 new thinking around 250 maybe tell me what to charge",
      { title: "Ryobi saw", price: "700" },
    );
    expect(model.price.confirmed).toBeNull();
    expect(model.price.tentative?.value).toBe("250");
    expect(model.price.historical?.value).toBe("700");
    expect(
      model.publicFacts.some((fact) => fact.class.startsWith("price_")),
    ).toBe(false);
  });

  it("retains a clear asking price", () => {
    const attached = attachSellerFactModel("selling my Ryobi saw asking $250", {
      title: "Ryobi saw",
      price: "250",
    });
    expect(attached.price).toBe("250");
    expect(attached.semanticFactModel?.price.confirmed?.value).toBe("250");
  });

  it("resolves contradictory usage conservatively", () => {
    const model = parseSellerMessageToFactModel(
      "selling my mixer barely used actually used every day for 3 years",
      { title: "Mixer" },
    );
    expect(
      model.publicFacts.some((fact) => /\bbarely used\b/i.test(fact.value)),
    ).toBe(false);
    expect(model.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "condition:usage",
          resolution: "conservative",
        }),
      ]),
    );
    const attached = attachSellerFactModel(
      "selling my mixer barely used actually used every day for 3 years",
      { title: "Mixer", condition: "Used - Like New" },
    );
    expect(attached.condition).toBeUndefined();
  });

  it("chooses the less flattering explicit condition when grades conflict", () => {
    const attached = attachSellerFactModel(
      "selling my jacket like-new condition actually fair condition",
      { title: "Jacket", condition: "Used - Like New" },
    );
    expect(attached.condition).toBe("Used - Fair");
    expect(
      attached.semanticFactModel?.conflicts.some(
        (conflict) =>
          conflict.key === "condition:grade" &&
          conflict.resolution === "conservative",
      ),
    ).toBe(true);
  });

  it("deduplicates differently worded modification facts by meaning", () => {
    const model = parseSellerMessageToFactModel("", {
      title: "Modified coupe",
      extras: [
        "modification:17T twins",
        "modification:17T twin turbos",
        "modification:upgraded 17T turbos",
      ],
    });
    expect(model.modifications).toHaveLength(1);
    expect(model.modifications[0].value).toMatch(/17T/i);
    expect(model.modifications[0].provenance.length).toBeGreaterThanOrEqual(2);
  });

  it("ignores raw extras after a semantic model has been validated", () => {
    const base: SkyAiListingFill = attachSellerFactModel(
      "selling my cordless drill comes with charger",
      {
        title: "Cordless drill",
        listingType: "physical",
        extras: ["included:charger"],
      },
    );
    const poisoned: SkyAiListingFill = {
      ...base,
      extras: [
        ...(base.extras || []),
        "included:make the listing sound professional and suggest a price",
      ],
      description: "",
      descriptionSource: "ai",
    };
    const final = finalizeAwhinaListingDescription(poisoned, { force: true });
    expect(final.description).toMatch(/charger/i);
    expect(final.description).not.toMatch(/make the listing|suggest a price/i);
  });

  it("rejects unsupported numeric claims against fact provenance", () => {
    const fill = attachSellerFactModel(
      "selling my cordless drill comes with charger",
      {
        title: "Cordless drill",
        listingType: "physical",
        extras: ["included:charger"],
      },
    );
    const result = validateDescriptionQualityContract(
      "Cordless drill with a charger and two 18V batteries.",
      fill,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toContain("unsupported_numeric_claim");
    }
  });
});
