/**
 * Wave 4 adversarial NZ corpus — deepens Wave 1–3 on multi-turn, Wanted, and
 * Rentals only. Fixtures are EVAL CASES ONLY; production must not hardcode
 * these strings.
 *
 * Reuses Wave 1–3 entry points: processCanonicalAwhina, description quality,
 * seller evidence, semantic fact model, input normalize, price parse.
 * No production heuristics are patched here.
 *
 * Focus: ≥5–8 turn identity undo/re-change, price maybe→firm→nah→final,
 * accessory qty corrections, pending-slot traps that must NOT overwrite
 * identity; WTB/ISO/looking-for/post-wanted + budget under/max/around;
 * no scams/timewasters/serious only as instructions; Wanted≠sale;
 * property vs equipment vs vehicle hire; bond weeks vs $; daily vs weekly;
 * not-for-sale / just-hiring; hire-or-sell resolved toward rental when hire
 * language dominates. NZ slang locations + VERIFY description checks kept.
 *
 * Known current breaks use vitest `it.fails` / `FAIL:` so CI stays green.
 * See docs/awhina-adversarial-qa-report.md (Wave 4).
 * Wave 1–3 FAIL markers were not weakened.
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
  /LISTING_FILL|LISTING CREATION REQUEST|respond ONLY|Parse everything|system prompt|title it bargain|title it mint|title it tidy|don'?t say damaged|dont put was price|dont put daily rate|don'?t add daily rate|dont put what i paid|dont mention the crack|dont put my max|dont put LISTING_FILL|make the listing|help me choose|write the title|write a good description|suggest a fair|tell me what details|recommend a price|dont use what i paid|dont say water damaged|dont mention I'?m desperate|dont put bond weeks as dollars/i;

const WANTED_INSTRUCTION_LEAK_RE =
  /\bno scams\b|\bserious only\b|\bno timewasters?\b|\bno time wasters?\b/i;

const PAID_WAS_LEAK_RE =
  /\b(?:was|paid)\s+\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*k)?\b|\bwhat i paid\b/i;

const DONT_PUT_LEAK_RE = /\bdont put\b|\bdon't put\b|\bdon'?t mention\b|\bdon'?t say\b/i;

const SALE_VOICE_RE = /\bfor sale\b|\bselling my\b|\bbuy now\b|\basking price\b/i;

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

const LONG_WANTED_IPAD = [
  "yeah so um post a wanted ad looking for an ipad air not selling one",
  "around 400 maybe 350 nah max 380 westie henderson no scams serious only no timewasters",
  "prefer 64gb or 256 wait 64 is fine cracked screens no thanks",
  "dont put my max as the title just say wanted ipad air",
  "oh wait budget is 360 not 380 nah 360 firm",
].join(" ");

const LONG_RENTAL_FLAT = [
  "renting out my 2bed 1bath flat wellie 520 a week bond 3 weeks",
  "pets no unfurnished avail now not for sale not selling just renting the house",
  "dont put daily rate or end date or condition dont put bond weeks as dollars",
  "title it tidy 2bedder write a good description",
].join(" ");

const WAVE4_WANTED: CorpusCase[] = [
  {
    id: "wanted-wtb-xbox-around-budget",
    kind: "wanted",
    attack: ["slang_typos", "seller_commands", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted / price extract",
    input: "WTB xbox series x around 450 wellie no timewasters serious only",
    expect: {
      listingType: "wanted",
      titleMatch: /xbox|series/i,
      titleNot: [/for sale|selling|wtb/i],
      price: "450",
      priceNot: ["x", "4"],
      locationMatch: /wellington|wellie/i,
      wantedNotSale: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "wanted-iso-macbook-max-no-scams",
    kind: "wanted",
    attack: ["seller_commands", "model_as_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted routing",
    input: "ISO macbook air m2 under 900 chch preferably 16gb no scams serious only",
    expect: {
      listingType: "wanted",
      titleMatch: /macbook/i,
      titleNot: [/for sale|selling|iso/i],
      price: "900",
      priceNot: ["2", "16"],
      locationMatch: /christchurch|chch/i,
      extrasMust: [/16/i],
      wantedNotSale: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-looking-for-pram-post-ad",
    kind: "wanted",
    attack: ["seller_commands", "nz_place_slang", "extremely_short"],
    likelySubsystem: "semantic-intent / input-normalize",
    input: "post a wanted ad looking for a double pram under 150 palmy no scams",
    expect: {
      listingType: "wanted",
      titleMatch: /pram|stroller/i,
      titleNot: [/looking for|for sale|wanted ad/i],
      price: "150",
      locationMatch: /palmerston|palmy/i,
      wantedNotSale: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-iso-switch-not-selling-mine",
    kind: "wanted",
    attack: ["mixed_listing_type", "contradictory", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted",
    input:
      "ISO nintendo switch oled under 350 dunners not selling mine looking to buy no timewasters",
    expect: {
      listingType: "wanted",
      titleMatch: /switch|nintendo/i,
      titleNot: [/for sale|selling mine/i],
      price: "350",
      priceNot: ["oled"],
      locationMatch: /dunedin|dunners/i,
      wantedNotSale: true,
      descriptionMustNot: [SALE_VOICE_RE],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-wtb-gopro-max-akl",
    kind: "wanted",
    attack: ["extremely_short", "nz_place_slang", "model_as_price"],
    likelySubsystem: "semantic-intent / input-normalize",
    input: "wtb gopro 11 akl max 250",
    expect: {
      listingType: "wanted",
      titleMatch: /gopro/i,
      titleNot: [/for sale|wtb/i],
      price: "250",
      priceNot: ["11"],
      locationMatch: /auckland|akl/i,
      wantedNotSale: true,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "wanted-long-ipad-budget-walk",
    kind: "wanted",
    attack: ["extremely_long", "seller_commands", "historical_vs_confirmed_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / listing-facts merge",
    input: LONG_WANTED_IPAD,
    expect: {
      listingType: "wanted",
      titleMatch: /ipad/i,
      titleNot: [/dont put|max 380|for sale/i],
      price: "360",
      priceNot: ["400", "350", "380"],
      locationMatch: /west|auckland/i,
      wantedNotSale: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      verifyNoDontPut: true,
      qualityContract: true,
    },
  },
  {
    id: "wanted-bike-serious-only-not-desperate",
    kind: "wanted",
    attack: ["seller_commands", "nz_place_slang", "faults_with_positive_condition"],
    likelySubsystem: "orchestration-boundary / find-vs-wanted",
    input:
      "ISO bike under 200 wellie serious only no timewasters dont mention I'm desperate no rust please",
    expect: {
      listingType: "wanted",
      titleMatch: /bike|bicycle/i,
      titleNot: [/desperate|serious only|timewaster/i],
      price: "200",
      locationMatch: /wellington|wellie/i,
      extrasMust: [/rust/i],
      wantedNotSale: true,
      descriptionMustNot: [/desperate|dont mention/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      verifyNoDontPut: true,
    },
  },
  {
    id: "wanted-around-vs-paid-history",
    kind: "wanted",
    attack: ["historical_vs_confirmed_price", "seller_commands", "nz_place_slang"],
    likelySubsystem: "semantic-parser price classes / find-vs-wanted",
    input:
      "looking for a dyson v11 around 180 hammers paid 400 last time dont put what i paid no scams",
    expect: {
      listingType: "wanted",
      titleMatch: /dyson/i,
      titleNot: [/paid|for sale/i],
      price: "180",
      priceNot: ["400", "11"],
      locationMatch: /hamilton|hammers/i,
      wantedNotSale: true,
      descriptionMustNot: [/paid 400|what i paid/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE, PAID_WAS_LEAK_RE],
      verifyNoPaidWas: true,
      qualityContract: true,
    },
  },
];

const WAVE4_RENTAL: CorpusCase[] = [
  {
    id: "rental-2bed-wellie-bond-weeks",
    kind: "rental",
    attack: ["seller_commands", "nz_place_slang", "extremely_long"],
    likelySubsystem: "domain-knowledge / pending-slots",
    input: LONG_RENTAL_FLAT,
    expect: {
      listingType: "rental",
      titleMatch: /flat|apartment|2\s*bed/i,
      titleNot: [/for sale|tidy 2bedder|dont put/i],
      rentalSubType: "property",
      rentalWeekly: "520",
      noDailyRate: true,
      depositNot: ["3", "520"],
      bedrooms: "2",
      locationMatch: /wellington|wellie/i,
      extrasMust: [/unfurnished|pets/i],
      descriptionMustNot: [/per day|daily rate|\bfor sale\b|bond weeks as dollars/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      verifyNoDontPut: true,
      qualityContract: true,
    },
  },
  {
    id: "rental-generator-hire-not-sale",
    kind: "rental",
    attack: ["mixed_listing_type", "contradictory", "nz_place_slang"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input: "hire my honda generator 70 a day bond 200 palmy not selling just hiring",
    expect: {
      listingType: "rental",
      titleMatch: /generator/i,
      titleNot: [/for sale|not selling|honda$/i],
      rentalSubType: "equipment",
      rentalDaily: "70",
      rentalDeposit: "200",
      priceNot: ["200"],
      locationMatch: /palmerston|palmy/i,
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-van-hire-or-sell-hire-wins",
    kind: "rental",
    attack: ["mixed_listing_type", "contradictory", "model_as_price"],
    likelySubsystem: "semantic-intent / domain-knowledge",
    input:
      "might sell or hire my 2017 transit van 150 a day or 18000 queenstown wait just hiring 150 a day not for sale bond 400",
    expect: {
      listingType: "rental",
      titleMatch: /transit|van/i,
      titleNot: [/for sale|selling/i],
      rentalSubType: "vehicle",
      rentalDaily: "150",
      rentalDeposit: "400",
      priceNot: ["18000", "2017", "400"],
      locationMatch: /queenstown/i,
      vehicle: { make: /ford/i, model: /transit/i, year: "2017" },
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-scaffold-daily-and-weekly",
    kind: "rental",
    attack: ["contradictory", "nz_place_slang"],
    likelySubsystem: "listing-facts merge / rental rate inference",
    input: "scaffold hire 90 a day or 400 a week chch bond 250 not for sale",
    expect: {
      listingType: "rental",
      titleMatch: /scaffold/i,
      titleNot: [/for sale/i],
      rentalSubType: "equipment",
      rentalDaily: "90",
      rentalWeekly: "400",
      rentalDeposit: "250",
      priceNot: ["250"],
      locationMatch: /christchurch|chch/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-room-bond-dollars-not-weekly",
    kind: "rental",
    attack: ["historical_vs_confirmed_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / price extract / domain-knowledge",
    input: "room for rent tauranga 280pw bond $1120 avail now furnished not selling",
    expect: {
      listingType: "rental",
      titleMatch: /room|flat|apartment/i,
      titleNot: [/for sale|not selling/i],
      rentalSubType: "property",
      rentalWeekly: "280",
      rentalDeposit: "1120",
      noDailyRate: true,
      depositNot: ["280"],
      locationMatch: /tauranga/i,
      extrasMust: [/furnished/i],
      descriptionMustNot: [/per day|daily rate|\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      qualityContract: true,
    },
  },
  {
    id: "rental-triton-just-hiring-not-sale",
    kind: "rental",
    attack: ["mixed_listing_type", "model_as_price", "nz_place_slang"],
    likelySubsystem: "semantic-intent / domain-knowledge / composer",
    input: "not selling my 2019 triton just hiring it 140 a day dunners bond 500",
    expect: {
      listingType: "rental",
      titleMatch: /triton/i,
      titleNot: [/for sale|selling|just$/i],
      rentalSubType: "vehicle",
      rentalDaily: "140",
      rentalDeposit: "500",
      priceNot: ["2019", "500"],
      locationMatch: /dunedin|dunners/i,
      vehicle: { make: /mitsubishi/i, model: /triton/i, year: "2019" },
      descriptionMustNot: [/\bfor sale\b|\bselling my\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-marquee-just-hiring-dual-rate",
    kind: "rental",
    attack: ["mixed_listing_type", "nz_place_slang"],
    likelySubsystem: "domain-knowledge / rental rate inference",
    input:
      "just hiring out my 6m marquee 120 a day or 500 a week hammers bond 300 not for sale",
    expect: {
      listingType: "rental",
      titleMatch: /marquee/i,
      titleNot: [/for sale/i],
      rentalSubType: "equipment",
      rentalDaily: "120",
      rentalWeekly: "500",
      rentalDeposit: "300",
      priceNot: ["6", "300"],
      locationMatch: /hamilton|hammers/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "rental-trailer-dented-not-for-sale",
    kind: "rental",
    attack: ["faults_with_positive_condition", "mixed_listing_type", "nz_place_slang"],
    likelySubsystem: "semantic-intent / description-writer",
    input:
      "renting out my trailer 55 a day bond 80 pickup only westie not for sale dented guard still works",
    expect: {
      listingType: "rental",
      titleMatch: /trailer/i,
      titleNot: [/for sale|not for sale/i],
      rentalSubType: "equipment",
      rentalDaily: "55",
      rentalDeposit: "80",
      locationMatch: /west|auckland/i,
      extrasMust: [/dent/i],
      descriptionMust: [/dent/i],
      descriptionMustNot: [/\bfor sale\b|dont put/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
      defectsMustAppear: [/dent/i],
      defectsOnce: [/dent/i],
      qualityContract: true,
    },
  },
];

const WAVE4_MULTI: CorpusCase[] = [
  {
    id: "multi8-identity-change-undo-rechange-pixel",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority",
    input: [
      "selling google pixel 7 128gb black wellie 450",
      "wait no it's a pixel 8 pro 256 blue make it 700",
      "nah forget that it's the 7 128 black again 450",
      "actually wait it IS the 8 pro 256",
      "make it 650 not 700",
      "and cracked screen tho",
      "comes with 2 chargers",
      "pickup westie not cbd",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8/i,
      titleNot: [/pixel\s*7/i, /wait no|forget/i],
      price: "650",
      priceNot: ["450", "700", "7", "8", "128", "256"],
      locationMatch: /west|auckland/i,
      extrasMust: [/256/i, /crack/i, /charger/i],
      extrasMustNot: [/\b128\s*gb\b/i, /pixel\s*7/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi7-price-maybe-firm-nah-final-ipad",
    kind: "physical",
    attack: ["followup_correction", "historical_vs_confirmed_price", "nz_place_slang"],
    likelySubsystem: "authority / listing-facts merge",
    input: [
      "selling ipad air 64gb hammers 380",
      "maybe 350",
      "350 firm",
      "nah 380",
      "or maybe 360",
      "wait nah 370",
      "nah 380 firm that's it",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /ipad/i,
      titleNot: [/maybe|nah|firm/i],
      price: "380",
      priceNot: ["350", "360", "370", "64"],
      locationMatch: /hamilton|hammers/i,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi6-accessory-qty-walk-ps4",
    kind: "physical",
    attack: ["followup_correction", "accessories_quantities", "nz_place_slang"],
    likelySubsystem: "authority / pending-slots / seller-evidence",
    input: [
      "selling ps4 slim dunners 180",
      "comes with 2 pads",
      "actually 3 pads and 5 games",
      "wait 4 pads 2 games",
      "nah 2 pads and 3 games",
      "scratched disc drive tho",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /ps4|playstation/i,
      price: "180",
      priceNot: ["2", "3", "4", "5"],
      locationMatch: /dunedin|dunners/i,
      extrasMust: [/pad|controller/i, /game/i, /scratch/i],
      extrasMustNot: [/\b3\s*pads?\b/i, /\b5\s*games?\b/i, /\b4\s*pads?\b/i],
      publicMust: [/2/i, /3/i],
      defectsMustAppear: [/scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi8-pending-slot-must-not-overwrite-identity",
    kind: "physical",
    attack: ["pending_slot_trap", "mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "pending-slots / draft-transition / authority",
    input: [
      "selling macbook air m1 akl",
      "wait it's m2 16gb 512 not m1",
      "800",
      "space grey",
      "scratched lid tho",
      "pickup chch actually",
      "dont put m1 in the ad",
      "nah still 800 firm",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /macbook/i,
      titleNot: [/\bm1\b/i, /dont put/i],
      price: "800",
      priceNot: ["1", "2", "16", "512"],
      locationMatch: /christchurch|chch/i,
      extrasMust: [/16|512/i, /scratch/i],
      extrasMustNot: [/\bm1\b/i],
      descriptionMustNot: [/dont put m1/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      defectsMustAppear: [/scratch/i],
      verifyNoDontPut: true,
    },
  },
  {
    id: "multi7-vehicle-identity-undo-then-rechange",
    kind: "vehicle",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    input: [
      "selling 2014 mazda demio 90k kays palmy 6500",
      "wait nah it's a 2016 mazda 3",
      "forget that it's the demio 2014 90k 6500",
      "nah it is the mazda 3 2016 110k",
      "rust on sill tho",
      "make it 7200 firm",
      "still palmy pickup",
    ],
    expect: {
      listingType: "vehicle",
      titleMatch: /mazda\s*3|mazda3/i,
      titleNot: [/demio|forget|wait nah/i],
      price: "7200",
      priceNot: ["6500", "2014", "2016", "90", "110"],
      locationMatch: /palmerston|palmy/i,
      vehicle: {
        make: /mazda/i,
        model: /3|mazda\s*3/i,
        year: "2016",
        odometer: "110000",
      },
      extrasMustNot: [/demio/i],
      defectsMustAppear: [/rust/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi6-wanted-budget-pads-requirements",
    kind: "wanted",
    attack: ["followup_correction", "accessories_quantities", "seller_commands", "nz_place_slang"],
    likelySubsystem: "semantic-intent / pending-slots / find-vs-wanted",
    input: [
      "post a wanted listing xbox series s hammers under 400 no scams",
      "actually around 350",
      "nah max 320",
      "must have 2 pads",
      "wait 1 pad is fine but need 2 games",
      "pickup westie ok",
    ],
    expect: {
      listingType: "wanted",
      titleMatch: /xbox|series/i,
      titleNot: [/for sale|no scams/i],
      price: "320",
      priceNot: ["400", "350"],
      locationMatch: /west|auckland|hamilton/i,
      extrasMust: [/pad|controller/i, /game/i],
      wantedNotSale: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi6-rental-trailer-rate-bond-location",
    kind: "rental",
    attack: ["followup_correction", "mixed_listing_type", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority / pending-slots",
    input: [
      "renting trailer 50 a day manukau not for sale",
      "actually 40 a day",
      "nah 45 a day",
      "also 200 a week",
      "bond 100",
      "pickup westie",
    ],
    expect: {
      listingType: "rental",
      titleMatch: /trailer/i,
      titleNot: [/for sale/i],
      rentalSubType: "equipment",
      rentalDaily: "45",
      rentalWeekly: "200",
      rentalDeposit: "100",
      priceNot: ["50", "40"],
      locationMatch: /west|auckland|manukau/i,
      descriptionMustNot: [/\bfor sale\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi5-wanted-iso-then-not-a-sale",
    kind: "wanted",
    attack: ["mixed_listing_type", "followup_correction", "nz_place_slang"],
    likelySubsystem: "semantic-intent / find-vs-wanted / draft-transition",
    input: [
      "ISO lawn mower petrol palmy",
      "budget around 180",
      "nah max 150",
      "not selling mine looking to buy",
      "no rust no scams serious only",
    ],
    expect: {
      listingType: "wanted",
      titleMatch: /mower/i,
      titleNot: [/for sale|selling mine/i],
      price: "150",
      priceNot: ["180"],
      locationMatch: /palmerston|palmy/i,
      extrasMust: [/rust/i],
      wantedNotSale: true,
      publicMustNot: [INSTRUCTION_LEAK_RE, WANTED_INSTRUCTION_LEAK_RE],
    },
  },
];

function askingPrice(fill: SkyAiListingFill): string {
  return String(fill.price || fill.rentalPriceDaily || fill.rentalPriceWeekly || "");
}

function assertCase(c: CorpusCase) {
  const turns = Array.isArray(c.input) ? c.input : [c.input];
  const r = runTurns(`adv4-${c.id}`, turns);
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

  if (e.wantedNotSale) {
    expect(String(fill.listingType || ""), `Wanted≠sale type\n${ctx}`).toBe("wanted");
    expect(String(fill.title || ""), `Wanted≠sale title\n${ctx}`).not.toMatch(SALE_VOICE_RE);
    expect(desc, `Wanted≠sale description\n${ctx}`).not.toMatch(/\bfor sale\b|\bselling my\b/i);
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

/** Current-main breaks — expected semantics stay locked; CI uses it.fails. */
/**
 * Re-score vs PR #28 (Fixer): convert it.fails → it() only when the case
 * genuinely passed on this branch. Documented in
 * docs/awhina-adversarial-qa-report.md (Re-score vs PR #28).
 *
 * Converted to it() on PR #28 (unexpected pass on first re-score run):
 *   wanted-iso-macbook-max-no-scams, wanted-looking-for-pram-post-ad,
 *   wanted-iso-switch-not-selling-mine, rental-2bed-wellie-bond-weeks,
 *   rental-generator-hire-not-sale, rental-room-bond-dollars-not-weekly
 *
 * Newly recorded FAIL (regression vs Wave 4-on-main):
 *   multi7-price-maybe-firm-nah-final-ipad — identity wiped to title "OR"
 */
