import { describe, expect, it } from "vitest";
import { BROWSE_CATEGORY_CONFIGS } from "./browse-category-config";
import { PHYSICAL_LISTING_CATEGORIES } from "./listing-type-config";

describe("physical browse category", () => {
  it("exposes a physical marketplace config for /physical", () => {
    const config = BROWSE_CATEGORY_CONFIGS.physical;
    expect(config).toBeDefined();
    expect(config.listingType).toBe("physical");
    expect(config.postAiType).toBe("physical");
    expect(config.filterMode).toBe("category");
    expect(config.categories).toEqual(["All", ...PHYSICAL_LISTING_CATEGORIES]);
  });
});
