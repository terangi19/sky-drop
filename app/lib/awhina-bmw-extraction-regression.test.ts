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

const BMW_MESSAGE =
  "2007 BMW 335i coupe 145000km automatic grey modified twin turbos intercooler downpipes intakes Auckland good condition";

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
});
