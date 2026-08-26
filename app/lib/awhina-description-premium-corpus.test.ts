/**
 * Generic premium description corpus — 40+ adversarial / unseen listing types.
 * Asserts fact coverage, truthfulness, no filler, no duplication, domain fit.
 */
import { describe, expect, it } from "vitest";
import { executeListingOperation } from "./awhina-listing-operation";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";
import {
  GENERIC_MARKETPLACE_FILLER_RE,
  hasSemanticFactDuplication,
  validateDescriptionQualityContract,
} from "./awhina-description-quality";
import {
  buildSemanticDescriptionFacts,
  dedupeSemanticFacts,
  normalizeSemanticFactText,
  prepareFillForDescription,
  semanticFactCoveredBy,
} from "./awhina-description-semantic";
import { containsInternalOrchestration } from "./awhina-orchestration-boundary";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

type CorpusCase = {
  name: string;
  message: string;
  must: RegExp[];
  mustNot?: RegExp[];
  domainHint?: RegExp;
};

const CORPUS: CorpusCase[] = [
  // Vehicles / parts
  {
    name: "hilux-sr5-anchor",
    message:
      "2018 Toyota Hilux SR5 128000km automatic diesel black good condition full service history canopy tow bar Auckland",
    must: [/SR5/i, /128,?000/i, /canopy/i, /tow\s*bar/i, /service history/i],
    mustNot: [/Comes with[\s\S]{0,40}Comes with/i, /perfect for|excellent driving/i],
  },
  {
    name: "ranger-wildtrak",
    message:
      "2017 Ford Ranger Wildtrak 95000km automatic diesel blue good condition leather seats tow bar canopy Christchurch",
    must: [/Wildtrak/i, /leather/i],
  },
  {
    name: "bmw-335i",
    message:
      "2007 BMW 335i coupe 145000km automatic grey good condition upgraded twin turbos intercooler downpipes intakes Auckland",
    must: [/335i/i, /coupe/i, /turbo/i, /intercooler/i],
    mustNot: [/Fitted with[\s\S]{0,40}Fitted with/i],
  },
  {
    name: "motorcycle",
    message:
      "2020 Yamaha MT-07 12000km black good condition full service history Akrapovic exhaust Auckland $9000",
    must: [/2020|service history|Auckland/i],
  },
  {
    name: "vehicle-part",
    message: "BMW E92 M3 carbon fibre roof spoiler used good condition Auckland $450",
    must: [/spoiler|carbon|E92|M3/i],
    mustNot: [/for sale in/i],
  },
  {
    name: "damaged-car",
    message:
      "2012 Mazda Axela 180000km automatic white fair condition needs new clutch small oil leak Auckland $3500",
    must: [/clutch|oil leak|fair/i],
    mustNot: [/excellent|perfect|mechanically perfect/i],
  },
  // Electronics
  {
    name: "iphone-anchor",
    message:
      "iPhone 15 Pro 256GB Natural Titanium like-new 94% battery original box USB-C cable case screen protector Auckland",
    must: [/256\s*GB/i, /titanium/i, /94\s*%/i, /box/i],
    mustNot: [/Comes with[\s\S]{0,40}Comes with/i, /pristine|carefully protected/i],
  },
  {
    name: "ps5-anchor",
    message: "PS5 Slim like new one controller HDMI cable power cable original box Auckland",
    must: [/controller|box|HDMI|cable/i],
  },
  {
    name: "laptop-broken-screen",
    message:
      "MacBook Pro 2019 16 inch 512GB space grey screen cracked otherwise works Auckland $600",
    must: [/crack|512|Auckland/i],
    mustNot: [/perfect condition|immaculate/i],
  },
  {
    name: "tv",
    message: "Samsung 55 inch 4K smart TV good used condition remote wall mount Hamilton $380",
    must: [/55|4K|Samsung|remote|mount/i],
  },
  {
    name: "camera",
    message:
      "Canon EOS R6 mark II body only 8000 shutter good condition battery charger strap Wellington",
    must: [/Canon|R6|battery|charger/i],
  },
  {
    name: "headphones",
    message: "Sony WH-1000XM5 black like new original box Auckland $280",
    must: [/Sony|XM5|box/i],
  },
  // Home / furniture
  {
    name: "couch-anchor",
    message: "Grey 3-seater couch good used condition small mark on left arm no tears Henderson",
    must: [/mark|arm/i],
    mustNot: [/perfect|immaculate|pristine/i],
  },
  {
    name: "fridge",
    message: "Fisher & Paykel 519L fridge freezer silver good working order West Auckland pickup only",
    must: [/Fisher|fridge|519|pickup/i],
  },
  {
    name: "washing-machine",
    message:
      "Simpson 8kg front loader washing machine good condition works well small scuff on side Manukau $220",
    must: [/Simpson|washing|scuff|Manukau/i],
  },
  // Tools / outdoor
  {
    name: "drill",
    message: "Makita 18V cordless drill 2 batteries charger case used good condition Papakura",
    must: [/Makita|batter|charger|case/i],
  },
  {
    name: "lawnmower",
    message: "Honda HRU19 self propelled mower recently serviced new blade good condition Albany",
    must: [/Honda|servic|blade/i],
  },
  {
    name: "chainsaw",
    message: "Stihl MS170 chainsaw runs well needs new chain bar oil included Rotorua",
    must: [/Stihl|chain|oil/i],
  },
  // Clothing / jewellery
  {
    name: "shoes",
    message: "Nike Air Max 90 size 10 white used twice tiny scuff on toe Auckland $90",
    must: [/Nike|size\s*10|scuff|twice|used/i],
  },
  {
    name: "jacket",
    message: "Patagonia down jacket men's M navy excellent condition no stains Christchurch",
    must: [/Patagonia|navy|M\b|excellent|stain/i],
  },
  {
    name: "jewellery",
    message: "9ct gold chain 45cm good condition no hallmarks missing clasp repair needed Auckland",
    must: [/gold|clasp|repair/i],
    mustNot: [/authentic|certified|investment/i],
  },
  // Collectibles / toys
  {
    name: "trading-card",
    message: "PSA 10 Charizard VMAX Champion's Path like new Auckland",
    must: [/Charizard|PSA\s*10/i],
    mustNot: [/rare|investment|appreciate/i],
  },
  {
    name: "lego",
    message: "LEGO Technic Lamborghini Sián sealed new never opened Auckland $420",
    must: [/LEGO|sealed|new|Lamborghini|Sián|Sian/i],
  },
  {
    name: "vinyl",
    message: "Pink Floyd Dark Side of the Moon original vinyl VG+ sleeve has ring wear Wellington",
    must: [/Pink Floyd|vinyl|ring wear|sleeve/i],
  },
  // Sports / fitness
  {
    name: "bike",
    message:
      "Trek Marlin 7 mountain bike size L good condition new chain recently serviced Dunedin",
    must: [/Trek|Marlin|chain|servic/i],
  },
  {
    name: "gym-bench",
    message: "Adjustable weight bench with dumbbells 2-20kg good used condition New Lynn",
    must: [/bench|dumbbell|20/i],
  },
  {
    name: "golf-clubs",
    message: "Callaway edge set irons 5-PW driver putter bag fair condition Takapuna",
    must: [/Callaway|iron|driver|putter|bag/i],
  },
  // Kids / books / music
  {
    name: "pram",
    message: "Bugaboo Bee 5 pram grey good condition rain cover bassinet included Auckland",
    must: [/Bugaboo|pram|rain|bassinet/i],
  },
  {
    name: "guitar",
    message: "Fender Player Stratocaster sunburst good condition soft case included Hamilton",
    must: [/Fender|Strat|case/i],
  },
  {
    name: "books-lot",
    message: "Box of 40 paperback novels mixed genres good condition free to good home Henderson",
    must: [/40|paperback|novel|Henderson/i],
  },
  // Services / rentals / wanted
  {
    name: "lawn-service",
    message: "Lawn mowing West Auckland small lawns from $40 larger lawns quoted fortnightly",
    must: [/lawn|mow|\$?40|quote|West Auckland|Auckland/i],
    mustNot: [/Comes with|Fitted with|for sale/i],
    domainHint: /service|lawn/i,
  },
  {
    name: "handyman",
    message: "Handyman services North Shore $55 per hour no job too small plumbing electrical light",
    must: [/handyman|55|hour|North Shore/i],
    mustNot: [/Comes with|in good used condition/i],
  },
  {
    name: "trailer-rental",
    message: "6x4 box trailer hire Hamilton $45 a day bond $100 recently serviced",
    must: [/trailer|hire|45|servic|Hamilton/i],
    mustNot: [/Fitted with|for sale/i],
  },
  {
    name: "flat-rental",
    message:
      "2 bedroom flat Mount Eden $600 a week bond $2400 available now unfurnished no pets",
    must: [/2|bedroom|600|bond|unfurnished|pets|Mount Eden|Eden/i],
    mustNot: [/for sale|Comes with/i],
  },
  {
    name: "wanted-laptop",
    message: "Looking for a used MacBook Pro 2020 or newer budget up to $1200 Auckland",
    must: [/looking|MacBook|1200|Auckland/i],
    mustNot: [/for sale|selling my/i],
  },
  // Unseen / weird / messy
  {
    name: "vintage-typewriter",
    message:
      "1960s Olivetti Lettera 32 typewriter new ribbon case included all keys working Greymouth",
    must: [/Olivetti|Lettera|ribbon|case|keys|Greymouth/i],
  },
  {
    name: "pottery-wheel",
    message: "Electric pottery wheel with foot pedal good working order clay tools included Nelson",
    must: [/pottery|wheel|pedal|clay|tools|Nelson/i],
  },
  {
    name: "bee-hive",
    message: "Langstroth bee hive 2 supers frames included used one season good condition Tauranga",
    must: [/hive|super|frame|Tauranga/i],
  },
  {
    name: "scuba",
    message: "Scuba BCD medium jacket style used lightly needs new bladder dump valve Auckland $180",
    must: [/BCD|bladder|Auckland/i],
    mustNot: [/Brand new Scuba/i],
  },
  {
    name: "messy-grammar",
    message:
      "selling my old dyson v8 vacuum it works ok battery a bit weak comes with wand and heads auckland $120",
    must: [/dyson|v8|battery|wand|auckland/i],
  },
  {
    name: "bundle-cables",
    message:
      "Lot of assorted USB cables HDMI cables chargers mixed lengths working free pickup Botany",
    must: [/USB|HDMI|cable|charger|Botany/i],
  },
  {
    name: "no-wof-car",
    message:
      "2005 Toyota Corolla 220000km manual silver fair condition no WOF needs work cheap Auckland $1500",
    must: [/no\s*WOF|WOF|fair|needs work|Corolla/i],
    mustNot: [/current WOF|WOF and registration are current/i],
  },
];

