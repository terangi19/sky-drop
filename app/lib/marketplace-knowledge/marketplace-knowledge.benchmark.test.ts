/**
 * Marketplace knowledge resolver unit tests + ≥300-prompt benchmark.
 */
import { describe, expect, it } from "vitest";
import {
  resolveMarketplaceKnowledge,
  clearAllDomainContextsForTests,
  lookupCurrentInfo,
  mapEntityToListingHints,
} from "./index";
import { composeListingTitleAndDescription } from "../awhina-listing-composer";

describe("marketplace-knowledge resolver", () => {
  it("resolves R34 → Nissan Skyline R34 without inventing trim", () => {
    const r = resolveMarketplaceKnowledge("r34 for sale auckland");
    expect(r.entity?.domain).toBe("vehicles");
    expect(r.listingHints.vehicleMake).toBe("Nissan");
    expect(r.listingHints.vehicleModel).toMatch(/Skyline R34/i);
    expect(r.entity?.userFacts.some((f) => /GT-R|GT-T/i.test(f))).toBe(false);
  });

  it("preserves user GT-T fact on R34", () => {
    const r = resolveMarketplaceKnowledge("Nissan Skyline R34 GT-T");
    expect(r.entity?.userFacts).toContain("GT-T");
    expect(r.listingHints.vehicleModel).toMatch(/GT-T/i);
  });

  it("resolves E92 335i with chassis generation", () => {
    const r = resolveMarketplaceKnowledge("e92 335i");
    expect(r.entity?.domain).toBe("vehicles");
    expect(r.listingHints.vehicleMake).toBe("BMW");
    expect(r.listingHints.vehicleModel).toMatch(/335i/i);
    expect(r.entity?.generation?.code).toBe("E92");
  });

  it("resolves PSA 10 Charizard without inventing year/pop/value", () => {
    const r = resolveMarketplaceKnowledge("PSA 10 Charizard");
    expect(r.entity?.domain).toBe("collectibles");
    expect(r.entity?.grade?.company).toBe("PSA");
    expect(r.entity?.grade?.grade).toBe("10");
    expect(r.entity?.model?.name).toMatch(/Charizard/i);
    expect(r.entity?.unknowns).toEqual(expect.arrayContaining(["year", "parallel", "cardNumber"]));
    expect(r.entity?.needsCurrentCheck.length).toBeGreaterThan(0);
    expect(r.entity?.grade?.population).toBeUndefined();
  });

  it("resolves Match Attax Messi and sticky Topps Chrome → Messi → PSA 10", () => {
    clearAllDomainContextsForTests();
    const a = resolveMarketplaceKnowledge("Topps Chrome", { conversationKey: "mk-1" });
    expect(a.entity?.domain).toBe("collectibles");
    const b = resolveMarketplaceKnowledge("Messi", { conversationKey: "mk-1" });
    expect(b.entity?.displayName).toMatch(/Messi/i);
    expect(b.entity?.displayName).toMatch(/Topps Chrome/i);
    const c = resolveMarketplaceKnowledge("PSA 10", { conversationKey: "mk-1" });
    expect(c.entity?.grade?.grade).toBe("10");
    expect(c.entity?.displayName).toMatch(/Messi/i);

    const ma = resolveMarketplaceKnowledge("Match Attax Messi");
    expect(ma.entity?.displayName).toMatch(/Match Attax/i);
    expect(ma.entity?.displayName).toMatch(/Messi/i);
  });

  it("resolves iPhone 15 Pro 128 without treating storage as price", () => {
    const r = resolveMarketplaceKnowledge("iphone 15 pro 128gb");
    expect(r.entity?.domain).toBe("electronics");
    expect(r.entity?.model?.name).toMatch(/iPhone 15 Pro/i);
    expect(r.entity?.attributes.some((a) => a.key === "storage" && a.value === "128GB")).toBe(true);
    expect(r.listingHints.category).toBe("Tech");
  });

  it("resolves Jordans into Fashion", () => {
    const r = resolveMarketplaceKnowledge("jordan 1 chicago size 10");
    expect(r.entity?.domain).toBe("fashion");
    expect(r.listingHints.category).toBe("Fashion");
    expect(r.entity?.model?.name).toMatch(/Jordan 1/i);
  });

  it("resolves digger rental and car detailing", () => {
    const d = resolveMarketplaceKnowledge("digger hire $250 per day");
    expect(d.listingHints.listingType).toBe("rental");
    expect(d.listingHints.rentalPriceDaily).toBe("250");

    const s = resolveMarketplaceKnowledge("car detailing $150");
    expect(s.entity?.domain).toBe("services");
    expect(s.listingHints.listingType).toBe("service");
  });

  it("lookup stub never pretends current market values", () => {
    const look = lookupCurrentInfo({
      domain: "collectibles",
      query: "PSA 10 Charizard",
      fields: ["market value", "population"],
    });
    expect(look.available).toBe(false);
    expect(look.resolved).toBe(false);
    expect(look.fieldsNeedingCheck).toContain("market value");
  });

  it("composer still builds vehicle titles (c5482f4 path intact)", () => {
    const c = composeListingTitleAndDescription({ item: "r34 gtt auckland" });
    expect(c.listingType).toBe("vehicle");
    expect(c.vehicleMake).toBe("Nissan");
    expect(c.title).toMatch(/Skyline|R34|Nissan/i);
  });

  it("mapEntityToListingHints keeps USER category", () => {
    const r = resolveMarketplaceKnowledge("ps5");
    const hints = mapEntityToListingHints(r.entity, {
      existing: { category: "Gaming" },
      existingProvenance: { category: "USER" },
    });
    expect(hints.category).toBe("Gaming");
  });
});

