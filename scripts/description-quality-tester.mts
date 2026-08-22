/**
 * Description quality tester — readable category sweep + sequential isolation.
 *
 * Usage:
 *   npm run test:description-quality
 *   npx tsx scripts/description-quality-tester.mts
 *   npx tsx scripts/description-quality-tester.mts --category "Toyota Hilux"
 *   npx tsx scripts/description-quality-tester.mts --sequential
 *   npx tsx scripts/description-quality-tester.mts --unknown
 *   npx tsx scripts/description-quality-tester.mts --all
 *   npx tsx scripts/description-quality-tester.mts --manual
 */

import type { SkyAiListingFill } from "../app/lib/sky-ai-listing-fill.ts";
import { enforcePublicListingDescription } from "../app/lib/awhina-listing-composer.ts";
import {
  GENERIC_MARKETPLACE_FILLER_RE,
  hasSemanticFactDuplication,
  validateDescriptionQualityContract,
} from "../app/lib/awhina-description-quality.ts";
import { MARKETING_FILLER_RE } from "../app/lib/awhina-description-writer.ts";

type Case = {
  name: string;
  fill: Partial<SkyAiListingFill> & { title: string };
  must: RegExp[];
  mustNot?: RegExp[];
  manualSeed?: string;
};

const CASES: Case[] = [
  {
    name: "iPhone",
    manualSeed:
      "Apple iPhone 15 Pro 256GB, Natural Titanium, like-new, $1,250, Hamilton. 94% battery, original box.",
    fill: {
      title: "Apple iPhone 15 Pro 256GB",
      condition: "Used - Like New",
      location: "Hamilton",
      extras: ["storage:256GB", "colour:Natural Titanium", "battery:94%"],
    },
    must: [/256GB/i, /Hamilton/i],
    mustNot: [/Hilux/i, /Samsung/i],
  },
  {
    name: "Samsung Galaxy",
    manualSeed:
      "Samsung Galaxy S24 Ultra 512GB Titanium Black, good condition, Henderson Auckland. Original box and S Pen.",
    fill: {
      title: "Samsung Galaxy S24 Ultra 512GB",
      condition: "Used - Good",
      location: "Henderson, Auckland",
      extras: ["storage:512GB", "colour:Titanium Black", "includes:original box", "includes:S Pen"],
    },
    must: [/512GB/i, /Henderson/i],
    mustNot: [/iPhone/i, /128,?000\s*km/i],
  },
  {
    name: "Toyota Hilux",
    manualSeed:
      "List my 2018 Toyota Hilux SR5, 128,000km, automatic, diesel, black, good condition, full service history, canopy and tow bar, $34,500 Auckland",
    fill: {
      title: "2018 Toyota Hilux SR5",
      listingType: "vehicle",
      category: "Cars",
      condition: "Used - Good",
      location: "Auckland",
      vehicleYear: "2018",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleOdometer: "128000",
      vehicleTransmission: "Automatic",
      vehicleFuelType: "Diesel",
      vehicleColour: "Black",
      extras: ["includes:canopy", "includes:tow bar", "service:full service history"],
    },
    must: [/2018/i, /128,?000\s*km/i, /diesel/i, /Auckland/i],
    mustNot: [/256GB/i, /iPhone/i],
  },
  {
    name: "BMW 335i extraction",
    manualSeed:
      "2007 BMW 335i coupe 145000km automatic grey modified twin turbos intercooler downpipes intakes Auckland good condition",
    fill: {
      title: "2007 BMW 335i",
      listingType: "vehicle",
      category: "Cars",
      condition: "Used - Good",
      location: "Auckland",
      vehicleYear: "2007",
      vehicleMake: "BMW",
      vehicleModel: "335i",
      vehicleBodyType: "Coupe",
      vehicleOdometer: "145000",
      vehicleTransmission: "Automatic",
      vehicleColour: "Grey",
      extras: [
        "modification:twin turbos",
        "modification:intercooler",
        "modification:downpipes",
        "modification:intakes",
      ],
    },
    must: [/2007/i, /335i/i, /145,?000\s*km/i, /grey|gray/i, /Auckland/i, /twin turbos/i, /intercooler/i],
    mustNot: [
      /Fitted with 2007 BMW 335i coupe 145000km/i,
      /modified twin turbos intercooler downpipes intakes Auckland good condition/i,
    ],
  },
  {
    name: "Pokémon card",
    manualSeed: "Charizard VMAX PSA 10 Champion's Path, like new, Auckland",
    fill: {
      title: "Charizard VMAX",
      category: "Collectibles",
      condition: "Used - Like New",
      location: "Auckland",
      extras: ["set:Champion's Path", "grade:PSA 10", "subject:Charizard"],
    },
    must: [/Charizard/i, /PSA\s*10/i],
    mustNot: [/odometer/i],
  },
  {
    name: "Lawn mowing service",
    manualSeed: "Lawn mowing North Shore Auckland from $60",
    fill: {
      title: "Lawn mowing",
      listingType: "service",
      category: "Gardening",
      location: "Auckland",
      extras: ["service area:North Shore", "pricing:from $60"],
    },
    must: [/lawn|mowing/i, /Auckland/i],
    mustNot: [/128,?000\s*km/i],
  },
  {
    name: "Trailer hire",
    manualSeed: "6x4 box trailer hire Hamilton $45/day bond $100",
    fill: {
      title: "6x4 box trailer hire",
      listingType: "rental",
      category: "Equipment Hire",
      location: "Hamilton",
      price: "45",
      rentalPriceDaily: "45",
      rentalDeposit: "100",
      rentalSubType: "equipment",
    },
    must: [/trailer/i, /Hamilton/i],
    mustNot: [/iPhone/i],
  },
  {
    name: "Vintage typewriter (niche)",
    manualSeed: "1960s Olivetti Lettera 32 typewriter, new ribbon, case, all keys working, Greymouth",
    fill: {
      title: "1960s Olivetti Lettera 32 typewriter",
      condition: "Used - Good",
      location: "Greymouth",
      extras: ["ribbon:new", "case included", "all keys working"],
    },
    must: [/Olivetti|typewriter/i, /Greymouth/i],
    mustNot: [/512GB|weekly rent/i],
  },
];

