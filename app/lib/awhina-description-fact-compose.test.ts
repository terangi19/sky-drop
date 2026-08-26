/**
 * Natural fact composition — jammed seller fragments → grammatical prose.
 * Semantic assertions only — no product golden strings.
 */
import { describe, expect, it } from "vitest";
import {
  splitJammedConditionAtoms,
  composeNaturalConditionProse,
  composeNaturalIncludedProse,
  hasUncomposedFactDump,
} from "./awhina-description-fact-compose";
import { executeListingOperation } from "./awhina-listing-operation";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";
import { validateDescriptionQualityContract } from "./awhina-description-quality";

describe("splitJammedConditionAtoms", () => {
  it("splits unpunctuated multi-fault blobs", () => {
    expect(splitJammedConditionAtoms("needs new clutch small oil leak")).toEqual([
      "needs new clutch",
      "small oil leak",
    ]);
  });

  it("splits phone fault chains", () => {
    const atoms = splitJammedConditionAtoms(
      "cracked back glass charging port sometimes cuts out"
    );
    expect(atoms.length).toBeGreaterThanOrEqual(2);
    expect(atoms.join(" ")).toMatch(/cracked/i);
    expect(atoms.join(" ")).toMatch(/charging port|cuts out/i);
  });

  it("keeps single faults intact", () => {
    expect(splitJammedConditionAtoms("needs new clutch")).toEqual(["needs new clutch"]);
  });
});

describe("composeNaturalConditionProse", () => {
  it("composes clutch + oil leak with articles and conjunction", () => {
    const prose = composeNaturalConditionProse(["needs new clutch small oil leak"]);
    expect(prose).toMatch(/needs a new clutch/i);
    expect(prose).toMatch(/small oil leak/i);
    expect(prose).toMatch(/\band\b/i);
    expect(prose).not.toMatch(/Needs new clutch small oil leak/i);
    expect(hasUncomposedFactDump(prose)).toBe(false);
  });

  it("retains multiple phone faults without dropping any", () => {
    const prose = composeNaturalConditionProse([
      "cracked back glass",
      "charging port sometimes cuts out",
    ]);
    expect(prose).toMatch(/cracked/i);
    expect(prose).toMatch(/charging port|cuts out/i);
    expect(prose).not.toMatch(/fingerprint works/i);
  });
});

describe("composeNaturalIncludedProse", () => {
  it("groups accessories into one Comes with sentence", () => {
    const prose = composeNaturalIncludedProse(
      ["original box", "USB-C cable", "case", "screen protector"],
      "Comes with"
    );
    expect((prose.match(/\bComes with\b/gi) || []).length).toBe(1);
    expect(prose).toMatch(/original box/i);
    expect(prose).toMatch(/USB-C cable/i);
    expect(prose).toMatch(/case/i);
    expect(prose).toMatch(/screen protector/i);
    expect(prose).toMatch(/\band\b/i);
  });
});

describe("hasUncomposedFactDump", () => {
  it("rejects raw jammed fault sentences", () => {
    expect(hasUncomposedFactDump("Needs new clutch small oil leak.")).toBe(true);
  });

  it("accepts composed fault sentences", () => {
    expect(
      hasUncomposedFactDump("Needs a new clutch and has a small oil leak.")
    ).toBe(false);
  });

  it("rejects repeated Comes with starters", () => {
    expect(
      hasUncomposedFactDump("Comes with canopy. Comes with tow bar.")
    ).toBe(true);
  });
});

describe("end-to-end create → description composition", () => {
  it("Mazda faults are composed, not dumped", () => {
    const created = executeListingOperation(
      {
        type: "CREATE",
        message:
          "2012 Mazda Axela 180000km automatic white fair condition needs new clutch small oil leak Auckland $3500",
        reason: "compose",
      },
      null
    );
    const fin = finalizeAwhinaListingDescription(created.fill, { force: true });
    const desc = String(fin.description || "");
    expect(desc).not.toMatch(/Needs new clutch small oil leak/i);
    expect(desc).toMatch(/clutch/i);
    expect(desc).toMatch(/oil\s*leak/i);
    expect(hasUncomposedFactDump(desc)).toBe(false);
    expect(validateDescriptionQualityContract(desc, fin).ok).toBe(true);
    expect(created.fill.price).toMatch(/3500/);
  });

  it("iPhone accessories grouped once", () => {
    const created = executeListingOperation(
      {
        type: "CREATE",
        message:
          "iPhone 15 Pro 256GB Natural Titanium like-new 94% battery original box USB-C cable case screen protector Auckland",
        reason: "compose",
      },
      null
    );
    const fin = finalizeAwhinaListingDescription(created.fill, { force: true });
    const desc = String(fin.description || "");
    expect((desc.match(/\bComes with\b/gi) || []).length).toBeLessThanOrEqual(1);
    expect(desc).toMatch(/box/i);
    expect(desc).toMatch(/cable/i);
  });

  it("Hilux vehicle extras use Fitted with grouping", () => {
    const created = executeListingOperation(
      {
        type: "CREATE",
        message:
          "2018 Toyota Hilux SR5 128000km automatic diesel black good condition full service history canopy tow bar Auckland",
        reason: "compose",
      },
      null
    );
    const fin = finalizeAwhinaListingDescription(created.fill, { force: true });
    const desc = String(fin.description || "");
    expect(desc).toMatch(/SR5/i);
    expect(desc).toMatch(/canopy/i);
    expect(desc).toMatch(/tow\s*bar/i);
    expect(desc).not.toMatch(/Comes with[\s\S]{0,40}Comes with/i);
    expect(hasUncomposedFactDump(desc)).toBe(false);
  });
});