function assertPremiumDescription(
  name: string,
  desc: string,
  fill: SkyAiListingFill,
  c: CorpusCase
) {
  expect(desc.trim().length, `${name}: empty`).toBeGreaterThan(10);
  expect(containsInternalOrchestration(desc), `${name}: leak`).toBe(false);
  expect(desc, `${name}: filler`).not.toMatch(GENERIC_MARKETPLACE_FILLER_RE);
  expect(hasSemanticFactDuplication(desc), `${name}: semantic dup`).toBe(false);
  expect(validateDescriptionQualityContract(desc, fill).ok, `${name}: contract`).toBe(true);
  for (const re of c.must) {
    expect(desc, `${name}: missing ${re}`).toMatch(re);
  }
  for (const re of c.mustNot || []) {
    expect(desc, `${name}: forbidden ${re}`).not.toMatch(re);
  }
  // Proportionate length: not absurdly padded for short inputs
  const inputWords = c.message.split(/\s+/).length;
  const descWords = desc.split(/\s+/).length;
  if (inputWords <= 12) {
    expect(descWords, `${name}: over-padded`).toBeLessThanOrEqual(80);
  }
}

describe("semantic description fact layer", () => {
  it("dedupes colour already present as vehicle field but keeps variant extras", () => {
    const fill: SkyAiListingFill = {
      title: "Black 2018 Toyota Hilux SR5",
      listingType: "vehicle",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleYear: "2018",
      vehicleColour: "Black",
      extras: ["variant:SR5", "colour:Black", "included:canopy"],
    };
    const prepared = prepareFillForDescription(fill);
    expect(prepared.extras?.join(" ")).toMatch(/included:canopy/i);
    expect(prepared.extras?.join(" ")).toMatch(/variant:SR5/i);
    expect(prepared.extras?.join(" ") || "").not.toMatch(/colour:Black/i);
  });

  it("semanticFactCoveredBy treats equivalent phrasings as one fact", () => {
    expect(semanticFactCoveredBy("Natural Titanium", "iPhone 15 Pro Natural Titanium")).toBe(
      true
    );
    expect(semanticFactCoveredBy("94% battery health", "Battery health is at 94%")).toBe(true);
    expect(semanticFactCoveredBy("tow bar", "canopy only")).toBe(false);
  });

  it("dedupeSemanticFacts prefers field over freeform extra", () => {
    const deduped = dedupeSemanticFacts([
      {
        kind: "spec",
        text: "Black",
        source: "extra",
        key: "spec:black",
      },
      {
        kind: "spec",
        text: "Black",
        source: "field",
        key: "spec:black",
      },
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].source).toBe("field");
  });

  it("normalize collapses odometer formatting", () => {
    expect(normalizeSemanticFactText("128,000km")).toMatch(/128000/);
    expect(normalizeSemanticFactText("like new condition")).toContain("like-new");
  });
});