/** Categories never used as implementation templates — proves generalisation. */
const UNKNOWN_CASES: Case[] = [
  {
    name: "Metal lathe (industrial)",
    manualSeed: "Colchester Triumph 2000 metal lathe, 3-phase, chuck and tooling, fair condition, Whanganui",
    fill: {
      title: "Colchester Triumph 2000 metal lathe",
      condition: "Used - Fair",
      location: "Whanganui",
      extras: ["note:3-phase power", "note:includes chuck and tooling"],
    },
    must: [/lathe/i, /Whanganui/i],
    mustNot: [/\bper hour\b/i],
  },
  {
    name: "Bee hive (niche physical)",
    manualSeed: "Flow Hive 2 cedar bee hive, used one season, complete with frames, Nelson",
    fill: {
      title: "Flow Hive 2 cedar bee hive",
      condition: "Used - Good",
      location: "Nelson",
      extras: ["note:complete with frames", "note:used one season"],
    },
    must: [/hive|Flow/i, /Nelson/i],
  },
  {
    name: "Wanted E92 bumper",
    manualSeed: "Looking for an E92 M Sport rear bumper in Space Grey around Auckland, budget around $800",
    fill: {
      title: "BMW E92 M Sport rear bumper Space Grey",
      listingType: "wanted",
      location: "Auckland",
      price: "800",
    },
    must: [/looking for|wanted|after a/i, /E92|bumper/i, /Auckland/i],
    mustNot: [/\bfor sale\b/i, /\bselling my\b/i],
  },
  {
    name: "Rich lawn service",
    manualSeed:
      "I mow lawns around West Auckland. Small lawns from $40, larger lawns quoted depending on size. Fortnightly mowing and green waste removal.",
    fill: {
      title: "Lawn mowing",
      listingType: "service",
      category: "Gardening",
      location: "West Auckland",
      extras: [
        "note:small lawns from $40",
        "note:larger lawns quoted depending on size",
        "note:regular fortnightly mowing available",
        "note:green waste removal offered",
      ],
    },
    must: [/lawn|mowing/i, /West Auckland|\$40|fortnightly|green waste/i],
    mustNot: [/\b(?:item|product)\s+in\s+good\s+condition\b/i, /\bfor sale\b/i],
  },
  {
    name: "Tandem trailer rental",
    manualSeed: "Renting out my tandem trailer in Henderson, $60 a day, $150 bond, pickup only, tie-down straps included",
    fill: {
      title: "Tandem trailer",
      listingType: "rental",
      category: "Equipment Hire",
      location: "Henderson",
      rentalPriceDaily: "60",
      rentalDeposit: "150",
      rentalSubType: "equipment",
      extras: ["note:pickup only", "includes:tie-down straps"],
    },
    must: [/trailer/i, /Henderson/i],
    mustNot: [/\bselling my\b/i, /\bfor sale\b/i],
  },
  {
    name: "Kombucha SCOBY kit",
    manualSeed: "Kombucha SCOBY starter kit, includes jar and starter tea, 2 cultures, good condition, New Plymouth",
    fill: {
      title: "Kombucha SCOBY starter kit",
      condition: "Used - Good",
      location: "New Plymouth",
      extras: ["note:includes jar and starter tea", "quantity:2 cultures"],
    },
    must: [/SCOBY|kombucha/i, /New Plymouth/i],
  },
  {
    name: "Piano tuning service",
    manualSeed: "Piano tuning Christchurch, $180 standard tune, can travel within Canterbury",
    fill: {
      title: "Piano tuning",
      listingType: "service",
      category: "Music & Instruments",
      location: "Christchurch",
      extras: ["note:$180 standard tune", "note:can travel within Canterbury"],
    },
    must: [/piano/i, /Christchurch|Canterbury|\$180/i],
  },
];

