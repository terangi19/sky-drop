/**
 * BMW one-shot — raw seller message must never survive as a single extra/evidence blob.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { enforcePublicListingDescription } from "./awhina-listing-composer";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  isCompositeStructuredExtra,
  sanitizeListingExtras,
  structuredFactContextFromFill,
} from "./awhina-seller-evidence";
import { validateDescriptionQualityContract } from "./awhina-description-quality";

const BMW_MESSAGE =
  "2007 BMW 335i coupe 145000km automatic grey modified twin turbos intercooler downpipes intakes Auckland good condition";

const MESSY_DUPLICATED_BMW_MESSAGE =
  "Dark grey 2007 BMW 335i E92 in Auckland. 164,000 km on the clock, an automatic transmission, fair used condition. Modified with upgraded 17T twin turbos, an intercooler, an It has 19-inch staggered wheels, a M3 mirror caps, a but I want the listing to sound appealing without hiding the fact that it’s modified, a 17T twin turbos, a VRSF downpipes/inlets/charge pipe, a Stage 2 LPFP, an index 12 injectors, a MHD tune, a XHP transmission tune. The car runs, a drives, a but I want the listing to sound appealing without hiding the fact that it’s modified. Help me choose the best category, a write the title, a description, a suggest a fair NZ price and a tell me what details I should add before publishing.";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

describe("BMW seller-evidence extraction regression", () => {
  beforeEach(() => wipe("bmw-extraction-regression"));

  it("splits structured vehicle facts — raw sentence never stored as one extra", () => {
    const r = processCanonicalAwhina(BMW_MESSAGE, {
      conversationId: "bmw-extraction-regression",
      pathname: "/post/ai",
    });
    const fill = r.listingFill as SkyAiListingFill;
    expect(fill).toBeTruthy();
    expect(fill.vehicleYear).toBe("2007");
    expect(fill.vehicleMake).toBe("BMW");
    expect(fill.vehicleModel).toMatch(/335i/i);
    expect(fill.vehicleBodyType).toMatch(/coupe/i);
    expect(fill.vehicleOdometer).toBe("145000");
    expect(fill.vehicleTransmission).toMatch(/automatic/i);
    expect(fill.vehicleColour).toMatch(/grey/i);
    expect(fill.location).toMatch(/Auckland/i);
    expect(fill.condition).toMatch(/Good/i);

    const extras = fill.extras || [];
    const extrasBlob = extras.join(" | ");
    expect(extrasBlob).not.toMatch(/145000km automatic grey modified twin turbos/i);
    expect(extrasBlob).not.toMatch(/^modification:2007 BMW/i);
    for (const extra of extras) {
      const value = extra.replace(/^[^:]+:\s*/, "");
      expect(
        isCompositeStructuredExtra(value, structuredFactContextFromFill(fill))
      ).toBe(false);
    }
    expect(extras.some((e) => /modification:.*twin turbos/i.test(e))).toBe(true);
    expect(extras.some((e) => /modification:.*intercooler/i.test(e))).toBe(true);
    expect(extras.some((e) => /modification:.*downpipes/i.test(e))).toBe(true);
    expect(extras.some((e) => /modification:.*intakes/i.test(e))).toBe(true);
    expect(extras.filter((e) => e.startsWith("colour:")).length).toBeLessThanOrEqual(1);

    const sanitized = sanitizeListingExtras(fill);
    expect(sanitized.join(" ")).not.toContain(BMW_MESSAGE);
  });

  it("description uses canonical facts once — never Fitted with full raw sentence", () => {
    const r = processCanonicalAwhina(BMW_MESSAGE, {
      conversationId: "bmw-extraction-regression",
      pathname: "/post/ai",
    });
    const fill = enforcePublicListingDescription(r.listingFill as SkyAiListingFill, {
      force: true,
    });
    const desc = String(fill.description || "");
    expect(desc.length).toBeGreaterThan(20);
    expect(desc).not.toContain(BMW_MESSAGE);
    expect(desc).not.toMatch(/^Fitted with 2007 BMW/i);
    expect(desc).not.toMatch(/Fitted with 2007 BMW 335i coupe 145000km/i);
    expect(countMatches(desc, /\b2007\b/g)).toBe(1);
    expect(countMatches(desc, /\bgrey\b|\bgray\b/gi)).toBe(1);
    expect(countMatches(desc, /Auckland/i)).toBe(1);
    expect(countMatches(desc, /good used condition|good condition/i)).toBe(1);
    expect(countMatches(desc, /145,?000\s*km/i)).toBe(1);
    expect(countMatches(desc, /twin turbos/i)).toBe(1);
    expect(countMatches(desc, /intercooler/i)).toBe(1);
    expect(countMatches(desc, /downpipes/i)).toBe(1);
    expect(countMatches(desc, /intakes/i)).toBe(1);
  });

  it("real listing UI path sanitizes messy duplicated instructions and modifiers", () => {
    const r = processCanonicalAwhina(MESSY_DUPLICATED_BMW_MESSAGE, {
      conversationId: "bmw-extraction-regression",
      pathname: "/post/ai",
    });
    const fill = r.listingFill as SkyAiListingFill;
    expect(fill).toBeTruthy();

    // processCanonicalAwhina is the same listing path consumed by /post/ai.
    const final = enforcePublicListingDescription(fill, { force: true });
    const desc = String(final.description || "");

    expect(final.vehicleYear).toBe("2007");
    expect(final.vehicleModel).toMatch(/335i/i);
    expect(final.vehicleOdometer).toBe("164000");
    expect(final.vehicleTransmission).toMatch(/automatic/i);
    expect(final.condition).toMatch(/Fair/i);
    expect(final.location).toMatch(/Auckland/i);
    expect(final.price).toBeUndefined();

    expect(countMatches(desc, /17T twin turbos/gi)).toBeLessThanOrEqual(1);
    expect(desc).not.toMatch(
      /I want the listing|Help me choose|write the title|suggest a fair|tell me what details/i
    );
    expect(desc).not.toMatch(
      /(?:^|[,.!?;]\s+)(?:a|an)(?=\s*(?:[,.!?;]|$))|\b(?:a|an)\s+It has\b/i
    );
    expect(desc).toMatch(/\bM3 mirror caps\b/);

    for (const fact of [
      /17T twin turbos/i,
      /intercooler/i,
      /19-inch staggered wheels/i,
      /M3 mirror caps/i,
      /VRSF downpipes\/inlets\/charge pipe/i,
      /Stage 2 LPFP/i,
      /index 12 injectors/i,
      /MHD tune/i,
      /XHP transmission tune/i,
    ]) {
      expect(desc).toMatch(fact);
    }

    // Knowledge/marketing claims absent from seller evidence stay absent.
    expect(desc).not.toMatch(
      /\bN54\b|reliable performance|meticulously maintained|excellent driving experience|rare|perfect for/i
    );
    expect(validateDescriptionQualityContract(desc, final).ok).toBe(true);

    const extrasBlob = (final.extras || []).join(" | ");
    expect(countMatches(extrasBlob, /17T twin turbos/gi)).toBeLessThanOrEqual(1);
    expect(extrasBlob).not.toMatch(
      /I want the listing|Help me choose|write the title|suggest a fair|tell me what details/i
    );
  });

  it("quality contract rejects the original leaked command/filler shape", () => {
    const bad =
      "Dark grey 2007 BMW 335i E92 in Auckland. Modified with upgraded 17T twin turbos, an It has 19-inch staggered wheels, a M3 mirror caps, a but I want the listing to sound appealing. Help me choose the best category.";
    const result = validateDescriptionQualityContract(bad, {
      listingType: "vehicle",
      vehicleMake: "BMW",
      vehicleModel: "335i",
      vehicleYear: "2007",
      location: "Auckland",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toEqual(
        expect.arrayContaining([
          "seller_instruction_leak",
          "orphan_filler_token",
        ])
      );
    }
  });
});
