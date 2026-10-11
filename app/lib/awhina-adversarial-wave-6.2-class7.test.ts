/**
 * Wave 6.2 — Class 7 expander corpus (contradictions / model-as-price twins).
 * Expands WAVE6-QA-REPORT related expanders + missing Class 7 twins.
 *
 * TESTS ONLY. No production Āwhina edits. No SAFE re-score. #28 HOLD.
 * All cases knownFailure (except converted GUARD twins). They RUN in the real runTurns/assertCase harness in
 * awhina-adversarial-wave-6.test.ts (it.fails, or plain-`it` GUARD), sourced from the shared module
 * awhina-adversarial-wave-6-corpus.ts. This file is the contract INDEX: plain `it` checks that every ID exists in
 * the shared corpus with the same knownFailure flag (twins: deep-equal input/expect, RegExp by source+flags).
 * No force-fail stubs. Do NOT weaken FAIL markers.
 *
 * Fixtures are EVAL CASES ONLY — production must not hardcode these strings.
 * Locked Fixer §7.1–7.4 IDs remain in wave-6; this file adds expander twins only.
 */

import { describe, expect, it } from "vitest";
import {
  INSTRUCTION_LEAK_RE,
  KNOWN_FAILURE_IDS,
  UNDO_LEAK_RE_W62,
  findWave6CorpusCase,
  normalizeCorpusValue,
  type AttackClass,
  type CorpusExpect,
  type ListingKind,
} from "./awhina-adversarial-wave-6-corpus";

/** Index copy of a shared corpus case, plus the twin reference. */
type CorpusCase = {
  id: string;
  kind: ListingKind;
  attack: AttackClass | AttackClass[];
  likelySubsystem: string;
  /** true = expected-fail contract; false = converted to regression guard in main harness. */
  knownFailure: boolean;
  twinOf: string;
  input: string | string[];
  expect: CorpusExpect;
};

/** Report expanders already in wave-6 (reference IDs — must remain it.fails). */
export const WAVE62_REPORT_EXPANDERS = [
  "physical-iphone15-contradiction-one-shot",
  "physical-macbook-m2-storage-flip-one-shot",
  "physical-storage-colour-flipflops-pixel8",
  "physical-storage-only-followup-not-price",
  "physical-series-x-1tb-colour-flip",
  "physical-colour-flip-keeps-1tb-without-repeat",
  "physical-air-max-90-asking-not-model",
  // "physical-gopro-11-asking-not-model" — converted to regression guard in main harness, W6.2/6.3 typecheck run 2026-09-28
  "physical-jordan-1-size-11-asking-not-size",
  "physical-last-confirmed-storage-wins-s24",
  "vehicle-sti-50k-slang-asking",
  "physical-brand-new-but-smashed-pixel",
  "physical-like-new-then-hairline-condition-conservative",
  "physical-battery-health-not-price-iphone13",
  "physical-qty-correction-not-price",
] as const;

