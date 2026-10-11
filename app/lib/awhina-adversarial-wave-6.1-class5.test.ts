/**
 * Wave 6.1 — Class 5 adversarial test contracts (identity-wipe / undo-rechange).
 * Aligns to Fixer awhina-class-5-7-production-pass-designs.md §5.1–5.7 + E5.
 *
 * TESTS ONLY. No production Āwhina edits. No SAFE re-score. #28 HOLD. No CloudAgent.
 * All corpus cases are knownFailure. They RUN as real-harness it.fails in awhina-adversarial-wave-6.test.ts
 * (registerCorpus → runTurns/assertCase), sourced from the shared module awhina-adversarial-wave-6-corpus.ts.
 * This file is the contract INDEX: plain `it` checks that every ID below exists in the shared corpus with the
 * same knownFailure flag and a deep-equal input/expect (RegExp compared by source+flags). No force-fail stubs.
 *
 * Fixtures are EVAL CASES ONLY — production must not hardcode these strings.
 * See WAVE6.1-CLASS5-TEST-CONTRACTS.md for UNDERSTAND→STRUCTURE→VERIFY→WRITE gates.
 */

import { describe, expect, it } from "vitest";
import { interpretSemanticTurn } from "./awhina-semantic-intent";
import {
  INSTRUCTION_LEAK_RE,
  KNOWN_FAILURE_IDS,
  UNDO_LEAK_RE_W61,
  findWave6CorpusCase,
  normalizeCorpusValue,
  type AttackClass,
  type CorpusExpect,
  type ListingKind,
} from "./awhina-adversarial-wave-6-corpus";

/** Index copy of a shared corpus case, plus the Fixer design reference. */
type CorpusCase = {
  id: string;
  kind: ListingKind;
  attack: AttackClass | AttackClass[];
  likelySubsystem: string;
  knownFailure: true;
  fixerRef: string;
  input: string | string[];
  expect: CorpusExpect;
};

/**
 * Fixer-locked Class 5 IDs — turn scripts match designs §5.1–5.5 / §5.7.
 * Keep knownFailure until production converts.
 */
