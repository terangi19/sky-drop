import { describe, expect, it } from "vitest";
import { reuseCachedVisionListingFill } from "./awhina-vision-cache-reuse";
import type { VisionAdapterResult } from "./awhina-vision-adapter";

function adapted(partial: Partial<VisionAdapterResult> & { title?: string; description?: string }): VisionAdapterResult {
  return {
    foundReply: "Found it",
    displayIdentity: partial.displayIdentity || "PS5",
    needsIdentityConfirm: false,
    missingPrompts: [],
    listingFill: {
      title: partial.title ?? "PS5 Slim",
      description: partial.description,
      listingType: "physical",
    },
    ...partial,
  } as VisionAdapterResult;
}

describe("reuseCachedVisionListingFill", () => {
  it("skips the description writer when identity matches and cached description exists", () => {
    const live = adapted({ title: "PS5 Slim", description: undefined });
    const cached = adapted({ title: "PS5 Slim", description: "Sony PlayStation 5 Slim in great condition." });
    const result = reuseCachedVisionListingFill(live, cached);
    expect(result.skippedDescriptionWriter).toBe(true);
    expect(result.adapted.listingFill?.description).toContain("PlayStation");
  });

  it("does not skip the writer when identity changed", () => {
    const live = adapted({
      displayIdentity: "iPhone 15",
      title: "iPhone 15",
      description: undefined,
    });
    const cached = adapted({
      displayIdentity: "PS5",
      title: "PS5 Slim",
      description: "Sony PlayStation 5 Slim in great condition.",
    });
    const result = reuseCachedVisionListingFill(live, cached);
    expect(result.skippedDescriptionWriter).toBe(false);
    expect(result.adapted.listingFill?.description).toBeUndefined();
  });

  it("skips the writer when the re-adapted fill already has a description", () => {
    const live = adapted({ description: "Existing copy" });
    const cached = adapted({ description: "Cached copy" });
    const result = reuseCachedVisionListingFill(live, cached);
    expect(result.skippedDescriptionWriter).toBe(true);
    expect(result.adapted.listingFill?.description).toBe("Existing copy");
  });
});