/** New Class 7 twins (Wave 6.2). */
export const WAVE62_CLASS7_TWINS: CorpusCase[] = [
  {
    id: "physical-s24-ultra-contradiction-one-shot",
    kind: "physical",
    attack: ["contradictory", "faults_with_positive_condition", "model_as_price"],
    likelySubsystem: "listing-facts merge / §7.1 twin",
    knownFailure: true,
    twinOf: "physical-s23-ultra-contradiction-one-shot",
    input:
      "samsung s24 ultra 256gb wait no 512 black actually violet like new battery 89 screen hairline though gisborne 1050",
    expect: {
      listingType: "physical",
      titleMatch: /s24|ultra|samsung/i,
      titleNot: [/wait no|actually|like new/i],
      price: "1050",
      priceNot: ["24", "256", "512", "89"],
      locationMatch: /gisborne/i,
      extrasMust: [/512/i, /violet|purple/i, /89|battery/i, /hairline|crack|scratch/i],
      extrasMustNot: [/\b256\s*gb\b/i, /\bblack\b/i],
      conditionNot: [/like\s*new|brand\s*new|^new$/i],
      defectsMustAppear: [/hairline|crack|scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-pixel8-pro-contradiction-one-shot",
    kind: "physical",
    attack: ["contradictory", "faults_with_positive_condition", "model_as_price", "nz_place_slang"],
    likelySubsystem: "listing-facts merge / §7.1 twin",
    knownFailure: true,
    twinOf: "physical-iphone15-contradiction-one-shot",
    input:
      "google pixel 8 pro 128gb wait no 256 obsidian actually porcelain mint battery 92 cracked glass though blenheim 720",
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8|google/i,
      titleNot: [/wait no|actually|\bmint\b/i],
      price: "720",
      priceNot: ["8", "128", "256", "92"],
      locationMatch: /blenheim/i,
      extrasMust: [/256/i, /porcelain|cream|white/i, /92|battery/i, /crack/i],
      extrasMustNot: [/\b128\s*gb\b/i, /obsidian/i],
      conditionNot: [/mint|like\s*new|brand\s*new|^new$/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-storage-colour-flipflops-iphone14",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / §7.2 twin",
    knownFailure: true,
    twinOf: "physical-storage-colour-flipflops-s23",
    input: [
      "selling iphone 14 128 midnight wellington 650",
      "actually 256",
      "wait no 512 and starlight not midnight",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /iphone\s*14/i,
      price: "650",
      priceNot: ["14", "128", "256", "512"],
      extrasMust: [/512/i, /starlight|white|cream/i],
      extrasMustNot: [/\b128\s*gb\b/i, /\b256\s*gb\b/i, /midnight|black/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-storage-only-followup-not-price-a54",
    kind: "physical",
    attack: ["followup_correction", "model_as_price", "nz_place_slang"],
    likelySubsystem: "authority / E7.6 twin",
    knownFailure: true,
    twinOf: "physical-storage-only-followup-not-price",
    input: ["selling samsung galaxy a54 128 awesome black oamaru 290", "actually 256"],
    expect: {
      listingType: "physical",
      titleMatch: /a54|galaxy|samsung/i,
      price: "290",
      priceNot: ["256", "128", "54"],
      locationMatch: /oamaru/i,
      extrasMust: [/256/i],
      extrasMustNot: [/\b128\s*gb\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-ps5-digital-1tb-colour-flip",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / §7.3 twin",
    knownFailure: true,
    twinOf: "physical-series-s-1tb-colour-flip",
    input: ["ps5 digital 825 white hamilton 480", "wait no 1tb white actually black 450"],
    expect: {
      listingType: "physical",
      titleMatch: /ps5|playstation|digital/i,
      price: "450",
      priceNot: ["480", "1", "825", "5"],
      locationMatch: /hamilton/i,
      extrasMust: [/1\s*tb|1000/i, /black/i],
      extrasMustNot: [/\b825\b/i, /\bwhite\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-colour-flip-keeps-512-without-repeat-s23",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / E7.7 twin",
    knownFailure: false, // converted to regression guard in main harness, W6.2/6.3 typecheck run 2026-09-28
    twinOf: "physical-colour-flip-keeps-1tb-without-repeat",
    input: ["samsung s23 512 cream napier 510", "wait no cream actually green 490"],
    expect: {
      listingType: "physical",
      titleMatch: /s23|samsung|galaxy/i,
      price: "490",
      priceNot: ["510", "23", "512"],
      locationMatch: /napier/i,
      extrasMust: [/512/i, /green/i],
      extrasMustNot: [/\bcream\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-yeezy-350-size-10-asking-not-model",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang"],
    likelySubsystem: "price extract / §7.4 E7.5 twin",
    knownFailure: true,
    twinOf: "physical-air-max-90-infrared-not-price",
    input: "yeezy boost 350 v2 zebra size 10 220 new plymouth scuffed sole",
    expect: {
      listingType: "physical",
      titleMatch: /yeezy|350|zebra/i,
      price: "220",
      priceNot: ["350", "2", "10"],
      locationMatch: /new plymouth|plymouth/i,
      extrasMust: [/size\s*10|10/i, /scuff/i],
      defectsMustAppear: [/scuff/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-hero12-asking-not-model",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang", "accessories_quantities"],
    likelySubsystem: "price extract / §7.4 twin",
    knownFailure: true,
    twinOf: "physical-gopro-11-asking-not-model",
    input: "gopro hero 12 black with 3 batteries 340 wanaka scratched lens",
    expect: {
      listingType: "physical",
      titleMatch: /gopro|hero\s*12/i,
      price: "340",
      priceNot: ["12", "3"],
      locationMatch: /wanaka/i,
      extrasMust: [/batter/i, /scratch/i],
      defectsMustAppear: [/scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-excellent-then-dent-condition-conservative",
    kind: "physical",
    attack: ["faults_with_positive_condition", "contradictory", "nz_place_slang"],
    likelySubsystem: "condition authority / E7.2 twin",
    knownFailure: true,
    twinOf: "physical-like-new-then-hairline-condition-conservative",
    input:
      "excellent condition ipad pro 11 256 space grey but dented corner tho whakatane 780",
    expect: {
      listingType: "physical",
      titleMatch: /ipad|pro/i,
      price: "780",
      priceNot: ["11", "256"],
      locationMatch: /whakatane/i,
      extrasMust: [/256/i, /dent/i],
      conditionNot: [/excellent|like\s*new|brand\s*new|^new$/i],
      defectsMustAppear: [/dent/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-battery-health-not-price-pixel8",
    kind: "physical",
    attack: ["model_as_price", "faults_with_positive_condition", "nz_place_slang"],
    likelySubsystem: "price extract / E7.3 twin",
    knownFailure: true,
    twinOf: "physical-battery-health-not-price-iphone13",
    input: "pixel 8 128 obsidian battery 86 good nick masterton 480 screen scratch",
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8/i,
      price: "480",
      priceNot: ["8", "128", "86"],
      locationMatch: /masterton/i,
      extrasMust: [/86|battery/i, /scratch/i],
      defectsMustAppear: [/scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "physical-qty-correction-not-price-batteries",
    kind: "physical",
    attack: ["followup_correction", "accessories_quantities", "model_as_price"],
    likelySubsystem: "authority / E7.4 twin",
    knownFailure: true,
    twinOf: "physical-qty-correction-not-price",
    input: [
      "selling canon r6 with 2 batteries 3 cards ashburton 1450",
      "wait 1 battery is fine but need 2 cards only",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /canon|r6/i,
      price: "1450",
      priceNot: ["1", "2", "3", "6"],
      locationMatch: /ashburton/i,
      extrasMust: [/batter/i, /card/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
  {
    id: "vehicle-wrx-40k-slang-asking",
    kind: "vehicle",
    attack: ["model_as_price", "nz_place_slang", "slang_typos"],
    likelySubsystem: "price extract / §7.4 vehicle twin",
    knownFailure: true,
    twinOf: "vehicle-sti-50k-slang-asking",
    input: "selling my subaru wrx 40k timaru 2018 95k kays cracked bumper",
    expect: {
      listingType: "vehicle",
      titleMatch: /subaru|wrx/i,
      price: "40000",
      priceNot: ["2018", "95", "40"],
      locationMatch: /timaru/i,
      vehicle: { make: /subaru/i, model: /wrx/i, year: "2018", odometer: "95000" },
      defectsMustAppear: [/crack|bumper/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W62],
    },
  },
];

describe("Wave 6.2 Class 7 — report expander index checks against the shared corpus (must PASS)", () => {
  // Real execution: each ID runs as a real-harness it.fails in awhina-adversarial-wave-6.test.ts.
  for (const id of WAVE62_REPORT_EXPANDERS) {
    it(`INDEX: report expander ${id} is in the shared corpus as knownFailure`, () => {
      const shared = findWave6CorpusCase(id);
      expect(shared, `${id} missing from awhina-adversarial-wave-6-corpus.ts`).toBeDefined();
      expect(shared?.knownFailure, `${id} knownFailure flag drifted`).toBe(true);
      expect(KNOWN_FAILURE_IDS.has(id), `${id} must register as it.fails in the main harness`).toBe(true);
    });
  }
});

describe("Wave 6.2 Class 7 — expander twin index checks against the shared corpus (must PASS)", () => {
  for (const c of WAVE62_CLASS7_TWINS) {
    const mode = c.knownFailure ? "knownFailure (it.fails)" : "converted GUARD (plain it)";
    it(`INDEX: ${c.id} is in the shared corpus as ${mode} with identical input+expect [twinOf=${c.twinOf}]`, () => {
      const shared = findWave6CorpusCase(c.id);
      expect(shared, `${c.id} missing from awhina-adversarial-wave-6-corpus.ts`).toBeDefined();
      expect(shared?.knownFailure, `${c.id} knownFailure flag drifted`).toBe(c.knownFailure);
      expect(KNOWN_FAILURE_IDS.has(c.id), `${c.id} it/it.fails registration drifted`).toBe(c.knownFailure);
      expect(shared?.kind).toBe(c.kind);
      expect(normalizeCorpusValue(shared?.input), `${c.id} input drifted`).toEqual(normalizeCorpusValue(c.input));
      expect(normalizeCorpusValue(shared?.expect), `${c.id} expect drifted`).toEqual(normalizeCorpusValue(c.expect));
    });
  }
});

describe("Wave 6.2 Class 7 — guard conversion hygiene (must PASS)", () => {
  it("physical-gopro-11-asking-not-model is no longer locked as an expected-fail report expander", () => {
    expect((WAVE62_REPORT_EXPANDERS as readonly string[]).includes("physical-gopro-11-asking-not-model")).toBe(false);
  });
  it("only physical-colour-flip-keeps-512-without-repeat-s23 is converted among the twins", () => {
    const converted = WAVE62_CLASS7_TWINS.filter((c) => c.knownFailure === false).map((c) => c.id);
    expect(converted).toEqual(["physical-colour-flip-keeps-512-without-repeat-s23"]);
  });
});
