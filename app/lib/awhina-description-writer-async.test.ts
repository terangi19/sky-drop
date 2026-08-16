import { describe, expect, it } from "vitest";
import {
  buildDescriptionWriterFacts,
  runAwhinaListingDescriptionWriter,
  validateAiListingDescriptionResult,
} from "./awhina-description-writer";
import { finalizeAwhinaListingDescriptionAsync } from "./awhina-listing-composer";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

type Fixture = {
  name: string;
  fill: SkyAiListingFill;
  description: string;
};

// These are an end-to-end writer-boundary contract, not prompt examples: every
// fixture takes the real async finalizer through raw JSON → validation → public
// description. The raw writer seam keeps the suite deterministic/offline.
const FIXTURES: Fixture[] = [
  { name: "R34", fill: { title: "Nissan Skyline R34", listingType: "physical", condition: "Used - Good", vehicleMake: "Nissan", vehicleModel: "Skyline", vehicleGeneration: "R34", extras: ["domain:vehicles", "objectType:car"] }, description: "This Nissan Skyline R34 is in good used condition. The listing identifies the R34 generation." },
  { name: "BMW 335i", fill: { title: "2007 BMW 335i E92 Coupe", listingType: "physical", condition: "Used - Good", vehicleYear: "2007", vehicleMake: "BMW", vehicleModel: "335i", vehicleGeneration: "E92", extras: ["domain:vehicles", "objectType:car"] }, description: "This 2007 BMW 335i E92 Coupe is in good used condition. It is listed as a coupe." },
  { name: "Riftbound display", fill: { title: "Riftbound League of Legends Unleashed Booster Display", listingType: "physical", condition: "New", extras: ["domain:trading_cards", "objectType:booster_display", "brand:Riftbound", "franchise:League of Legends", "set:Unleashed", "product_format:booster display"] }, description: "This Riftbound League of Legends Unleashed Booster Display is brand new. It is a sealed TCG product containing booster packs from the Unleashed set." },
  { name: "Topps booster box", fill: { title: "Topps Premier League Booster Box", listingType: "physical", condition: "New", extras: ["domain:trading_cards", "objectType:booster_box", "brand:Topps", "set:Premier League", "product_format:booster box"] }, description: "This Topps Premier League Booster Box is brand new. It is a sealed TCG product containing booster packs from the Premier League set." },
  { name: "Yu-Gi-Oh bundle", fill: { title: "Yu-Gi-Oh Egyptian God Cards", listingType: "physical", condition: "Used - Good", extras: ["domain:trading_cards", "objectType:card_bundle", "bundle_quantity:3", "subject:The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor"] }, description: "This Yu-Gi-Oh Egyptian God Cards bundle includes The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. The three cards are in good used condition." },
  { name: "iPhone", fill: { title: "Apple iPhone 15 Pro", listingType: "physical", condition: "Used - Good", extras: ["domain:electronics", "objectType:smartphone", "brand:Apple", "model:iPhone 15 Pro", "storage:256GB"] }, description: "Apple iPhone 15 Pro with 256GB storage, in good used condition. The listing is for the phone itself." },
  { name: "DualSense", fill: { title: "Sony DualSense Wireless Controller", listingType: "physical", condition: "Used - Good", extras: ["domain:electronics", "objectType:controller", "brand:Sony", "colour:Midnight Black"] }, description: "Sony DualSense Wireless Controller in good used condition. It is the Midnight Black version." },
  { name: "mountain bike", fill: { title: "Trek Marlin Mountain Bike", listingType: "physical", condition: "Used - Good", extras: ["domain:cycling", "objectType:mountain_bike", "brand:Trek", "model:Marlin"] }, description: "Trek Marlin mountain bike in good used condition. It is listed as a mountain bike." },
  { name: "Nike shoes", fill: { title: "Nike Air Max 90 Shoes", listingType: "physical", condition: "Used - Good", extras: ["domain:clothing", "objectType:shoe", "brand:Nike", "model:Air Max 90"] }, description: "Nike Air Max 90 shoes in good used condition. The listing is for the pair shown." },
  { name: "LEGO set", fill: { title: "LEGO Star Wars X-Wing Set", listingType: "physical", condition: "Used - Good", extras: ["domain:toys", "objectType:building_set", "brand:LEGO", "product_family:Star Wars"] }, description: "LEGO Star Wars X-Wing Set in good used condition. It is listed as a LEGO building set." },
  { name: "Makita drill", fill: { title: "Makita Cordless Drill", listingType: "physical", condition: "Used - Good", extras: ["domain:tools", "objectType:drill", "brand:Makita"] }, description: "Makita cordless drill in good used condition. It is listed as a cordless drill." },
  { name: "Samsung TV", fill: { title: "Samsung 55-inch Smart TV", listingType: "physical", condition: "Used - Good", extras: ["domain:electronics", "objectType:television", "brand:Samsung"] }, description: "Samsung 55-inch Smart TV in good used condition. The listing identifies a 55-inch television." },
  { name: "dining chair", fill: { title: "Oak Dining Chair", listingType: "physical", condition: "Used - Good", extras: ["domain:furniture", "objectType:dining_chair"] }, description: "Oak dining chair in good used condition. It is listed as a single dining chair." },
  { name: "Nintendo Switch", fill: { title: "Nintendo Switch Console", listingType: "physical", condition: "Used - Good", extras: ["domain:gaming", "objectType:console", "brand:Nintendo"] }, description: "Nintendo Switch console in good used condition. The listing is for the console." },
  { name: "Adidas jacket", fill: { title: "Adidas Track Jacket", listingType: "physical", condition: "Used - Good", extras: ["domain:clothing", "objectType:jacket", "brand:Adidas"] }, description: "Adidas track jacket in good used condition. It is listed as a jacket." },
  { name: "road bike", fill: { title: "Giant Road Bike", listingType: "physical", condition: "Used - Good", extras: ["domain:cycling", "objectType:road_bike", "brand:Giant"] }, description: "Giant road bike in good used condition. It is listed as a road bike." },
];