export const WAVE61_CLASS5_LOCKED: CorpusCase[] = [
  {
    id: "multi8-identity-change-undo-rechange-s22",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority",
    knownFailure: true,
    fixerRef: "§5.1",
    input: [
      "selling samsung galaxy s22 128gb black levin 380",
      "wait no it's an s23 256 green make it 520",
      "nah forget that it's the s22 128 black again 380",
      "actually wait it IS the s23 256",
      "make it 490 not 520",
      "and cracked screen tho",
      "comes with 2 chargers",
      "pickup porirua not cbd",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /s23|galaxy/i,
      titleNot: [/\bs22\b/i, /wait no|forget|actually wait|^and cracked/i],
      price: "490",
      priceNot: ["380", "520", "22", "23", "128", "256"],
      locationMatch: /porirua/i,
      extrasMust: [/256/i, /green/i, /crack/i, /charger/i],
      extrasMustNot: [/\b128\s*gb\b/i, /\bs22\b/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
    },
  },
  {
    id: "multi6-switch-lite-oled-undo-rechange",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    fixerRef: "§5.2",
    input: [
      "selling nintendo switch lite coral greymouth 180",
      "wait nah it's the oled white 320",
      "forget that it's the lite coral 180",
      "nah it is the oled white",
      "make it 300 firm",
      "scratched kickstand tho",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /switch|oled/i,
      titleNot: [/lite|forget|wait nah/i],
      price: "300",
      priceNot: ["180", "320"],
      locationMatch: /greymouth/i,
      extrasMust: [/scratch/i, /white/i],
      extrasMustNot: [/lite/i],
      defectsMustAppear: [/scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
    },
  },
  {
    id: "multi7-civic-type-r-accord-undo",
    kind: "vehicle",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    fixerRef: "§5.3",
    input: [
      "selling 2018 honda civic type r 70k kays whanganui 28000",
      "wait nah it's a 2016 accord",
      "forget that it's the type r 2018 70k 28000",
      "nah it is the accord 2016 110k",
      "rust on arch tho",
      "make it 11500 firm",
      "still whanganui pickup",
    ],
    expect: {
      listingType: "vehicle",
      titleMatch: /accord/i,
      titleNot: [/type\s*r|civic|forget|wait nah/i],
      price: "11500",
      priceNot: ["28000", "2018", "2016", "70", "110"],
      locationMatch: /whanganui/i,
      vehicle: { make: /honda/i, model: /accord/i, year: "2016", odometer: "110000" },
      extrasMustNot: [/type\s*r/i],
      defectsMustAppear: [/rust/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
      noInventedVehicleDefaults: true,
    },
  },
  {
    id: "multi8-pending-slot-must-not-eat-a7iv",
    kind: "physical",
    attack: ["pending_slot_trap", "mid_conversation_change", "followup_correction", "model_as_price", "seller_commands"],
    likelySubsystem: "pending-slots / draft-transition / authority",
    knownFailure: true,
    fixerRef: "§5.4",
    input: [
      "selling sony a7iii kerikeri",
      "wait it's a7iv 24-70 not a7iii",
      "1800",
      "black body",
      "scratched hotshoe tho",
      "pickup lower hutt actually",
      "dont put a7iii in the ad",
      "nah still 1800 firm",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /sony|a7\s*iv|a7iv/i,
      titleNot: [/a7iii|a7 iii|dont put/i],
      price: "1800",
      priceNot: ["3", "4", "7", "24", "70"],
      locationMatch: /hutt|lower/i,
      extrasMust: [/scratch/i],
      extrasMustNot: [/a7iii/i],
      descriptionMustNot: [/dont put a7iii/i],
      defectsMustAppear: [/scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
      verifyNoDontPut: true,
    },
  },
  {
    id: "multi4-followup-crack-must-not-wipe-s23",
    kind: "physical",
    attack: ["followup_correction", "faults_with_positive_condition"],
    likelySubsystem: "draft-transition / pending-slots",
    knownFailure: true,
    fixerRef: "§5.5",
    input: [
      "selling samsung galaxy s23 256gb green levin 490",
      "wait no 512 actually cream",
      "and cracked screen tho",
      "pickup still levin",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /s23|galaxy|samsung/i,
      titleNot: [/^and cracked/i, /wait no/i],
      price: "490",
      priceNot: ["23", "256", "512"],
      locationMatch: /levin/i,
      extrasMust: [/512/i, /cream|white/i, /crack/i],
      extrasMustNot: [/\b256\s*gb\b/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
    },
  },
  {
    id: "multi8-identity-change-undo-rechange-pixel",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority",
    knownFailure: true,
    fixerRef: "§5.7 / E5.1",
    input: [
      "selling google pixel 7 128 black napier 420",
      "wait nah it's a pixel 8 pro 256 porcelain 580",
      "nah forget that keep the pixel 7",
      "actually it IS the pixel 8 pro 256",
      "make it 560 firm",
      "hairline crack on corner tho",
      "comes with official charger",
      "pickup hastings not napier",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8/i,
      titleNot: [/\bpixel\s*7\b/i, /forget|wait nah/i],
      price: "560",
      priceNot: ["420", "580", "7", "8", "128", "256"],
      locationMatch: /hastings/i,
      extrasMust: [/256/i, /porcelain|cream|white/i, /crack/i],
      extrasMustNot: [/\bpixel\s*7\b/i, /\b128\s*gb\b/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
    },
  },
];

/** E5 expanders — same Class 5 rules; do not replace locked IDs. */
export const WAVE61_CLASS5_E5: CorpusCase[] = [
  {
    id: "multi8-undo-undo-affirm-pixel-family",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang"],
    likelySubsystem: "draft-transition / E5.2 last-affirm",
    knownFailure: true,
    fixerRef: "E5.2",
    input: [
      "selling pixel 7a 128 charcoal rotorua 310",
      "wait it's pixel 8 128 obsidian 480",
      "nah forget keep 7a",
      "forget that go back to pixel 8",
      "it IS the pixel 8 128 obsidian",
      "450 firm",
      "scuffed frame tho",
      "pickup ngongotaha",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8/i,
      titleNot: [/7a|forget|wait it's/i],
      price: "450",
      priceNot: ["310", "480", "7", "8", "128"],
      locationMatch: /ngongotaha|rotorua/i,
      extrasMust: [/128/i, /obsidian|black/i, /scuff/i],
      extrasMustNot: [/7a/i, /charcoal/i],
      defectsMustAppear: [/scuff/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
    },
  },
  {
    id: "multi1-same-turn-s23-bundle-correction",
    kind: "physical",
    attack: ["mid_conversation_change", "model_as_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / E5.3 same-turn bundle",
    knownFailure: true,
    fixerRef: "E5.3",
    input: "selling samsung s22 128 black palmy 380 wait no it's an s23 256 green make it 520",
    expect: {
      listingType: "physical",
      titleMatch: /s23|galaxy|samsung/i,
      titleNot: [/\bs22\b/i, /wait no/i],
      price: "520",
      priceNot: ["380", "22", "23", "128", "256"],
      locationMatch: /palmerston|palmy/i,
      extrasMust: [/256/i, /green/i],
      extrasMustNot: [/\bs22\b/i, /\b128\s*gb\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
    },
  },
  {
    id: "multi5-instruction-during-a7iv-repair",
    kind: "physical",
    attack: ["seller_commands", "mid_conversation_change", "pending_slot_trap", "model_as_price"],
    likelySubsystem: "authority / E5.5 instruction during repair",
    knownFailure: true,
    fixerRef: "E5.5",
    input: [
      "selling sony a7iii wellington",
      "wait a7iv body only 1650",
      "dont put a7iii in the ad",
      "scuffed baseplate tho",
      "still wellington",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /a7\s*iv|a7iv|sony/i,
      titleNot: [/a7iii|dont put/i],
      price: "1650",
      priceNot: ["3", "4", "7"],
      locationMatch: /wellington/i,
      extrasMust: [/scuff/i],
      extrasMustNot: [/a7iii/i],
      defectsMustAppear: [/scuff/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
      verifyNoDontPut: true,
    },
  },
  {
    id: "multi6-location-price-firm-after-identity-settle",
    kind: "physical",
    attack: ["followup_correction", "nz_place_slang", "mid_conversation_change"],
    likelySubsystem: "authority / E5.7 slot PATCH only",
    knownFailure: true,
    fixerRef: "E5.7",
    input: [
      "selling garmin fenix 7 solar slate nelson 520",
      "wait no fenix 7x solar black 680",
      "nah still 650 firm",
      "pickup richmond not nelson",
      "scratched bezel tho",
      "dont change the model again",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /fenix\s*7x|garmin/i,
      titleNot: [/fenix\s*7\b(?!x)|dont change|wait no/i],
      price: "650",
      priceNot: ["520", "680", "7"],
      locationMatch: /richmond/i,
      extrasMust: [/scratch|bezel/i, /black|solar/i],
      extrasMustNot: [/fenix\s*7\b(?!x)/i],
      defectsMustAppear: [/scratch|bezel/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
    },
  },
  {
    id: "multi7-demio-to-axela-tuple-atomic",
    kind: "vehicle",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang"],
    likelySubsystem: "listing-identity-conflict / E5.6 vehicle tuple",
    knownFailure: true,
    fixerRef: "E5.6",
    input: [
      "selling 2012 mazda demio 98k kays invercargill 6500",
      "wait nah it's a 2014 axela 120k",
      "forget that keep the demio 2012 98k 6500",
      "nah it IS the axela 2014 120k",
      "rust on sill tho",
      "make it 7200",
      "still invercargill",
    ],
    expect: {
      listingType: "vehicle",
      titleMatch: /axela|mazda/i,
      titleNot: [/demio|forget|wait nah/i],
      price: "7200",
      priceNot: ["6500", "2012", "2014", "98", "120"],
      locationMatch: /invercargill/i,
      vehicle: { make: /mazda/i, model: /axela/i, year: "2014", odometer: "120000" },
      extrasMustNot: [/demio/i],
      defectsMustAppear: [/rust/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
    },
  },
];

export const WAVE61_CLASS5_ALL = [...WAVE61_CLASS5_LOCKED, ...WAVE61_CLASS5_E5];

/**
 * Semantic §5.6/§5.7 — unit-level against the REAL interpretSemanticTurn.
 * Rewired 2026-09-28 (was a hard-coded `const blob = "price:23"` placeholder that could never pass).
 * Inputs + assertions mirror the main-harness twins in awhina-adversarial-wave-6.test.ts
 * ("Fixer Class 5/7 semantic traps" s22→s23, and the tightened "semantic correction identity" pixel 7→8).
 * it.fails status follows main (where the PR lands); on #28 + Fixer 0000–0003 both pass.
 */
const factBlob = (r: { facts?: Array<{ key?: string; value?: string }> }) =>
  (r.facts || []).map((f) => `${f.key}:${f.value}`).join(" | ");

describe("Wave 6.1 Class 5 — Fixer semantic §5.6 (contracts)", () => {
  it.fails("FAIL: semantic-nah-forget-s22-then-actually-s23 — CORRECTION, not price:23 [§5.6]", () => {
    // Contract: primary=CORRECTION; facts include s23/storage; must not emit price:23.
    const r = interpretSemanticTurn({
      message: "nah forget s22 then actually wait it IS the s23 256",
      pendingSlot: "title",
      canonical: { title: "Samsung Galaxy S22", extras: ["storage:128GB"], price: "380" },
    });
    const blob = factBlob(r);
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/s23|23/i);
    expect(blob).not.toMatch(/price:23\b/i);
  });

  it.fails("FAIL: semantic-nah-forget-pixel7-then-actually-8pro — identity re-change [§5.7]", () => {
    // Contract (main-harness twin, tightened): identity re-change, not a new listing and not a price.
    // The main twin re-changes to "pixel 8"; the ID keeps its original "8pro" name for traceability.
    const r = interpretSemanticTurn({
      message: "nah forget that it's the pixel 7 again wait actually pixel 8",
      pendingSlot: "price",
      priorAssistant: "What price are you asking?",
      canonical: { title: "Google Pixel 8", listingType: "physical" },
    });
    const blob = factBlob(r);
    expect(
      r.facts?.some((f: { key?: string; value?: string }) => /pixel\s*8/i.test(String(f.value || f.key || ""))) ||
        r.isCorrection
    ).toBeTruthy();
    expect(blob, "model digit 7 must not become a price fact").not.toMatch(/price:7\b/i);
    expect(blob, "facts must mention pixel 8").toMatch(/pixel\s*8/i);
  });
});

describe("Wave 6.1 Class 5 — locked + E5 index checks against the shared corpus (must PASS)", () => {
  // Real execution: each ID runs as a real-harness it.fails in awhina-adversarial-wave-6.test.ts.
  for (const c of WAVE61_CLASS5_ALL) {
    it(`INDEX: ${c.id} is in the shared corpus as knownFailure with identical input+expect [${c.fixerRef}]`, () => {
      const shared = findWave6CorpusCase(c.id);
      expect(shared, `${c.id} missing from awhina-adversarial-wave-6-corpus.ts`).toBeDefined();
      expect(shared?.knownFailure, `${c.id} knownFailure flag drifted`).toBe(c.knownFailure);
      expect(KNOWN_FAILURE_IDS.has(c.id), `${c.id} must register as it.fails in the main harness`).toBe(true);
      expect(shared?.kind).toBe(c.kind);
      expect(normalizeCorpusValue(shared?.input), `${c.id} input drifted`).toEqual(normalizeCorpusValue(c.input));
      expect(normalizeCorpusValue(shared?.expect), `${c.id} expect drifted`).toEqual(normalizeCorpusValue(c.expect));
    });
  }
});
