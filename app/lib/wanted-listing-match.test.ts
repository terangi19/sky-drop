import { describe, expect, it } from "vitest";
import {
  hasWantedListingIntentConflict,
  isWantedListingMatch,
  scoreWantedListingMatch,
} from "./wanted-listing-match";

describe("wanted listing matchmaking", () => {
  it("does not match BMW car wanted with BMW part listing", () => {
    const wanted = {
      type: "wanted",
      title: "Looking for BMW car",
      description: "Want a BMW sedan, Auckland",
    };
    const part = {
      type: "physical",
      title: "BMW brake part",
      description: "Genuine BMW spare part",
      category: "Auto Parts",
    };

    expect(hasWantedListingIntentConflict(wanted, part)).toBe(true);
    expect(isWantedListingMatch(wanted, part)).toBe(false);
  });

  it("matches BMW car wanted with BMW vehicle listing", () => {
    const wanted = {
      type: "wanted",
      title: "BMW car wanted",
      description: "Looking for BMW sedan under 15k",
    };
    const vehicle = {
      type: "vehicle",
      title: "2015 BMW 320i",
      description: "Clean BMW sedan",
      vehicleMake: "BMW",
      vehicleModel: "320i",
    };

    expect(isWantedListingMatch(wanted, vehicle)).toBe(true);
  });

  it("matches when make and model align on vehicle fields", () => {
    const wanted = {
      type: "wanted",
      title: "Mazda Axela",
      vehicleMake: "Mazda",
      vehicleModel: "Axela",
    };
    const listing = {
      type: "vehicle",
      title: "2014 Mazda Axela",
      vehicleMake: "Mazda",
      vehicleModel: "Axela",
    };

    expect(scoreWantedListingMatch(wanted, listing).score).toBe(100);
  });

  it("does not match on brand keyword alone for non-vehicle accessories", () => {
    const wanted = { type: "wanted", title: "Want Toyota Corolla" };
    const unrelated = { type: "physical", title: "Toyota floor mats", category: "Accessories" };

    expect(isWantedListingMatch(wanted, unrelated)).toBe(false);
  });

  it("matches parts wanted with parts listing", () => {
    const wanted = { type: "wanted", title: "Need BMW headlight part" };
    const part = { type: "physical", title: "BMW headlight assembly", category: "Parts" };

    expect(hasWantedListingIntentConflict(wanted, part)).toBe(false);
    expect(isWantedListingMatch(wanted, part)).toBe(true);
  });
});