/** Programmatic ≥300-prompt knowledge benchmark */
type BenchCase = {
  id: string;
  prompt: string;
  expectDomain?: string;
  expectMake?: string;
  expectModel?: RegExp | string;
  expectGrade?: string;
  expectCategory?: string;
  expectListingType?: string;
  forbidInvent?: RegExp;
  minConfidence?: "low" | "medium" | "high";
};

function buildBenchmarkCases(): BenchCase[] {
  const cases: BenchCase[] = [];

  const vehicles: Array<[string, string, RegExp | string]> = [
    ["r34", "Nissan", /Skyline R34/i],
    ["r 34", "Nissan", /Skyline R34/i],
    ["skyline r34", "Nissan", /Skyline R34/i],
    ["nissan skyline r34", "Nissan", /Skyline R34/i],
    ["r34 gtt", "Nissan", /R34/i],
    ["r34 gt-t", "Nissan", /GT-T/i],
    ["e92 335i", "BMW", /335i/i],
    ["e90 320d", "BMW", /320d/i],
    ["335i", "BMW", /335i/i],
    ["supra", "Toyota", /Supra/i],
    ["hilux", "Toyota", /Hilux/i],
    ["ranger", "Ford", /Ranger/i],
    ["civic", "Honda", /Civic/i],
    ["axela", "Mazda", /Axela/i],
    ["wrx", "Subaru", /WRX/i],
    ["rx7", "Mazda", /RX-7/i],
    ["rx-8", "Mazda", /RX-8/i],
    ["navara", "Nissan", /Navara/i],
    ["commodore", "Holden", /Commodore/i],
    ["mustang", "Ford", /Mustang/i],
  ];
  const vSlang = ["", " for sale", " auckland", " selling my", " list my", " 120000km", " $12k"];
  let n = 0;
  for (const [alias, make, model] of vehicles) {
    for (const s of vSlang) {
      cases.push({
        id: `v-${n++}`,
        prompt: `${alias}${s}`.trim(),
        expectDomain: "vehicles",
        expectMake: make,
        expectModel: model,
        expectListingType: "vehicle",
        forbidInvent: /\b(pop report|market value \$|worth \$)\b/i,
      });
    }
  }

  const cards: Array<[string, RegExp]> = [
    ["psa 10 charizard", /Charizard/i],
    ["PSA 10 Charizard", /Charizard/i],
    ["psa10 charizard", /Charizard/i],
    ["charizard psa 10", /Charizard/i],
    ["match attax messi", /Messi/i],
    ["Match Attax Messi", /Messi/i],
    ["topps chrome messi", /Messi/i],
    ["topps chrome messi psa 10", /Messi/i],
    ["psa 9 pikachu", /Pikachu/i],
    ["bgs 9.5 charizard", /Charizard/i],
    ["graded charizard psa 10", /Charizard/i],
    ["panini messi", /Messi/i],
  ];
  const cSlang = ["", " for sale", " selling", " list", " auckland", " mint"];
  n = 0;
  for (const [prompt, subj] of cards) {
    for (const s of cSlang) {
      cases.push({
        id: `c-${n++}`,
        prompt: `${prompt}${s}`.trim(),
        expectDomain: "collectibles",
        expectModel: subj,
        forbidInvent: /\b(population|pop\s*\d|worth \$[\d,]+|\$[\d,]{3,}\s*market)\b/i,
        minConfidence: "medium",
      });
    }
  }

  const electronics: Array<[string, string, string]> = [
    ["ps5", "PS5", "Gaming"],
    ["playstation 5", "PS5", "Gaming"],
    ["ps4", "PS4", "Gaming"],
    ["iphone 15 pro 128gb", "iPhone 15 Pro", "Tech"],
    ["iphone 15 pro 128", "iPhone 15 Pro", "Tech"],
    ["iphone 15", "iPhone 15", "Tech"],
    ["iphone 14 pro", "iPhone 14 Pro", "Tech"],
    ["macbook pro", "MacBook Pro", "Tech"],
    ["airpods pro", "AirPods Pro", "Tech"],
    ["xbox series x", "Xbox Series X", "Gaming"],
    ["nintendo switch", "Switch", "Gaming"],
    ["pixel 8 pro", "Pixel 8 Pro", "Tech"],
    ["samsung galaxy s24", "Galaxy S24", "Tech"],
  ];
  const eSlang = ["", " for sale", " selling my", " like new", " auckland $500"];
  n = 0;
  for (const [prompt, model, cat] of electronics) {
    for (const s of eSlang) {
      cases.push({
        id: `e-${n++}`,
        prompt: `${prompt}${s}`.trim(),
        expectDomain: /ps|xbox|switch/i.test(prompt) ? "gaming" : "electronics",
        expectModel: new RegExp(model.replace(/\s+/g, "\\s*"), "i"),
        expectCategory: cat,
        forbidInvent: /\bmsrp\s*\$|worth \$[\d,]+/i,
      });
    }
  }

  const fashion: Array<[string, RegExp]> = [
    ["jordan 1", /Jordan 1/i],
    ["air jordan 1", /Jordan 1/i],
    ["aj1", /Jordan 1/i],
    ["jordans size 10", /Jordan/i],
    ["jordan 4", /Jordan 4/i],
    ["yeezy 350", /Yeezy/i],
    ["dunk low", /Dunk/i],
    ["af1", /Air Force/i],
    ["air force 1", /Air Force/i],
    ["nb 550", /550/i],
  ];
  const fSlang = ["", " for sale", " size 9", " chicago", " selling"];
  n = 0;
  for (const [prompt, model] of fashion) {
    for (const s of fSlang) {
      cases.push({
        id: `f-${n++}`,
        prompt: `${prompt}${s}`.trim(),
        expectDomain: "fashion",
        expectModel: model,
        expectCategory: "Fashion",
        forbidInvent: /\bauthentic(ated)?\b.*\bguaranteed\b|\bworth \$[\d,]+/i,
      });
    }
  }

  const equipment = [
    "digger hire",
    "mini digger rental",
    "excavator for hire",
    "bobcat hire",
    "trailer hire $40 per day",
    "generator rental",
  ];
  n = 0;
  for (const prompt of equipment) {
    for (const s of ["", " auckland", " this weekend"]) {
      cases.push({
        id: `eq-${n++}`,
        prompt: `${prompt}${s}`.trim(),
        expectDomain: "equipment",
        expectListingType: "rental",
      });
    }
  }

  const services = [
    "car detailing",
    "car detailing $120",
    "lawn mowing",
    "house cleaning",
    "handyman",
    "plumbing service",
    "tutoring $40 per hour",
    "photography",
  ];
  n = 0;
  for (const prompt of services) {
    for (const s of ["", " auckland", " available weekends"]) {
      cases.push({
        id: `sv-${n++}`,
        prompt: `${prompt}${s}`.trim(),
        expectDomain: "services",
        expectListingType: "service",
      });
    }
  }

  // Misspellings / slang stress + extra coverage toward ≥300
  const typos: Array<[string, string]> = [
    ["skylien r34", "vehicles"],
    ["plaustation 5", "electronics"],
    ["ifone 15 pro", "electronics"],
    ["jordon 1", "fashion"],
    ["charrizard psa 10", "collectibles"],
    ["messi match atax", "collectibles"],
    ["bmw 3351", "vehicles"],
  ];
  // Only include soft expectations — misspellings may fall to low conf / clarify
  n = 0;
  for (const [prompt] of typos) {
    cases.push({
      id: `ty-${n++}`,
      prompt,
      forbidInvent: /\bpopulation\s*\d{3,}|\bmarket value \$[\d,]{4,}/i,
    });
  }

  // Extra slang / NZ / short-form expansions
  const extras: Array<BenchCase> = [
    { id: "x-0", prompt: "selling my r34 gtt auckland 120k km", expectDomain: "vehicles", expectMake: "Nissan", expectListingType: "vehicle" },
    { id: "x-1", prompt: "list e92 335i", expectDomain: "vehicles", expectMake: "BMW" },
    { id: "x-2", prompt: "PSA10 Charizard for sale", expectDomain: "collectibles", expectModel: /Charizard/i },
    { id: "x-3", prompt: "iphone 15 pro max 256gb", expectDomain: "electronics", expectCategory: "Tech" },
    { id: "x-4", prompt: "aj1 chicago sz 10", expectDomain: "fashion", expectCategory: "Fashion" },
    { id: "x-5", prompt: "rent out my digger $280/day", expectDomain: "equipment", expectListingType: "rental" },
    { id: "x-6", prompt: "I do car detailing for $150", expectDomain: "services", expectListingType: "service" },
    { id: "x-7", prompt: "find me a skyline r34", expectDomain: "vehicles", expectMake: "Nissan" },
    { id: "x-8", prompt: "looking for jordan 4", expectDomain: "fashion", expectCategory: "Fashion" },
    { id: "x-9", prompt: "ps5 slim for sale", expectDomain: "gaming", expectCategory: "Gaming" },
    { id: "x-10", prompt: "macbook air m2", expectDomain: "electronics", expectCategory: "Tech" },
    { id: "x-11", prompt: "bgs 9.5 pikachu", expectDomain: "collectibles", expectModel: /Pikachu/i },
    { id: "x-12", prompt: "yeezy 350 v2", expectDomain: "fashion", expectModel: /Yeezy/i },
    { id: "x-13", prompt: "bobcat hire hamilton", expectDomain: "equipment", expectListingType: "rental" },
    { id: "x-14", prompt: "house cleaning $80", expectDomain: "services", expectListingType: "service" },
    { id: "x-15", prompt: "wrx sti for sale", expectDomain: "vehicles", expectMake: "Subaru" },
    { id: "x-16", prompt: "nintendo switch oled", expectDomain: "gaming", expectCategory: "Gaming" },
    { id: "x-17", prompt: "topps chrome ronaldo psa 9", expectDomain: "collectibles", expectModel: /Ronaldo/i },
    { id: "x-18", prompt: "galaxy s24 ultra", expectDomain: "electronics", expectCategory: "Tech" },
    { id: "x-19", prompt: "dunk low panda size 9", expectDomain: "fashion", expectCategory: "Fashion" },
  ];
  cases.push(...extras);

  return cases;
}

