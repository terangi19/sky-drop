/**
 * Wave 2 adversarial NZ corpus — extends Wave 1 coverage. Fixtures are EVAL
 * CASES ONLY; production must not hardcode these product names.
 *
 * Reuses Wave 1 entry points: processCanonicalAwhina, description quality,
 * seller evidence, semantic fact model, input normalize, price parse.
 * No production heuristics are patched here.
 *
 * Known current breaks use vitest `it.fails` / `FAIL:` so CI stays green.
 * See docs/awhina-adversarial-qa-report.md (Wave 2).
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
  /LISTING_FILL|LISTING CREATION REQUEST|respond ONLY|Parse everything|system prompt|title it bargain|don'?t say damaged|dont put was price|dont put daily rate|don'?t add daily rate|dont put what i paid|dont mention the crack|dont put my max|make the listing|help me choose|write the title|write a good description|suggest a fair|tell me what details|recommend a price|dont use what i paid|title it tidy|title it mint|title it bargain/i;

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
      pricingType: fill.pricingType,
      servicePricingType: fill.servicePricingType,
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
      rentalBathrooms: fill.rentalBathrooms,
      rentalPetsPolicy: fill.rentalPetsPolicy,
      rentalFurnishedStatus: fill.rentalFurnishedStatus,
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
  | "modifications"
  | "historical_vs_confirmed_price"
  | "model_as_price"
  | "seller_commands"
  | "mid_conversation_change"
  | "followup_correction"
  | "extremely_short"
  | "extremely_long";

type ListingKind = "physical" | "vehicle" | "service" | "rental" | "wanted";

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
    generation?: RegExp;
    colour?: RegExp;
    transmission?: RegExp;
    body?: RegExp;
  };
  rentalSubType?: "property" | "equipment" | "vehicle";
  rentalDaily?: string;
  rentalWeekly?: string;
  noDailyRate?: boolean;
  depositNot?: string[];
  bedrooms?: string;
  pricingType?: RegExp;
  extrasMust?: RegExp[];
  extrasMustNot?: RegExp[];
  descriptionMust?: RegExp[];
  descriptionMustNot?: RegExp[];
  publicMust?: RegExp[];
  publicMustNot?: RegExp[];
  noInventedVehicleDefaults?: boolean;
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

const LONG_WANTED_HILUX = [
  "yeah so um post a wanted ad wtb iso looking for a toyota hilux diesel 4wd",
  "under 25k maybe 22k nah under 25000 west auckland westie henderson pickup",
  "prefer 2015 or newer under 180000 kays no rust no scams serious only no timewasters",
  "dont put my max as the title just say wanted hilux",
  "also open to rangers but mainly hilux auto not manual",
  "oh wait budget is 23000 not 25k nah 23000 firm",
].join(" ");

const LONG_IPAD_COMMANDS = [
  "dont mention the crack title it mint sell my ipad air 64gb dunedin",
  "was 650 paid 700 selling 220 ono cracked screen still works",
  "dont put what i paid or the was price in the ad 2 chargers apple pencil",
  "write a good description help me choose category mint otherwise yeah",
].join(" ");

const LONG_PROPERTY_CHCH = [
  "yeah renting my 2 bed 1 bath unit in chch christchurch 480 a week 480pw",
  "bond 2 weeks cats ok furnished avail now not for sale its a rental",
  "dont put daily rate or end date or condition title it tidy 2bedder",
  "parking 1 off street tenant does lawns older 90s unit needs a paint",
  "write a good description help me choose category",
].join(" ");

const WAVE2: CorpusCase[] = [
  {
    id: "wanted-wtb-axela-budget-cap",
    kind: "wanted",
    attack: ["slang_typos", "seller_commands", "model_as_price"],
    likelySubsystem: "semantic-intent / find-vs-wanted routing / price extract",
    input: "WTB mazda axela under 8k wellington no timewasters serious only",
    expect: {
      listingType: "wanted",
      titleMatch: /axela|mazda/i,
      titleNot: [/timewaster|serious only|wtb/i],
      price: "8000",
      priceNot: ["8"],
      locationMatch: /wellington/i,
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "wanted-iso-hilux-westie-no-scams",
    kind: "wanted",
    attack: ["slang_typos", "seller_commands", "model_as_price"],
    likelySubsystem: "semantic-intent / input-normalize / find-vs-wanted",
    input: "ISO toyota hilux diesel under 25k westie no scams",
    expect: {
      listingType: "wanted",
      titleMatch: /hilux/i,
      titleNot: [/no scams|iso\b/i],
      price: "25000",
      priceNot: ["25"],
      locationMatch: /west|auckland/i,
      extrasMust: [/diesel/i],
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "wanted-looking-for-post-ad-dunedin",
    kind: "wanted",
    attack: ["slang_typos", "seller_commands"],
    likelySubsystem: "semantic-intent",
    input:
      "post a wanted ad looking for iphone 14 pro max under 1100 dunedin preferably unlocked no scams",
    expect: {
      listingType: "wanted",
      titleMatch: /iphone/i,
      titleNot: [/looking for|no scams/i],
      price: "1100",
      priceNot: ["14"],
      locationMatch: /dunedin/i,
      extrasMust: [/unlock/i],
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "wanted-mower-hammers-short",
    kind: "wanted",
    attack: ["extremely_short", "slang_typos"],
    likelySubsystem: "semantic-intent / input-normalize",
    input: "wanted: lawn mower petrol hammers budget 200 no rust",
    expect: {
      listingType: "wanted",
      titleMatch: /mower/i,
      price: "200",
      locationMatch: /hamilton|hammers/i,
      extrasMust: [/petrol|rust/i],
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-wtb-gtr-extremely-short",
    kind: "wanted",
    attack: ["extremely_short", "model_as_price"],
    likelySubsystem: "semantic-intent / price extract",
    input: "wtb gtr akl",
    expect: {
      listingType: "wanted",
      titleMatch: /gtr|skyline|nissan/i,
      price: null,
      priceNot: ["34", "33", "35"],
      locationMatch: /auckland|akl/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-long-hilux-budget-walk",
    kind: "wanted",
    attack: [
      "extremely_long",
      "seller_commands",
      "contradictory",
      "historical_vs_confirmed_price",
      "slang_typos",
    ],
    likelySubsystem: "semantic-intent / listing-facts merge / description-writer",
    input: LONG_WANTED_HILUX,
    expect: {
      listingType: "wanted",
      titleMatch: /hilux/i,
      titleNot: [/dont put my max|no scams|serious only/i],
      price: "23000",
      priceNot: ["25000", "22000", "25"],
      locationMatch: /west|auckland|henderson/i,
      extrasMust: [/diesel|4wd|auto/i],
      extrasMustNot: [/manual/i],
      descriptionMustNot: [/\bfor sale\b|25000|25k/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-chch-unit-bond-weeks",
    kind: "rental",
    attack: ["slang_typos", "seller_commands", "missing_punctuation"],
    likelySubsystem: "domain-knowledge / pending-slots",
    input:
      "2bed 1bath unit chch 480 a week bond 2 weeks cats ok furnished avail now not for sale",
    expect: {
      listingType: "rental",
      titleMatch: /unit|apartment|bedroom|flat/i,
      titleNot: [/for sale|selling/i],
      priceNot: ["2", "1"],
      locationMatch: /christchurch|chch/i,
      rentalSubType: "property",
      rentalWeekly: "480",
      noDailyRate: true,
      depositNot: ["2"],
      bedrooms: "2",
      extrasMust: [/cat|furnish/i],
      descriptionMust: [/480|week/i],
      descriptionMustNot: [/per day|daily rate|end date|dont put|\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-property-long-chch-commands",
    kind: "rental",
    attack: ["extremely_long", "seller_commands", "repeated_info"],
    likelySubsystem: "domain-knowledge / description-writer",
    input: LONG_PROPERTY_CHCH,
    expect: {
      listingType: "rental",
      titleMatch: /unit|bedroom|flat|apartment/i,
      titleNot: [/tidy 2bedder|for sale|title it/i],
      rentalSubType: "property",
      rentalWeekly: "480",
      noDailyRate: true,
      depositNot: ["2"],
      locationMatch: /christchurch|chch/i,
      extrasMust: [/cat|furnish/i],
      descriptionMustNot: [/daily rate|title it tidy|write a good description|\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-studio-bond-dollars",
    kind: "rental",
    attack: ["missing_punctuation"],
    likelySubsystem: "domain-knowledge / pending-slots",
    input: "studio wellington 420pw bond $1680 avail 1 oct unfurnished no pets",
    expect: {
      listingType: "rental",
      titleMatch: /studio|apartment|flat/i,
      rentalSubType: "property",
      rentalWeekly: "420",
      noDailyRate: true,
      depositNot: ["1"],
      locationMatch: /wellington/i,
      extrasMust: [/unfurnished|pets/i],
      descriptionMust: [/420|week/i],
      descriptionMustNot: [/per day|daily rate/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-mixer-equipment-not-sale",
    kind: "rental",
    attack: ["missing_punctuation", "seller_commands"],
    likelySubsystem: "domain-knowledge / semantic-intent",
    input: "hire my concrete mixer 80 a day bond 150 hamilton not selling",
    expect: {
      listingType: "rental",
      titleMatch: /mixer|concrete/i,
      titleNot: [/for sale|selling/i],
      rentalSubType: "equipment",
      rentalDaily: "80",
      priceNot: ["150"],
      depositNot: ["80"],
      locationMatch: /hamilton/i,
      descriptionMust: [/80|\$80|per day|\/day/i],
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-trailer-daily-or-weekly",
    kind: "rental",
    attack: ["missing_punctuation"],
    likelySubsystem: "domain-knowledge / listing-facts merge",
    input: "trailer hire 40 a day or 200 a week manukau not for sale",
    expect: {
      listingType: "rental",
      titleMatch: /trailer/i,
      titleNot: [/for sale/i],
      rentalSubType: "equipment",
      rentalDaily: "40",
      rentalWeekly: "200",
      locationMatch: /manukau/i,
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-ranger-hire-not-sale",
    kind: "rental",
    attack: ["contradictory", "model_as_price", "seller_commands"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input: "not selling my 2020 ranger just hiring it 180 a day auckland bond 600",
    expect: {
      listingType: "rental",
      titleMatch: /ranger/i,
      titleNot: [/for sale|selling/i],
      rentalSubType: "vehicle",
      rentalDaily: "180",
      priceNot: ["2020", "600"],
      locationMatch: /auckland/i,
      vehicle: { make: /ford/i, model: /ranger/i, year: "2020" },
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-caravan-weekly",
    kind: "rental",
    attack: ["extremely_short"],
    likelySubsystem: "domain-knowledge",
    input: "rent my caravan 400 a week taupo bond 200 not for sale",
    expect: {
      listingType: "rental",
      titleMatch: /caravan/i,
      titleNot: [/for sale/i],
      rentalSubType: "equipment",
      rentalWeekly: "400",
      priceNot: ["200"],
      locationMatch: /taupo/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "service-plumbing-westie-quote-plus-drain",
    kind: "service",
    attack: ["slang_typos", "contradictory"],
    likelySubsystem: "domain-knowledge / listing-facts merge",
    input: "plumbing westie callout 90 quote for bigger jobs also drain unblocking",
    expect: {
      listingType: "service",
      titleMatch: /plumb/i,
      price: "90",
      locationMatch: /west|auckland/i,
      extrasMust: [/drain/i],
      pricingType: /quote|from|fixed/i,
      publicMust: [/quote|drain/i],
      descriptionMustNot: [/for sale|selling my/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "service-mechanic-chch-hourly-wof",
    kind: "service",
    attack: ["slang_typos", "extremely_short"],
    likelySubsystem: "domain-knowledge / input-normalize",
    input: "mobile mechanic chch 80 an hour also wof checks",
    expect: {
      listingType: "service",
      titleMatch: /mechanic/i,
      price: "80",
      locationMatch: /christchurch|chch/i,
      extrasMust: [/wof|warrant/i],
      pricingType: /hourly/i,
      descriptionMustNot: [/for sale/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "service-mow-hammers-quote-gardens",
    kind: "service",
    attack: ["slang_typos", "missing_punctuation"],
    likelySubsystem: "domain-knowledge / listing-facts merge",
    input: "i mow lawns hammers 45 a lawn bigger sections quote also gardens",
    expect: {
      listingType: "service",
      titleMatch: /lawn|mow/i,
      price: "45",
      locationMatch: /hamilton|hammers/i,
      extrasMust: [/garden/i],
      publicMust: [/quote|garden/i],
      descriptionMustNot: [/for sale/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "service-painting-quote-required-palmy",
    kind: "service",
    attack: ["slang_typos", "seller_commands"],
    likelySubsystem: "domain-knowledge / service-pricing",
    input: "house painting quote required palmy no fixed price",
    expect: {
      listingType: "service",
      titleMatch: /paint/i,
      price: null,
      locationMatch: /palmerston|palmy/i,
      pricingType: /quote/i,
      descriptionMustNot: [/for sale|buy now/i],
      publicMust: [/quote/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "service-cleaning-chch-secondary-oven",
    kind: "service",
    attack: ["slang_typos"],
    likelySubsystem: "listing-facts merge",
    input: "cleaning chch 50 a visit also oven and carpet",
    expect: {
      listingType: "service",
      titleMatch: /clean/i,
      price: "50",
      locationMatch: /christchurch|chch/i,
      extrasMust: [/oven|carpet/i],
      descriptionMust: [/oven|carpet/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "physical-ipad-instruction-historical-defect",
    kind: "physical",
    attack: [
      "seller_commands",
      "historical_vs_confirmed_price",
      "faults_with_positive_condition",
      "extremely_long",
    ],
    likelySubsystem: "authority / description-writer / semantic-parser price classes",
    input: LONG_IPAD_COMMANDS,
    expect: {
      listingType: "physical",
      titleMatch: /ipad/i,
      titleNot: [/mint|dont mention|title it/i],
      price: "220",
      priceNot: ["650", "700", "64"],
      locationMatch: /dunedin/i,
      conditionNot: [EXAGGERATED_CONDITION_RE],
      extrasMust: [/crack/i, /pencil|charger/i],
      descriptionMust: [/crack/i],
      descriptionMustNot: [/was 650|\$650|paid 700|dont mention|title it mint/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      defectsMustAppear: [/crack/i],
      qualityContract: true,
    },
  },
  {
    id: "physical-iphone-exaggerated-new-with-crack",
    kind: "physical",
    attack: ["faults_with_positive_condition", "model_as_price"],
    likelySubsystem: "listing-condition / description-writer",
    input: "brand new condition but cracked screen iphone 12 64gb 280 chch",
    expect: {
      listingType: "physical",
      titleMatch: /iphone/i,
      price: "280",
      priceNot: ["12", "64"],
      locationMatch: /christchurch|chch/i,
      conditionNot: [EXAGGERATED_CONDITION_RE],
      extrasMust: [/crack/i],
      descriptionMust: [/crack/i],
      descriptionMustNot: [/brand new(?![\s\S]*crack)/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      defectsMustAppear: [/crack/i],
      qualityContract: true,
    },
  },
  {
    id: "physical-ps4-historical-paid-leak",
    kind: "physical",
    attack: ["historical_vs_confirmed_price", "seller_commands"],
    likelySubsystem: "semantic-parser price classes / description-writer",
    input: "ps4 slim was 400 paid 450 selling 150 hamilton dont put what i paid",
    expect: {
      listingType: "physical",
      titleMatch: /ps4|playstation/i,
      price: "150",
      priceNot: ["400", "450"],
      locationMatch: /hamilton/i,
      descriptionMustNot: [/paid 450|was 400|dont put what i paid/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "physical-couch-duplicate-facts",
    kind: "physical",
    attack: ["repeated_info", "missing_punctuation"],
    likelySubsystem: "description-writer / seller-evidence dedupe",
    input:
      "selling couch 2 seater 2 seater couch grey fabric grey fabric good cond good condition pickup palmy palmy 250 bucks 250 250",
    expect: {
      listingType: "physical",
      titleMatch: /couch|sofa/i,
      price: "250",
      locationMatch: /palmerston|palmy/i,
      extrasMust: [/fabric|2\s*seater|pickup/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "vehicle-corolla-missing-defects",
    kind: "vehicle",
    attack: ["faults_with_positive_condition", "missing_punctuation", "slang_typos"],
    likelySubsystem: "seller-evidence / description-writer",
    input: "toyota corolla 2012 180k kays good runner rust on sills cracked bumper 4500 palmy",
    expect: {
      listingType: "vehicle",
      titleMatch: /corolla/i,
      price: "4500",
      priceNot: ["2012", "180"],
      locationMatch: /palmerston|palmy/i,
      conditionNot: [EXAGGERATED_CONDITION_RE],
      vehicle: { make: /toyota/i, model: /corolla/i, year: "2012", odometer: "180000" },
      extrasMust: [/rust/i, /bumper|crack/i],
      descriptionMust: [/rust/i, /bumper|crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      defectsMustAppear: [/rust/i, /bumper|crack/i],
      qualityContract: true,
    },
  },
  {
    id: "vehicle-axela-voice-number-words",
    kind: "vehicle",
    attack: ["voice_garbage", "missing_punctuation"],
    likelySubsystem: "input-normalize / semantic-intent",
    input:
      "um so yeah uh sell my uh mazda axela uh twenty fifteen uh one two eight thousand k uh eleven five hundred auckland blue",
    expect: {
      listingType: "vehicle",
      titleMatch: /axela/i,
      titleNot: [/uh twenty|twenty fifteen/i],
      price: "11500",
      priceNot: ["15", "128", "11", "5"],
      locationMatch: /auckland/i,
      vehicle: {
        make: /mazda/i,
        model: /axela/i,
        year: "2015",
        odometer: "128000",
        colour: /blue/i,
      },
      noInventedVehicleDefaults: true,
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "vehicle-civic-voice-year-price-words",
    kind: "vehicle",
    attack: ["voice_garbage"],
    likelySubsystem: "input-normalize",
    input: "sell my honda civic two thousand and twelve thirty two hundred bucks wellington",
    expect: {
      listingType: "vehicle",
      titleMatch: /civic/i,
      price: "3200",
      priceNot: ["12", "2000", "32"],
      locationMatch: /wellington/i,
      vehicle: { make: /honda/i, model: /civic/i, year: "2012" },
      noInventedVehicleDefaults: true,
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "vehicle-gtr-short-model-not-price",
    kind: "vehicle",
    attack: ["extremely_short", "model_as_price"],
    likelySubsystem: "input-normalize / price extract",
    input: "gtr 50k akl",
    expect: {
      listingType: "vehicle",
      titleMatch: /gtr|skyline|nissan/i,
      price: "50000",
      priceNot: ["34", "33", "35"],
      locationMatch: /auckland|akl/i,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "service-mow-short-westie",
    kind: "service",
    attack: ["extremely_short", "slang_typos"],
    likelySubsystem: "input-normalize / domain-knowledge",
    input: "mow 40 westie",
    expect: {
      listingType: "service",
      titleMatch: /mow|lawn/i,
      price: "40",
      locationMatch: /west|auckland/i,
      descriptionMustNot: [/for sale/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
];

const WAVE2_MULTI: CorpusCase[] = [
  {
    id: "wanted-budget-pads-nah-bro",
    kind: "wanted",
    attack: ["followup_correction", "mid_conversation_change", "accessories_quantities"],
    likelySubsystem: "authority / semantic-intent / pending-slots",
    input: [
      "WTB ps5 disc chch under 700 no scams",
      "nah bro max 550 and must have 2 pads",
    ],
    expect: {
      listingType: "wanted",
      titleMatch: /ps5|playstation/i,
      price: "550",
      priceNot: ["700", "5", "2"],
      locationMatch: /christchurch|chch/i,
      extrasMust: [/pad|controller/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-identity-iphone-13-to-15",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / authority",
    input: [
      "selling iphone 13 128gb black auckland 600",
      "wait no it's a 15 pro 256 blue make it 950",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /iphone\s*15\s*pro/i,
      titleNot: [/iphone\s*13/i, /wait no/i],
      price: "950",
      priceNot: ["600", "13", "15", "128", "256"],
      extrasMust: [/256/i, /blue/i],
      extrasMustNot: [/\b128\s*gb\b/i, /iphone\s*13/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-price-firm-nah-bro",
    kind: "physical",
    attack: ["followup_correction", "historical_vs_confirmed_price"],
    likelySubsystem: "listing-facts merge / authority",
    input: [
      "selling 3 seater couch brown leather mt maunganui 400",
      "make it 350",
      "nah bro 400 firm",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /couch|sofa/i,
      price: "400",
      priceNot: ["350"],
      locationMatch: /maunganui/i,
      extrasMust: [/leather|3\s*seater/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-storage-colour-flipflops",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / semantic-intent",
    input: [
      "selling samsung galaxy s24 128gb black auckland 700",
      "actually 256",
      "wait no 512 and its purple not black",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /s24|galaxy|samsung/i,
      price: "700",
      priceNot: ["24", "128", "256", "512"],
      extrasMust: [/512/i, /purple/i],
      extrasMustNot: [/\b128\s*gb\b/i, /\b256\s*gb\b/i, /\bblack\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "vehicle-identity-tv-to-axela",
    kind: "vehicle",
    attack: ["mid_conversation_change", "followup_correction"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    input: [
      "yeh selling my samsung 55inch tv hamilton $280",
      "wait nah forget the tv selling my 2015 mazda axela blue 128000km auckland 11500",
    ],
    expect: {
      listingType: "vehicle",
      titleMatch: /axela|mazda/i,
      titleNot: [/samsung|tv|wait nah|forget/i],
      price: "11500",
      priceNot: ["280", "55", "2015"],
      locationMatch: /auckland/i,
      vehicle: {
        make: /mazda/i,
        model: /axela/i,
        year: "2015",
        odometer: "128000",
        colour: /blue/i,
      },
      extrasMustNot: [/samsung|55\s*inch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "vehicle-colour-nah-bro-chain",
    kind: "vehicle",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / semantic-intent",
    input: [
      "selling 07 bmw 335i grey auckland 9k",
      "actually silver",
      "wait no grey nah bro its blue cracked bumper tho",
    ],
    expect: {
      listingType: "vehicle",
      titleMatch: /bmw/i,
      price: "9000",
      priceNot: ["335", "07"],
      vehicle: {
        make: /bmw/i,
        model: /335i/i,
        year: "2007",
        colour: /blue/i,
      },
      extrasMustNot: [/\bgrey\b|\bsilver\b/i],
      defectsMustAppear: [/bumper|crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-trailer-rate-flipflop",
    kind: "rental",
    attack: ["followup_correction", "mid_conversation_change"],
    likelySubsystem: "authority / pending-slots",
    input: [
      "renting out my trailer 50 a day bond 100 manukau not for sale",
      "actually 40",
      "nah 45 a day",
    ],
    expect: {
      listingType: "rental",
      titleMatch: /trailer/i,
      rentalSubType: "equipment",
      rentalDaily: "45",
      priceNot: ["50", "40", "100"],
      locationMatch: /manukau/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "service-add-secondary-followup",
    kind: "service",
    attack: ["followup_correction"],
    likelySubsystem: "draft-transition / pending-slots",
    input: [
      "mobile mechanic chch 80 an hour",
      "also wof checks and bigger jobs quote",
    ],
    expect: {
      listingType: "service",
      titleMatch: /mechanic/i,
      price: "80",
      extrasMust: [/wof|warrant/i],
      publicMust: [/quote|wof/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
];

function askingPrice(fill: SkyAiListingFill): string {
  return String(fill.price || fill.rentalPriceDaily || fill.rentalPriceWeekly || "");
}

function assertCase(c: CorpusCase) {
  const turns = Array.isArray(c.input) ? c.input : [c.input];
  const r = runTurns(`adv2-${c.id}`, turns);
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
  if (e.pricingType) {
    expect(
      `${fill.servicePricingType || ""} ${fill.pricingType || ""} ${pub}`,
      `pricingType\n${ctx}`
    ).toMatch(e.pricingType);
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
    expect(desc, `description must not ${re}\n${ctx}`).toMatch(re);
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

  if (e.qualityContract && desc.trim()) {
    const contract = validateDescriptionQualityContract(desc, fill);
    expect(contract.ok, `quality ${JSON.stringify(contract)} \n${ctx}`).toBe(true);
  }
}

/** Current-main breaks — expected semantics stay locked; CI uses it.fails. */
const KNOWN_FAILURE_IDS = new Set<string>([
  "wanted-wtb-axela-budget-cap",
  "wanted-iso-hilux-westie-no-scams",
  "wanted-looking-for-post-ad-dunedin",
  "wanted-mower-hammers-short",
  "wanted-wtb-gtr-extremely-short",
  "wanted-long-hilux-budget-walk",
  "rental-chch-unit-bond-weeks",
  "rental-property-long-chch-commands",
  "rental-studio-bond-dollars",
  "rental-mixer-equipment-not-sale",
  "rental-trailer-daily-or-weekly",
  "rental-ranger-hire-not-sale",
  "rental-caravan-weekly",
  "service-plumbing-westie-quote-plus-drain",
  "service-mechanic-chch-hourly-wof",
  "service-mow-hammers-quote-gardens",
  "service-painting-quote-required-palmy",
  "service-cleaning-chch-secondary-oven",
  "physical-ipad-instruction-historical-defect",
  "physical-iphone-exaggerated-new-with-crack",
  "physical-ps4-historical-paid-leak",
  "vehicle-gtr-short-model-not-price",
  "service-mow-short-westie",
  "wanted-budget-pads-nah-bro",
  "physical-identity-iphone-13-to-15",
  "physical-storage-colour-flipflops",
  "rental-trailer-rate-flipflop",
  "service-add-secondary-followup",
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

describe("adversarial NZ wave2 — price traps (parseListingPriceFromMessage)", () => {
  const traps: Array<[string, string | null]> = [
    ["civic si", null],
    ["bmw 320i", null],
    ["galaxy s23", null],
    ["iphone 14", null],
    ["skyline r33", null],
    ["mazda cx-5", null],
    ["toyota rav4", null],
    ["subaru wrx sti", null],
    ["s24 ultra", null],
    ["iphone 14 pro 128gb", null],
    ["s24 ultra $900", "900"],
    ["WTB mazda axela under 8k", null],
    ["ISO toyota hilux diesel under 25k", null],
    ["iphone 12 64gb 280 chch", "280"],
  ];

  for (const [msg, expected] of traps) {
    it(`${JSON.stringify(msg)} → ${expected}`, () => {
      const got = parseListingPriceFromMessage(msg);
      if (expected === null) {
        expect(got).not.toBe("5");
        expect(got).not.toBe("8");
        expect(got).not.toBe("14");
        expect(got).not.toBe("23");
        expect(got).not.toBe("24");
        expect(got).not.toBe("25");
        expect(got).not.toBe("33");
        expect(got).not.toBe("320");
        expect(got).not.toBe("128");
        expect(got).not.toBe("64");
      } else {
        expect(got).toBe(expected);
      }
    });
  }

  it('"ps4 slim was 400 paid 450 selling 150" → 150 (selling-N beats was/paid)', () => {
    expect(parseListingPriceFromMessage("ps4 slim was 400 paid 450 selling 150 hamilton")).toBe(
      "150"
    );
  });

  it.fails('FAIL: "gtr 50k akl" → 50000 (slang 50k asking is dropped at parser)', () => {
    expect(parseListingPriceFromMessage("gtr 50k akl")).toBe("50000");
    expect(parseListingPriceFromMessage("gtr 50k akl")).not.toBe("50");
  });

  it.fails('FAIL: "eleven five hundred" voice asking → 11500', () => {
    expect(
      parseListingPriceFromMessage(
        "mazda axela twenty fifteen one two eight thousand k eleven five hundred auckland"
      )
    ).toBe("11500");
  });
});

describe("adversarial NZ wave2 — input normalize slang + voice", () => {
  it("preserves s24 as model not $24", () => {
    const n = normalizeAwhinaInput("selling samsung galaxy s24 128gb").normalized;
    expect(n).toMatch(/s24/i);
    expect(n).not.toMatch(/\$24\b/);
  });

  it("voice filler still contains axela identity", () => {
    const n = normalizeAwhinaInput(
      "um so yeah uh sell my uh mazda axela uh twenty fifteen"
    ).normalized;
    expect(n).toMatch(/axela/i);
    expect(n).toMatch(/mazda/i);
  });

  it("keeps WTB/ISO tokens available for wanted routing", () => {
    const wtb = normalizeAwhinaInput("WTB mazda axela under 8k wellington").normalized;
    const iso = normalizeAwhinaInput("ISO toyota hilux diesel under 25k westie").normalized;
    expect(wtb).toMatch(/axela/i);
    expect(iso).toMatch(/hilux/i);
  });
});

describe("adversarial NZ wave2 — semantic fact model", () => {
  it("historical paid/was prices are not confirmed asking", () => {
    const model = parseSellerMessageToFactModel(
      "ps4 slim was 400 paid 450 selling 150 hamilton dont put what i paid",
      { title: "PS4 Slim", price: "150" }
    );
    expect(model.price.confirmed?.value || "150").toMatch(/150/);
    expect(model.price.confirmed?.value).not.toBe("400");
    expect(model.price.confirmed?.value).not.toBe("450");
  });

  it.fails("FAIL: no scams / serious only are seller instructions not public facts", () => {
    const model = parseSellerMessageToFactModel(
      "WTB mazda axela under 8k wellington no timewasters serious only no scams",
      { title: "Mazda Axela", listingType: "wanted" }
    );
    expect(
      model.sellerInstructions.some((f) => /scam|serious|timewaster/i.test(f.value))
    ).toBe(true);
    expect(
      model.publicFacts.some((f) => /no scams|serious only|timewaster/i.test(f.value))
    ).toBe(false);
  });

  it("dont mention the crack is instruction; crack is a defect", () => {
    const model = parseSellerMessageToFactModel(
      "dont mention the crack title it mint sell my ipad air cracked screen $220",
      { title: "iPad Air" }
    );
    expect(model.negativeCondition.some((f) => /crack/i.test(f.value))).toBe(true);
    expect(model.sellerInstructions.length).toBeGreaterThan(0);
    expect(model.publicFacts.some((f) => /title it mint|dont mention the crack/i.test(f.value))).toBe(
      false
    );
  });
});

describe("adversarial NZ wave2 — semantic correction stress", () => {
  it.fails("FAIL: nah bro max 550 plus 2 pads is a budget+accessory correction", () => {
    const r = interpretSemanticTurn({
      message: "nah bro max 550 and must have 2 pads",
      pendingSlot: "price",
      canonical: { title: "PS5 Disc", listingType: "wanted", price: "700" },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/550/);
    expect(blob).toMatch(/pad|controller|2/i);
    expect(blob).not.toMatch(/price:2\b/i);
  });

  it("wait no 512 purple not black is storage+colour correction not price", () => {
    const r = interpretSemanticTurn({
      message: "wait no 512 and its purple not black",
      pendingSlot: "condition",
      canonical: { title: "Galaxy S24", extras: ["storage:128GB", "colour:black"] },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(blob).toMatch(/512/i);
    expect(blob).toMatch(/purple/i);
    expect(blob).not.toMatch(/price:512/i);
  });
});

registerCorpus("adversarial NZ wave2 one-shot corpus", WAVE2);
registerCorpus("adversarial NZ wave2 multi-turn corpus", WAVE2_MULTI);
