/**
 * REGRESSION: Razer Gaming Mouse (category Tech) must NEVER ask storage.
 *
 * Root cause (pre-fix): category===Tech → electronics → monolithic storage ask
 * + resolveFactDomain mapped ALL electronics → PHONE schema.
 *
 * Fix: electronics subtype registry (gaming_mouse) + relevance gate + next-best.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  computeMissingListingSlots,
  nextListingSlotQuestion,
  detectSellDomain,
  SLOT_QUESTIONS,
} from "./awhina-pending-slots";
import {
  computeDomainAwareMissingSlots,
  isFieldRelevant,
  isListingSlotQuestionValid,
  listRelevantFieldKeys,
  resolveCanonicalListingObject,
  resolveElectronicsSubtype,
  resolveFactDomain,
  selectNextBestListingSlot,
} from "./awhina-domain-facts";
import { prepareVisionConversationBridge, commitVisionBridgeToConversation } from "./awhina-vision-conversation-bridge";
import { processCanonicalAwhina } from "./awhina-canonical";
import {
  __resetAwhinaConversationStoreForTests,
} from "./awhina-conversation-store";
import {
  buildConfirmIdentityPendingAction,
  clearPendingActionStoreForTests,
} from "./awhina-pending-action";
import { buildReadinessFollowUpReply } from "./awhina-listing-readiness";
import { guardResponseBeforeEmit } from "./awhina-response-guard";

beforeEach(() => {
  clearPendingActionStoreForTests();
  __resetAwhinaConversationStoreForTests();
});

const RAZER_TECH = {
  title: "Razer Gaming Mouse",
  listingType: "physical" as const,
  category: "Tech",
};

const RAZER_GAMING = {
  title: "Razer Gaming Mouse",
  listingType: "physical" as const,
  category: "Gaming",
};

describe("Razer gaming mouse — storage must not enter the flow", () => {
  it("subtype is gaming_mouse even when category is Tech", () => {
    expect(resolveElectronicsSubtype(RAZER_TECH)).toBe("gaming_mouse");
    const obj = resolveCanonicalListingObject(RAZER_TECH);
    expect(obj.subtype).toBe("gaming_mouse");
    expect(obj.family).toBe("electronics");
    expect(resolveFactDomain(RAZER_TECH)).not.toBe("PHONE");
  });

  it("storage is NOT relevant / required / missing / pendingSlot", () => {
    for (const fill of [RAZER_TECH, RAZER_GAMING]) {
      expect(isFieldRelevant("storage", fill)).toBe(false);
      expect(isListingSlotQuestionValid("storage", fill)).toBe(false);
      expect(computeDomainAwareMissingSlots(fill)).not.toContain("storage");
      expect(computeMissingListingSlots(fill)).not.toContain("storage");
      expect(selectNextBestListingSlot(fill)).not.toBe("storage");
      expect(nextListingSlotQuestion(fill)?.slot).not.toBe("storage");
      expect(listRelevantFieldKeys(fill)).not.toContain("storage");
    }
  });

  it("cannot render storage question for Razer mouse", () => {
    const next = nextListingSlotQuestion(RAZER_TECH);
    expect(next?.question || "").not.toMatch(/storage/i);
    expect(SLOT_QUESTIONS.storage).toMatch(/storage/i);
    // Safety net would reject even if forced
    expect(isListingSlotQuestionValid("storage", RAZER_TECH)).toBe(false);
  });

  it("after identity confirm, follow-up is NOT storage", () => {
    const reply = buildReadinessFollowUpReply(RAZER_TECH as never, {
      lead: "Yep — **Razer Gaming Mouse**.",
    });
    expect(reply).not.toMatch(/storage/i);
    expect(reply).toMatch(/price|condition|located|Auckland/i);
  });

  it("vision confirm → Yes → reply never asks storage", () => {
    const conversationId = `razer_vis_${Math.random().toString(36).slice(2, 10)}`;
    const bridge = prepareVisionConversationBridge({
      listingFill: RAZER_TECH,
      displayIdentity: "Razer Gaming Mouse",
      needsIdentityConfirm: true,
    });
    expect(bridge.pendingAction?.type).toBe("CONFIRM_IDENTITY");
    commitVisionBridgeToConversation(bridge);

    const yes = processCanonicalAwhina("Yes", {
      conversationId,
      listingContext: {
        title: "Razer Gaming Mouse",
        listingType: "physical",
        category: "Tech",
      },
      pathname: "/post/ai",
      clientPendingAction: bridge.pendingAction,
    });
    expect(yes.reply || "").not.toMatch(/storage/i);
    expect(yes.sessionState?.pendingSlot).not.toBe("storage");
  });

  it("guard rejects storage pendingSlot for gaming_mouse", () => {
    const g = guardResponseBeforeEmit({
      draft: RAZER_TECH,
      pendingSlotAfter: "storage",
      reply: SLOT_QUESTIONS.storage,
    });
    expect(g.safePendingSlot).not.toBe("storage");
    expect(g.notes.some((n) => /irrelevant|storage/i.test(n))).toBe(true);
  });
});

describe("electronics inheritance — not all Tech has storage", () => {
  it("smartphone still asks storage when unknown", () => {
    const fill = {
      title: "iPhone 15",
      listingType: "physical" as const,
      category: "Tech",
    };
    expect(resolveElectronicsSubtype(fill)).toBe("smartphone");
    expect(computeMissingListingSlots(fill)).toContain("storage");
    expect(isFieldRelevant("storage", fill)).toBe(true);
  });

  it("laptop keeps storage as high-value", () => {
    const fill = {
      title: "MacBook Pro",
      listingType: "physical" as const,
      category: "Tech",
    };
    expect(resolveElectronicsSubtype(fill)).toBe("laptop");
    expect(computeMissingListingSlots(fill)).toContain("storage");
  });

  it("console does not demand storage", () => {
    const fill = {
      title: "PS5",
      listingType: "physical" as const,
      category: "Gaming",
    };
    expect(resolveElectronicsSubtype(fill)).toBe("console");
    expect(computeMissingListingSlots(fill)).not.toContain("storage");
  });

  it("keyboard / headphones / monitor — no storage", () => {
    for (const title of [
      "Mechanical Keyboard",
      "Sony Headphones",
      "Dell Monitor",
    ]) {
      const fill = { title, listingType: "physical" as const, category: "Tech" };
      expect(computeMissingListingSlots(fill), title).not.toContain("storage");
      expect(isFieldRelevant("storage", fill), title).toBe(false);
    }
  });

  it("generic Tech gadget without subtype cues — no storage", () => {
    const fill = {
      title: "USB Hub",
      listingType: "physical" as const,
      category: "Tech",
    };
    expect(resolveElectronicsSubtype(fill)).toBe("generic_electronics");
    expect(computeMissingListingSlots(fill)).not.toContain("storage");
  });
});

describe("cross-domain field relevance", () => {
  it("vehicle never asks storage or clothing size", () => {
    const fill = {
      title: "Toyota Corolla",
      listingType: "vehicle" as const,
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
    };
    const missing = computeMissingListingSlots(fill);
    expect(missing).not.toContain("storage");
    expect(missing).not.toContain("size");
    expect(missing).not.toContain("card_subject");
    expect(isFieldRelevant("storage", fill)).toBe(false);
    expect(isFieldRelevant("odometer", fill)).toBe(true);
  });

  it("trading card never asks storage or mileage", () => {
    const fill = {
      title: "Nicolo Barella Panini",
      listingType: "physical" as const,
      category: "Collectibles",
      extras: ["subject:Nicolo Barella"],
    };
    const missing = computeMissingListingSlots(fill);
    expect(missing).not.toContain("storage");
    expect(missing).not.toContain("odometer");
    expect(missing).not.toContain("size");
  });

  it("clothing asks size not storage", () => {
    const fill = {
      title: "Nike Hoodie",
      listingType: "physical" as const,
      category: "Fashion",
    };
    expect(detectSellDomain(fill)).toBe("clothing");
    expect(computeMissingListingSlots(fill)).toContain("size");
    expect(computeMissingListingSlots(fill)).not.toContain("storage");
  });

  it("stale phone storage extra does not force storage ask on mouse object", () => {
    // Current object is mouse — even if a stale storage: tag somehow lingered,
    // storage must not be a pending question (already "known" or irrelevant).
    const fill = {
      ...RAZER_TECH,
      extras: ["storage:128GB"], // stale contamination
    };
    expect(resolveElectronicsSubtype(fill)).toBe("gaming_mouse");
    expect(nextListingSlotQuestion(fill)?.slot).not.toBe("storage");
    // Relevance still false — we don't ASK storage for mice
    expect(isFieldRelevant("storage", fill)).toBe(false);
  });
});

describe("next-best-question + multi-fact skip", () => {
  it("mouse with price + location skips optional interrogation", () => {
    const fill = {
      ...RAZER_TECH,
      price: "50",
      location: "Auckland",
      condition: "Used",
    };
    expect(selectNextBestListingSlot(fill)).toBeNull();
    expect(nextListingSlotQuestion(fill)).toBeNull();
  });

  it("multi-fact: $60 basically new wireless pickup Auckland → draftable", () => {
    const fill = {
      title: "Razer Gaming Mouse",
      listingType: "physical" as const,
      category: "Tech",
      price: "60",
      condition: "Like New",
      location: "Auckland",
      extras: ["connectivity:wireless"],
    };
    expect(computeMissingListingSlots(fill)).toEqual([]);
    expect(nextListingSlotQuestion(fill)).toBeNull();
  });

  it("mouse with only identity → price beats storage (storage never candidate)", () => {
    const next = selectNextBestListingSlot(RAZER_TECH);
    expect(next).toBe("price");
    expect(next).not.toBe("storage");
  });

  it("smartphone with identity → storage still in missing (high-value)", () => {
    const fill = {
      title: "iPhone 14 Pro",
      listingType: "physical" as const,
      category: "Tech",
    };
    const missing = computeMissingListingSlots(fill);
    expect(missing).toContain("storage");
    expect(isFieldRelevant("storage", fill)).toBe(true);
    // Required price outranks optional storage — next-best may be price first
    expect(["price", "storage"]).toContain(selectNextBestListingSlot(fill));
  });
});

describe("CONFIRM_IDENTITY pendingAction preserved with domain fix", () => {
  it("Yes after Razer confirm still resolves locally without storage ask", () => {
    const conversationId = `razer_dom_${Math.random().toString(36).slice(2, 10)}`;
    const pa = {
      ...buildConfirmIdentityPendingAction({
        identity: "Razer Gaming Mouse",
        listingFill: RAZER_TECH,
      }),
      id: "pa_test_razer",
      status: "active" as const,
      createdAt: Date.now(),
    };

    const yes = processCanonicalAwhina("Yes", {
      conversationId,
      pathname: "/post/ai",
      clientPendingAction: pa,
      listingContext: {
        title: "Razer Gaming Mouse",
        category: "Tech",
        listingType: "physical",
      },
    });
    expect(yes.handled).toBe(true);
    expect(yes.reply || "").toMatch(/Razer/i);
    expect(yes.reply || "").not.toMatch(/storage/i);
    expect(yes.reply || "").not.toMatch(/What are you confirming/i);
  });
});