describe("premium description corpus (adversarial + unseen)", () => {
  it.each(CORPUS)("$name", (c) => {
    const created = executeListingOperation(
      { type: "CREATE", message: c.message, reason: "corpus" },
      null
    );
    const fill = created.fill;
    const finalized = finalizeAwhinaListingDescription(fill, { force: true });
    const desc = String(finalized.description || "");
    assertPremiumDescription(c.name, desc, finalized, c);
  });
});

describe("cross-listing isolation corpus", () => {
  it("Hilux → iPhone drops vehicle facts", () => {
    const a = executeListingOperation(
      {
        type: "CREATE",
        message:
          "2018 Toyota Hilux SR5 128000km diesel canopy tow bar Auckland",
        reason: "t1",
      },
      null
    );
    const b = executeListingOperation(
      {
        type: "CREATE",
        message: "iPhone 15 Pro 256GB Natural Titanium like-new Auckland",
        reason: "identity_conflict_new_listing",
      },
      a.listing
    );
    const desc = String(b.fill.description || "");
    expect(desc).toMatch(/iPhone|256/i);
    expect(desc).not.toMatch(/Hilux|SR5|canopy|tow\s*bar|diesel/i);
  });

  it("service → rental drops service pricing language incorrectly", () => {
    const a = executeListingOperation(
      {
        type: "CREATE",
        message: "Lawn mowing West Auckland from $40",
        reason: "t1",
      },
      null
    );
    const b = executeListingOperation(
      {
        type: "CREATE",
        message: "6x4 box trailer hire Hamilton $45 a day bond $100",
        reason: "identity_conflict_new_listing",
      },
      a.listing
    );
    const desc = String(b.fill.description || "");
    expect(desc).toMatch(/trailer|hire|Hamilton/i);
    expect(desc).not.toMatch(/lawn|mow/i);
  });
});