describe("async description writer authority", () => {
  it.each(FIXTURES)("uses accepted writer prose for $name", async ({ fill, description }) => {
    const generateRawOutput = async () => JSON.stringify({ description });
    const attempt = await runAwhinaListingDescriptionWriter(fill, { generateRawOutput });
    const final = await finalizeAwhinaListingDescriptionAsync(fill, { writer: generateRawOutput });

    expect(attempt.writer_called).toBe(true);
    expect(attempt.writer_raw_output).toContain(description);
    expect(attempt.writer_validation_result, JSON.stringify(attempt)).toBe("accepted");
    expect(attempt.writer_validation_failure_reason).toBeUndefined();
    expect(final.description).toBe(description);
    expect(final.description).not.toMatch(/standout|perfect for|great addition|for sale in/i);
  });

  it("records a reason and permits only a substantive offline fallback", async () => {
    const fill: SkyAiListingFill = {
      title: "Riftbound League of Legends Unleashed Booster Box",
      listingType: "physical",
      condition: "New",
      extras: ["brand:Riftbound", "set:Unleashed", "product_format:booster box"],
    };
    const rejected = await runAwhinaListingDescriptionWriter(fill, {
      generateRawOutput: async () => JSON.stringify({ description: "Brand new Riftbound League of Legends Unleashed Booster Box." }),
    });
    const final = await finalizeAwhinaListingDescriptionAsync(fill, {
      writer: async () => JSON.stringify({ description: "Brand new Riftbound League of Legends Unleashed Booster Box." }),
    });

    expect(rejected.writer_validation_result).toBe("rejected");
    expect(rejected.writer_validation_failure_reason).toBe("title_equivalent");
    expect(final.description).toMatch(/sealed TCG product containing booster packs/i);
    expect(final.description).not.toBe("Brand new Riftbound League of Legends Unleashed Booster Box.");
  });

  it("reports specific validator reason codes", () => {
    const fill = FIXTURES[0]!.fill;
    const result = validateAiListingDescriptionResult(
      "This Nissan Skyline is a standout vehicle known for its performance and design.",
      buildDescriptionWriterFacts(fill)
    );
    expect(result.ok ? null : result.reason).toBe("marketing_filler");
  });
});
