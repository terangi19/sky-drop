/**
 * Wave 6 adversarial NZ corpus — SHARED FIXTURE MODULE (not a test file; no vitest import).
 *
 * Holds the corpus types, WAVE6_IDENTITY, WAVE6_CONTRADICTION, KNOWN_FAILURE_IDS and the shared regex
 * constants. Consumed by:
 *   - awhina-adversarial-wave-6.test.ts (real harness: registerCorpus → runTurns/assertCase it / it.fails)
 *   - awhina-adversarial-wave-6.1/6.2/6.3 index files (plain `it` registration checks against this corpus)
 *
 * Fixtures are EVAL CASES ONLY — production must not hardcode these strings. Do not claim SAFE.
 * This file is included by the production tsconfig ("app" ts glob) and must typecheck there; it has no
 * runtime imports and is not imported by any production code.
 */

export const INSTRUCTION_LEAK_RE =
  /LISTING_FILL|LISTING CREATION REQUEST|respond ONLY|Parse everything|system prompt|title it bargain|title it mint|title it tidy|don'?t say damaged|dont put was price|dont put daily rate|don'?t add daily rate|dont put what i paid|dont mention the crack|dont put my max|dont put LISTING_FILL|make the listing|help me choose|write the title|write a good description|suggest a fair|tell me what details|recommend a price|dont use what i paid|dont say water damaged|dont mention I'?m desperate|dont put bond weeks as dollars|dont put m1|dont put the 6d/i;

/**
 * Class 5/7 undo-phrase leak regexes, kept byte-identical to the per-wave index copies they came
 * from (6.1 / 6.2 / 6.3). Corpus entries indexed by those waves carry BOTH INSTRUCTION_LEAK_RE
 * (prompt/instruction leak) AND their wave's undo-phrase regex, so the index contract is enforced in
 * the real runTurns/assertCase harness (added 2026-09-28; strengthening only).
 */
export const UNDO_LEAK_RE_W61 =
  /\bdont put\b|\bdon't put\b|\bdon'?t mention\b|\bforget that\b|\bwait no\b|\bnah forget\b/i;

export const UNDO_LEAK_RE_W62 =
  /\bdont put\b|\bdon't put\b|\bforget that\b|\bwait no\b|\bnah forget\b/i;

export const UNDO_LEAK_RE_W63 =
  /\bdont put\b|\bdon't put\b|\bdon'?t mention\b|\bforget that\b|\bwait no\b|\bnah forget\b|\bscrap that\b|\bundo that\b/i;

export const WANTED_INSTRUCTION_LEAK_RE =
  /\bno scams\b|\bserious only\b|\bno timewasters?\b|\bno time wasters?\b/i;

export const PAID_WAS_LEAK_RE =
  /\b(?:was|paid)\s+\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*k)?\b|\bwhat i paid\b/i;

export const DONT_PUT_LEAK_RE = /\bdont put\b|\bdon't put\b|\bdon'?t mention\b|\bdon'?t say\b/i;

export const SALE_VOICE_RE = /\bfor sale\b|\bselling my\b|\bbuy now\b|\basking price\b/i;

export const EDUCATION_LECTURE_RE =
  /\b(?:how to (?:spot|avoid) (?:a )?scam|never (?:send|wire)|safe pickup tips|too good to be true|scam (?:warning|alert|education)|watch out for scams|this (?:looks|sounds) like a scam)\b/i;

export const EXAGGERATED_CONDITION_RE = /^(New|Used - Like New)$/i;

export type AttackClass =
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

export type ListingKind = "physical" | "vehicle" | "service" | "rental" | "wanted" | "digital";

