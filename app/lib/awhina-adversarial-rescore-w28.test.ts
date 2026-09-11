/**
 * Wave-R (re-score vs PR #28) — NEW messy NZ attacks not already in Waves 1–4.
 * Fixtures are EVAL CASES ONLY; production must not hardcode these strings.
 *
 * Targets remaining weak spots Fixer admitted after v1: wanted ads, rentals,
 * digital ebook/template/course, identity-wipe follow-ups, hedge-class add-on,
 * budget corrections, smashed-phone fill. Same processCanonicalAwhina harness.
 * No production heuristics are patched here.
 *
 * See docs/awhina-adversarial-qa-report.md (Re-score vs PR #28).
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

const INSTRUCTION_LEAK_RE =
  /LISTING_FILL|LISTING CREATION REQUEST|respond ONLY|Parse everything|system prompt|title it bargain|title it mint|title it tidy|don'?t say damaged|dont put was price|dont put daily rate|don'?t add daily rate|dont put what i paid|dont mention the crack|dont put my max|dont put LISTING_FILL|make the listing|help me choose|write the title|write a good description|suggest a fair|tell me what details|recommend a price|dont use what i paid|dont say smashed|dont say water damaged/i;

const WANTED_INSTRUCTION_LEAK_RE =
  /\bno scams\b|\bserious only\b|\bno timewasters?\b|\bno time wasters?\b/i;

const EXAGGERATED_CONDITION_RE = /^(New|Used - Like New)$/i;

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

function dump(r: CanonicalResult, fill: SkyAiListingFill): string {
  return JSON.stringify(
    {
      handled: r.handled,
      intent: r.intent,
      tool: r.tool,
      reply: r.reply,
      listingType: fill.listingType,
      title: fill.title,
      price: fill.price,
      condition: fill.condition,
      location: fill.location,
      category: fill.category,
      vehicleMake: fill.vehicleMake,
      vehicleModel: fill.vehicleModel,
      vehicleYear: fill.vehicleYear,
      vehicleOdometer: fill.vehicleOdometer,
      vehicleGeneration: fill.vehicleGeneration,
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

type AttackClass =
  | "missing_punctuation"
  | "slang_typos"
  | "voice_garbage"
  | "repeated_info"
  | "contradictory"
  | "accessories_quantities"
  | "faults_with_positive_condition"
  | "historical_vs_confirmed_price"
  | "model_as_price"
  | "seller_commands"
  | "mid_conversation_change"
  | "followup_correction"
  | "extremely_short"
  | "extremely_long"
  | "mixed_listing_type"
  | "nz_place_slang";

type ListingKind = "physical" | "vehicle" | "service" | "rental" | "wanted" | "digital";

type CorpusExpect = {
  listingType: ListingKind;
  titleMatch?: RegExp;
  titleNot?: RegExp[];
  price?: string | null;
  priceNot?: string[];
  locationMatch?: RegExp;
  conditionNot?: RegExp[];
  vehicle?: {
    make?: RegExp;
    model?: RegExp;
    year?: string;
    odometer?: string;
  };
  rentalSubType?: "property" | "equipment" | "vehicle";
  rentalDaily?: string;
  rentalWeekly?: string;
  noDailyRate?: boolean;
  depositNot?: string[];
  bedrooms?: string;
  extrasMust?: RegExp[];
  extrasMustNot?: RegExp[];
  descriptionMust?: RegExp[];
  descriptionMustNot?: RegExp[];
  publicMust?: RegExp[];
  publicMustNot?: RegExp[];
  defectsMustAppear?: RegExp[];
  qualityContract?: boolean;
};

type CorpusCase = {
  id: string;
  kind: ListingKind;
  attack: AttackClass | AttackClass[];
  likelySubsystem: string;
  knownFailure?: boolean;
  input: string | string[];
  expect: CorpusExpect;
};

/** New messy NZ attacks — products/places not used in Waves 1–4. */
const WAVER: CorpusCase[] = [
  {
    id: "wanted-wtb-karcher-napier",
    kind: "wanted",
    attack: ["slang_typos", "seller_commands", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted routing",
    input: "WTB karcher k5 pressure washer under 220 napier no timewasters serious only",
    expect: {
      listingType: "wanted",
      titleMatch: /karcher|pressure/i,
      titleNot: [/timewaster|serious only|wtb/i],
      price: "220",
      priceNot: ["5", "2"],
      locationMatch: /napier/i,
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "wanted-iso-cot-timaru-no-scams",
    kind: "wanted",
    attack: ["seller_commands", "nz_place_slang", "extremely_short"],
    likelySubsystem: "semantic-intent / find-vs-wanted routing",
    input: "ISO baby cot under 120 timaru no scams preferably with mattress",
    expect: {
      listingType: "wanted",
      titleMatch: /cot|crib/i,
      titleNot: [/no scams|iso\b/i],
      price: "120",
      locationMatch: /timaru/i,
      extrasMust: [/mattress/i],
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-post-ad-generator-gisborne",
    kind: "wanted",
    attack: ["seller_commands", "mixed_listing_type", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted",
    input:
      "post a wanted ad looking for honda eu20i generator under 900 gisborne not selling mine serious only",
    expect: {
      listingType: "wanted",
      titleMatch: /honda|generator|eu20/i,
      titleNot: [/looking for|serious only|not selling/i],
      price: "900",
      priceNot: ["20"],
      locationMatch: /gisborne/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-1bed-nelson-bond-weeks",
    kind: "rental",
    attack: ["seller_commands", "nz_place_slang", "missing_punctuation"],
    likelySubsystem: "domain-knowledge / pending-slots",
    input:
      "renting my 1bed flat nelson 390pw bond 3 weeks no pets unfurnished avail now not selling dont put daily rate",
    expect: {
      listingType: "rental",
      titleMatch: /flat|apartment|bedroom|studio|1\s*bed/i,
      titleNot: [/for sale|selling|dont put/i],
      locationMatch: /nelson/i,
      rentalSubType: "property",
      rentalWeekly: "390",
      noDailyRate: true,
      depositNot: ["3"],
      bedrooms: "1",
      descriptionMustNot: [/per day|daily rate|dont put|\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-spa-dual-rate-rotorua",
    kind: "rental",
    attack: ["contradictory", "nz_place_slang", "mixed_listing_type"],
    likelySubsystem: "listing-facts merge / rental rate inference",
    input: "hire my inflatable spa 90 a day or 400 a week rotorua bond 200 not for sale",
    expect: {
      listingType: "rental",
      titleMatch: /spa|inflatable/i,
      titleNot: [/for sale|selling/i],
      rentalSubType: "equipment",
      rentalDaily: "90",
      rentalWeekly: "400",
      priceNot: ["200"],
      locationMatch: /rotorua/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-cx5-just-hiring-npl",
    kind: "rental",
    attack: ["mixed_listing_type", "model_as_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input: "not selling my 2016 mazda cx-5 just hiring it 95 a day new plymouth bond 400",
    expect: {
      listingType: "rental",
      titleMatch: /cx-?5|mazda/i,
      titleNot: [/for sale|selling|just hiring/i],
      rentalSubType: "vehicle",
      rentalDaily: "95",
      priceNot: ["2016", "5", "400"],
      locationMatch: /new plymouth|npl/i,
      vehicle: { make: /mazda/i, model: /cx-?5/i, year: "2016" },
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "digital-instagram-templates-gisborne",
    kind: "digital",
    attack: ["accessories_quantities", "mixed_listing_type", "nz_place_slang"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input:
      "selling my instagram story canva templates instant download 12 gisborne not a printed pack 30 templates",
    expect: {
      listingType: "digital",
      titleMatch: /template|canva|instagram/i,
      titleNot: [/printed pack|not a printed/i],
      price: "12",
      priceNot: ["30"],
      locationMatch: /gisborne/i,
      extrasMust: [/30|template/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "digital-guitar-course-invercargill",
    kind: "digital",
    attack: ["mixed_listing_type", "seller_commands"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input: "online guitar course video download 35 invercargill not a physical dvd not a usb stick",
    expect: {
      listingType: "digital",
      titleMatch: /guitar|course/i,
      titleNot: [/usb|dvd|physical/i],
      price: "35",
      locationMatch: /invercargill/i,
      extrasMustNot: [/usb|dvd/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "digital-gardening-ebook-napier",
    kind: "digital",
    attack: ["mixed_listing_type", "extremely_short"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input: "nz native gardening kindle ebook pdf instant download 8 napier not paperback",
    expect: {
      listingType: "digital",
      titleMatch: /ebook|garden|kindle/i,
      titleNot: [/paperback|not paperback/i],
      price: "8",
      locationMatch: /napier/i,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-smashed-s21-invercargill-command",
    kind: "physical",
    attack: ["faults_with_positive_condition", "seller_commands", "model_as_price"],
    likelySubsystem: "listing-condition / authority / description-writer",
    input:
      "brand new still boxed but smashed screen samsung s21 128gb 150 invercargill dont say smashed title it mint",
    expect: {
      listingType: "physical",
      titleMatch: /samsung|s21|galaxy/i,
      titleNot: [/brand new|title it mint|dont say/i],
      price: "150",
      priceNot: ["21", "128"],
      locationMatch: /invercargill/i,
      conditionNot: [EXAGGERATED_CONDITION_RE],
      extrasMust: [/smash|crack|broken/i],
      defectsMustAppear: [/smash|crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-4bed-timaru-no-daily",
    kind: "rental",
    attack: ["seller_commands", "nz_place_slang"],
    likelySubsystem: "domain-knowledge / pending-slots",
    input:
      "4bed 2bath house timaru 720 a week bond 4 weeks pets no unfurnished avail now dont put daily rate or end date",
    expect: {
      listingType: "rental",
      titleMatch: /house|4\s*bed|bedroom/i,
      titleNot: [/for sale|dont put/i],
      locationMatch: /timaru/i,
      rentalSubType: "property",
      rentalWeekly: "720",
      noDailyRate: true,
      depositNot: ["4"],
      bedrooms: "4",
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
];

const WAVER_MULTI: CorpusCase[] = [
  {
    id: "multi-yaris-identity-size-wipe",
    kind: "vehicle",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority",
    input: [
      "selling my 2014 toyota yaris 90k napier 6500",
      "wait nah its the 2015 110k and 5800 rust on arch still napier",
    ],
    expect: {
      listingType: "vehicle",
      titleMatch: /yaris|toyota/i,
      titleNot: [/wait nah/i],
      price: "5800",
      priceNot: ["6500", "2014", "2015", "90", "110"],
      locationMatch: /napier/i,
      vehicle: { make: /toyota/i, model: /yaris/i, year: "2015", odometer: "110000" },
      defectsMustAppear: [/rust/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi-galaxy-a54-undo-wipes-identity",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / authority",
    input: [
      "selling samsung galaxy a54 128gb black nelson 280",
      "wait nah its the a55 256 cream make it 420",
      "nah forget that it's the a54 128 black again 280",
      "and cracked back tho",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /a54|galaxy|samsung/i,
      titleNot: [/a55|wait nah|forget/i],
      price: "280",
      priceNot: ["420", "54", "55", "128", "256"],
      locationMatch: /nelson/i,
      extrasMust: [/128/i, /black/i, /crack/i],
      extrasMustNot: [/\b256\s*gb\b/i, /a55/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "service-add-window-wash-followup",
    kind: "service",
    attack: ["followup_correction", "nz_place_slang"],
    likelySubsystem: "pending-slots / draft-transition",
    input: ["house cleaning palmy 80 a visit", "also window washing bigger houses quote"],
    expect: {
      listingType: "service",
      titleMatch: /clean/i,
      price: "80",
      extrasMust: [/window/i],
      publicMust: [/quote|window/i],
      locationMatch: /palmerston|palmy/i,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-dyson-budget-wand-correction",
    kind: "wanted",
    attack: ["followup_correction", "accessories_quantities"],
    likelySubsystem: "authority / pending-slots / seller-evidence",
    input: [
      "post a wanted listing looking for dyson v8 nelson under 200",
      "actually max 170 and i need the wand",
    ],
    expect: {
      listingType: "wanted",
      titleMatch: /dyson/i,
      price: "170",
      priceNot: ["200", "8"],
      extrasMust: [/wand/i],
      locationMatch: /nelson/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
];

function askingPrice(fill: SkyAiListingFill): string {
  return String(fill.price || fill.rentalPriceDaily || fill.rentalPriceWeekly || "");
}

function assertCase(c: CorpusCase) {
  const turns = Array.isArray(c.input) ? c.input : [c.input];
  const r = runTurns(`adv-wr-${c.id}`, turns);
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

  for (const re of e.extrasMust || []) {
    expect(`${extras} ${desc}`, `extras/desc must ${re}\n${ctx}`).toMatch(re);
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

  expect(containsInternalOrchestration(pub), `orchestration leak\n${ctx}`).toBe(false);
  expect(containsSellerMetaInstruction(desc), `seller instruction in description\n${ctx}`).toBe(false);
  expect(desc, ctx).not.toMatch(MARKETING_FILLER_RE);
  expect(desc, ctx).not.toMatch(GENERIC_MARKETPLACE_FILLER_RE);
  if (desc.trim().length > 20) {
    expect(hasSemanticFactDuplication(desc), `duplicate facts\n${ctx}`).toBe(false);
  }

  for (const re of e.defectsMustAppear || []) {
    const evidence = harvestSellerEvidence(turns.join("\n"))
      .map((item) => item.text)
      .join(" ");
    expect(`${evidence} ${extras} ${desc}`, `defect missing ${re}\n${ctx}`).toMatch(re);
  }

  if (e.qualityContract && desc.trim()) {
    const contract = validateDescriptionQualityContract(desc, fill);
    expect(contract.ok, `quality ${JSON.stringify(contract)} \n${ctx}`).toBe(true);
  }
}

/** First run vs PR #28: 7 passed | 17 failed. Recorded as it.fails below. */
const KNOWN_FAILURE_IDS = new Set<string>([
  "wanted-wtb-karcher-napier",
  "wanted-iso-cot-timaru-no-scams",
  "rental-spa-dual-rate-rotorua",
  "rental-cx5-just-hiring-npl",
  "digital-instagram-templates-gisborne",
  "digital-guitar-course-invercargill",
  "digital-gardening-ebook-napier",
  "rental-4bed-timaru-no-daily",
  "multi-yaris-identity-size-wipe",
  "multi-galaxy-a54-undo-wipes-identity",
  "service-add-window-wash-followup",
  "wanted-dyson-budget-wand-correction",
]);

function registerCorpus(name: string, cases: CorpusCase[]) {
  describe(name, () => {
    beforeEach(() => {
      clearAllListingDraftCacheForTests();
    });

    for (const c of cases) {
      const attacks = Array.isArray(c.attack) ? c.attack.join("+") : c.attack;
      const failing = Boolean(c.knownFailure) || KNOWN_FAILURE_IDS.has(c.id);
      const title = `${failing ? "FAIL: " : ""}${c.id} [${c.kind}/${attacks}]`;
      const body = () => assertCase(c);
      if (failing) it.fails(title, body);
      else it(title, body);
    }
  });
}

describe("adversarial NZ Wave-R — price/budget traps", () => {
  it.fails('FAIL: "under 220 napier" wanted budget is 220 not karcher k5', () => {
    const got = parseListingPriceFromMessage("WTB karcher k5 pressure washer under 220 napier");
    expect(got).toBe("220");
    expect(got).not.toBe("5");
  });

  it.fails('FAIL: "max 170" wanted cap is 170 not v8', () => {
    const got = parseListingPriceFromMessage("looking for dyson v8 nelson under 200 actually max 170");
    expect(got).toBe("170");
    expect(got).not.toBe("8");
  });

  it(' "90 a day or 400 a week" dual hire is not 90 as weekly', () => {
    const got = parseListingPriceFromMessage("hire my inflatable spa 90 a day or 400 a week rotorua");
    expect(got).not.toBe("5");
    expect(["90", "400", null]).toContain(got);
  });

  it("s21 / cx-5 / eu20i are not asking prices without a dollar amount", () => {
    expect(parseListingPriceFromMessage("samsung s21")).not.toBe("21");
    expect(parseListingPriceFromMessage("mazda cx-5")).not.toBe("5");
    expect(parseListingPriceFromMessage("honda eu20i")).not.toBe("20");
  });
});

describe("adversarial NZ Wave-R — input normalize new places", () => {
  it("preserves napier / nelson / timaru / gisborne / rotorua / invercargill / new plymouth", () => {
    const blob = [
      normalizeAwhinaInput("WTB karcher napier").normalized,
      normalizeAwhinaInput("1bed flat nelson 390pw").normalized,
      normalizeAwhinaInput("ISO baby cot timaru").normalized,
      normalizeAwhinaInput("generator gisborne").normalized,
      normalizeAwhinaInput("inflatable spa rotorua").normalized,
      normalizeAwhinaInput("guitar course invercargill").normalized,
      normalizeAwhinaInput("cx-5 new plymouth").normalized,
    ].join(" ");
    expect(blob).toMatch(/napier/i);
    expect(blob).toMatch(/nelson/i);
    expect(blob).toMatch(/timaru/i);
    expect(blob).toMatch(/gisborne/i);
    expect(blob).toMatch(/rotorua/i);
    expect(blob).toMatch(/invercargill/i);
    expect(blob).toMatch(/plymouth/i);
  });
});

describe("adversarial NZ Wave-R — semantic fact model", () => {
  it("dont say smashed / title it mint are instructions; smash is a defect", () => {
    const model = parseSellerMessageToFactModel(
      "brand new still boxed but smashed screen samsung s21 128gb 150 invercargill dont say smashed title it mint",
      { title: "Samsung S21" }
    );
    expect(model.negativeCondition.some((f) => /smash|crack/i.test(f.value))).toBe(true);
    expect(model.sellerInstructions.length).toBeGreaterThan(0);
    expect(
      model.publicFacts.some((f) => /title it mint|dont say smashed/i.test(f.value))
    ).toBe(false);
  });

  it.fails("FAIL: no scams / serious only on a WTB karcher are instructions not public facts", () => {
    const model = parseSellerMessageToFactModel(
      "WTB karcher k5 pressure washer under 220 napier no timewasters serious only no scams",
      { title: "Karcher K5", listingType: "wanted" }
    );
    expect(model.sellerInstructions.some((f) => /scam|serious|timewaster/i.test(f.value))).toBe(true);
    expect(
      model.publicFacts.some((f) => /no scams|serious only|timewaster/i.test(f.value))
    ).toBe(false);
  });
});

describe("adversarial NZ Wave-R — semantic correction", () => {
  it.fails("FAIL: nah forget a55 it's the a54 again is identity undo not a new listing", () => {
    const r = interpretSemanticTurn({
      message: "nah forget that it's the a54 128 black again 280",
      pendingSlot: "title",
      canonical: { title: "Samsung Galaxy A55", extras: ["storage:256GB", "colour:cream"], price: "420" },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/a54|54/i);
    expect(blob).toMatch(/128|black|280/);
    expect(blob).not.toMatch(/price:54\b/i);
  });

  it.fails("FAIL: actually max 170 and i need the wand is budget+accessory correction", () => {
    const r = interpretSemanticTurn({
      message: "actually max 170 and i need the wand",
      pendingSlot: "price",
      canonical: { title: "Dyson V8", listingType: "wanted", price: "200" },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/170/);
    expect(blob).toMatch(/wand/i);
    expect(blob).not.toMatch(/price:8\b/i);
  });
});

registerCorpus("adversarial NZ Wave-R one-shot corpus", WAVER);
registerCorpus("adversarial NZ Wave-R multi-turn corpus", WAVER_MULTI);
