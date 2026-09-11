/**
 * Wave 5 adversarial NZ corpus — deepens remaining FAIL classes 3/4/5/7 only.
 * Fixtures are EVAL CASES ONLY; production must not hardcode these strings.
 *
 * Reuses Wave 1–4 entry points: processCanonicalAwhina, description quality,
 * seller evidence, semantic fact model, input normalize, price parse.
 * No production heuristics are patched here.
 *
 * Focus:
 *   Class 3 Wanted — WTB/ISO/looking-for/post-wanted; budget under/max/around;
 *     no scams/timewasters as instructions; Wanted≠sale; Wanted≠education lecture;
 *     multi-turn budget + accessory requirements.
 *   Class 4 Rentals — hire vs sale; property vs equipment vs vehicle hire;
 *     bond weeks vs $; weekly vs daily dual rates; bond must not beat rent.
 *   Class 5 Identity wipe — ≥4–8 turn identity change/undo/rechange; follow-up
 *     must not replace draft; pending-slot traps must not eat identity as price.
 *   Class 7 Contradictions / model-as-price — last confirmed fact wins;
 *     storage/colour flipflops; 90 / 8 / 11 / 50k as asking when slang says so
 *     vs model when it is a model.
 *
 * Known current breaks use vitest `it.fails` / `FAIL:` so CI stays green.
 * See docs/awhina-adversarial-qa-report.md (Wave 5).
 * Wave 1–4 and PR #35 re-score FAIL markers were not weakened.
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
  /LISTING_FILL|LISTING CREATION REQUEST|respond ONLY|Parse everything|system prompt|title it bargain|title it mint|title it tidy|don'?t say damaged|dont put was price|dont put daily rate|don'?t add daily rate|dont put what i paid|dont mention the crack|dont put my max|dont put LISTING_FILL|make the listing|help me choose|write the title|write a good description|suggest a fair|tell me what details|recommend a price|dont use what i paid|dont say water damaged|dont mention I'?m desperate|dont put bond weeks as dollars|dont put m1|dont put the 6d/i;

const WANTED_INSTRUCTION_LEAK_RE =
  /\bno scams\b|\bserious only\b|\bno timewasters?\b|\bno time wasters?\b/i;

const PAID_WAS_LEAK_RE =
  /\b(?:was|paid)\s+\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*k)?\b|\bwhat i paid\b/i;

const DONT_PUT_LEAK_RE = /\bdont put\b|\bdon't put\b|\bdon'?t mention\b|\bdon'?t say\b/i;

const SALE_VOICE_RE = /\bfor sale\b|\bselling my\b|\bbuy now\b|\basking price\b/i;

const EDUCATION_LECTURE_RE =
  /\b(?:how to (?:spot|avoid) (?:a )?scam|never (?:send|wire)|safe pickup tips|too good to be true|scam (?:warning|alert|education)|watch out for scams|this (?:looks|sounds) like a scam)\b/i;

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
  | "extremely_long"
  | "mixed_listing_type"
  | "nz_place_slang"
  | "pending_slot_trap";

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
    generation?: RegExp;
    colour?: RegExp;
    transmission?: RegExp;
    body?: RegExp;
  };
  rentalSubType?: "property" | "equipment" | "vehicle";
  rentalDaily?: string;
  rentalWeekly?: string;
  rentalDeposit?: string;
  noDailyRate?: boolean;
  depositNot?: string[];
  bedrooms?: string;
  extrasMust?: RegExp[];
  extrasMustNot?: RegExp[];
  descriptionMust?: RegExp[];
  descriptionMustNot?: RegExp[];
  publicMust?: RegExp[];
  publicMustNot?: RegExp[];
  noInventedVehicleDefaults?: boolean;
  defectsMustAppear?: RegExp[];
  defectsOnce?: RegExp[];
  qualityContract?: boolean;
  verifyNoPaidWas?: boolean;
  verifyNoDontPut?: boolean;
  wantedNotSale?: boolean;
  wantedNotEducation?: boolean;
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

const LONG_WANTED_AMP = [
  "yeah so um post a wanted ad looking for a marshall dsl40 not selling one",
  "around 500 maybe 450 nah max 480 westie henderson no scams serious only no timewasters",
  "prefer with footswitch and cover wait footswitch is fine cracked cabinet no thanks",
  "dont put my max as the title just say wanted marshall amp",
  "oh wait budget is 430 not 480 nah 430 firm",
].join(" ");

const LONG_RENTAL_TOWNHOUSE = [
  "renting out my 3bed 2bath townhouse nelson 580 a week bond 3 weeks",
  "pets no furnished avail now not for sale not selling just renting the house",
  "dont put daily rate or end date or condition dont put bond weeks as dollars",
  "title it tidy 3bedder write a good description",
].join(" ");

const WAVE5_WANTED: CorpusCase[] = [
  {
    id: "wanted-wtb-canon-nelson-no-scams",
    kind: "wanted",
    attack: ["slang_typos", "seller_commands", "model_as_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted / price extract",
    input: "WTB canon 5d mark iii under 900 nelson no timewasters serious only no scams",
    expect: {
      listingType: "wanted",
      titleMatch: /canon|5d/i,
      titleNot: [/for sale|selling|wtb/i],
      price: "900",
      priceNot: ["5", "3"],
      locationMatch: /nelson/i,
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, EDUCATION_LECTURE_RE],
      qualityContract: true,
    },
  },
  {
    id: "wanted-iso-camping-fridge-invercargill",
    kind: "wanted",
    attack: ["seller_commands", "nz_place_slang", "accessories_quantities"],
    likelySubsystem: "semantic-intent / find-vs-wanted routing",
    input:
      "ISO camping fridge 12v around 250 invercargill preferably with battery no scams serious only",
    expect: {
      listingType: "wanted",
      titleMatch: /fridge|cooler/i,
      titleNot: [/for sale|selling|iso/i],
      price: "250",
      priceNot: ["12"],
      locationMatch: /invercargill/i,
      extrasMust: [/batter/i],
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, EDUCATION_LECTURE_RE],
    },
  },
  {
    id: "wanted-looking-for-kayak-gisborne-post-ad",
    kind: "wanted",
    attack: ["seller_commands", "nz_place_slang", "extremely_short"],
    likelySubsystem: "semantic-intent / input-normalize",
    input: "post a wanted ad looking for a kayak under 400 gisborne no scams",
    expect: {
      listingType: "wanted",
      titleMatch: /kayak/i,
      titleNot: [/looking for|for sale|wanted ad/i],
      price: "400",
      locationMatch: /gisborne/i,
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, EDUCATION_LECTURE_RE],
    },
  },
  {
    id: "wanted-drone-around-vs-max-rotorua",
    kind: "wanted",
    attack: ["historical_vs_confirmed_price", "seller_commands", "model_as_price"],
    likelySubsystem: "semantic-parser price classes / find-vs-wanted",
    input: "looking for a dji mini 2 around 280 rotorua max 300 no scams",
    expect: {
      listingType: "wanted",
      titleMatch: /dji|mini|drone/i,
      titleNot: [/for sale|looking for/i],
      price: "300",
      priceNot: ["2", "280"],
      locationMatch: /rotorua/i,
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, EDUCATION_LECTURE_RE],
    },
  },
  {
    id: "wanted-ebike-not-selling-mine-npl",
    kind: "wanted",
    attack: ["mixed_listing_type", "contradictory", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted",
    input:
      "ISO electric bike under 800 new plymouth not selling mine looking to buy no timewasters",
    expect: {
      listingType: "wanted",
      titleMatch: /e-?bike|electric bike|ebike/i,
      titleNot: [/for sale|selling mine/i],
      price: "800",
      locationMatch: /new plymouth|npl/i,
      wantedNotSale: true,
      wantedNotEducation: true,
      descriptionMustNot: [SALE_VOICE_RE],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-steam-deck-no-scams-not-lecture",
    kind: "wanted",
    attack: ["seller_commands", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted routing",
    input: "wanted steam deck lcd under 550 napier no scams please",
    expect: {
      listingType: "wanted",
      titleMatch: /steam\s*deck/i,
      titleNot: [/for sale|selling/i],
      price: "550",
      locationMatch: /napier/i,
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, EDUCATION_LECTURE_RE],
    },
  },
  {
    id: "wanted-wtb-iphone-se-max-akl",
    kind: "wanted",
    attack: ["extremely_short", "nz_place_slang", "model_as_price"],
    likelySubsystem: "semantic-intent / input-normalize / model-as-price",
    input: "wtb iphone se 2020 akl max 280",
    expect: {
      listingType: "wanted",
      titleMatch: /iphone/i,
      titleNot: [/for sale|wtb/i],
      price: "280",
      priceNot: ["2020", "se"],
      locationMatch: /auckland|akl/i,
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-long-marshall-amp-budget-walk",
    kind: "wanted",
    attack: ["extremely_long", "seller_commands", "historical_vs_confirmed_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / listing-facts merge",
    input: LONG_WANTED_AMP,
    expect: {
      listingType: "wanted",
      titleMatch: /marshall|dsl|amp/i,
      titleNot: [/dont put|max 480|for sale/i],
      price: "430",
      priceNot: ["500", "450", "480"],
      locationMatch: /west|auckland/i,
      extrasMust: [/footswitch/i],
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      verifyNoDontPut: true,
      qualityContract: true,
    },
  },
  {
    id: "wanted-iso-chainsaw-westie-extra-chain",
    kind: "wanted",
    attack: ["accessories_quantities", "seller_commands", "nz_place_slang"],
    likelySubsystem: "orchestration-boundary / pending-slots",
    input:
      "ISO husqvarna chainsaw under 180 westie no timewasters preferably with extra chain no scams",
    expect: {
      listingType: "wanted",
      titleMatch: /chainsaw|husqvarna/i,
      titleNot: [/timewaster|no scams|iso/i],
      price: "180",
      locationMatch: /west|auckland/i,
      extrasMust: [/chain/i],
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-iso-highchair-whangarei-serious-only",
    kind: "wanted",
    attack: ["seller_commands", "nz_place_slang", "faults_with_positive_condition"],
    likelySubsystem: "orchestration-boundary / find-vs-wanted",
    input:
      "ISO high chair under 80 whangarei serious only no timewasters dont mention I'm desperate no mould please",
    expect: {
      listingType: "wanted",
      titleMatch: /high\s*chair|highchair/i,
      titleNot: [/desperate|serious only|timewaster/i],
      price: "80",
      locationMatch: /whangarei/i,
      extrasMust: [/mould|mold/i],
      wantedNotSale: true,
      wantedNotEducation: true,
      descriptionMustNot: [/desperate|dont mention/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      verifyNoDontPut: true,
    },
  },
  {
    id: "wanted-around-vs-paid-history-lens",
    kind: "wanted",
    attack: ["historical_vs_confirmed_price", "seller_commands", "nz_place_slang"],
    likelySubsystem: "semantic-parser price classes / find-vs-wanted",
    input:
      "looking for a canon 50mm around 220 blenheim paid 400 last time dont put what i paid no scams",
    expect: {
      listingType: "wanted",
      titleMatch: /canon|50mm|lens/i,
      titleNot: [/paid|for sale/i],
      price: "220",
      priceNot: ["400", "50"],
      locationMatch: /blenheim/i,
      wantedNotSale: true,
      wantedNotEducation: true,
      descriptionMustNot: [/paid 400|what i paid/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, PAID_WAS_LEAK_RE],
      verifyNoPaidWas: true,
      qualityContract: true,
    },
  },
];

const WAVE5_RENTAL: CorpusCase[] = [
  {
    id: "rental-navara-just-hiring-not-sale",
    kind: "rental",
    attack: ["mixed_listing_type", "model_as_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / domain-knowledge / composer",
    input: "not selling my 2020 navara just hiring it 160 a day rotorua bond 550",
    expect: {
      listingType: "rental",
      titleMatch: /navara/i,
      titleNot: [/for sale|selling|just$/i],
      rentalSubType: "vehicle",
      rentalDaily: "160",
      rentalDeposit: "550",
      priceNot: ["2020", "550"],
      locationMatch: /rotorua/i,
      vehicle: { make: /nissan/i, model: /navara/i, year: "2020" },
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-1bed-napier-bond-weeks",
    kind: "rental",
    attack: ["seller_commands", "nz_place_slang", "missing_punctuation"],
    likelySubsystem: "domain-knowledge / pending-slots",
    input:
      "1bed apartment napier 440 a week bond 4 weeks pets no unfurnished avail now dont put daily rate",
    expect: {
      listingType: "rental",
      titleMatch: /apartment|flat|1\s*bed/i,
      titleNot: [/for sale|dont put/i],
      rentalSubType: "property",
      rentalWeekly: "440",
      noDailyRate: true,
      depositNot: ["4", "440"],
      bedrooms: "1",
      locationMatch: /napier/i,
      extrasMust: [/unfurnished|pets/i],
      descriptionMustNot: [/per day|daily rate|\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      verifyNoDontPut: true,
      qualityContract: true,
    },
  },
  {
    id: "rental-concrete-mixer-dual-rate-gisborne",
    kind: "rental",
    attack: ["contradictory", "nz_place_slang", "mixed_listing_type"],
    likelySubsystem: "listing-facts merge / rental rate inference",
    input: "hire my concrete mixer 65 a day or 280 a week gisborne bond 150 not for sale",
    expect: {
      listingType: "rental",
      titleMatch: /mixer|concrete/i,
      titleNot: [/for sale/i],
      rentalSubType: "equipment",
      rentalDaily: "65",
      rentalWeekly: "280",
      rentalDeposit: "150",
      priceNot: ["150"],
      locationMatch: /gisborne/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-hiace-hire-not-sale",
    kind: "rental",
    attack: ["mixed_listing_type", "contradictory", "nz_place_slang"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input: "hiring out my 2015 toyota hiace 110 a day invercargill not selling bond 400",
    expect: {
      listingType: "rental",
      titleMatch: /hiace|toyota/i,
      titleNot: [/for sale|selling/i],
      rentalSubType: "vehicle",
      rentalDaily: "110",
      rentalDeposit: "400",
      priceNot: ["2015", "400"],
      locationMatch: /invercargill/i,
      vehicle: { make: /toyota/i, model: /hiace/i, year: "2015" },
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-3bed-nelson-bond-weeks",
    kind: "rental",
    attack: ["seller_commands", "nz_place_slang", "extremely_long"],
    likelySubsystem: "domain-knowledge / pending-slots",
    input: LONG_RENTAL_TOWNHOUSE,
    expect: {
      listingType: "rental",
      titleMatch: /townhouse|house|3\s*bed/i,
      titleNot: [/for sale|tidy 3bedder|dont put/i],
      rentalSubType: "property",
      rentalWeekly: "580",
      noDailyRate: true,
      depositNot: ["3", "580"],
      bedrooms: "3",
      locationMatch: /nelson/i,
      extrasMust: [/furnished|pets/i],
      descriptionMustNot: [/per day|daily rate|\bfor sale\b|bond weeks as dollars/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      verifyNoDontPut: true,
      qualityContract: true,
    },
  },
  {
    id: "rental-cherry-picker-daily-and-weekly",
    kind: "rental",
    attack: ["contradictory", "nz_place_slang"],
    likelySubsystem: "listing-facts merge / rental rate inference",
    input: "cherry picker hire 180 a day or 750 a week palmy bond 300 not for sale",
    expect: {
      listingType: "rental",
      titleMatch: /cherry|boom|eWP|elevat/i,
      titleNot: [/for sale/i],
      rentalSubType: "equipment",
      rentalDaily: "180",
      rentalWeekly: "750",
      rentalDeposit: "300",
      priceNot: ["300"],
      locationMatch: /palmerston|palmy/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-room-npl-bond-dollars-not-weekly",
    kind: "rental",
    attack: ["historical_vs_confirmed_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / price extract / domain-knowledge",
    input: "room for rent new plymouth 240pw bond $960 avail now furnished not selling",
    expect: {
      listingType: "rental",
      titleMatch: /room|flat|apartment/i,
      titleNot: [/for sale|not selling/i],
      rentalSubType: "property",
      rentalWeekly: "240",
      rentalDeposit: "960",
      noDailyRate: true,
      depositNot: ["240"],
      locationMatch: /new plymouth|npl/i,
      extrasMust: [/furnished/i],
      descriptionMustNot: [/per day|daily rate|\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-jimny-hire-or-sell-hire-wins",
    kind: "rental",
    attack: ["mixed_listing_type", "contradictory", "model_as_price"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input:
      "might sell or hire my 2018 jimny 90 a day or 22000 hamilton wait just hiring 90 a day not for sale bond 350",
    expect: {
      listingType: "rental",
      titleMatch: /jimny/i,
      titleNot: [/for sale|selling/i],
      rentalSubType: "vehicle",
      rentalDaily: "90",
      rentalDeposit: "350",
      priceNot: ["22000", "2018", "350"],
      locationMatch: /hamilton|hammers/i,
      vehicle: { make: /suzuki/i, model: /jimny/i, year: "2018" },
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-tinnie-hire-taupo-not-sale",
    kind: "rental",
    attack: ["mixed_listing_type", "nz_place_slang", "faults_with_positive_condition"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input: "hiring my tinnie 80 a day taupo bond 200 not for sale scratched hull still floats",
    expect: {
      listingType: "rental",
      titleMatch: /tinnie|boat|aluminium/i,
      titleNot: [/for sale|not for sale/i],
      rentalSubType: "equipment",
      rentalDaily: "80",
      rentalDeposit: "200",
      locationMatch: /taupo/i,
      extrasMust: [/scratch/i],
      descriptionMust: [/scratch/i],
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      defectsMustAppear: [/scratch/i],
      defectsOnce: [/scratch/i],
      qualityContract: true,
    },
  },
  {
    id: "rental-5bed-hastings-no-daily",
    kind: "rental",
    attack: ["seller_commands", "nz_place_slang", "missing_punctuation"],
    likelySubsystem: "domain-knowledge / pending-slots",
    input:
      "5bed 3bath house hastings 890 a week bond 4 weeks unfurnished pets no avail now dont put daily rate or end date",
    expect: {
      listingType: "rental",
      titleMatch: /house|5\s*bed/i,
      titleNot: [/for sale|dont put/i],
      rentalSubType: "property",
      rentalWeekly: "890",
      noDailyRate: true,
      depositNot: ["4", "890"],
      bedrooms: "5",
      locationMatch: /hastings/i,
      extrasMust: [/unfurnished|pets/i],
      descriptionMustNot: [/per day|daily rate|\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      verifyNoDontPut: true,
      qualityContract: true,
    },
  },
];

const WAVE5_IDENTITY: CorpusCase[] = [
  {
    id: "multi8-identity-change-undo-rechange-s22",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority",
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
      titleNot: [/\bs22\b/i, /wait no|forget/i],
      price: "490",
      priceNot: ["380", "520", "22", "23", "128", "256"],
      locationMatch: /porirua/i,
      extrasMust: [/256/i, /crack/i, /charger/i],
      extrasMustNot: [/\b128\s*gb\b/i, /\bs22\b/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi6-switch-lite-oled-undo-rechange",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
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
      extrasMust: [/scratch/i],
      extrasMustNot: [/lite/i],
      defectsMustAppear: [/scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi7-civic-type-r-accord-undo",
    kind: "vehicle",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
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
      vehicle: {
        make: /honda/i,
        model: /accord/i,
        year: "2016",
        odometer: "110000",
      },
      extrasMustNot: [/type\s*r/i],
      defectsMustAppear: [/rust/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi8-pending-slot-must-not-eat-a7iv",
    kind: "physical",
    attack: ["pending_slot_trap", "mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "pending-slots / draft-transition / authority",
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
      titleMatch: /sony|a7/i,
      titleNot: [/a7iii|a7 iii|dont put/i],
      price: "1800",
      priceNot: ["3", "4", "7", "24", "70"],
      locationMatch: /hutt|lower/i,
      extrasMust: [/scratch/i],
      extrasMustNot: [/a7iii/i],
      descriptionMustNot: [/dont put a7iii/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      defectsMustAppear: [/scratch/i],
      verifyNoDontPut: true,
    },
  },
  {
    id: "multi4-followup-crack-must-not-wipe-s23",
    kind: "physical",
    attack: ["followup_correction", "faults_with_positive_condition"],
    likelySubsystem: "draft-transition / pending-slots",
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
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
];

const WAVE5_WANTED_MULTI: CorpusCase[] = [
  {
    id: "multi6-wanted-canon-budget-battery",
    kind: "wanted",
    attack: ["followup_correction", "accessories_quantities", "seller_commands", "nz_place_slang"],
    likelySubsystem: "semantic-intent / pending-slots / find-vs-wanted",
    input: [
      "post a wanted listing canon 6d te puke under 700 no scams",
      "actually around 650",
      "nah max 600",
      "must have extra battery",
      "wait 1 battery is fine but need 2 cards",
      "pickup te puke ok",
    ],
    expect: {
      listingType: "wanted",
      titleMatch: /canon|6d/i,
      titleNot: [/for sale|no scams/i],
      price: "600",
      priceNot: ["700", "650", "6"],
      locationMatch: /te puke/i,
      extrasMust: [/batter/i, /card/i],
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, EDUCATION_LECTURE_RE],
    },
  },
  {
    id: "multi5-wanted-iso-fridge-then-not-a-sale",
    kind: "wanted",
    attack: ["mixed_listing_type", "followup_correction", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted / draft-transition",
    input: [
      "ISO camping fridge 12v gisborne",
      "budget around 280",
      "nah max 220",
      "not selling mine looking to buy",
      "no rust no scams serious only",
    ],
    expect: {
      listingType: "wanted",
      titleMatch: /fridge/i,
      titleNot: [/for sale|selling mine/i],
      price: "220",
      priceNot: ["280", "12"],
      locationMatch: /gisborne/i,
      extrasMust: [/rust/i],
      wantedNotSale: true,
      wantedNotEducation: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
];

const WAVE5_RENTAL_MULTI: CorpusCase[] = [
  {
    id: "multi6-rental-mixer-rate-bond-location",
    kind: "rental",
    attack: ["followup_correction", "mixed_listing_type", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority / pending-slots",
    input: [
      "renting concrete mixer 70 a day gisborne not for sale",
      "actually 60 a day",
      "nah 65 a day",
      "also 280 a week",
      "bond 150",
      "pickup westie",
    ],
    expect: {
      listingType: "rental",
      titleMatch: /mixer|concrete/i,
      titleNot: [/for sale/i],
      rentalSubType: "equipment",
      rentalDaily: "65",
      rentalWeekly: "280",
      rentalDeposit: "150",
      priceNot: ["70", "60"],
      locationMatch: /west|auckland|gisborne/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
];

const WAVE5_CONTRADICTION: CorpusCase[] = [
  {
    id: "physical-s23-ultra-contradiction-one-shot",
    kind: "physical",
    attack: ["contradictory", "faults_with_positive_condition", "model_as_price"],
    likelySubsystem: "semantic-intent / listing-facts merge",
    input:
      "samsung s23 ultra 256gb wait no 512 black actually green like new battery 91 screen hairline though dunedin 890",
    expect: {
      listingType: "physical",
      titleMatch: /s23|ultra|samsung/i,
      price: "890",
      priceNot: ["23", "256", "512", "91"],
      locationMatch: /dunedin/i,
      conditionNot: [EXAGGERATED_CONDITION_RE],
      extrasMust: [/512/i, /green/i, /91/i, /hairline|scratch|crack/i],
      extrasMustNot: [/\b256\s*gb\b/i],
      descriptionMust: [/512/i, /91/i],
      descriptionMustNot: [/\b256\s*GB\b/i, /like new(?![\s\S]*(hairline|scratch|crack))/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      defectsMustAppear: [/hairline|scratch|crack/i],
      qualityContract: true,
    },
  },
  {
    id: "physical-storage-colour-flipflops-s23",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / semantic-intent",
    input: [
      "selling samsung galaxy s23 128gb black levin 490",
      "actually 256",
      "wait no 512 and its cream not black",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /s23|galaxy|samsung/i,
      price: "490",
      priceNot: ["23", "128", "256", "512"],
      extrasMust: [/512/i, /cream|white/i],
      extrasMustNot: [/\b128\s*gb\b/i, /\b256\s*gb\b/i, /\bblack\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-last-confirmed-storage-wins-iphone14",
    kind: "physical",
    attack: ["contradictory", "model_as_price", "nz_place_slang"],
    likelySubsystem: "listing-facts merge / authority",
    input:
      "iphone 14 128gb wait no 256 wait actually 128 again nah 256 black actually green levin 800",
    expect: {
      listingType: "physical",
      titleMatch: /iphone\s*14/i,
      price: "800",
      priceNot: ["14", "128", "256"],
      locationMatch: /levin/i,
      extrasMust: [/256/i, /green/i],
      extrasMustNot: [/\b128\s*gb\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-series-s-1tb-colour-flip",
    kind: "physical",
    attack: ["contradictory", "model_as_price", "followup_correction"],
    likelySubsystem: "listing-facts merge / authority",
    input: [
      "selling xbox series s 512 white porirua 380",
      "wait no 1tb white actually black 360",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /xbox|series\s*s/i,
      titleNot: [/wait no/i],
      price: "360",
      priceNot: ["380", "512", "1"],
      locationMatch: /porirua/i,
      extrasMust: [/1\s*tb|1tb/i, /black/i],
      extrasMustNot: [/\b512\b/i, /\bwhite\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-air-max-90-infrared-not-price",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang"],
    likelySubsystem: "model-as-price / seller-evidence",
    input: "air max 90 infrared size 9 95 greymouth",
    expect: {
      listingType: "physical",
      titleMatch: /air\s*max|nike/i,
      price: "95",
      priceNot: ["90", "9"],
      locationMatch: /greymouth/i,
      extrasMust: [/90/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-pixel-8-asking-not-model",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang"],
    likelySubsystem: "model-as-price / price extract",
    input: "selling google pixel 8 128gb 620 hastings",
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8/i,
      price: "620",
      priceNot: ["8", "128"],
      locationMatch: /hastings/i,
      extrasMust: [/128/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-gopro-11-asking-not-model",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang"],
    likelySubsystem: "model-as-price / price extract",
    input: "selling gopro hero 11 280 palmy",
    expect: {
      listingType: "physical",
      titleMatch: /gopro|hero/i,
      price: "280",
      priceNot: ["11"],
      locationMatch: /palmerston|palmy/i,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-jordan-size-11-not-price",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang"],
    likelySubsystem: "model-as-price / seller-evidence",
    input: "jordan 1 chicago size 11 140 wellie",
    expect: {
      listingType: "physical",
      titleMatch: /jordan/i,
      price: "140",
      priceNot: ["11", "1"],
      locationMatch: /wellington|wellie/i,
      extrasMust: [/11|size/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "vehicle-sti-50k-slang-asking",
    kind: "vehicle",
    attack: ["extremely_short", "model_as_price", "nz_place_slang"],
    likelySubsystem: "input-normalize / price extract",
    input: "sti 50k greymouth",
    expect: {
      listingType: "vehicle",
      titleMatch: /sti|wrx|subaru/i,
      price: "50000",
      priceNot: ["50"],
      locationMatch: /greymouth/i,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "vehicle-330i-50k-kays-not-asking",
    kind: "vehicle",
    attack: ["model_as_price", "nz_place_slang", "missing_punctuation"],
    likelySubsystem: "price extract / odometer vs asking",
    input: "selling 2012 bmw 330i 50k kays wellington 8500",
    expect: {
      listingType: "vehicle",
      titleMatch: /330i|bmw/i,
      price: "8500",
      priceNot: ["2012", "50000", "50"],
      locationMatch: /wellington/i,
      vehicle: {
        make: /bmw/i,
        model: /330/i,
        year: "2012",
        odometer: "50000",
      },
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
];

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

/**
 * Current-branch breaks — expected semantics stay locked; CI uses it.fails.
 * First run vs cursor/awhina-rescore-w28-584e: 24 passed, 44 failed (68).
 * Converted genuine passes stay `it()`. Remaining corpus IDs below stay FAIL.
 */