const SEQUENTIAL: Array<Partial<SkyAiListingFill> & { title: string; replaceDraft?: boolean }> = [
  { title: "Apple iPhone 15 Pro", extras: ["storage:256GB"], location: "Hamilton" },
  {
    title: "2018 Toyota Hilux SR5",
    listingType: "vehicle",
    vehicleYear: "2018",
    vehicleMake: "Toyota",
    vehicleModel: "Hilux",
    vehicleOdometer: "128000",
    location: "Auckland",
    replaceDraft: true,
  },
  {
    title: "Samsung Galaxy S24 Ultra",
    extras: ["storage:512GB"],
    location: "Henderson, Auckland",
    replaceDraft: true,
  },
  {
    title: "Charizard VMAX PSA 10",
    category: "Collectibles",
    extras: ["grade:PSA 10"],
    location: "Wellington",
    replaceDraft: true,
  },
  {
    title: "Lawn mowing",
    listingType: "service",
    location: "Christchurch",
    replaceDraft: true,
  },
  {
    title: "6x4 trailer hire",
    listingType: "rental",
    location: "Dunedin",
    replaceDraft: true,
  },
];

const args = process.argv.slice(2);
const onlyCategory = args.includes("--category")
  ? args[args.indexOf("--category") + 1]
  : null;
const runSequential = args.includes("--sequential");
const runUnknown = args.includes("--unknown");
const runAll = args.includes("--all");
const showManual = args.includes("--manual");

function describe(fill: SkyAiListingFill): string {
  return enforcePublicListingDescription(fill, { force: true }).description?.trim() || "";
}

function check(desc: string, fill: SkyAiListingFill, must: RegExp[], mustNot: RegExp[] = []) {
  const issues: string[] = [];
  if (desc.length < 12) issues.push("description too short");
  for (const re of must) {
    if (!re.test(desc)) issues.push(`missing: ${re.source}`);
  }
  for (const re of mustNot) {
    if (re.test(desc)) issues.push(`forbidden: ${re.source}`);
  }
  if (MARKETING_FILLER_RE.test(desc)) issues.push("marketing filler");
  if (GENERIC_MARKETPLACE_FILLER_RE.test(desc)) issues.push("generic marketplace filler");
  if (hasSemanticFactDuplication(desc)) issues.push("semantic duplicate facts");
  const contract = validateDescriptionQualityContract(desc, fill, { requireNonEmpty: must.length > 0 });
  if (!contract.ok) issues.push(`quality contract: ${contract.violations.join(", ")}`);
  return issues;
}