export type CorpusExpect = {
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

export type CorpusCase = {
  id: string;
  kind: ListingKind;
  attack: AttackClass | AttackClass[];
  likelySubsystem: string;
  knownFailure?: boolean;
  input: string | string[];
  expect: CorpusExpect;
};

export const LONG_WANTED_AMP = [
  "yeah so um post a wanted ad looking for a marshall dsl40 not selling one",
  "around 500 maybe 450 nah max 480 westie henderson no scams serious only no timewasters",
  "prefer with footswitch and cover wait footswitch is fine cracked cabinet no thanks",
  "dont put my max as the title just say wanted marshall amp",
  "oh wait budget is 430 not 480 nah 430 firm",
].join(" ");

export const LONG_RENTAL_TOWNHOUSE = [
  "renting out my 3bed 2bath townhouse nelson 580 a week bond 3 weeks",
  "pets no furnished avail now not for sale not selling just renting the house",
  "dont put daily rate or end date or condition dont put bond weeks as dollars",
  "title it tidy 3bedder write a good description",
].join(" ");


/** Wave 6 — Class 5 identity wipe (≥5–8 turns) */
export const WAVE6_IDENTITY: CorpusCase[] = [
  {
    id: "multi8-pixel7-to-8-undo-rechange",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority",
    knownFailure: true,
    input: [
      "selling google pixel 7 128 black napier 420",
      "wait nah it's a pixel 8 256 porcelain 580",
      "forget that keep the pixel 7 128 420",
      "actually it IS the pixel 8 256 porcelain",
      "make it 560 firm",
      "hairline crack on corner tho",
      "comes with official charger + case",
      "pickup hastings not napier",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8|google pixel/i,
      titleNot: [/\bpixel\s*7\b/i, /wait nah|forget that|actually it/i],
      price: "560",
      priceNot: ["420", "580", "7", "8", "128", "256"],
      locationMatch: /hastings/i,
      extrasMust: [/256/i, /porcelain|white|cream/i, /crack/i, /charger|case/i],
      extrasMustNot: [/\b128\s*gb\b/i, /\bpixel\s*7\b/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi7-macbook-air-m1-to-m2-undo",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price", "seller_commands"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    input: [
      "selling macbook air m1 8/256 space grey dunedin 650",
      "wait no it's m2 16/512 midnight 980",
      "nah forget m2 it's the m1 again 650",
      "actually wait it is the m2 midnight 16gb 512",
      "dont put m1 in the title",
      "dent on lid tho",
      "900 firm pickup mosgiel",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /macbook|air|m2/i,
      titleNot: [/\bm1\b/i, /dont put|wait no|forget/i],
      price: "900",
      priceNot: ["650", "980", "1", "2", "8", "16", "256", "512"],
      locationMatch: /mosgiel|dunedin/i,
      extrasMust: [/512/i, /16/i, /midnight|black/i, /dent/i],
      extrasMustNot: [/\bm1\b/i, /\b8\s*\/\s*256\b/i],
      defectsMustAppear: [/dent/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
      verifyNoDontPut: true,
    },
  },
  {
    id: "multi8-ranger-xlt-to-wildtrak-undo-rechange",
    kind: "vehicle",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    input: [
      "selling 2019 ford ranger xlt 140k kays tauranga 34900",
      "wait nah it's a wildtrak",
      "forget that it's the xlt 2019 140k 34900",
      "nah it is the wildtrak 2019 128k",
      "cracked windscreen tho",
      "make it 36500",
      "still tauranga",
      "dont say crashed just note windscreen",
    ],
    expect: {
      listingType: "vehicle",
      titleMatch: /wildtrak|ranger/i,
      titleNot: [/\bxlt\b/i, /forget|wait nah|dont say/i],
      price: "36500",
      priceNot: ["34900", "2019", "140", "128"],
      locationMatch: /tauranga/i,
      vehicle: {
        make: /ford/i,
        model: /ranger|wildtrak/i,
        year: "2019",
        odometer: "128000",
      },
      extrasMustNot: [/\bxlt\b/i],
      defectsMustAppear: [/windscreen|windshield|crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
    },
  },
  {
    id: "multi6-pending-price-must-not-eat-iphone15",
    kind: "physical",
    attack: ["pending_slot_trap", "mid_conversation_change", "model_as_price"],
    likelySubsystem: "pending-slots / authority",
    knownFailure: true,
    input: [
      "selling iphone 14 pro hamilton",
      "wait it's a 15 pro max not 14",
      "256 blue",
      "battery 87 screen cracked tho",
      "950",
      "dont put 14 in the ad",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /iphone\s*15|15\s*pro/i,
      titleNot: [/\b14\b/i, /dont put|wait it's/i],
      price: "950",
      priceNot: ["14", "15", "256", "87"],
      locationMatch: /hamilton/i,
      extrasMust: [/256/i, /blue/i, /87|battery/i, /crack/i],
      extrasMustNot: [/\b14\s*pro\b/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE, DONT_PUT_LEAK_RE],
    },
  },
  {
    id: "multi5-defect-add-must-not-wipe-ps5",
    kind: "physical",
    attack: ["followup_correction", "faults_with_positive_condition"],
    likelySubsystem: "draft-transition / pending-slots",
    knownFailure: true,
    input: [
      "selling ps5 disc 2 pads 3 games chch 650",
      "wait 1 pad only actually",
      "and disc drive scratched tho",
      "still christchurch",
      "620 ono",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /ps5|playstation/i,
      titleNot: [/^and disc|wait 1 pad/i],
      price: "620",
      priceNot: ["650", "5", "1", "2", "3"],
      locationMatch: /christchurch|chch/i,
      extrasMust: [/pad|controller/i, /scratch/i],
      defectsMustAppear: [/scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi8-ipad-air-identity-flipflop-final",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority",
    knownFailure: true,
    input: [
      "selling ipad air 4 64 starlight new plymouth 380",
      "nah it's air 5 256 purple 520",
      "wait no air 4 again 380",
      "actually air 5 256 purple",
      "480 firm",
      "tiny dent on corner",
      "box + pencil tip only",
      "pickup waitara",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /ipad\s*air\s*5|air\s*5/i,
      titleNot: [/air\s*4|\b4\b.*starlight|nah it's|wait no/i],
      price: "480",
      priceNot: ["380", "520", "4", "5", "64", "256"],
      locationMatch: /waitara|new plymouth/i,
      extrasMust: [/256/i, /purple/i, /dent/i],
      extrasMustNot: [/\b64\s*gb\b/i, /air\s*4/i],
      defectsMustAppear: [/dent/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "multi8-identity-change-undo-rechange-s22",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price", "nz_place_slang"],
    likelySubsystem: "draft-transition / authority",
    knownFailure: true,
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
      publicMustNot: [INSTRUCTION_LEAK_RE, UNDO_LEAK_RE_W61],
      defectsMustAppear: [/scratch/i],
      verifyNoDontPut: true,
    },
  },
  {
    id: "multi4-followup-crack-must-not-wipe-s23",
    kind: "physical",
    attack: ["followup_correction", "faults_with_positive_condition"],
    likelySubsystem: "draft-transition / pending-slots",
    knownFailure: true,
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

  // ---- Wave 6.3 Class 5.2–5.7 deeper contracts (knownFailure) ----
  {
    id: "multi6-xbox-series-s-x-undo-rechange",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "model_as_price"],
    likelySubsystem: "draft-transition / listing-identity-conflict",
    knownFailure: true,
    // Wave 6.3 §5.2
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
    // Wave 6.3 §5.2
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
    // Wave 6.3 §5.3
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
    // Wave 6.3 §5.3
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
    // Wave 6.3 §5.4
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
    // Wave 6.3 §5.4
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
    // Wave 6.3 §5.4
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
    // Wave 6.3 §5.5
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
    // Wave 6.3 §5.5
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
    // Wave 6.3 §5.7
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
    // Wave 6.3 §5.7
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
    // Wave 6.3 §5.7
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
  // ---- Wave 6.1 E5 expanders (knownFailure) — added 2026-09-28 so every 6.1 index ID runs in the real harness ----
  {
    id: "multi8-undo-undo-affirm-pixel-family",
    kind: "physical",
    attack: ["mid_conversation_change", "followup_correction", "nz_place_slang"],
    likelySubsystem: "draft-transition / E5.2 last-affirm",
    // Wave 6.1 E5.2
    knownFailure: true,
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
    // Wave 6.1 E5.3
    knownFailure: true,
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
    // Wave 6.1 E5.5
    knownFailure: true,
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
    // Wave 6.1 E5.7
    knownFailure: true,
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
    // Wave 6.1 E5.6
    knownFailure: true,
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

/** Wave 6 — Class 7 contradictions / model-as-price */
export const WAVE6_CONTRADICTION: CorpusCase[] = [
  {
    id: "physical-iphone15-contradiction-one-shot",
    kind: "physical",
    attack: ["contradictory", "faults_with_positive_condition", "model_as_price"],
    likelySubsystem: "listing-facts merge / semantic-intent",
    knownFailure: true,
    input:
      "iphone 15 pro 128gb wait no 256 black actually blue like new battery 87 screen cracked though auckland 950",
    expect: {
      listingType: "physical",
      titleMatch: /iphone\s*15/i,
      titleNot: [/wait no|actually|like new/i],
      price: "950",
      priceNot: ["15", "128", "256", "87"],
      extrasMust: [/256/i, /blue/i, /87|battery/i, /crack/i],
      extrasMustNot: [/\b128\s*gb\b/i, /\bblack\b/i],
      conditionNot: [/^New$/i, /Like New/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-storage-colour-flipflops-pixel8",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / last-confirmed-wins",
    knownFailure: true,
    input: [
      "selling pixel 8 128 obsidian wellington 520",
      "wait no 256 hazel",
      "nah 128 again",
      "actually 256 hazel 500",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8/i,
      price: "500",
      priceNot: ["520", "8", "128", "256"],
      extrasMust: [/256/i, /hazel|green|brown/i],
      extrasMustNot: [/\b128\s*gb\b/i, /obsidian/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-series-x-1tb-colour-flip",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / model-as-price",
    knownFailure: true,
    input: [
      "xbox series x 1tb black palmy 550",
      "wait it's white not black",
      "nah black",
      "actually white 520",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /series\s*x|xbox/i,
      price: "520",
      priceNot: ["550", "1", "1000"],
      extrasMust: [/white/i, /1\s*tb|1000/i],
      extrasMustNot: [/\bblack\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-air-max-90-asking-not-model",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang"],
    likelySubsystem: "price extract / model-as-price",
    knownFailure: true,
    input: "nike air max 90 infrared size 10 95 greymouth good condition",
    expect: {
      listingType: "physical",
      titleMatch: /air\s*max\s*90|nike/i,
      price: "95",
      priceNot: ["90", "10"],
      locationMatch: /greymouth/i,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-gopro-11-asking-not-model",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang", "accessories_quantities"],
    likelySubsystem: "price extract / model-as-price",
    knownFailure: false, // GUARD: converted to regression guard (passes on 02b6733), W6.2/6.3 typecheck run 2026-09-28
    input: "gopro hero 11 black with 2 batteries 280 queenstown scratched screen",
    expect: {
      listingType: "physical",
      titleMatch: /gopro|hero\s*11/i,
      price: "280",
      priceNot: ["11", "2"],
      locationMatch: /queenstown/i,
      extrasMust: [/batter/i, /scratch/i],
      defectsMustAppear: [/scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-last-confirmed-storage-wins-s24",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / last-confirmed-wins",
    knownFailure: true,
    input: [
      "samsung s24 ultra 256 titanium black akl 950",
      "wait 512",
      "nah 256",
      "actually 512 titanium grey 920 screen crack",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /s24|ultra|samsung/i,
      price: "920",
      priceNot: ["950", "24", "256", "512"],
      extrasMust: [/512/i, /grey|gray/i, /crack/i],
      extrasMustNot: [/\b256\s*gb\b/i],
      defectsMustAppear: [/crack/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "vehicle-sti-50k-slang-asking",
    kind: "vehicle",
    attack: ["model_as_price", "nz_place_slang", "slang_typos"],
    likelySubsystem: "price extract / model-as-price",
    knownFailure: true,
    input: "selling my subaru wrx sti 50k greymouth 2015 140k kays cracked bumper",
    expect: {
      listingType: "vehicle",
      titleMatch: /subaru|wrx|sti/i,
      price: "50000",
      priceNot: ["2015", "140", "50"],
      locationMatch: /greymouth/i,
      vehicle: { make: /subaru/i, model: /wrx|sti/i, year: "2015", odometer: "140000" },
      defectsMustAppear: [/crack|bumper/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-brand-new-but-smashed-pixel",
    kind: "physical",
    attack: ["faults_with_positive_condition", "contradictory", "model_as_price"],
    likelySubsystem: "condition authority / model-as-price",
    knownFailure: true,
    input: "brand new google pixel 8 pro 128 but smashed screen 320 hamilton",
    expect: {
      listingType: "physical",
      titleMatch: /pixel\s*8/i,
      price: "320",
      priceNot: ["8", "128"],
      conditionNot: [/^New$/i, /Brand New/i, /Like New/i],
      defectsMustAppear: [/smash|crack|broken/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-s23-ultra-contradiction-one-shot",
    kind: "physical",
    attack: ["contradictory", "faults_with_positive_condition", "model_as_price"],
    likelySubsystem: "listing-facts merge / semantic-intent",
    knownFailure: true,
    input:
      "samsung s23 ultra 256gb wait no 512 black actually green like new battery 91 screen hairline though dunedin 890",
    expect: {
      listingType: "physical",
      titleMatch: /s23|ultra|samsung/i,
      titleNot: [/wait no|actually|like new/i],
      price: "890",
      priceNot: ["23", "256", "512", "91"],
      locationMatch: /dunedin/i,
      extrasMust: [/512/i, /green/i, /91|battery/i, /hairline|crack|scratch/i],
      extrasMustNot: [/\b256\s*gb\b/i, /\bblack\b/i],
      conditionNot: [/like\s*new|brand\s*new|^new$/i],
      defectsMustAppear: [/hairline|crack|scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-storage-colour-flipflops-s23",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / last-confirmed-wins",
    knownFailure: true,
    input: [
      "selling samsung galaxy s23 128gb black wellington 490",
      "actually 256",
      "wait no 512 and cream not black",
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
    id: "physical-series-s-1tb-colour-flip",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / model-as-price",
    knownFailure: true,
    input: [
      "xbox series s 512 white porirua 380",
      "wait no 1tb white actually black 360",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /series\s*s|xbox/i,
      price: "360",
      priceNot: ["380", "1", "512"],
      locationMatch: /porirua/i,
      extrasMust: [/1\s*tb|1000/i, /black/i],
      extrasMustNot: [/\b512\b/i, /\bwhite\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-air-max-90-infrared-not-price",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang"],
    likelySubsystem: "price extract / model-as-price",
    knownFailure: true,
    input: "air max 90 infrared size 9 95 greymouth",
    expect: {
      listingType: "physical",
      titleMatch: /air\s*max\s*90|nike/i,
      price: "95",
      priceNot: ["90", "9"],
      locationMatch: /greymouth/i,
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-qty-correction-not-price",
    kind: "physical",
    attack: ["followup_correction", "accessories_quantities", "model_as_price"],
    likelySubsystem: "authority / qty vs price",
    knownFailure: true,
    input: [
      "selling ps5 disc 2 pads 3 games chch 620",
      "wait 1 pad is fine but need 2 games only",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /ps5|playstation/i,
      price: "620",
      priceNot: ["1", "2", "3", "5"],
      locationMatch: /christchurch|chch/i,
      extrasMust: [/pad|controller/i, /game/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-like-new-then-hairline-condition-conservative",
    kind: "physical",
    attack: ["faults_with_positive_condition", "contradictory", "nz_place_slang"],
    likelySubsystem: "condition authority / VERIFY",
    knownFailure: true,
    input:
      "ipad air m2 256 like new wait battery 88 hairline though nelson 640",
    expect: {
      listingType: "physical",
      titleMatch: /ipad|air|m2/i,
      titleNot: [/like new|wait|though/i],
      price: "640",
      priceNot: ["2", "256", "88"],
      locationMatch: /nelson/i,
      extrasMust: [/256/i, /88|battery/i, /hairline|crack|scratch/i],
      conditionNot: [/like\s*new|brand\s*new|^new$/i],
      defectsMustAppear: [/hairline|crack|scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-storage-only-followup-not-price",
    kind: "physical",
    attack: ["followup_correction", "model_as_price", "nz_place_slang"],
    likelySubsystem: "authority / storage PATCH not price",
    knownFailure: true,
    input: [
      "selling samsung galaxy a54 128 black timaru 280",
      "actually 256",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /a54|galaxy|samsung/i,
      price: "280",
      priceNot: ["256", "128", "54"],
      locationMatch: /timaru/i,
      extrasMust: [/256/i],
      extrasMustNot: [/\b128\s*gb\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-colour-flip-keeps-1tb-without-repeat",
    kind: "physical",
    attack: ["followup_correction", "contradictory", "model_as_price"],
    likelySubsystem: "authority / E7.7 colour flip keeps storage",
    knownFailure: true,
    input: [
      "xbox series s 1tb white new plymouth 340",
      "wait no white actually black 320",
    ],
    expect: {
      listingType: "physical",
      titleMatch: /series\s*s|xbox/i,
      price: "320",
      priceNot: ["340", "1"],
      locationMatch: /new plymouth|plymouth/i,
      extrasMust: [/1\s*tb|1000/i, /black/i],
      extrasMustNot: [/\bwhite\b/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-battery-health-not-price-iphone13",
    kind: "physical",
    attack: ["model_as_price", "faults_with_positive_condition", "nz_place_slang"],
    likelySubsystem: "price extract / E7.3 battery≠price",
    knownFailure: true,
    input: "iphone 13 128 midnight battery 91 good nick invercargill 420 screen hairline",
    expect: {
      listingType: "physical",
      titleMatch: /iphone\s*13/i,
      price: "420",
      priceNot: ["13", "128", "91"],
      locationMatch: /invercargill/i,
      extrasMust: [/91|battery/i, /hairline|crack|scratch/i],
      defectsMustAppear: [/hairline|crack|scratch/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-macbook-m2-storage-flip-one-shot",
    kind: "physical",
    attack: ["contradictory", "model_as_price", "nz_place_slang"],
    likelySubsystem: "listing-facts merge / E7.1 one-shot chain",
    knownFailure: true,
    input:
      "macbook air m2 256gb wait no 512 silver actually space grey like new battery 94 dented lid though tauranga 980",
    expect: {
      listingType: "physical",
      titleMatch: /macbook|air|m2/i,
      titleNot: [/wait no|actually|like new/i],
      price: "980",
      priceNot: ["2", "256", "512", "94"],
      locationMatch: /tauranga/i,
      extrasMust: [/512/i, /grey|gray|space/i, /94|battery/i, /dent/i],
      extrasMustNot: [/\b256\s*gb\b/i, /\bsilver\b/i],
      conditionNot: [/like\s*new|brand\s*new|^new$/i],
      defectsMustAppear: [/dent/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  {
    id: "physical-jordan-1-size-11-asking-not-size",
    kind: "physical",
    attack: ["model_as_price", "nz_place_slang"],
    likelySubsystem: "price extract / E7.5 size≠price",
    knownFailure: true,
    input: "jordan 1 chicago size 11 180 whanganui scuffed toe",
    expect: {
      listingType: "physical",
      titleMatch: /jordan|chicago/i,
      price: "180",
      priceNot: ["1", "11"],
      locationMatch: /whanganui/i,
      extrasMust: [/size\s*11|11/i, /scuff/i],
      defectsMustAppear: [/scuff/i],
      publicMustNot: [INSTRUCTION_LEAK_RE],
    },
  },
  // --- Wave 6.2 Class 7 expander twins (NZ) — knownFailure until Fixer converts ---
  {
    id: "physical-s24-ultra-contradiction-one-shot",
    kind: "physical",
    attack: ["contradictory", "faults_with_positive_condition", "model_as_price"],
    likelySubsystem: "listing-facts merge / §7.1 twin",
    knownFailure: true,
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
    input: [
      "selling samsung galaxy a54 128 awesome black oamaru 290",
      "actually 256",
    ],
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
    input: [
      "ps5 digital 825 white hamilton 480",
      "wait no 1tb white actually black 450",
    ],
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
    knownFailure: false, // GUARD: converted to regression guard (passes on 02b6733), W6.2/6.3 typecheck run 2026-09-28
    input: [
      "samsung s23 512 cream napier 510",
      "wait no cream actually green 490",
    ],
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
    input: "excellent condition ipad pro 11 256 space grey but dented corner tho whakatane 780",
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

  // ---- Main-bug pull-out from Wave 6.4 (#28-only file) — added 2026-09-28 ----
  // Same turns as 6.4 GUARD w64-guard-full-no-trigger-pixel-8-case-nah-make-it-8 (a GUARD on patched #28).
  // On main 5d10ccf+02b6733: price becomes 8 but the title becomes "Google Pixel 8" (drops "case").
  {
    id: "physical-pixel8-case-price-8-keeps-case-title",
    kind: "physical",
    attack: ["model_as_price", "followup_correction"],
    likelySubsystem: "pending price answer / title rebuild on price change",
    knownFailure: true,
    input: ["google pixel 8 case clear nelson 10", "nah make it 8"],
    expect: {
      listingType: "physical",
      titleMatch: /case/i,
      price: "8",
    },
  },
];


/**
 * Current-branch breaks — expected semantics stay locked; CI uses it.fails.
 * First run vs cursor/awhina-rescore-w28-584e: 24 passed, 44 failed (68).
 * Rebased onto main @ 6e6fd19: 12 extra live `it()` cases fail vs that older
 * production tip (Wanted fill / property weekly / model-as-price fill / parser).
 * Those IDs are recorded as FAIL here so CI completes; expected semantics unchanged.
 * `around 250` now passes on main (cannot stay `it.fails` — vitest requires expected-fail to fail).
 * Converted genuine passes stay `it()`. Remaining corpus IDs below stay FAIL.
 */

// Cases explicitly marked knownFailure: false are converted regression guards (plain it()).
export const KNOWN_FAILURE_IDS = new Set<string>([
  ...WAVE6_IDENTITY.filter((c) => c.knownFailure !== false).map((c) => c.id),
  ...WAVE6_CONTRADICTION.filter((c) => c.knownFailure !== false).map((c) => c.id),
]);

/** All shared corpus cases, in registration order (identity first, then contradiction). */
export const WAVE6_ALL_CASES: readonly CorpusCase[] = [...WAVE6_IDENTITY, ...WAVE6_CONTRADICTION];

/** Look up a shared corpus case by ID (used by the 6.1/6.2/6.3 index checks). */
export function findWave6CorpusCase(id: string): CorpusCase | undefined {
  return WAVE6_ALL_CASES.find((c) => c.id === id);
}

/**
 * Normalise a corpus value for index deep-equality: every RegExp becomes { source, flags } so two
 * regexes compare equal only when both pattern and flags match; objects are compared key-by-key.
 */
export function normalizeCorpusValue(value: unknown): unknown {
  if (value instanceof RegExp) return { source: value.source, flags: value.flags };
  if (Array.isArray(value)) return value.map(normalizeCorpusValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, normalizeCorpusValue(v)])
    );
  }
  return value;
}
