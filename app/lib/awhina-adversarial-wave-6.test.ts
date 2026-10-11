/**
 * Wave 6 adversarial NZ corpus — Class 5 identity-wipe + Class 7 contradictions only.
 * Fixtures are EVAL CASES ONLY; production must not hardcode these strings.
 *
 * Lead Dev hourly re-task (offline tests-only). Aligns with Fixer Class 5+7 IDs:
 * multi8-s22 / multi6-switch-oled / multi7-civic-accord / multi8-a7iv-pending /
 * multi4-crack-wipe-s23 / physical-s23-ultra-contradiction / storage-colour-flipflops /
 * series-s-1tb-colour-flip / air-max-90-infrared-not-price — plus new Pixel/MacBook/Ranger/PS5/iPad attacks.
 *
 * Reuses Wave 1–5 entry points: processCanonicalAwhina, description quality,
 * seller evidence, semantic fact model, input normalize, price parse.
 * No production heuristics are patched here. Do not claim SAFE.
 *
 * Known current breaks use vitest `it.fails` / `FAIL:` so CI stays green.
 * See docs/awhina-adversarial-qa-report.md (Wave 6).
 * Wave 1–5 FAIL markers were not weakened.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { processCanonicalAwhina, type CanonicalResult } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests, parseListingPriceFromMessage } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { enforcePublicListingDescription } from "./awhina-listing-composer";
import {
  GENERIC_MARKETPLACE_FILLER_RE,
  hasSemanticFactDuplication,
  validateDescriptionQualityContract,
} from "./awhina-description-quality";
import { MARKETING_FILLER_RE } from "./awhina-description-writer";
import {
  containsInternalOrchestration,
  containsSellerMetaInstruction,
} from "./awhina-orchestration-boundary";
import { harvestSellerEvidence } from "./awhina-seller-evidence";
import { normalizeAwhinaInput } from "./awhina-input-normalize";
import { parseSellerMessageToFactModel } from "./awhina-semantic-parser";
import { interpretSemanticTurn } from "./awhina-semantic-intent";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  DONT_PUT_LEAK_RE,
  EDUCATION_LECTURE_RE,
  KNOWN_FAILURE_IDS,
  PAID_WAS_LEAK_RE,
  SALE_VOICE_RE,
  WAVE6_CONTRADICTION,
  WAVE6_IDENTITY,
  type CorpusCase,
} from "./awhina-adversarial-wave-6-corpus";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
}

function asFill(r: CanonicalResult): SkyAiListingFill {
  return (r.listingFill || {}) as SkyAiListingFill;
}

function compose(fill: SkyAiListingFill): SkyAiListingFill {
  if (!fill.title && !fill.listingType) return fill;
  return enforcePublicListingDescription(fill, { force: true });
}

function extrasBlob(fill: SkyAiListingFill): string {
  return (fill.extras || []).join(" | ");
}

function publicBlob(fill: SkyAiListingFill, reply?: string): string {
  return [fill.title, fill.description, extrasBlob(fill), reply || ""].join("\n");
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return (text.match(new RegExp(re.source, flags)) || []).length;
}

function dump(r: CanonicalResult, fill: SkyAiListingFill): string {
  return JSON.stringify(
    {
      handled: r.handled,
      intent: r.intent,
      tool: r.tool,
      reply: r.reply,
      pendingSlot: r.sessionState?.pendingSlot,
      listingType: fill.listingType,
      title: fill.title,
      price: fill.price,
      condition: fill.condition,
      location: fill.location,
      category: fill.category,
      pricingType: fill.pricingType,
      servicePricingType: fill.servicePricingType,
      saleType: fill.saleType,
      acceptOffers: fill.acceptOffers,
      stockQuantity: fill.stockQuantity,
      vehicleMake: fill.vehicleMake,
      vehicleModel: fill.vehicleModel,
      vehicleYear: fill.vehicleYear,
      vehicleOdometer: fill.vehicleOdometer,
      vehicleGeneration: fill.vehicleGeneration,
      vehicleColour: fill.vehicleColour,
      vehicleTransmission: fill.vehicleTransmission,
      vehicleBodyType: fill.vehicleBodyType,
      vehicleFuelType: fill.vehicleFuelType,
      rentalSubType: fill.rentalSubType,
      rentalPriceDaily: fill.rentalPriceDaily,
      rentalPriceWeekly: fill.rentalPriceWeekly,
      rentalDeposit: fill.rentalDeposit,
      rentalBedrooms: fill.rentalBedrooms,
      extras: fill.extras,
      description: fill.description,
      semanticPrice: fill.semanticFactModel?.price,
      instructions: fill.semanticFactModel?.sellerInstructions?.map((f) => f.value),
      negatives: fill.semanticFactModel?.negativeCondition?.map((f) => f.value),
    },
    null,
    2
  );
}

function runTurns(id: string, turns: string[]): CanonicalResult {
  wipe(id);
  let prev: CanonicalResult | undefined;
  let last!: CanonicalResult;
  for (const msg of turns) {
    last = processCanonicalAwhina(msg, {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: (prev?.listingFill as SkyAiListingFill) || undefined,
      clientTask: prev?.sessionState?.task,
    });
    prev = last;
  }
  return last;
}

// Corpus types, WAVE6_IDENTITY, WAVE6_CONTRADICTION and KNOWN_FAILURE_IDS live in the shared
// fixture module ./awhina-adversarial-wave-6-corpus (imported above) so the 6.1/6.2/6.3 index files
// can verify registration against the real harness corpus.

function askingPrice(fill: SkyAiListingFill): string {
  return String(fill.price || fill.rentalPriceDaily || fill.rentalPriceWeekly || "");
}

function assertCase(c: CorpusCase) {
  const turns = Array.isArray(c.input) ? c.input : [c.input];
  const r = runTurns(`adv5-${c.id}`, turns);
  const fill = compose(asFill(r));
  const ctx = dump(r, fill);
  const pub = publicBlob(fill, r.reply);
  const extras = extrasBlob(fill);
  const desc = String(fill.description || "");
  const e = c.expect;

  expect(r.handled, `handled\n${ctx}`).toBe(true);
  expect(String(fill.listingType || ""), `listingType\n${ctx}`).toBe(e.listingType);

  if (e.titleMatch) expect(String(fill.title || ""), `title\n${ctx}`).toMatch(e.titleMatch);
  for (const re of e.titleNot || []) {
    expect(String(fill.title || ""), `title must not ${re}\n${ctx}`).not.toMatch(re);
  }

  if (e.price === null) {
    expect(fill.price, `price should be unset\n${ctx}`).toBeFalsy();
  } else if (e.price !== undefined) {
    expect(askingPrice(fill), `price\n${ctx}`).toBe(e.price);
  }
  if (e.rentalDaily) {
    expect(String(fill.rentalPriceDaily || fill.price || ""), `rentalDaily\n${ctx}`).toBe(e.rentalDaily);
  }
  if (e.rentalWeekly) {
    expect(String(fill.rentalPriceWeekly || fill.price || ""), `rentalWeekly\n${ctx}`).toBe(
      e.rentalWeekly
    );
  }
  if (e.noDailyRate) {
    expect(String(fill.rentalPriceDaily || ""), `no daily rate on property\n${ctx}`).toBe("");
  }
  if (e.rentalSubType) {
    expect(String(fill.rentalSubType || ""), `rentalSubType\n${ctx}`).toBe(e.rentalSubType);
  }
  if (e.rentalDeposit) {
    expect(String(fill.rentalDeposit || ""), `rentalDeposit\n${ctx}`).toBe(e.rentalDeposit);
  }
  for (const bad of e.depositNot || []) {
    expect(String(fill.rentalDeposit || ""), `deposit must not be ${bad}\n${ctx}`).not.toBe(bad);
  }
  if (e.bedrooms) {
    expect(String(fill.rentalBedrooms || ""), `bedrooms\n${ctx}`).toBe(e.bedrooms);
  }

  for (const bad of e.priceNot || []) {
    expect(String(fill.price || ""), `price must not be ${bad}\n${ctx}`).not.toBe(bad);
    expect(desc, `description must not use trap price ${bad}\n${ctx}`).not.toMatch(
      new RegExp(`(?:asking(?:\\s+price)?|price(?:\\s+is)?|\\$)\\s*${bad}\\b`, "i")
    );
  }

  if (e.locationMatch) {
    expect(`${fill.location || ""} ${desc}`, `location\n${ctx}`).toMatch(e.locationMatch);
  }
  for (const re of e.conditionNot || []) {
    expect(String(fill.condition || ""), `condition\n${ctx}`).not.toMatch(re);
  }

  const v = e.vehicle;
  if (v?.make) expect(String(fill.vehicleMake || ""), ctx).toMatch(v.make);
  if (v?.model) expect(String(fill.vehicleModel || ""), ctx).toMatch(v.model);
  if (v?.year) expect(String(fill.vehicleYear || ""), ctx).toBe(v.year);
  if (v?.odometer) expect(String(fill.vehicleOdometer || ""), ctx).toBe(v.odometer);
  if (v?.generation) {
    expect(`${fill.vehicleGeneration || ""} ${fill.vehicleModel || ""} ${fill.title || ""}`, ctx).toMatch(
      v.generation
    );
  }
  if (v?.colour) expect(String(fill.vehicleColour || ""), ctx).toMatch(v.colour);
  if (v?.transmission) expect(String(fill.vehicleTransmission || ""), ctx).toMatch(v.transmission);
  if (v?.body) expect(String(fill.vehicleBodyType || ""), ctx).toMatch(v.body);

  const extrasAndColour = `${extras} ${desc} ${fill.vehicleColour || ""}`;
  for (const re of e.extrasMust || []) {
    expect(extrasAndColour, `extras/desc/colour must ${re}\n${ctx}`).toMatch(re);
  }
  for (const re of e.extrasMustNot || []) {
    expect(extras, `extras must not ${re}\n${ctx}`).not.toMatch(re);
  }
  for (const re of e.descriptionMust || []) {
    expect(desc, `description must ${re}\n${ctx}`).toMatch(re);
  }
  for (const re of e.descriptionMustNot || []) {
    expect(desc, `description must not ${re}\n${ctx}`).not.toMatch(re);
  }
  for (const re of e.publicMust || []) {
    expect(pub, `public must ${re}\n${ctx}`).toMatch(re);
  }
  for (const re of e.publicMustNot || []) {
    expect(pub, `public must not ${re}\n${ctx}`).not.toMatch(re);
  }

  if (e.wantedNotSale) {
    expect(String(fill.listingType || ""), `Wanted≠sale type\n${ctx}`).toBe("wanted");
    expect(String(fill.title || ""), `Wanted≠sale title\n${ctx}`).not.toMatch(SALE_VOICE_RE);
    expect(desc, `Wanted≠sale description\n${ctx}`).not.toMatch(/\bfor sale\b|\bselling my\b/i);
  }

  if (e.wantedNotEducation) {
    expect(String(r.intent || ""), `Wanted≠education intent\n${ctx}`).not.toMatch(/education/i);
    expect(fill.listingType, `Wanted≠education must still fill\n${ctx}`).toBe("wanted");
    expect(String(r.reply || ""), `Wanted≠education reply\n${ctx}`).not.toMatch(EDUCATION_LECTURE_RE);
  }

  expect(containsInternalOrchestration(pub), `orchestration leak\n${ctx}`).toBe(false);
  expect(containsSellerMetaInstruction(desc), `seller instruction in description\n${ctx}`).toBe(false);
  expect(desc, ctx).not.toMatch(MARKETING_FILLER_RE);
  expect(desc, ctx).not.toMatch(GENERIC_MARKETPLACE_FILLER_RE);
  if (desc.trim().length > 20) {
    expect(hasSemanticFactDuplication(desc), `duplicate facts\n${ctx}`).toBe(false);
  }

  if (e.verifyNoPaidWas) {
    expect(desc, `paid/was leak\n${ctx}`).not.toMatch(PAID_WAS_LEAK_RE);
    expect(String(fill.title || ""), `paid/was in title\n${ctx}`).not.toMatch(PAID_WAS_LEAK_RE);
  }
  if (e.verifyNoDontPut) {
    expect(pub, `dont-put leak\n${ctx}`).not.toMatch(DONT_PUT_LEAK_RE);
  }

  if (e.noInventedVehicleDefaults) {
    const blob = JSON.stringify(fill).toLowerCase();
    if (!/\bauto(?:matic)?\b/i.test(turns.join(" "))) {
      expect(blob, ctx).not.toMatch(/"vehicletransmission":"automatic"/);
    }
    if (!/\bpetrol|diesel|hybrid|electric\b/i.test(turns.join(" "))) {
      expect(blob, ctx).not.toMatch(/"vehiclefueltype":"petrol"/);
    }
    if (!/\bsuv\b/i.test(turns.join(" "))) {
      expect(blob, ctx).not.toMatch(/"vehiclebodytype":"suv"/);
    }
    if (!/\b(brand\s*new|new condition|like new)\b/i.test(turns.join(" "))) {
      expect(String(fill.condition || ""), ctx).not.toMatch(/^New$/i);
    }
  }

  for (const re of e.defectsMustAppear || []) {
    const evidence = harvestSellerEvidence(turns.join("\n"))
      .map((item) => item.text)
      .join(" ");
    expect(`${evidence} ${extras} ${desc}`, `defect missing ${re}\n${ctx}`).toMatch(re);
  }

  for (const re of e.defectsOnce || []) {
    const n = countMatches(desc, re);
    expect(n, `defect ${re} should appear once in description, got ${n}\n${ctx}`).toBeGreaterThanOrEqual(
      1
    );
    expect(n, `defect ${re} spammed ${n} times\n${ctx}`).toBeLessThanOrEqual(2);
  }

  if (e.qualityContract && desc.trim()) {
    const contract = validateDescriptionQualityContract(desc, fill);
    expect(contract.ok, `quality ${JSON.stringify(contract)} \n${ctx}`).toBe(true);
  }
}


function registerCorpus(name: string, cases: CorpusCase[]) {
  describe(name, () => {
    beforeEach(() => {
      clearAllListingDraftCacheForTests();
    });

    for (const c of cases) {
      const attacks = Array.isArray(c.attack) ? c.attack.join("+") : c.attack;
      const failing = Boolean(c.knownFailure) || KNOWN_FAILURE_IDS.has(c.id);
      const prefix = failing ? "FAIL: " : c.knownFailure === false ? "GUARD: " : "";
      const title = `${prefix}${c.id} [${c.kind}/${attacks}]`;
      const body = () => assertCase(c);
      if (failing) it.fails(title, body);
      else it(title, body);
    }
  });
}


registerCorpus("adversarial NZ wave6 identity multi-turn corpus", WAVE6_IDENTITY);
registerCorpus("adversarial NZ wave6 contradiction / model-as-price corpus", WAVE6_CONTRADICTION);

describe("adversarial NZ wave6 — price/model traps (parseListingPriceFromMessage)", () => {
  it.fails('FAIL: "air max 90 infrared size 10 95" → 95 (90 is model)', () => {
    expect(parseListingPriceFromMessage("nike air max 90 infrared size 10 95 greymouth")).toBe("95");
  });
  // GUARD: converted from it.fails — passes on 02b6733 (W6.2/6.3 typecheck run 2026-09-28).
  it('GUARD: "gopro hero 11 black 280" → 280 (11 is model)', () => {
    expect(parseListingPriceFromMessage("gopro hero 11 black with 2 batteries 280 queenstown")).toBe("280");
  });
  it.fails('FAIL: "pixel 8 520 wellington" → 520 (8 is model)', () => {
    expect(parseListingPriceFromMessage("google pixel 8 128 obsidian wellington 520")).toBe("520");
  });
  it.fails('FAIL: "sti 50k greymouth" slang 50k asking is 50000', () => {
    expect(parseListingPriceFromMessage("subaru wrx sti 50k greymouth")).toBe("50000");
  });
});

describe("adversarial NZ wave6 — semantic correction identity", () => {
  it.fails("FAIL: nah forget pixel 7 then actually pixel 8 is identity re-change not a new listing", () => {
    const r = interpretSemanticTurn({
      message: "nah forget that it's the pixel 7 again wait actually pixel 8",
      pendingSlot: "price",
      priorAssistant: "What price are you asking?",
      canonical: { title: "Google Pixel 8", listingType: "physical" },
    });
    expect(r.facts?.some((f: { key?: string; value?: string }) => /pixel\s*8/i.test(String(f.value || f.key || ""))) || r.isCorrection).toBeTruthy();
    // Tightened 2026-09-28: isCorrection alone is not enough — model digit must not become price,
    // and the facts must carry the re-changed identity (pixel 8).
    const blob = (r.facts || []).map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(blob, "model digit 7 must not become a price fact").not.toMatch(/price:7\b/i);
    expect(blob, "facts must mention pixel 8").toMatch(/pixel\s*8/i);
  });
});

describe("adversarial NZ wave6 — Fixer Class 5/7 semantic traps", () => {
  it.fails("FAIL: semantic-nah-forget-s22-then-actually-s23 — CORRECTION, not price:23", () => {
    const r = interpretSemanticTurn({
      message: "nah forget s22 then actually wait it IS the s23 256",
      pendingSlot: "title",
      canonical: { title: "Samsung Galaxy S22", extras: ["storage:128GB"], price: "380" },
    });
    const blob = (r.facts || []).map((f: { key?: string; value?: string }) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/s23|23/i);
    expect(blob).not.toMatch(/price:23\b/i);
  });

  it.fails("FAIL: semantic-qty-correction-not-price — pending quantity not price 1/2", () => {
    const r = interpretSemanticTurn({
      message: "wait 1 battery is fine but need 2 cards",
      pendingSlot: "quantity",
      canonical: {
        title: "Canon 6D",
        listingType: "wanted",
        extras: ["included:extra battery"],
        price: "600",
      },
    });
    const blob = (r.facts || []).map((f: { key?: string; value?: string }) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/batter|card/i);
    expect(blob).not.toMatch(/price:1\b/i);
    expect(blob).not.toMatch(/price:2\b/i);
  });
});

describe("adversarial NZ wave6.3 — Class 5.6 semantic CORRECTION contracts", () => {
  const blobOf = (r: { facts?: Array<{ key?: string; value?: string }> }) =>
    (r.facts || []).map((f) => `${f.key}:${f.value}`).join(" | ");

  it.fails("FAIL: semantic-scrap-that-s22-to-s23-ultra-512 — CORRECTION, not price:512/23 [§5.6 W6.3]", () => {
    const r = interpretSemanticTurn({
      message: "scrap that, not the s22 its the s23 ultra 512",
      pendingSlot: "title",
      canonical: { title: "Samsung Galaxy S22", extras: ["storage:128GB"], price: "380" },
    });
    const blob = blobOf(r);
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/ultra|s23/i);
    expect(blob).not.toMatch(/price:(512|23)\b/i);
  });

  // GUARD: converted from it.fails — passes on 02b6733 (W6.2/6.3 typecheck run 2026-09-28).
  it("GUARD: semantic-nah-actually-oled-aye — identity CORRECTION while price pending [§5.6 W6.3]", () => {
    const r = interpretSemanticTurn({
      message: "nah actually the oled one aye",
      pendingSlot: "price",
      priorAssistant: "What price are you asking?",
      canonical: { title: "Nintendo Switch Lite", listingType: "physical", price: "180" },
    });
    const blob = blobOf(r);
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/oled/i);
    expect(blob).not.toMatch(/price:/i);
  });

  // GUARD: converted from it.fails — passes on 02b6733 (W6.2/6.3 typecheck run 2026-09-28).
  it("GUARD: semantic-wrong-ute-sr5-2018 — vehicle tuple CORRECTION, not price:2018/5 [§5.6 W6.3]", () => {
    const r = interpretSemanticTurn({
      message: "sorry wrong ute its the sr5 2018 not the 2016",
      pendingSlot: "price",
      canonical: { title: "2016 Toyota Hilux SR", listingType: "vehicle", price: "29000" },
    });
    const blob = blobOf(r);
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/sr5|2018/i);
    expect(blob).not.toMatch(/price:(2018|2016|5)\b/i);
  });

  it.fails("FAIL: semantic-cancel-change-keep-a7iv — undo is CORRECTION, not price:7/4 [§5.6 W6.3]", () => {
    const r = interpretSemanticTurn({
      message: "cancel that change, keep the a7iv",
      pendingSlot: "price",
      canonical: { title: "Sony A7C", listingType: "physical", extras: ["included:28-60 kit"] },
    });
    const blob = blobOf(r);
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/a7\s*iv|a7iv/i);
    expect(blob).not.toMatch(/price:(7|4)\b/i);
  });
});