describe("marketplace knowledge benchmark ≥300", () => {
  const cases = buildBenchmarkCases();

  it(`has at least 300 prompts (got ${cases.length})`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(300);
  });

  it("scores resolution / routing / hallucination across domains", () => {
    let pass = 0;
    let fail = 0;
    const fails: string[] = [];

    for (const c of cases) {
      const r = resolveMarketplaceKnowledge(c.prompt);
      const problems: string[] = [];

      if (c.expectDomain && r.entity?.domain !== c.expectDomain) {
        // gaming is electronics module routing — accept either for console prompts
        if (
          !(
            (c.expectDomain === "gaming" && r.entity?.domain === "electronics") ||
            (c.expectDomain === "electronics" && r.entity?.domain === "gaming")
          )
        ) {
          problems.push(`domain=${r.entity?.domain}`);
        }
      }
      if (c.expectMake && r.listingHints.vehicleMake !== c.expectMake) {
        problems.push(`make=${r.listingHints.vehicleMake}`);
      }
      if (c.expectModel) {
        const blob = `${r.entity?.displayName || ""} ${r.listingHints.vehicleModel || ""} ${r.entity?.model?.name || ""}`;
        const ok =
          typeof c.expectModel === "string"
            ? blob.toLowerCase().includes(c.expectModel.toLowerCase())
            : c.expectModel.test(blob);
        if (!ok) problems.push(`model~${c.expectModel}`);
      }
      if (c.expectGrade && r.entity?.grade?.grade !== c.expectGrade) {
        problems.push(`grade=${r.entity?.grade?.grade}`);
      }
      if (c.expectCategory && r.listingHints.category !== c.expectCategory) {
        problems.push(`cat=${r.listingHints.category}`);
      }
      if (c.expectListingType && r.listingHints.listingType !== c.expectListingType) {
        problems.push(`type=${r.listingHints.listingType}`);
      }
      if (c.forbidInvent) {
        // Only score invented *values* — not honest "needs checking: population" labels
        const riskBlob = [
          r.entity?.grade?.population,
          r.entity?.grade?.marketValue,
          ...((r.entity?.attributes || [])
            .filter((a) => /value|price|pop|worth/i.test(a.key))
            .map((a) => a.value)),
          r.entity?.displayName,
        ]
          .filter(Boolean)
          .join(" ");
        if (c.forbidInvent.test(riskBlob)) problems.push("hallucination");
      }
      // Never invent market prices on attributes
      if (r.entity?.attributes.some((a) => /value|price|pop/i.test(a.key) && a.provenance === "MODEL_INFERENCE")) {
        problems.push("inferred-price");
      }

      if (problems.length) {
        fail++;
        if (fails.length < 25) fails.push(`${c.id}:${c.prompt} → ${problems.join(",")}`);
      } else {
        pass++;
      }
    }

    const rate = pass / cases.length;
    // First slice target: ≥85% on generated suite (typos soft)
    expect(rate, `passRate=${rate.toFixed(3)} fails=${fails.join(" | ")}`).toBeGreaterThanOrEqual(0.85);
    expect(fail, fails.join(" | ")).toBeLessThan(cases.length * 0.15);
  });
});
