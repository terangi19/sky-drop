/**
 * Active listing session UX — one authoritative listing per turn.
 * Torture tests: sequential unrelated listings, edit patches, identity conflict.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { processListingFillMessage, clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { clearListingDraftFromSkyAi } from "./sky-ai-listing-context";
import {
  classifyListingOperation,
  executeListingOperation,
} from "./awhina-listing-operation";
import { fillToActiveListing, activeListingToFill } from "./awhina-active-listing";
import {
  listingIdentitiesConflict,
  extractListingIdentityFromMessage,
} from "./awhina-listing-identity-conflict";
import type { SkyAiListingContext } from "./sky-ai-types";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

const HILUX =
  "2018 Toyota Hilux SR5 128000km automatic diesel black good condition full service history canopy tow bar Auckland";
const BMW =
  "2007 BMW 335i coupe 145000km automatic grey modified twin turbos intercooler downpipes intakes Auckland good condition";
const IPHONE = "iPhone 15 Pro 256GB Natural Titanium like-new $1250 Auckland";
const OLIVETTI =
  "Olivetti Lettera 32 portable typewriter good working condition $280 Wellington";
const POKEMON =
  "Charizard holographic Pokemon card PSA 9 mint condition $450 Auckland";
const LAWN =
  "Lawn mowing service weekly residential Auckland from $45";
const TRAILER =
  "Trailer hire 6x4 box trailer daily weekly rates Auckland";
const COUCH = "Grey fabric 3-seater couch good condition pickup Auckland $350";
const SAMSUNG =
  "Samsung Galaxy S24 Ultra 512GB excellent condition $1400 Wellington";

const TORTURE_10 = [IPHONE, HILUX, BMW, OLIVETTI, POKEMON, LAWN, TRAILER, COUCH, SAMSUNG, HILUX];

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
  clearListingDraftFromSkyAi();
  const store = new Map<string, string>();
  (globalThis as { sessionStorage?: Storage }).sessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}

function hiluxContext(): SkyAiListingContext {
  return {
    draftId: "draft_hilux_test",
    title: "2018 Toyota Hilux SR5",
    listingType: "vehicle",
    vehicleMake: "Toyota",
    vehicleModel: "Hilux",
    vehicleYear: "2018",
    vehicleOdometer: "128000",
    vehicleTransmission: "Automatic",
    vehicleFuelType: "Diesel",
    vehicleColour: "Black",
    condition: "Used - Good",
    location: "Auckland",
    description:
      "2018 Toyota Hilux SR5 in good condition with 128,000 km. Automatic diesel, finished in black.",
    extras: ["maintenance:full service history", "included:canopy", "included:tow bar"],
  };
}

function bmwContext(): SkyAiListingContext {
  return {
    draftId: "draft_bmw_test",
    title: "2007 BMW 335i Coupe",
    listingType: "vehicle",
    vehicleMake: "BMW",
    vehicleModel: "335i",
    vehicleYear: "2007",
    vehicleOdometer: "145000",
    vehicleTransmission: "Automatic",
    vehicleColour: "Grey",
    condition: "Used - Good",
    location: "Auckland",
    description:
      "2007 BMW 335i Coupe in good condition with 145,000 km. Automatic and finished in grey.",
    extras: ["modification:twin turbos", "modification:intercooler"],
  };
}

describe("identity conflict", () => {
  it("Hilux vs BMW = conflict", () => {
    expect(listingIdentitiesConflict(hiluxContext(), BMW)).toBe(true);
  });

  it("classifies BMW after Hilux as CREATE", () => {
    const current = fillToActiveListing(hiluxContext());
    const op = classifyListingOperation(BMW, current, { pathname: "/post/ai" });
    expect(op.type).toBe("CREATE");
  });

  it("forbids 2007 Toyota Hilux hybrid", () => {
    const out = processListingFillMessage(BMW, {
      pathname: "/post/ai",
      listingContext: hiluxContext(),
    });
    expect(out.handled).toBe(true);
    if (!out.handled) return;
    expect(out.listingFill?.replaceDraft).toBe(true);
    const title = String(out.listingFill?.title || "").toLowerCase();
    expect(title).not.toMatch(/toyota.*hilux|hilux.*toyota/);
    expect(title).toMatch(/bmw|335i/);
    expect(String(out.listingFill?.vehicleMake || "")).toMatch(/bmw/i);
    expect(String(out.listingFill?.vehicleModel || "")).toMatch(/335i/i);
    expect(String(out.listingFill?.vehicleYear || "")).toBe("2007");
    expect(String(out.listingFill?.vehicleMake || "")).not.toMatch(/toyota/i);
    const desc = String(out.listingFill?.description || "").toLowerCase();
    expect(desc).not.toMatch(/canopy|tow bar|hilux|toyota/);
    expect(desc).toMatch(/bmw|335i|145/);
    expect(out.reply).toMatch(/new listing|335i|bmw/i);
  });
});

describe("BMW edit patches", () => {
  beforeEach(() => wipe("bmw-edits"));

  it("mileage patch keeps same draftId", () => {
    const seed = processListingFillMessage(BMW, {
      pathname: "/post/ai",
      freshStart: true,
    });
    expect(seed.handled).toBe(true);
    if (!seed.handled || !seed.listingFill) return;
    const draftId = seed.listingFill.draftId;
    const ctx = { ...seed.listingFill } as SkyAiListingContext;

    const patch = processListingFillMessage("actually 150000km", {
      pathname: "/post/ai",
      listingContext: ctx,
    });
    expect(patch.handled).toBe(true);
    if (!patch.handled) return;
    expect(patch.listingFill?.replaceDraft).not.toBe(true);
    expect(String(patch.listingFill?.vehicleOdometer || "")).toMatch(/150000|150,000/);
    expect(String(patch.listingFill?.vehicleMake || "")).toMatch(/bmw/i);
  });

  it("add new tyres keeps BMW identity", () => {
    const ctx = bmwContext();
    const patch = processListingFillMessage("add new tyres", {
      pathname: "/post/ai",
      listingContext: ctx,
    });
    expect(patch.handled).toBe(true);
    if (!patch.handled) return;
    const extras = (patch.listingFill?.extras || []).join(" ").toLowerCase();
    expect(extras).toMatch(/tyre|tire/);
    expect(String(patch.listingFill?.vehicleMake || "")).toMatch(/bmw/i);
  });
});

describe("sequential 10-listing torture chain", () => {
  beforeEach(() => wipe("torture-10"));

  it("each transition replaces prior identity completely", () => {
    let ctx: SkyAiListingContext | null = null;
    let priorDraftId: string | undefined;
    const id = "torture-10";

    for (let i = 0; i < TORTURE_10.length; i++) {
      const msg = TORTURE_10[i];
      const out = processCanonicalAwhina(msg, {
        conversationId: id,
        pathname: "/post/ai",
        listingContext: ctx,
      });
      expect(out.handled).toBe(true);
      const fill = out.listingFill as SkyAiListingFill | undefined;
      expect(fill).toBeTruthy();
      if (!fill) continue;

      const title = String(fill.title || "").toLowerCase();
      const desc = String(fill.description || "").toLowerCase();
      const extras = Array.isArray(fill.extras)
        ? fill.extras.join(" ").toLowerCase()
        : "";

      if (i === 1) {
        expect(title).toMatch(/hilux|toyota/);
      }
      if (i === 2) {
        expect(title).toMatch(/bmw|335i/);
        expect(title).not.toMatch(/hilux|toyota|iphone/);
        expect(desc).not.toMatch(/iphone|256gb|titanium/);
      }
      if (i === 3) {
        expect(title).toMatch(/olivetti|typewriter/);
        expect(desc).not.toMatch(/bmw|335i|downpipe/);
      }

      if (priorDraftId && fill.replaceDraft) {
        expect(fill.draftId).not.toBe(priorDraftId);
      }

      if (i > 0 && fill.replaceDraft) {
        const prev = TORTURE_10[i - 1].toLowerCase();
        if (prev.includes("iphone") && i === 1) {
          expect(desc).not.toMatch(/iphone|256gb/);
        }
      }

      expect(desc).not.toMatch(/2007 toyota hilux|toyota 335i|bmw hilux/);
      expect(extras).not.toMatch(/2007 toyota hilux sr5 128000km/);

      priorDraftId = fill.draftId || priorDraftId;
      ctx = { ...fill, draftId: fill.draftId || `draft_${i}` } as SkyAiListingContext;
    }
  });
});

describe("stress: 25 and 50 unrelated listings", () => {
  const seeds = [
    HILUX, BMW, IPHONE, OLIVETTI, POKEMON, LAWN, TRAILER, COUCH, SAMSUNG,
    "2015 Mazda Axela blue 98000km automatic $11500 Auckland",
    "Ford Ranger XLT 2019 85000km diesel white canopy",
    "PlayStation 5 disc edition 2 controllers $650 Christchurch",
    "MacBook Pro M2 16GB 512GB excellent $2100",
    "Dining table solid oak seats 6 $400 Hamilton",
    "House cleaning service weekly $35 per hour Auckland",
    "Apartment rental 2 bed Mt Eden weekly rent $650",
    "Kawasaki Ninja 650 2021 12000km learner legal",
    "Baby cot incl mattress white $120 Tauranga",
    "Weber BBQ Q1200 portable gas barely used",
    "Electric drill Makita 18V with 2 batteries",
    "Nintendo Switch OLED white 256GB $420",
    "Toyota Corolla 2012 156000km silver hatch",
    "Standing desk electric adjustable 140cm",
    "Guitar Fender Stratocaster sunburst with case",
    "Washing machine Samsung 8kg front loader",
  ];

  function runChain(count: number) {
    wipe(`stress-${count}`);
    let ctx: SkyAiListingContext | null = null;
    const id = `stress-${count}`;
    for (let i = 0; i < count; i++) {
      const msg = seeds[i % seeds.length];
      const out = processListingFillMessage(msg, {
        pathname: "/post/ai",
        listingContext: ctx,
        sessionKey: `sell:${id}`,
      });
      expect(out.handled).toBe(true);
      if (!out.handled || !out.listingFill) throw new Error(`failed at ${i}`);
      const fill = out.listingFill;
      const desc = String(fill.description || "").toLowerCase();
      expect(desc).not.toMatch(/2007 toyota hilux|bmw hilux|toyota 335i/);
      ctx = { ...fill, draftId: fill.draftId || `d${i}` } as SkyAiListingContext;
    }
    return ctx;
  }

  it("25 listings stay clean", () => {
    const last = runChain(25);
    expect(last?.title?.trim()).toBeTruthy();
    const desc = String(last?.description || "").toLowerCase();
    expect(desc).not.toMatch(/2007 toyota hilux|bmw hilux|toyota 335i/);
  });

  it("50 listings stay clean", () => {
    const last = runChain(50);
    expect(last?.title?.trim()).toBeTruthy();
    const desc = String(last?.description || "").toLowerCase();
    expect(desc).not.toMatch(/canopy|tow bar|twin turbos.*hilux/);
  }, 60000);
});

describe("executeListingOperation CREATE", () => {
  it("builds BMW from message only", () => {
    const op = { type: "CREATE" as const, message: BMW, reason: "test" };
    const result = executeListingOperation(op, fillToActiveListing(hiluxContext()));
    expect(result.replaceDraft).toBe(true);
    expect(result.fill.vehicleMake).toMatch(/bmw/i);
    expect(result.fill.vehicleModel).toMatch(/335i/i);
    expect(String(result.fill.title || "")).not.toMatch(/hilux|toyota/i);
    expect(result.reply).toMatch(/new listing|335i/i);
  });
});

describe("operation classifier", () => {
  it("mileage correction = PATCH on BMW", () => {
    const current = fillToActiveListing(bmwContext());
    const op = classifyListingOperation("actually 150000km", current);
    expect(op.type).toBe("PATCH");
  });

  it("rich paste without sell my = CREATE when different item", () => {
    const current = fillToActiveListing(hiluxContext());
    const op = classifyListingOperation(BMW, current);
    expect(op.type).toBe("CREATE");
    expect(extractListingIdentityFromMessage(BMW)?.make).toMatch(/bmw/i);
  });
});