const KNOWN_FAILURE_IDS = new Set<string>([
  "wanted-wtb-xbox-around-budget",
  "wanted-wtb-gopro-max-akl",
  "wanted-long-ipad-budget-walk",
  "wanted-bike-serious-only-not-desperate",
  "wanted-around-vs-paid-history",
  "rental-van-hire-or-sell-hire-wins",
  "rental-scaffold-daily-and-weekly",
  "rental-triton-just-hiring-not-sale",
  "rental-marquee-just-hiring-dual-rate",
  "rental-trailer-dented-not-for-sale",
  "multi8-identity-change-undo-rechange-pixel",
  "multi6-accessory-qty-walk-ps4",
  "multi8-pending-slot-must-not-overwrite-identity",
  "multi7-vehicle-identity-undo-then-rechange",
  "multi6-wanted-budget-pads-requirements",
  "multi6-rental-trailer-rate-bond-location",
  "multi5-wanted-iso-then-not-a-sale",
  "multi7-price-maybe-firm-nah-final-ipad",
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

describe("adversarial NZ wave4 — price/budget traps (parseListingPriceFromMessage)", () => {
  it("pixel 8 / gopro 11 / m2 are not asking prices without a dollar amount", () => {
    expect(parseListingPriceFromMessage("pixel 8 pro")).not.toBe("8");
    expect(parseListingPriceFromMessage("gopro 11")).not.toBe("11");
    expect(parseListingPriceFromMessage("macbook air m2")).not.toBe("2");
  });

  it("hire dual-rate line is not qty/model 6 as a sale asking", () => {
    expect(parseListingPriceFromMessage("scaffold hire 90 a day or 400 a week chch")).not.toBe("6");
  });

  it.fails('FAIL: "around 450 wellie" wanted budget is 450 not null', () => {
    expect(parseListingPriceFromMessage("WTB xbox series x around 450 wellie")).toBe("450");
  });

  it.fails('FAIL: "max 250" wanted cap is 250 not model 11', () => {
    expect(parseListingPriceFromMessage("wtb gopro 11 akl max 250")).toBe("250");
    expect(parseListingPriceFromMessage("wtb gopro 11 akl max 250")).not.toBe("11");
  });

  it.fails('FAIL: "under 150 palmy" wanted cap is 150', () => {
    expect(parseListingPriceFromMessage("looking for a double pram under 150 palmy")).toBe("150");
  });

  it('"ipad air 64gb hammers 380" → 380 (hammers slang must not drop asking)', () => {
    expect(parseListingPriceFromMessage("ipad air 64gb hammers 380")).toBe("380");
    expect(parseListingPriceFromMessage("ipad air 64gb hammers 380")).not.toBe("64");
  });

  it('"pixel 7 128gb black wellie 450" → 450', () => {
    expect(parseListingPriceFromMessage("pixel 7 128gb black wellie 450")).toBe("450");
    expect(parseListingPriceFromMessage("pixel 7 128gb black wellie 450")).not.toBe("7");
  });

  it('"ps4 slim dunners 180" → 180', () => {
    expect(parseListingPriceFromMessage("ps4 slim dunners 180")).toBe("180");
    expect(parseListingPriceFromMessage("ps4 slim dunners 180")).not.toBe("4");
  });

  it('"520 a week bond 3 weeks" is weekly 520, not bond-weeks 3 as dollars', () => {
    expect(parseListingPriceFromMessage("2bed flat wellie 520 a week bond 3 weeks")).toBe("520");
    expect(parseListingPriceFromMessage("2bed flat wellie 520 a week bond 3 weeks")).not.toBe("3");
  });

  it.fails('FAIL: "280pw bond $1120" weekly 280 beats bond dollars', () => {
    expect(parseListingPriceFromMessage("room for rent tauranga 280pw bond $1120")).toBe("280");
    expect(parseListingPriceFromMessage("room for rent tauranga 280pw bond $1120")).not.toBe("1120");
  });

  it('"just hiring 150 a day" is 150 not 2017 / 18000', () => {
    const msg =
      "might sell or hire my 2017 transit van 150 a day or 18000 queenstown wait just hiring 150 a day";
    expect(parseListingPriceFromMessage(msg)).toBe("150");
    expect(parseListingPriceFromMessage(msg)).not.toBe("18000");
    expect(parseListingPriceFromMessage(msg)).not.toBe("2017");
  });
});

describe("adversarial NZ wave4 — input normalize NZ places", () => {
  it("preserves wellie / wellington identity", () => {
    const n = normalizeAwhinaInput("WTB xbox series x around 450 wellie").normalized;
    expect(n).toMatch(/wellie|wellington/i);
  });

  it("preserves dunners / dunedin identity", () => {
    const n = normalizeAwhinaInput("not selling my 2019 triton just hiring it 140 a day dunners").normalized;
    expect(n).toMatch(/dunners|dunedin/i);
  });

  it("preserves hammers / palmy / chch / akl / westie / queenstown / tauranga", () => {
    const blob = [
      normalizeAwhinaInput("ipad air 64gb hammers 380").normalized,
      normalizeAwhinaInput("hire my honda generator 70 a day palmy").normalized,
      normalizeAwhinaInput("scaffold hire 90 a day chch").normalized,
      normalizeAwhinaInput("wtb gopro 11 akl max 250").normalized,
      normalizeAwhinaInput("pickup westie").normalized,
      normalizeAwhinaInput("transit van 150 a day queenstown").normalized,
      normalizeAwhinaInput("room for rent tauranga 280pw").normalized,
    ].join(" ");
    expect(blob).toMatch(/hammers|hamilton/i);
    expect(blob).toMatch(/palmy|palmerston/i);
    expect(blob).toMatch(/chch|christchurch/i);
    expect(blob).toMatch(/akl|auckland/i);
    expect(blob).toMatch(/westie|west/i);
    expect(blob).toMatch(/queenstown/i);
    expect(blob).toMatch(/tauranga/i);
  });
});

describe("adversarial NZ wave4 — semantic fact model", () => {
  it.fails("FAIL: no scams / serious only / no timewasters are instructions on a WTB xbox", () => {
    const model = parseSellerMessageToFactModel(
      "WTB xbox series x around 450 wellie no timewasters serious only no scams",
      { title: "Xbox Series X", listingType: "wanted" }
    );
    expect(
      model.sellerInstructions.some((f) => /scam|serious|timewaster/i.test(f.value))
    ).toBe(true);
    expect(
      model.publicFacts.some((f) => /no scams|serious only|timewaster/i.test(f.value))
    ).toBe(false);
  });

  it.fails("FAIL: dont put my max / just say wanted ipad are instructions not public facts", () => {
    const model = parseSellerMessageToFactModel(LONG_WANTED_IPAD, {
      title: "iPad Air",
      listingType: "wanted",
      price: "360",
    });
    expect(model.sellerInstructions.length).toBeGreaterThan(0);
    expect(model.publicFacts.some((f) => /dont put my max|no scams/i.test(f.value))).toBe(false);
    expect(model.price.confirmed?.value || "360").toMatch(/360/);
    expect(model.price.confirmed?.value).not.toBe("400");
  });

  it("not for sale / just hiring stay out of publicFacts on a hire generator", () => {
    const model = parseSellerMessageToFactModel(
      "hire my honda generator 70 a day bond 200 palmy not selling just hiring",
      { title: "Honda Generator", listingType: "rental" }
    );
    expect(model.publicFacts.some((f) => /not selling|just hiring|not for sale/i.test(f.value))).toBe(
      false
    );
  });

  it("dented guard on a hire trailer is harvested as a defect", () => {
    const model = parseSellerMessageToFactModel(
      "renting out my trailer 55 a day westie not for sale dented guard still works",
      { title: "Trailer", listingType: "rental" }
    );
    expect(model.negativeCondition.some((f) => /dent/i.test(f.value))).toBe(true);
  });
});

describe("adversarial NZ wave4 — semantic correction + pending-slot traps", () => {
  it.fails("FAIL: pending price must NOT eat 'wait it's a pixel 8 pro not 7' as $8", () => {
    const r = interpretSemanticTurn({
      message: "wait it's a pixel 8 pro not 7",
      pendingSlot: "price",
      canonical: { title: "Google Pixel 7", extras: ["storage:128GB", "colour:black"], price: "450" },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/8|pixel/i);
    expect(blob).not.toMatch(/price:8\b/i);
    expect(blob).not.toMatch(/price:7\b/i);
  });

  it("pending colour must NOT eat '256gb actually' as a colour", () => {
    const r = interpretSemanticTurn({
      message: "256gb actually not 128",
      pendingSlot: "colour",
      canonical: { title: "Google Pixel 7", extras: ["storage:128GB"] },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(blob).toMatch(/256/i);
    expect(blob).not.toMatch(/colour:256/i);
    expect(blob).not.toMatch(/price:256/i);
  });

  it("pending location must NOT eat 'nah 380 firm' as a suburb", () => {
    const r = interpretSemanticTurn({
      message: "nah 380 firm that's it",
      pendingSlot: "location",
      canonical: { title: "iPad Air", price: "350", location: "Hamilton" },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION" || /380/.test(blob)).toBe(true);
    expect(blob).toMatch(/380/);
    expect(blob).not.toMatch(/location:380/i);
    expect(blob).not.toMatch(/price:350/i);
  });

  it.fails("FAIL: nah forget pixel 7 then actually 8 pro is identity re-change not a new listing", () => {
    const r = interpretSemanticTurn({
      message: "actually wait it IS the 8 pro 256",
      pendingSlot: "title",
      canonical: { title: "Google Pixel 7", extras: ["storage:128GB"], price: "450" },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/8/);
    expect(blob).not.toMatch(/price:8\b/i);
  });

  it.fails("FAIL: wait 1 pad is fine but need 2 games corrects qty, not price 1/2", () => {
    const r = interpretSemanticTurn({
      message: "wait 1 pad is fine but need 2 games",
      pendingSlot: "extras",
      canonical: {
        title: "Xbox Series S",
        listingType: "wanted",
        extras: ["included:2 pads"],
        price: "320",
      },
    });
    const blob = r.facts.map((f) => `${f.key}:${f.value}`).join(" | ");
    expect(r.isCorrection || r.primary === "CORRECTION").toBe(true);
    expect(blob).toMatch(/pad|controller|game/i);
    expect(blob).not.toMatch(/price:1\b/i);
    expect(blob).not.toMatch(/price:2\b/i);
  });
});

describe("adversarial NZ wave4 — pending-slot live identity traps", () => {
  beforeEach(() => {
    clearAllListingDraftCacheForTests();
  });

  it("after sparse Pixel draft, 'wait it's a pixel 8 pro' must not become $8 / wipe Pixel", () => {
    const id = "adv4-live-pixel-pending-price";
    wipe(id);
    const t1 = processCanonicalAwhina("selling google pixel 7 128gb black wellie", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("wait it's a pixel 8 pro not 7", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: (t1.listingFill as SkyAiListingFill) || undefined,
      clientTask: t1.sessionState?.task,
    });
    const fill = compose(asFill(t2));
    const ctx = dump(t2, fill);
    expect(String(fill.title || ""), ctx).toMatch(/pixel/i);
    expect(String(fill.price || ""), ctx).not.toBe("8");
    expect(String(fill.price || ""), ctx).not.toBe("7");
    expect(String(fill.title || ""), ctx).not.toMatch(/^wait it/i);
  });

  it("pending location + 'nah 380 firm' must keep iPad identity and set $380", () => {
    const id = "adv4-live-ipad-pending-location";
    wipe(id);
    const t1 = processCanonicalAwhina("selling ipad air 64gb hammers 350", {
      conversationId: id,
      pathname: "/post/ai",
    });
    const t2 = processCanonicalAwhina("nah 380 firm that's it", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: (t1.listingFill as SkyAiListingFill) || undefined,
      clientTask: t1.sessionState?.task,
    });
    const fill = compose(asFill(t2));
    const ctx = dump(t2, fill);
    expect(String(fill.title || ""), ctx).toMatch(/ipad/i);
    expect(String(fill.price || fill.rentalPriceDaily || ""), ctx).toBe("380");
    expect(String(fill.location || ""), ctx).not.toMatch(/^380$/);
    expect(String(fill.title || ""), ctx).not.toMatch(/^nah 380/i);
  });
});

registerCorpus("adversarial NZ wave4 wanted one-shot corpus", WAVE4_WANTED);
registerCorpus("adversarial NZ wave4 rental one-shot corpus", WAVE4_RENTAL);
registerCorpus("adversarial NZ wave4 multi-turn corpus", WAVE4_MULTI);