function printCase(testCase: Case) {
  const fill: SkyAiListingFill = {
    listingType: testCase.fill.listingType || "physical",
    category: testCase.fill.category || "Other",
    condition:
      testCase.fill.condition ??
      (testCase.fill.listingType === "service" || testCase.fill.listingType === "rental"
        ? undefined
        : "Used - Good"),
    ...testCase.fill,
  };
  const desc = describe(fill);
  const issues = check(desc, fill, testCase.must, testCase.mustNot || []);
  const ok = issues.length === 0;
  console.log(`\n${"─".repeat(72)}`);
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${testCase.name}`);
  console.log(`Title: ${fill.title}`);
  if (fill.location) console.log(`Location: ${fill.location}`);
  console.log(`\nDescription:\n  ${desc || "(empty)"}`);
  if (testCase.manualSeed) {
    console.log(`\nManual /post/ai seed:\n  ${testCase.manualSeed}`);
  }
  if (!ok) console.log(`\nIssues:\n  ${issues.map((i) => `- ${i}`).join("\n  ")}`);
  return ok;
}

function runCaseList(label: string, cases: Case[]) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(label);
  console.log(`Cases: ${cases.length}`);
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    if (printCase(c)) pass++;
    else fail++;
  }
  console.log(`\n${"─".repeat(72)}`);
  console.log(`Result: ${pass} passed, ${fail} failed`);
  return fail;
}

function runSequentialChain() {
  console.log("Description quality tester — sequential isolation chain");
  console.log("iPhone → Hilux → Samsung → Pokémon → service → trailer\n");
  let prior = "";
  let fail = 0;
  for (const step of SEQUENTIAL) {
    const fill: SkyAiListingFill = {
      listingType: step.listingType || "physical",
      category: step.category || "Other",
      condition: step.listingType === "service" || step.listingType === "rental" ? undefined : "Used - Good",
      ...step,
      description: prior || undefined,
    };
    const desc = describe(fill);
    const blob = `${fill.title} ${(fill.extras || []).join(" ")}`.toLowerCase();
    const bleed: string[] = [];
    if (!/iphone/i.test(blob) && /iphone|256gb/i.test(desc)) bleed.push("iPhone bleed");
    if (!/hilux/i.test(blob) && /hilux|128,?000/i.test(desc)) bleed.push("Hilux bleed");
    if (!/samsung/i.test(blob) && /samsung|512gb/i.test(desc)) bleed.push("Samsung bleed");
    if (!/charizard|pok/i.test(blob) && /charizard|pok[eé]mon/i.test(desc)) bleed.push("card bleed");
    const issues = [
      ...(desc.length < 12 ? ["empty description"] : []),
      ...(hasSemanticFactDuplication(desc) ? ["semantic dupes"] : []),
      ...(GENERIC_MARKETPLACE_FILLER_RE.test(desc) ? ["filler"] : []),
      ...bleed,
    ];
    const ok = issues.length === 0;
    console.log(`${ok ? "✓" : "✗"} ${step.title}`);
    console.log(`  ${desc}`);
    if (!ok) console.log(`  Issues: ${issues.join(", ")}`);
    if (!ok) fail++;
    prior = desc;
  }
  console.log(fail ? `\nSequential chain: FAILED (${fail} steps)` : "\nSequential chain: PASSED");
  return fail === 0 ? 0 : 1;
}

function printManualGuide() {
  console.log(`
${"═".repeat(72)}
MANUAL UI TESTER — /post/ai
${"═".repeat(72)}

Open: http://localhost:3000/post/ai

For each seed below:
  1. Paste the message → wait for draft
  2. Open Edit details → confirm title, price, condition, location
  3. Read description — check: grounded facts, no filler, no dupes, natural voice

SEQUENTIAL ISOLATION (do NOT clear chat between steps):
  Step 1: iPhone seed
  Step 2: Hilux seed (full listing message)
  Step 3: Samsung seed
  → Samsung description must have ZERO iPhone/Hilux facts

EDIT REGEN:
  After Samsung draft: "actually battery health is 91%"
  → description must show 91% only (not 94%)

REPLACE REGEN:
  After Samsung: "remove the tow bar" (on Hilux) / location change
  → old fact must disappear entirely

CATEGORY SEEDS:
`);
  for (const c of CASES) {
    if (c.manualSeed) console.log(`  [${c.name}]\n    ${c.manualSeed}\n`);
  }
  console.log("UNKNOWN / NICHE SEEDS (architecture must generalise — not template-specific):\n");
  for (const c of UNKNOWN_CASES) {
    if (c.manualSeed) console.log(`  [${c.name}]\n    ${c.manualSeed}\n`);
  }
}

async function main() {
  if (showManual) {
    printManualGuide();
    return;
  }
  let fail = 0;
  if (runAll) {
    fail += runCaseList("Description quality tester — category sweep", CASES);
    fail += runSequentialChain();
    fail += runCaseList("Description quality tester — unknown / niche listings", UNKNOWN_CASES);
  } else if (runSequential) {
    fail = runSequentialChain();
  } else if (runUnknown) {
    fail = runCaseList("Description quality tester — unknown / niche listings", UNKNOWN_CASES);
  } else {
    const cases = onlyCategory
      ? [...CASES, ...UNKNOWN_CASES].filter((c) =>
          c.name.toLowerCase().includes(onlyCategory!.toLowerCase())
        )
      : CASES;
    if (!cases.length) {
      console.error(`No case matched --category "${onlyCategory}"`);
      process.exit(1);
    }
    fail = runCaseList("Description quality tester — category sweep", cases);
  }
  if (fail !== 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
