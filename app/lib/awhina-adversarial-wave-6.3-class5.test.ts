/**
 * Wave 6.3 — Class 5.2–5.7 deeper adversarial contracts (identity-wipe / undo / pending-slot / defect follow-up).
 * Goes beyond Wave 6.1 (locked IDs + E5 expanders) and Wave 6.2 (Class 7 twins).
 *
 * TESTS ONLY. No production Āwhina or Fixer edits. No SAFE claim. #28 HOLD. No CloudAgent.
 * All cases knownFailure. The SAME 12 cases live in WAVE6_IDENTITY in the shared module
 * awhina-adversarial-wave-6-corpus.ts and RUN as real-harness it.fails in awhina-adversarial-wave-6.test.ts
 * (registerCorpus → runTurns/assertCase). This file is the contract INDEX: plain `it` checks that every ID
 * exists in the shared corpus with the same knownFailure flag and a deep-equal input/expect (RegExp compared
 * by source+flags). No force-fail stubs.
 *
 * Fixtures are EVAL CASES ONLY — production must not hardcode these strings.
 * pendingSlot uses ListingMissingSlot values only ("price" | "title" | "quantity"); never "extras".
 */

import { describe, expect, it } from "vitest";
import {
  INSTRUCTION_LEAK_RE,
  KNOWN_FAILURE_IDS,
  UNDO_LEAK_RE_W63,
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

export const WAVE63_CLASS5: CorpusCase[] = [
  {
    id: "multi6-xbox-series-s-x-undo-rechange",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    fixerRef: "§5.2 (Wave 6.3)",
    input: [
      "selling xbox series s 512 white napier 350",
      "nah its the series x black 1tb 600",
      "forget that its the series s 350",
      "nah it is the x",
      "550 ono",
      "controller drift on one pad tho",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /series\s*x/i,
      titleNot: [/series\s*s\b|forget|nah/i],
      price: "550",
      priceNot: ["350", "600", "512", "1"],
      locationMatch: /napier/i,
      extrasMust: [/1\s*tb/i, /black/i, /drift/i],
      extrasMustNot: [/512/i, /white/i],
      defectsMustAppear: [/drift/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
  {
    id: "multi6-airpods-pro2-pro1-undo-rechange",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    fixerRef: "§5.2 (Wave 6.3)",
    input: [
      "airpods pro 2 usb-c tauranga 280",
      "wait nah pro 1 lightning 150",
      "forget that its the pro 2",
      "make it 260",
      "left bud crackles",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /airpods\s*pro\s*(2|\(2nd)|2nd\s*gen/i,
      titleNot: [/forget|wait nah|lightning/i],
      price: "260",
      priceNot: ["280", "150", "2", "1"],
      locationMatch: /tauranga/i,
      extrasMust: [/usb-?c/i],
      extrasMustNot: [/lightning/i],
      defectsMustAppear: [/crackl/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
  {
    id: "multi7-hilux-sr5-sr-undo-tuple",
    kind: "vehicle",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang", "model_as_price"],
    likelySubsystem: "draft-transition / vehicle tuple atomicity",
    knownFailure: true,
    fixerRef: "§5.3 (Wave 6.3)",
    input: [
      "2018 toyota hilux sr5 4wd 145k whangarei 42k",
      "nah sorry its the 2016 sr 2wd 190k 29k",
      "forget that its the 2018 sr5",
      "40k firm",
      "wof til march, towbar",
    ],
    expect: {
      listingType: "vehicle",
      titleMatch: /hilux/i,
      titleNot: [/forget|nah sorry/i],
      price: "40000",
      priceNot: ["42000", "29000", "2018", "2016", "5", "145000", "190000"],
      locationMatch: /whang[aā]rei/i,
      vehicle: { make: /toyota/i, model: /hilux/i, year: "2018", odometer: "145000" },
      extrasMust: [/4wd|4x4/i, /tow\s*bar/i],
      extrasMustNot: [/2wd/i, /190/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
      noInventedVehicleDefaults: true,
    },
  },
  {
    id: "multi7-aqua-prius-aqua-tuple-atomic",
    kind: "vehicle",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang"],
    likelySubsystem: "draft-transition / vehicle tuple atomicity",
    knownFailure: true,
    fixerRef: "§5.3 (Wave 6.3)",
    input: [
      "2014 toyota aqua 88k palmy 11500",
      "nah actually 2012 prius 120k 13k",
      "no scrap that the aqua",
      "11k ono",
      "small dent rear bumper",
    ],
    expect: {
      listingType: "vehicle",
      titleMatch: /aqua/i,
      titleNot: [/prius|scrap that|nah actually/i],
      price: "11000",
      priceNot: ["11500", "13000", "2012", "2014", "88000", "120000"],
      locationMatch: /palm(y|erston north)/i,
      vehicle: { make: /toyota/i, model: /aqua/i, year: "2014", odometer: "88000" },
      extrasMustNot: [/prius/i, /120/i],
      defectsMustAppear: [/dent/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
      noInventedVehicleDefaults: true,
    },
  },
  {
    id: "multi8-pending-price-must-not-eat-z6ii",
    kind: "physical",
    attack: ["pending_slot_trap", "model_as_price", "followup_correction"],
    likelySubsystem: "pending-slots / price parse authority",
    knownFailure: true,
    fixerRef: "§5.4 (Wave 6.3)",
    input: [
      "nikon z6 body only 24k shutter christchurch",
      "oh sorry its the z6ii not z6, 1850",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /z\s*6\s*ii|z6\s*(mark\s*)?(2|ii)/i,
      titleNot: [/oh sorry/i],
      price: "1850",
      priceNot: ["6", "2", "24", "24000"],
      locationMatch: /christchurch|chch/i,
      extrasMust: [/shutter/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
  {
    id: "multi8-pending-price-must-not-eat-m50ii",
    kind: "physical",
    attack: ["pending_slot_trap", "model_as_price"],
    likelySubsystem: "pending-slots / price parse authority",
    knownFailure: true,
    fixerRef: "§5.4 (Wave 6.3)",
    input: [
      "canon m50 mark ii kit lens hamilton",
      "the m50 ii with 15-45, 650 cash",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /m50/i,
      price: "650",
      priceNot: ["50", "2", "15", "45"],
      locationMatch: /hamilton/i,
      extrasMust: [/15\s*-\s*45/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
  {
    id: "multi8-pending-title-must-not-eat-r5-price",
    kind: "physical",
    attack: ["pending_slot_trap", "model_as_price"],
    likelySubsystem: "pending-slots / title slot vs price authority",
    knownFailure: true,
    fixerRef: "§5.4 (Wave 6.3)",
    input: [
      "selling camera body 3200 dunedin",
      "r5 but only 8k shots, canon",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /canon.*r5|eos\s*r5|\br5\b/i,
      price: "3200",
      priceNot: ["5", "8", "8000"],
      locationMatch: /dunedin/i,
      extrasMust: [/8k|8,?000/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
  {
    id: "multi4-followup-plus-dead-pixel-must-not-wipe-ipad",
    kind: "physical",
    attack: ["followup_correction", "faults_with_positive_condition"],
    likelySubsystem: "draft-transition / defect-only follow-up merge",
    knownFailure: true,
    fixerRef: "§5.5 (Wave 6.3)",
    input: [
      "ipad air 5 64gb wifi blue nelson 650",
      "plus a dead pixel top corner",
      "also the charger's not og",
      "600",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /ipad\s*air/i,
      titleNot: [/dead pixel|plus|charger/i],
      price: "600",
      priceNot: ["650", "5", "64"],
      locationMatch: /nelson/i,
      extrasMust: [/64/i, /blue/i],
      conditionNot: [/^New$/i, /like new/i],
      defectsMustAppear: [/dead\s*pixel/i, /charger|not\s*(og|original)/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
  {
    id: "multi4-bare-np-defect-tho-must-not-wipe-ps5",
    kind: "physical",
    attack: ["followup_correction", "faults_with_positive_condition", "extremely_short"],
    likelySubsystem: "draft-transition / defect-only follow-up merge",
    knownFailure: true,
    fixerRef: "§5.5 (Wave 6.3)",
    input: [
      "ps5 disc 825gb invercargill 520",
      "sticky r2 tho",
      "and a scuff on the side",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /ps5|playstation\s*5/i,
      titleNot: [/sticky|scuff/i],
      price: "520",
      priceNot: ["5", "2", "825"],
      locationMatch: /invercargill/i,
      extrasMust: [/825|disc/i],
      defectsMustAppear: [/sticky/i, /scuff/i],
      defectsOnce: [/scuff/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
  {
    id: "multi8-identity-change-undo-rechange-iphone15-promax",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    fixerRef: "§5.7 (Wave 6.3)",
    input: [
      "iphone 15 pro 256 natural titanium lower hutt 1350",
      "nah its the 15 pro max 512 blue 1650",
      "forget that, the pro 256",
      "nah actually pro max",
      "1600 firm",
      "tiny chip on camera ring",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /pro\s*max/i,
      titleNot: [/forget|nah/i],
      price: "1600",
      priceNot: ["1350", "1650", "15", "256", "512"],
      locationMatch: /lower\s*hutt/i,
      extrasMust: [/512/i, /blue/i],
      extrasMustNot: [/natural/i, /\b256\b/i],
      defectsMustAppear: [/chip/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
  {
    id: "multi8-family-rechange-a54-s23fe-back",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    fixerRef: "§5.7 (Wave 6.3)",
    input: [
      "samsung a54 128 lime rotorua 330",
      "wait its the s23 fe 256 mint 520",
      "nah back to the a54",
      "300 ono",
      "screen protector cracked not the screen",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /a54/i,
      titleNot: [/s23|\bfe\b|nah back/i],
      price: "300",
      priceNot: ["330", "520", "54", "23", "128", "256"],
      locationMatch: /rotorua/i,
      extrasMust: [/128/i, /lime/i],
      extrasMustNot: [/256/i, /mint/i],
      defectsMustAppear: [/protector/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
  {
    id: "multi8-pixel-family-8a-8pro-undo-affirm",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    fixerRef: "§5.7 (Wave 6.3)",
    input: [
      "pixel 8a 128 bay blue hastings 480",
      "actually 8 pro 256 obsidian 850",
      "nah undo that",
      "yep definitely the 8a",
      "450",
      "back glass hairline crack",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8a/i,
      titleNot: [/8\s*pro|undo|nah|yep/i],
      price: "450",
      priceNot: ["480", "850", "8", "128", "256"],
      locationMatch: /hastings/i,
      extrasMust: [/128/i, /bay|blue/i],
      extrasMustNot: [/256/i, /obsidian/i],
      conditionNot: [/like new/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W63],
    },
  },
];

describe("Wave 6.3 Class 5.2–5.7 — index checks against the shared corpus (must PASS)", () => {
  // Real execution: each ID runs as a real-harness it.fails in awhina-adversarial-wave-6.test.ts.
  for (const c of WAVE63_CLASS5) {
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

describe("Wave 6.3 — contract hygiene (must PASS)", () => {
  it("every Wave 6.3 case is knownFailure with a fixerRef in §5.2–5.7", () => {
    for (const c of WAVE63_CLASS5) {
      expect(c.knownFailure).toBe(true);
      expect(c.fixerRef).toMatch(/§5\.[2-7]/);
    }
  });
  it("Wave 6.3 IDs are unique", () => {
    const ids = WAVE63_CLASS5.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