/** 50+ messy seller inputs — semantic coverage, no golden strings. */
const FUZZ_INPUTS: string[] = [
  "ps5 slim good condition one controller hdmi cable power cable box auckland 500",
  "dell xps 13 512gb silver fair battery swollen screen hinge loose wellington 350",
  "road bike 54cm ultegra wheels scratched chain needs new cassette christchurch",
  "sofa grey 3 seater stain on cushion small tear arm hamilton pickup only 200",
  "dewalt drill 18v two batteries charger case scuffed works fine tauranga 120",
  "baby stroller black good condition rain cover cup holder missing tray auckland",
  "canon 50mm lens dusty elements fungus free focus ring stiff dunedin 280",
  "nintendo switch oled dock joycons drift left stick cracked screen protector included",
  "lawnmower petrol self propelled hard to start oil leak under deck rotorua",
  "oak dining table 6 chairs one chair wobbly water ring marks grey lynn",
  "guitalele yamaha nylon strings scratch on soundboard soft case included nelson",
  "server rack 42u missing doors some rails bent lower hutt pickup only",
  "lego star wars set sealed box crushed corner instructions included newmarket",
  "vintage radio 1960s powers on crackles missing knobs one dial stuck napier",
  "skateboard complete trucks loose grip worn wheels flat spotted wellington",
  "espresso machine gaggia needs descaling drip tray cracked portafilter fine",
  "welding helmet auto darkening scratches on lens headband frayed hamilton",
  "climbing rope 60m used indoor few fuzzies no core shots auckland",
  "telescope 8 inch dobsonian collimation off finder scope missing screws",
  "pottery wheel kick needs belt tension splash pan cracked christchurch",
  "surfboard 6ft ding repaired leash plug loose fin box ok raglan",
  "sewing machine brother skips stitches bobbin case sticky foot pedal works",
  "treadmill folds incline stuck belt slips motor noisy albany",
  "pressure washer wand tip missing hose weep at coupler still strong",
  "amplifier fender combo crackle on channel 2 handle torn cover ok",
  "drone with controller one prop cracked gps lock slow battery swollen",
  "microscope kids missing slides stage clips bent light works",
  "anvil small chips on face hardy hole worn stand wobbly",
  "loom floor standing warp beam sticky shuttle missing heddles",
  "accordion 48 bass some keys sticky bellows pinholes case included",
  "kayak sit on top scratched hull scupper plugs missing paddle ok",
  "chainsaw bar oiling weak chain dull spark plug fouled starts",
  "typewriter ribbon dried keys stick carriage return soft case",
  "record player skips on some lps stylus worn dust cover cracked",
  "projector lamp hours high focus ring gritty remote missing",
  "heater oil column thermostat sticky tip over switch works",
  "fridge freezer ice build up door seal torn runs continuous",
  "washer spins unbalanced drain pump noisy hose weep",
  "dryer lint trap warped heating element weak drum squeaks",
  "dishwasher top rack wheels missing soap door broken cleans ok",
  "microwave turntable missing keypad membrane worn heats fine",
  "vac robot brushes worn bumper cracked maps fine docks ok",
  "printer paper jam roller worn ink tanks low scans fine",
  "monitor dead pixels corner stand wobbly hdmi only",
  "keyboard mechanical sticky keycaps worn cable frayed wireless ok",
  "mouse double click issue scroll wheel loose sensor fine",
  "tablet cracked digitizer wifi fine battery 78 charger included",
  "earbuds case scratched one side low battery case dents",
  "camera bag zipper sticky rain cover missing insert ok",
  "tripod one leg sticky ball head loose plate included",
  "Looking for used generator under 2000w quiet auckland",
  "Math tutoring NCEA level 2 40 per hour includes past papers no essay marking",
  "Storage unit 3x3 hire albany 45 a week bond 100 access 7am-7pm",
];

describe("adversarial fuzz composition", () => {
  it("never emits uncomposed fact dumps across fuzz corpus", () => {
    let failures = 0;
    const samples: string[] = [];
    for (const message of FUZZ_INPUTS) {
      const created = executeListingOperation(
        { type: "CREATE", message, reason: "fuzz" },
        null
      );
      const fin = finalizeAwhinaListingDescription(created.fill, { force: true });
      const desc = String(fin.description || "");
      if (!desc || desc.length < 8) continue;
      if (hasUncomposedFactDump(desc)) {
        failures += 1;
        samples.push(`DUMP: ${desc.slice(0, 120)}`);
      }
      if (/(?:Comes with|Fitted with)[\s\S]{0,50}(?:Comes with|Fitted with)/i.test(desc)) {
        failures += 1;
        samples.push(`REP: ${desc.slice(0, 120)}`);
      }
    }
    expect(FUZZ_INPUTS.length).toBeGreaterThanOrEqual(50);
    expect(failures, samples.join("\n")).toBe(0);
  });
});
