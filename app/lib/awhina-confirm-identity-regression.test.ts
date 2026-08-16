/**
 * PRODUCTION BUG: Barella card → Razer mouse photo → "Is that right?" → "Yes"
 * must NOT reply "What are you confirming?"
 *
 * Root cause: vision confirmation prose without structured CONFIRM_IDENTITY pendingAction.
 * Fix: pendingAction written when asking; Yes resolves locally (zero OpenAI).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import {
  prepareVisionConversationBridge,
  commitVisionBridgeToConversation,
} from "./awhina-vision-conversation-bridge";
import {
  __resetAwhinaConversationStoreForTests,
  getAwhinaConversationState,
} from "./awhina-conversation-store";
import {
  buildConfirmIdentityPendingAction,
  classifyConfirmationReply,
  clearPendingActionStoreForTests,
  pendingActionKey,
  resolvePendingActionTurn,
  setPendingAction,
  shouldSupersedePendingAction,
  visionObjectIdFromIdentity,
} from "./awhina-pending-action";
import { assessObjectContinuity } from "./awhina-object-continuity";
import type { VisionListingObservation } from "./awhina-vision-observation";

beforeEach(() => {
  clearPendingActionStoreForTests();
  __resetAwhinaConversationStoreForTests();
});

const RAZER_FILL = {
  title: "Razer Gaming Mouse",
  listingType: "physical" as const,
  category: "Gaming",
  replaceDraft: true,
};

const BARELLA_DRAFT = {
  title: "Nicolo Barella Panini card",
  price: "20",
  condition: "Used",
  listingType: "physical" as const,
  category: "Collectibles",
  extras: ["subject:Nicolo Barella", "manufacturer:Panini"],
};

describe("classifyConfirmationReply — affirmatives / negatives", () => {
  it("accepts all required affirmatives", () => {
    for (const m of [
      "Yes",
      "yep",
      "yeah",
      "correct",
      "that's right",
      "thats right",
      "yup",
      "Yep!",
      "yeah booster box",
      "yes it's a booster box",
    ]) {
      expect(classifyConfirmationReply(m), m).toBe("AFFIRM");
    }
  });
  it("accepts required negatives", () => {
    for (const m of ["No", "nah", "nope", "wrong", "not right", "nah hobby box"]) {
      expect(classifyConfirmationReply(m), m).toBe("REJECT");
    }
  });
});

describe("Barella → Razer → Yes exact sequence", () => {
  it("vision confirm writes CONFIRM_IDENTITY pendingAction (not prose-only)", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: RAZER_FILL,
      displayIdentity: "Razer Gaming Mouse",
      needsIdentityConfirm: true,
      existingDraft: BARELLA_DRAFT,
    });

    expect(bridge.needsIdentityConfirm).toBe(true);
    expect(bridge.assistantMessage).toMatch(/Razer Gaming Mouse/i);
    expect(bridge.assistantMessage).toMatch(/Is that right/i);
    expect(bridge.pendingAction).not.toBeNull();
    expect(bridge.pendingAction?.type).toBe("CONFIRM_IDENTITY");
    expect(bridge.pendingAction?.status).toBe("active");
    expect(bridge.pendingAction?.identity).toMatch(/Razer/i);
    expect(bridge.pendingAction?.objectId).toBe(
      visionObjectIdFromIdentity("Razer Gaming Mouse")
    );
    expect(bridge.pendingAction?.proposedFacts?.title).toMatch(/Razer/i);
    // NEW_OBJECT: no Barella / Panini / $20 leak into proposed fill
    expect(JSON.stringify(bridge.listingFill)).not.toMatch(/Barella|Panini/i);
    expect(bridge.listingFill.price).toBeUndefined();
  });

  it("commit persists pendingAction into conversation session (survives next turn)", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: RAZER_FILL,
      displayIdentity: "Razer Gaming Mouse",
      needsIdentityConfirm: true,
    });
    commitVisionBridgeToConversation(bridge);

    const state = getAwhinaConversationState();
    expect(state.awhinaSession?.pendingAction?.type).toBe("CONFIRM_IDENTITY");
    expect(state.awhinaSession?.pendingAction?.identity).toMatch(/Razer/i);
    expect(state.messages.some((m) => /Is that right/i.test(m.text))).toBe(true);
  });

  it("Yes with CONFIRM_IDENTITY → accept facts, continue workflow, ZERO AI", () => {
    const conversationId = `razer_${Math.random().toString(36).slice(2, 10)}`;
    const pa = {
      ...buildConfirmIdentityPendingAction({
        identity: "Razer Gaming Mouse",
        listingFill: RAZER_FILL,
      }),
      id: "pa_razer",
      status: "active" as const,
      createdAt: Date.now(),
    };

    const yes = processCanonicalAwhina("Yes", {
      conversationId,
      pathname: "/post/ai",
      clientPendingAction: pa,
      listingContext: { title: "Razer Gaming Mouse", listingType: "physical" },
    });

    expect(yes.handled).toBe(true);
    expect(yes.avoidedAi).toBe(true);
    expect(yes.usedLocalExecution).toBe(true);
    expect(yes.reply || "").not.toMatch(/What are you confirming/i);
    expect(yes.reply || "").toMatch(/Razer/i);
    expect(yes.reply || "").toMatch(/Yep|price|condition|located|asking/i);
    expect(yes.listingFill?.title || RAZER_FILL.title).toMatch(/Razer/i);
    expect(yes.intent).toMatch(/listing/i);
    // Must not force user to restate identity
    expect(yes.reply || "").not.toMatch(/what (are you|do you want to) sell/i);
  });

  it("Yes is a booster box confirms identity and refines the active listing", () => {
    const pending = {
      ...buildConfirmIdentityPendingAction({
        identity: "2026 Topps Premier League",
        listingFill: {
          title: "2026 Topps Premier League",
          listingType: "physical",
          category: "Sports",
        },
      }),
      id: "pa_booster",
      status: "active" as const,
      createdAt: Date.now(),
    };
    const result = processCanonicalAwhina("Yes is a booster box", {
      conversationId: `booster_${Math.random().toString(36).slice(2, 10)}`,
      pathname: "/post/ai",
      clientPendingAction: pending,
      listingContext: { title: "2026 Topps Premier League", listingType: "physical" },
    });
    expect(result.avoidedAi).toBe(true);
    expect(result.listingFill?.title).toBe("2026 Topps Premier League Booster Box");
    expect(result.listingFill?.extras).toContain("productFormat:Booster Box");
    expect(result.reply).toMatch(/asking price|price/i);
    expect(result.reply).not.toMatch(/clarify what you'd like me to do/i);
  });

  it.each([
    "list it",
    "list it for sale",
    "sell this",
    "post it",
    "make a listing",
  ])("routes active-draft command %s to selling, not generic clarification", (message) => {
    const result = processCanonicalAwhina(message, {
      conversationId: `sell_command_${message}`,
      pathname: "/post/ai",
      listingContext: {
        title: "2026 Topps Premier League Booster Box",
        listingType: "physical",
        category: "Sports",
      },
    });
    expect(result.reply || "").not.toMatch(/clarify what you'd like me to do/i);
    expect(result.intent).toMatch(/listing/);
  });

  it("orphan Yes without pending still clarifies (unchanged safety)", () => {
    const yes = processCanonicalAwhina("Yes", {
      conversationId: `orphan_${Math.random().toString(36).slice(2, 10)}`,
      pathname: "/post/ai",
    });
    expect(yes.reply || "").toMatch(/What are you confirming/i);
    expect(yes.avoidedAi).toBe(true);
  });

  it("full roundtrip: bridge ask → client pending → Yes resolves", () => {
    const conversationId = `rt_${Math.random().toString(36).slice(2, 10)}`;
    const bridge = prepareVisionConversationBridge({
      listingFill: RAZER_FILL,
      displayIdentity: "Razer Gaming Mouse",
      needsIdentityConfirm: true,
      existingDraft: BARELLA_DRAFT,
    });
    commitVisionBridgeToConversation(bridge);
    const pending = getAwhinaConversationState().awhinaSession?.pendingAction;
    expect(pending?.type).toBe("CONFIRM_IDENTITY");

    const yes = processCanonicalAwhina("Yes", {
      conversationId,
      pathname: "/post/ai",
      clientPendingAction: pending,
      listingContext: {
        title: bridge.displayIdentity,
        listingType: "physical",
        category: "Gaming",
      },
    });

    expect(yes.avoidedAi).toBe(true);
    expect(yes.reply || "").not.toMatch(/What are you confirming/i);
    expect(yes.reply || "").toMatch(/Razer/i);
  });
});

describe("CONFIRM_IDENTITY reject + interruption + object scope", () => {
  it("No → asks What is it? with zero AI", () => {
    const conversationId = `no_${Math.random().toString(36).slice(2, 10)}`;
    const no = processCanonicalAwhina("No", {
      conversationId,
      pathname: "/post/ai",
      clientPendingAction: {
        ...buildConfirmIdentityPendingAction({
          identity: "Razer Gaming Mouse",
          listingFill: RAZER_FILL,
        }),
        id: "pa_no",
        status: "active",
        createdAt: Date.now(),
      },
      listingContext: { title: "Razer Gaming Mouse" },
    });
    expect(no.avoidedAi).toBe(true);
    expect(no.reply || "").toMatch(/What is it/i);
  });

  it("interruption 'actually find me a PS5' supersedes confirm", () => {
    const pending = {
      ...buildConfirmIdentityPendingAction({
        identity: "Razer Gaming Mouse",
        listingFill: RAZER_FILL,
      }),
      id: "pa_int",
      status: "active" as const,
      createdAt: Date.now(),
    };
    expect(
      shouldSupersedePendingAction({
        message: "actually find me a PS5",
        pending,
      })
    ).toBe(true);

    const conversationId = `int_${Math.random().toString(36).slice(2, 10)}`;
    const r = processCanonicalAwhina("actually find me a PS5", {
      conversationId,
      pathname: "/",
      clientPendingAction: pending,
      listingContext: { title: "Razer Gaming Mouse" },
    });
    // Must not treat as identity affirm / orphan clarify
    expect(r.reply || "").not.toMatch(/What are you confirming/i);
    expect(r.reply || "").not.toMatch(/^Yep —/i);
  });

  it("stale objectId does not resolve (no cross-object leak)", () => {
    const r = resolvePendingActionTurn({
      message: "Yes",
      pendingAction: {
        ...buildConfirmIdentityPendingAction({
          identity: "Nicolo Barella Panini card",
          listingFill: BARELLA_DRAFT,
        }),
        id: "pa_stale",
        status: "active",
        createdAt: Date.now(),
      },
      currentObjectId: visionObjectIdFromIdentity("Razer Gaming Mouse"),
    });
    expect(r.kind).toBe("CLARIFY");
    if (r.kind === "CLARIFY") {
      expect(r.reply).toMatch(/What are you confirming/i);
    }
  });

  it("two objects: Razer pending does not carry Barella facts", () => {
    const paKey = pendingActionKey({ conversationId: "multi_obj" });
    setPendingAction(
      paKey,
      buildConfirmIdentityPendingAction({
        identity: "Nicolo Barella Panini card",
        listingFill: BARELLA_DRAFT,
      })
    );
    // New photo supersedes
    const next = setPendingAction(
      paKey,
      buildConfirmIdentityPendingAction({
        identity: "Razer Gaming Mouse",
        listingFill: RAZER_FILL,
      })
    );
    expect(next.identity).toMatch(/Razer/i);
    expect(JSON.stringify(next.listingFill || {})).not.toMatch(/Barella|Panini|\"20\"/);
    expect(next.objectId).not.toBe(visionObjectIdFromIdentity("Nicolo Barella Panini card"));
  });
});

describe("object boundary Barella → Razer", () => {
  it("continuity marks NEW_OBJECT", () => {
    const obs = {
      displayIdentity: "Razer Gaming Mouse",
      brand: { value: "Razer", confidence: 0.9 },
      product: { value: "Gaming Mouse", confidence: 0.85 },
      domain: "electronics",
      category: { value: "Gaming", confidence: 0.8 },
    } as unknown as VisionListingObservation;
    const c = assessObjectContinuity({
      observation: obs,
      priorDraft: BARELLA_DRAFT,
    });
    expect(c.verdict).toBe("NEW_OBJECT");
  });
});

describe("OpenAI call count for Yes with pending", () => {
  it("CONFIRM_IDENTITY Yes sets avoidedAi (zero model calls in canonical)", () => {
    const yes = processCanonicalAwhina("yep", {
      conversationId: `ai0_${Math.random().toString(36).slice(2, 10)}`,
      pathname: "/post/ai",
      clientPendingAction: {
        ...buildConfirmIdentityPendingAction({
          identity: "Razer Gaming Mouse",
          listingFill: RAZER_FILL,
        }),
        id: "pa_ai0",
        status: "active",
        createdAt: Date.now(),
      },
      listingContext: { title: "Razer Gaming Mouse" },
    });
    expect(yes.avoidedAi).toBe(true);
    expect(yes.usedLocalExecution).toBe(true);
    expect(yes.source).not.toBe("ai");
  });
});
