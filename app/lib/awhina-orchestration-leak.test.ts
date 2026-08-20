/**
 * Orchestration text must never leak into public listing copy.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import {
  containsInternalOrchestration,
  extractSellerAuthoredText,
  sanitizePublicListingCopy,
} from "./awhina-orchestration-boundary";
import { harvestSellerEvidence } from "./awhina-seller-evidence";
import {
  buildDescriptionWriterFacts,
  validateAiListingDescriptionResult,
} from "./awhina-description-writer";
import { enhanceListingFillFromMessage } from "./sky-ai-form-actions";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

const ORCH_ENVELOPE = `[LISTING CREATION REQUEST]
The user is on the Sell page. Parse everything below as listing data and respond ONLY with LISTING_FILL JSON. Generate a complete listing (title, description, all relevant fields). Do not give general chat advice.

`;

const ORCH_FAIL_RE =
  /LISTING CREATION REQUEST|LISTING_FILL|Sell page|Parse everything|respond ONLY|Generate a complete listing|general chat advice/i;

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

function turn(id: string, message: string, prev?: { listingFill?: SkyAiListingFill | null }) {
  return processCanonicalAwhina(message, {
    conversationId: id,
    pathname: "/post/ai",
    listingContext: (prev?.listingFill as never) || undefined,
  });
}

function assertCleanPublic(fill: SkyAiListingFill | null | undefined) {
  const blob = [
    fill?.title,
    fill?.description,
    Array.isArray(fill?.extras) ? fill!.extras!.join(" ") : fill?.extras,
  ]
    .filter(Boolean)
    .join("\n");
  expect(blob).not.toMatch(ORCH_FAIL_RE);
  expect(containsInternalOrchestration(blob)).toBe(false);
}

describe("orchestration boundary", () => {
  it("extracts only seller text from a sell-page envelope", () => {
    const seller =
      "256GB, Natural Titanium, like-new condition, $1,250, Auckland. Battery health is 94%.";
    expect(extractSellerAuthoredText(`${ORCH_ENVELOPE}${seller}`)).toBe(seller);
    expect(extractSellerAuthoredText(seller)).toBe(seller);
  });

  it("never harvests orchestration as seller evidence", () => {
    const items = harvestSellerEvidence(
      `${ORCH_ENVELOPE}Comes with the original box and USB-C cable. No cracks, faults or repairs.`
    );
    const blob = items.map((i) => i.text).join(" | ");
    expect(blob).toMatch(/box|cable|crack/i);
    expect(blob).not.toMatch(ORCH_FAIL_RE);
  });

  it("rejects descriptions containing orchestration via validator", () => {
    const facts = buildDescriptionWriterFacts({
      title: "iPhone 15 Pro",
      listingType: "physical",
      condition: "Used - Like New",
      location: "Auckland",
      extras: ["storage:256GB", "mechanical:94% battery health"],
    });
    const poisoned =
      "Like-new iPhone 15 Pro 256GB. [LISTING CREATION REQUEST] The user is on the Sell page. Parse everything below as listing data.";
    const result = validateAiListingDescriptionResult(poisoned, facts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("orchestration_leak");
  });

  it("sanitizePublicListingCopy clears control language", () => {
    expect(
      sanitizePublicListingCopy(
        "Nice phone. Respond ONLY with LISTING_FILL JSON. Do not give general chat advice."
      )
    ).not.toMatch(ORCH_FAIL_RE);
  });
});

describe("envelope-wrapped sell flows stay clean", () => {
  const cases = [
    {
      name: "iPhone",
      seed: "I want to sell my iPhone 15 Pro",
      follow:
        "256GB, Natural Titanium, like-new condition, $1,250, Auckland. Battery health is 94%. Comes with the original box and USB-C cable. Always used with a case and screen protector. No cracks, faults or repairs.",
      must: [/like[- ]new/i, /256\s*GB/i, /titanium/i, /94|battery/i, /box|cable/i, /auckland/i],
    },
    {
      name: "PS5",
      seed: "I want to sell my PS5",
      follow: "Like new, $550, Auckland. Comes with one controller and all cables. No faults or damage.",
      must: [/like[- ]new/i, /controller/i, /cable/i, /auckland/i],
    },
    {
      name: "R34",
      seed: "I want to sell my Nissan Skyline R34",
      follow:
        "1999, 145,000 km, manual, petrol, silver, good used condition, asking $38,000, located in Auckland. Aftermarket exhaust, intake, coilovers and wheels. Recently serviced with new oil and filters. Tidy interior, a few stone chips on the front bumper, no known mechanical faults.",
      must: [/1999|Skyline|R34/i, /exhaust|coilover/i, /auckland/i],
    },
  ] as const;

  for (const c of cases) {
    it(`${c.name}: wrapped follow-up never leaks orchestration`, () => {
      const id = `orch-${c.name}`;
      wipe(id);
      const t1 = turn(id, c.seed);
      const t2 = turn(id, `${ORCH_ENVELOPE}${c.follow}`, { listingFill: t1.listingFill });
      assertCleanPublic(t2.listingFill);
      expect(String(t2.reply || "")).not.toMatch(ORCH_FAIL_RE);
      const desc = String(t2.listingFill?.description || "");
      for (const re of c.must) expect(desc).toMatch(re);

      // Route-style enhance on wrapped raw message must also stay clean.
      const enhanced = enhanceListingFillFromMessage(`${ORCH_ENVELOPE}${c.follow}`, {
        ...(t2.listingFill || {}),
      });
      assertCleanPublic(enhanced);
      const finalized = finalizeAwhinaListingDescription({
        ...(enhanced || {}),
        description: `${desc} [LISTING CREATION REQUEST] The user is on the Sell page.`,
        descriptionSource: "ai",
      }, { force: true });
      expect(String(finalized.description || "")).not.toMatch(ORCH_FAIL_RE);
    });
  }

  it("service and rental envelopes stay clean", () => {
    wipe("orch-service");
    const service = turn(
      "orch-service",
      `${ORCH_ENVELOPE}I want to offer lawn mowing in Auckland for $50 per hour`
    );
    assertCleanPublic(service.listingFill);

    wipe("orch-rental");
    const rental = turn(
      "orch-rental",
      `${ORCH_ENVELOPE}I want to hire out my trailer in Auckland for $40 a day`
    );
    assertCleanPublic(rental.listingFill);
  });
});
