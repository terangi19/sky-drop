/**
 * Form ↔ draft sync — visible Listing Details must match canonical fill.
 */
import { describe, expect, it } from "vitest";
import {
  applySkyAiListingFill,
  normalizeSkyAiListingFill,
  type SkyAiListingFill,
} from "./sky-ai-listing-fill";
import {
  formCaughtUpWithFill,
  promoteColourFromExtras,
  reconcileListingDraftForSync,
  resolveLockedMergeValue,
  semanticDraftFieldsPersisted,
  shouldApplyFillToField,
} from "./awhina-form-sync";
import {
  INVENTED_REASONING_RE,
  MARKETING_FILLER_RE,
  buildDescriptionWriterFacts,
  validateAiListingDescriptionResult,
} from "./awhina-description-writer";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";

describe("awhina form sync", () => {
  it("allows Āwhina to fill empty USER-locked price/condition", () => {
    expect(
      shouldApplyFillToField({
        replaceDraft: false,
        userLocked: true,
        currentValue: "",
        incomingValue: "1250",
      })
    ).toBe(true);
    expect(
      shouldApplyFillToField({
        replaceDraft: false,
        userLocked: true,
        currentValue: "999",
        incomingValue: "1250",
      })
    ).toBe(false);
  });

  it("empty USER lock does not wipe incoming price", () => {
    expect(resolveLockedMergeValue("", "1250", true)).toBe("1250");
    expect(resolveLockedMergeValue("1150", "1250", true)).toBe("1150");
  });

  it("reconcile keeps pending price/condition when form is still blank", () => {
    const pending: SkyAiListingFill = {
      title: "iPhone 15 Pro",
      price: "1250",
      condition: "Used - Like New",
      location: "Auckland",
      listingType: "physical",
      vehicleColour: "Natural Titanium",
      extras: ["colour:Natural Titanium", "storage:256GB"],
    };
    const reconciled = reconcileListingDraftForSync({
      formConfirmed: { title: "iPhone 15 Pro" },
      prior: { title: "iPhone 15 Pro" },
      pendingFill: pending,
      fieldProvenance: { title: "AWHINA" },
      draftId: "draft_test",
    });
    expect(reconciled.price).toBe("1250");
    expect(reconciled.condition).toBe("Used - Like New");
    expect(reconciled.location).toBe("Auckland");
    expect(reconciled.vehicleColour).toBe("Natural Titanium");
    expect(formCaughtUpWithFill({ title: "iPhone 15 Pro", price: "", condition: "" }, pending)).toBe(
      false
    );
    expect(
      formCaughtUpWithFill(
        {
          title: "iPhone 15 Pro",
          price: "1250",
          condition: "Used - Like New",
          location: "Auckland",
        },
        pending
      )
    ).toBe(true);
  });

  it("semantic persistence ignores boolean/extras mismatch", () => {
    const expected = {
      title: "iPhone 15 Pro",
      price: "1250",
      condition: "Used - Like New",
      location: "Auckland",
      pickupAvailable: true,
      extras: ["storage:256GB"],
    };
    const confirmed = {
      title: "iPhone 15 Pro",
      price: "1250",
      condition: "Used - Like New",
      location: "Auckland",
    };
    expect(semanticDraftFieldsPersisted(expected, confirmed)).toBe(true);
    expect(
      semanticDraftFieldsPersisted(expected, {
        title: "iPhone 15 Pro",
        condition: "Used - Like New",
        location: "Auckland",
      })
    ).toBe(false);
  });

  it("applySkyAiListingFill sets price, condition, and colour for physical", () => {
    const state: Record<string, string> = {
      price: "",
      condition: "",
      vehicleColour: "",
      title: "",
      listingType: "physical",
    };
    const fill = promoteColourFromExtras({
      title: "iPhone 15 Pro",
      listingType: "physical",
      price: "1250",
      condition: "Used - Like New",
      location: "Auckland",
      extras: ["colour:Natural Titanium", "storage:256GB"],
    });
    const normalized = normalizeSkyAiListingFill(fill)!;
    expect(normalized.price).toBe("1250");
    expect(normalized.condition).toBe("Used - Like New");
    expect(normalized.vehicleColour).toMatch(/titanium/i);

    const ok = applySkyAiListingFill(normalized, {
      setTitle: (v) => {
        state.title = v;
      },
      setDescription: () => {},
      setCategory: () => {},
      setCondition: (v) => {
        state.condition = v;
      },
      setPrice: (v) => {
        state.price = v;
      },
      setListingType: (v) => {
        state.listingType = v;
      },
      setLocation: () => {},
      setVehicleColour: (v) => {
        state.vehicleColour = v;
      },
    });
    expect(ok).toBe(true);
    expect(state.price).toBe("1250");
    expect(state.condition).toBe("Used - Like New");
    expect(state.vehicleColour).toMatch(/titanium/i);
  });
});