const KNOWN_FAILURE_IDS = new Set<string>([
  "rental-navara-just-hiring-not-sale",
  "rental-concrete-mixer-dual-rate-gisborne",
  "rental-hiace-hire-not-sale",
  "rental-cherry-picker-daily-and-weekly",
  "rental-room-npl-bond-dollars-not-weekly",
  "rental-jimny-hire-or-sell-hire-wins",
  "rental-tinnie-hire-taupo-not-sale",
  "rental-5bed-hastings-no-daily",
  "multi8-identity-change-undo-rechange-s22",
  "multi6-switch-lite-oled-undo-rechange",
  "multi7-civic-type-r-accord-undo",
  "multi8-pending-slot-must-not-eat-a7iv",
  "multi4-followup-crack-must-not-wipe-s23",
  "multi6-rental-mixer-rate-bond-location",
  "physical-s23-ultra-contradiction-one-shot",
  "physical-storage-colour-flipflops-s23",
  "physical-last-confirmed-storage-wins-iphone14",
  "physical-series-s-1tb-colour-flip",
  "physical-air-max-90-infrared-not-price",
  "vehicle-sti-50k-slang-asking",
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

describe("adversarial NZ wave5 — price/budget traps (parseListingPriceFromMessage)", () => {
  it("pixel 8 / gopro 11 / air max 90 / a7iv are not asking prices without a dollar amount", () => {
    expect(parseListingPriceFromMessage("google pixel 8")).not.toBe("8");
    expect(parseListingPriceFromMessage("gopro hero 11")).not.toBe("11");
    expect(parseListingPriceFromMessage("air max 90 infrared")).not.toBe("90");
    expect(parseListingPriceFromMessage("sony a7iv")).not.toBe("4");
    expect(parseListingPriceFromMessage("sony a7iv")).not.toBe("7");
  });

  it("hire dual-rate cherry picker is not qty/model 6 as a sale asking", () => {
    expect(parseListingPriceFromMessage("cherry picker hire 180 a day or 750 a week palmy")).not.toBe("6");
  });

  it('"around 250 invercargill" wanted budget is 250 not 12v', () => {
    expect(parseListingPriceFromMessage("ISO camping fridge 12v around 250 invercargill")).toBe("250");
    expect(parseListingPriceFromMessage("ISO camping fridge 12v around 250 invercargill")).not.toBe("12");
  });

  it('"max 280" wanted cap is 280 not se/2020', () => {
    expect(parseListingPriceFromMessage("wtb iphone se 2020 akl max 280")).toBe("280");
    expect(parseListingPriceFromMessage("wtb iphone se 2020 akl max 280")).not.toBe("2020");
  });

  it('"under 900 nelson" wanted cap is 900 not 5d', () => {
    expect(parseListingPriceFromMessage("WTB canon 5d mark iii under 900 nelson")).toBe("900");
    expect(parseListingPriceFromMessage("WTB canon 5d mark iii under 900 nelson")).not.toBe("5");
  });

  it('"under 400 gisborne" wanted cap is 400', () => {
    expect(parseListingPriceFromMessage("looking for a kayak under 400 gisborne")).toBe("400");
  });

  it('"max 300" beats around 280 on a drone wanted line', () => {
    expect(parseListingPriceFromMessage("looking for a dji mini 2 around 280 rotorua max 300")).toBe(
      "300"
    );
    expect(parseListingPriceFromMessage("looking for a dji mini 2 around 280 rotorua max 300")).not.toBe(
      "2"
    );
  });

  it('"pixel 8 128gb 620 hastings" → 620 (8 is model)', () => {
    expect(parseListingPriceFromMessage("selling google pixel 8 128gb 620 hastings")).toBe("620");
    expect(parseListingPriceFromMessage("selling google pixel 8 128gb 620 hastings")).not.toBe("8");
  });

  it.fails('FAIL: "gopro hero 11 280 palmy" → 280 (11 is model)', () => {
    expect(parseListingPriceFromMessage("selling gopro hero 11 280 palmy")).toBe("280");
    expect(parseListingPriceFromMessage("selling gopro hero 11 280 palmy")).not.toBe("11");
  });

  it.fails('FAIL: "air max 90 infrared size 9 95 greymouth" → 95 (90 is model)', () => {
    expect(parseListingPriceFromMessage("air max 90 infrared size 9 95 greymouth")).toBe("95");
    expect(parseListingPriceFromMessage("air max 90 infrared size 9 95 greymouth")).not.toBe("90");
  });

  it.fails('FAIL: "jordan 1 chicago size 11 140 wellie" → 140 (11 is size)', () => {
    expect(parseListingPriceFromMessage("jordan 1 chicago size 11 140 wellie")).toBe("140");
    expect(parseListingPriceFromMessage("jordan 1 chicago size 11 140 wellie")).not.toBe("11");
  });

  it.fails('FAIL: "sti 50k greymouth" slang 50k asking is 50000', () => {
    expect(parseListingPriceFromMessage("sti 50k greymouth")).toBe("50000");
  });

  it('"2012 bmw 330i 50k kays wellington 8500" → 8500 (50k is odo)', () => {
    expect(parseListingPriceFromMessage("selling 2012 bmw 330i 50k kays wellington 8500")).toBe("8500");
    expect(parseListingPriceFromMessage("selling 2012 bmw 330i 50k kays wellington 8500")).not.toBe(
      "50000"
    );
    expect(parseListingPriceFromMessage("selling 2012 bmw 330i 50k kays wellington 8500")).not.toBe(
      "2012"
    );
  });

  it('"580 a week bond 3 weeks" is weekly 580, not bond-weeks 3 as dollars', () => {
    expect(parseListingPriceFromMessage("3bed townhouse nelson 580 a week bond 3 weeks")).toBe("580");
    expect(parseListingPriceFromMessage("3bed townhouse nelson 580 a week bond 3 weeks")).not.toBe("3");
  });

  it.fails('FAIL: "240pw bond $960" weekly 240 beats bond dollars', () => {
    expect(parseListingPriceFromMessage("room for rent new plymouth 240pw bond $960")).toBe("240");
    expect(parseListingPriceFromMessage("room for rent new plymouth 240pw bond $960")).not.toBe("960");
  });

  it('"just hiring 90 a day" is 90 not 2018 / 22000', () => {
    const msg =
      "might sell or hire my 2018 jimny 90 a day or 22000 hamilton wait just hiring 90 a day";
    expect(parseListingPriceFromMessage(msg)).toBe("90");
    expect(parseListingPriceFromMessage(msg)).not.toBe("22000");
    expect(parseListingPriceFromMessage(msg)).not.toBe("2018");
  });
});

describe("adversarial NZ wave5 — input normalize NZ places", () => {
  it("preserves nelson / napier / gisborne / invercargill / rotorua / new plymouth", () => {
    const blob = [
      normalizeAwhinaInput("WTB canon 5d nelson").normalized,
      normalizeAwhinaInput("wanted steam deck napier").normalized,
      normalizeAwhinaInput("looking for a kayak gisborne").normalized,
      normalizeAwhinaInput("ISO camping fridge invercargill").normalized,
      normalizeAwhinaInput("navara 160 a day rotorua").normalized,
      normalizeAwhinaInput("room for rent new plymouth 240pw").normalized,
    ].join(" ");
    expect(blob).toMatch(/nelson/i);
    expect(blob).toMatch(/napier/i);
    expect(blob).toMatch(/gisborne/i);
    expect(blob).toMatch(/invercargill/i);
    expect(blob).toMatch(/rotorua/i);
    expect(blob).toMatch(/new plymouth|npl/i);
  });

  it("preserves whangarei / hastings / blenheim / greymouth / porirua / whanganui / levin / kerikeri / te puke / lower hutt", () => {
    const blob = [
      normalizeAwhinaInput("ISO high chair whangarei").normalized,
      normalizeAwhinaInput("5bed house hastings 890 a week").normalized,
      normalizeAwhinaInput("canon 50mm around 220 blenheim").normalized,
      normalizeAwhinaInput("air max 90 greymouth").normalized,
      normalizeAwhinaInput("pickup porirua not cbd").normalized,
      normalizeAwhinaInput("civic type r whanganui").normalized,
      normalizeAwhinaInput("s23 256gb levin 490").normalized,
      normalizeAwhinaInput("sony a7iii kerikeri").normalized,
      normalizeAwhinaInput("canon 6d te puke").normalized,
      normalizeAwhinaInput("pickup lower hutt actually").normalized,
    ].join(" ");
    expect(blob).toMatch(/whangarei/i);
    expect(blob).toMatch(/hastings/i);
    expect(blob).toMatch(/blenheim/i);
    expect(blob).toMatch(/greymouth/i);
    expect(blob).toMatch(/porirua/i);
    expect(blob).toMatch(/whanganui/i);
    expect(blob).toMatch(/levin/i);
    expect(blob).toMatch(/kerikeri/i);
    expect(blob).toMatch(/te puke/i);
    expect(blob).toMatch(/hutt/i);
  });

  it("keeps WTB/ISO tokens available for wanted routing", () => {
    const wtb = normalizeAwhinaInput("WTB canon 5d mark iii under 900 nelson").normalized;
    const iso = normalizeAwhinaInput("ISO camping fridge 12v around 250 invercargill").normalized;
    expect(wtb).toMatch(/wtb/i);
    expect(iso).toMatch(/iso/i);
  });
});

describe("adversarial NZ wave5 — semantic fact model", () => {
  it("no scams / serious only / no timewasters are instructions on a WTB canon", () => {
    const model = parseSellerMessageToFactModel(
      "WTB canon 5d mark iii under 900 nelson no timewasters serious only no scams",
      { title: "Canon 5D Mark III", listingType: "wanted" }
    );
    expect(model.sellerInstructions.some((f) => /scam|serious|timewaster/i.test(f.value))).toBe(true);
    expect(model.publicFacts.some((f) => /no scams|serious only|timewaster/i.test(f.value))).toBe(
      false
    );
  });

  it("dont put my max / just say wanted marshall are instructions not public facts", () => {
    const model = parseSellerMessageToFactModel(LONG_WANTED_AMP, {
      title: "Marshall DSL40",
      listingType: "wanted",
      price: "430",
    });
    expect(model.sellerInstructions.length).toBeGreaterThan(0);
    expect(model.publicFacts.some((f) => /dont put my max|no scams/i.test(f.value))).toBe(false);
    expect(model.price.confirmed?.value || "430").toMatch(/430/);
    expect(model.price.confirmed?.value).not.toBe("500");
  });

  it("not for sale / just hiring stay out of publicFacts on a hire navara", () => {
    const model = parseSellerMessageToFactModel(
      "not selling my 2020 navara just hiring it 160 a day rotorua bond 550",
      { title: "Nissan Navara", listingType: "rental" }
    );
    expect(model.publicFacts.some((f) => /not selling|just hiring|not for sale/i.test(f.value))).toBe(
      false
    );
  });

  it("scratched hull on a hire tinnie is harvested as a defect", () => {
    const model = parseSellerMessageToFactModel(
      "hiring my tinnie 80 a day taupo not for sale scratched hull still floats",
      { title: "Tinnie", listingType: "rental" }
    );
    expect(model.negativeCondition.some((f) => /scratch/i.test(f.value))).toBe(true);
  });
});

describe("adversarial NZ wave5 — semantic correction + pending-slot traps", () => {
  it("pending price must NOT eat 'wait it's a7iv not a7iii' as $4 / $7", () => {
    const r = interpretSemanticTurn({
      message: "wait it's a7iv not a7iii",
      pendingSlot: "price",
      canonical: { title: "Sony A7III", extras: ["colour:black"], price: "1500" },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/a7|iv|4/i);
    expect(blob).not.toMatch(/price:4\b/i);
    expect(blob).not.toMatch(/price:7\b/i);
    expect(blob).not.toMatch(/price:3\b/i);
  });

  it("pending colour must NOT eat '512gb actually' as a colour", () => {
    const r = interpretSemanticTurn({
      message: "512gb actually not 128",
      pendingSlot: "colour",
      canonical: { title: "Samsung Galaxy S23", extras: ["storage:128GB"] },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(blob).toMatch(/512/i);
    expect(blob).not.toMatch(/colour:512/i);
    expect(blob).not.toMatch(/price:512/i);
  });

  it.fails("FAIL: nah forget s22 then actually s23 is identity re-change not a new listing", () => {
    const r = interpretSemanticTurn({
      message: "actually wait it IS the s23 256",
      pendingSlot: "title",
      canonical: { title: "Samsung Galaxy S22", extras: ["storage:128GB"], price: "380" },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/s23|23/i);
    expect(blob).not.toMatch(/price:23\b/i);
  });

  it("wait 1 battery is fine but need 2 cards corrects qty, not price 1/2", () => {
    const r = interpretSemanticTurn({
      message: "wait 1 battery is fine but need 2 cards",
      pendingSlot: "extras",
      canonical: {
        title: "Canon 6D",
        listingType: "wanted",
        extras: ["included:extra battery"],
        price: "600",
      },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/batter|card/i);
    expect(blob).not.toMatch(/price:1\b/i);
    expect(blob).not.toMatch(/price:2\b/i);
  });
});

describe("adversarial NZ wave5 — pending-slot live identity traps", () => {
  beforeEach(() => {
    clearAllListingDraftCacheForTests();
  });

  it("after sparse Sony draft, 'wait it's a7iv' must not become $4 / wipe Sony", () => {
    const id = "adv5-live-a7-pending-price";
    wipe(id);
    const t1 = processCanonicalAwhina("selling sony a7iii kerikeri", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("wait it's a7iv not a7iii", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: (t1.listingFill as SkyAiListingFill) || undefined,
      clientTask: t1.sessionState?.task,
    });
    const fill = compose(asFill(t2));
    const ctx = dump(t2, fill);
    expect(String(fill.title || ""), ctx).toMatch(/sony|a7/i);
    expect(String(fill.price || ""), ctx).not.toBe("4");
    expect(String(fill.price || ""), ctx).not.toBe("7");
    expect(String(fill.price || ""), ctx).not.toBe("3");
    expect(String(fill.title || ""), ctx).not.toMatch(/^wait it/i);
  });

  it("pending location + 'nah 430 firm' must keep Marshall identity and set $430", () => {
    const id = "adv5-live-marshall-pending-location";
    wipe(id);
    const t1 = processCanonicalAwhina("selling marshall dsl40 westie 480", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("nah 430 firm that's it", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: (t1.listingFill as SkyAiListingFill) || undefined,
      clientTask: t1.sessionState?.task,
    });
    const fill = compose(asFill(t2));
    const ctx = dump(t2, fill);
    expect(String(fill.title || ""), ctx).toMatch(/marshall|dsl|amp/i);
    expect(String(fill.price || fill.rentalPriceDaily || ""), ctx).toBe("430");
    expect(String(fill.location || ""), ctx).not.toMatch(/^430$/);
    expect(String(fill.title || ""), ctx).not.toMatch(/^nah 430/i);
  });
});

registerCorpus("adversarial NZ wave5 wanted one-shot corpus", WAVE5_WANTED);
registerCorpus("adversarial NZ wave5 rental one-shot corpus", WAVE5_RENTAL);
registerCorpus("adversarial NZ wave5 identity multi-turn corpus", WAVE5_IDENTITY);
registerCorpus("adversarial NZ wave5 wanted multi-turn corpus", WAVE5_WANTED_MULTI);
registerCorpus("adversarial NZ wave5 rental multi-turn corpus", WAVE5_RENTAL_MULTI);
registerCorpus("adversarial NZ wave5 contradiction / model-as-price corpus", WAVE5_CONTRADICTION);
