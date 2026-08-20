/**
 * End-to-end client applyFill simulation — proves form setters receive price/condition.
 * Mirrors /post/ai applyFill critical path without React.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { mergeListingFillWithDraft } from "./sky-ai-draft-merge";
import {
  applySkyAiListingFill,
  normalizeSkyAiListingFill,
  type SkyAiListingFill,
} from "./sky-ai-listing-fill";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";
import { promoteColourFromExtras } from "./awhina-form-sync";
import {
  syncListingDraftToSkyAi,
  readListingDraftFromSkyAi,
  clearListingDraftFromSkyAi,
} from "./sky-ai-listing-context";

function wipe(id: string) {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: id }));
  clearListingDraftFromSkyAi();
}

describe("visible form sync from canonical listingFill", () => {
  beforeEach(() => {
    wipe("form-ui-sync");
    // sessionStorage mock for node
    const store = new Map<string, string>();
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, String(v));
      },
      removeItem: (k) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  it("iPhone rich follow-up: applySkyAiListingFill sets visible price + condition", () => {
    const id = "form-ui-sync";
    const t1 = processCanonicalAwhina("I want to sell my iPhone 15 Pro", {
      conversationId: id,
      pathname: "/post/ai",
    });
    syncListingDraftToSkyAi({ ...(t1.listingFill || {}), draftId: "d1" });

    const t2 = processCanonicalAwhina(
      "256GB, Natural Titanium, like-new condition, $1,250, Auckland. Battery health is 94%. Comes with the original box and USB-C cable. Always used with a case and screen protector. No cracks, faults or repairs.",
      {
        conversationId: id,
        pathname: "/post/ai",
        listingContext: t1.listingFill as never,
      }
    );

    expect(t2.listingFill?.price).toBe("1250");
    expect(t2.listingFill?.condition).toBe("Used - Like New");

    // Mirror SkyAiChatPanel merge + page applyFill (unlocked form)
    const prior = readListingDraftFromSkyAi();
    let merged = {
      ...mergeListingFillWithDraft(prior, t2.listingFill!),
    } as SkyAiListingFill & { draftId?: string };
    merged = { ...promoteColourFromExtras(merged) };
    merged = { ...finalizeAwhinaListingDescription(merged) };

    expect(merged.price).toBe("1250");
    expect(merged.condition).toBe("Used - Like New");

    const normalized = normalizeSkyAiListingFill(merged)!;
    expect(normalized.price).toBe("1250");
    expect(normalized.condition).toBe("Used - Like New");

    const form = {
      price: "",
      condition: "",
      location: "",
      title: "",
      description: "",
      listingType: "physical" as string,
    };

    const ok = applySkyAiListingFill(normalized, {
      setTitle: (v) => {
        form.title = v;
      },
      setDescription: (v) => {
        form.description = v;
      },
      setCategory: () => {},
      setCondition: (v) => {
        form.condition = v;
      },
      setPrice: (v) => {
        form.price = v;
      },
      setListingType: (v) => {
        form.listingType = v;
      },
      setLocation: (v) => {
        form.location = v;
      },
      setVehicleColour: () => {},
    });

    expect(ok).toBe(true);
    expect(form.price).toBe("1250");
    expect(form.condition).toBe("Used - Like New");
    expect(form.location).toBe("Auckland");
    expect(form.description.length).toBeGreaterThan(40);
    expect(form.description).toMatch(/titanium/i);
    expect(form.description).not.toMatch(/pristine|to ensure/i);
  });
});