describe("invented reasoning + fact coverage", () => {
  it("rejects pristine / to ensure invented reasoning", () => {
    const fill: SkyAiListingFill = {
      title: "iPhone 15 Pro",
      listingType: "physical",
      condition: "Used - Like New",
      location: "Auckland",
      vehicleColour: "Natural Titanium",
      extras: [
        "storage:256GB",
        "colour:Natural Titanium",
        "mechanical:94% battery health",
        "included:original box and USB-C cable",
        "note:Always used with a case and screen protector",
        "conditionDetail:No cracks, faults or repairs",
      ],
    };
    const facts = buildDescriptionWriterFacts(fill);
    const bad =
      "Like-new iPhone 15 Pro 256GB in Natural Titanium. Always used with a case and screen protector to ensure its pristine condition. Battery health is 94%.";
    expect(INVENTED_REASONING_RE.test(bad) || MARKETING_FILLER_RE.test(bad)).toBe(true);
    const result = validateAiListingDescriptionResult(bad, facts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["invented_reasoning", "marketing_filler"]).toContain(result.reason);
    }
  });

  it("rejects description that drops Natural Titanium when colour is known", () => {
    const fill: SkyAiListingFill = {
      title: "iPhone 15 Pro",
      listingType: "physical",
      condition: "Used - Like New",
      location: "Auckland",
      vehicleColour: "Natural Titanium",
      extras: [
        "storage:256GB",
        "colour:Natural Titanium",
        "mechanical:94% battery health",
        "included:original box and USB-C cable",
        "note:Always used with a case and screen protector",
        "conditionDetail:No cracks, faults or repairs",
      ],
    };
    const facts = buildDescriptionWriterFacts(fill);
    expect(facts.product?.colour).toMatch(/titanium/i);
    const droppedColour =
      "Like-new iPhone 15 Pro 256GB. Battery health is 94%, with no cracks, faults or repairs. Comes with the original box and USB-C cable and has always been used with a case and screen protector. Located in Auckland.";
    const result = validateAiListingDescriptionResult(droppedColour, facts);
    expect(result.ok, JSON.stringify(result)).toBe(false);
  });

  it("deterministic finalize keeps colour and no invented reasoning", () => {
    const fill: SkyAiListingFill = {
      title: "iPhone 15 Pro",
      listingType: "physical",
      condition: "Used - Like New",
      location: "Auckland",
      price: "1250",
      vehicleColour: "Natural Titanium",
      pickupAvailable: true,
      extras: [
        "storage:256GB",
        "colour:Natural Titanium",
        "mechanical:94% battery health",
        "included:Comes with the original box and USB-C cable",
        "note:Always used with a case and screen protector",
        "conditionDetail:No cracks, faults or repairs",
      ],
      description:
        "Like-new iPhone 15 Pro. Always used with a case and screen protector to ensure its pristine condition.",
      descriptionSource: "ai",
    };
    const out = finalizeAwhinaListingDescription(fill, { force: true });
    const desc = String(out.description || "");
    expect(desc).toMatch(/titanium/i);
    expect(desc).toMatch(/256\s*GB/i);
    expect(desc).not.toMatch(/pristine|to ensure/i);
    expect(desc).not.toMatch(/\$\s*1,?250|asking/i);
  });
});
