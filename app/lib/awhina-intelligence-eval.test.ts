/**
 * Āwhina intelligence regression suite.
 *
 * Fixtures (Floyd Samba, R33, etc.) are EVAL CASES ONLY — production code
 * must not hardcode these product names.
 *
 * Covers: VISION CORRECTION, MULTI FACT, OFF-SLOT ANSWER, REPEATED QUESTION,
 * UNCERTAINTY, USER DESCRIPTION, PHOTO AGAIN, UNKNOWN, CONTEXT, messy human input.
 */

import { describe, expect, it } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import {
  AUTHORITY_RANK,
  mayOverwriteAuthority,
  isLockedUserAuthority,
} from "./awhina-authority";
import {
  emptyCanonicalTaskState,
  mergeCanonicalFact,
  isUncertaintyOrSkipMessage,
} from "./awhina-canonical-state";
import { interpretSemanticTurn } from "./awhina-semantic-intent";
import {
  looksLikeCardSetAnswer,
  looksLikeCardSubjectAnswer,
  validatePendingSlotAnswer,
} from "./awhina-pending-slot-validate";
import { runIntelligenceTurn } from "./awhina-intelligence-turn";
import { guardResponseBeforeEmit } from "./awhina-response-guard";
import {
  computeDomainAwareMissingSlots,
  resolveFactDomain,
} from "./awhina-domain-facts";
import { computeMissingListingSlots } from "./awhina-pending-slots";
import { setFact, mergeListingFacts, emptyListingFacts } from "./awhina-listing-facts";

function anon() {
  return `intel_${Math.random().toString(36).slice(2, 10)}`;
}

describe("authority hierarchy", () => {
  it("USER_CORRECTED beats IMAGE and AWHINA", () => {
    expect(AUTHORITY_RANK.USER_CORRECTED).toBeGreaterThan(AUTHORITY_RANK.IMAGE);
    expect(AUTHORITY_RANK.USER_CORRECTED).toBeGreaterThan(AUTHORITY_RANK.AWHINA);
    expect(mayOverwriteAuthority("USER_CORRECTED", "IMAGE")).toBe(false);
    expect(mayOverwriteAuthority("USER_CONFIRMED", "MODEL_INFERENCE")).toBe(false);
    expect(mayOverwriteAuthority("IMAGE", "USER_CORRECTED")).toBe(true);
    expect(isLockedUserAuthority("USER_CORRECTED")).toBe(true);
  });

  it("canonical merge keeps USER fact when vision conflicts", () => {
    let state = emptyCanonicalTaskState();
    state = mergeCanonicalFact(state, {
      key: "cardSubject",
      value: "Floyd Samba",
      authority: "USER_CORRECTED",
      lifecycle: "corrected",
      confidence: "HIGH",
    });
    state = mergeCanonicalFact(state, {
      key: "cardSubject",
      value: "Wrong Samuels",
      authority: "IMAGE",
      lifecycle: "inferred",
      confidence: "HIGH",
    });
    expect(state.facts.cardSubject.value).toBe("Floyd Samba");
    expect(state.conflictingEvidence.length).toBeGreaterThan(0);
    expect(state.conflictingEvidence.at(-1)?.kept).toBe("canonical");
  });
});

describe("semantic correction (not keyword-only)", () => {
  it("understands messy identity correction without 'actually'", () => {
    const r = interpretSemanticTurn({
      message: "its floyd samba not samuels",
      pendingSlot: "card_set",
      priorAssistant: "Which set / product line is the card from?",
      canonical: {
        title: "Samuels Rookie",
        extras: ["subject:Samuels"],
      },
    });
    expect(r.isCorrection).toBe(true);
    expect(r.facts.some((f) => /floyd samba/i.test(f.value))).toBe(true);
    expect(r.correctedKeys).toContain("cardSubject");
  });

  it("understands nah bro its r33", () => {
    const r = interpretSemanticTurn({
      message: "nah bro its r33",
      pendingSlot: "year",
      priorAssistant: "What year is it?",
      canonical: { title: "Nissan Skyline", vehicleMake: "Nissan", vehicleModel: "Skyline" },
    });
    expect(r.facts.some((f) => f.key === "vehicleGeneration" && /R33/i.test(f.value))).toBe(
      true
    );
  });

  it("extracts multi-fact: actually 450 pickup only", () => {
    const r = interpretSemanticTurn({
      message: "actually 450 pickup only",
      pendingSlot: "condition",
      canonical: { title: "Couch" },
    });
    expect(r.facts.some((f) => f.key === "price" && f.value === "450")).toBe(true);
    expect(r.facts.some((f) => f.key === "delivery")).toBe(true);
  });
});

describe("pendingSlot is HINT not TRAP", () => {
  it("does not treat person identity as card_set", () => {
    expect(looksLikeCardSetAnswer("It's Floyd Samba")).toBe(false);
    expect(looksLikeCardSetAnswer("Floyd Samba")).toBe(false);
    expect(looksLikeCardSubjectAnswer("Floyd Samba")).toBe(true);
    expect(looksLikeCardSetAnswer("Prizm")).toBe(true);
    expect(looksLikeCardSetAnswer("2023 Topps Chrome")).toBe(true);
  });

  it("OFF-SLOT: card_set pending + identity answer → subject, not set", () => {
    const v = validatePendingSlotAnswer({
      message: "It's Floyd Samba",
      activeSlot: "card_set",
      baseDraft: {
        title: "Samuels",
        listingType: "physical",
        category: "Collectibles",
        extras: ["subject:Samuels"],
      },
      priorAssistant: "Which set / product line is the card from?",
    });
    expect(v.consumeAsPending).toBe(false);
    expect(v.filledSlots).toContain("card_subject");
    const setExtra = (v.appliedPartial.extras || []).find((e) =>
      e.toLowerCase().startsWith("set:")
    );
    expect(setExtra).toBeFalsy();
    const sub = (v.appliedPartial.extras || []).find((e) =>
      e.toLowerCase().startsWith("subject:")
    );
    expect(sub).toMatch(/floyd samba/i);
  });

  it("intelligence turn: Floyd Samba correction class is impossible to trap as set", () => {
    const result = runIntelligenceTurn({
      message: "its floyd samba not samuels",
      activeSlot: "card_set",
      baseDraft: {
        title: "Samuels Rookie Card",
        listingType: "physical",
        category: "Collectibles",
        extras: ["subject:Samuels"],
      },
      priorAssistant: "Which set / product line is the card from?",
    });
    expect(result.handled).toBe(true);
    expect(result.filledSlots).toContain("card_subject");
    expect(result.pendingSlotAfter).not.toBe("card_set");
    const extras = result.mergedDraft.extras || [];
    expect(extras.some((e) => /^set:.*floyd/i.test(e))).toBe(false);
    expect(extras.some((e) => /subject:.*floyd samba/i.test(e))).toBe(true);
    expect(result.userCorrectedKeys.length).toBeGreaterThan(0);
  });
});

describe("domain-aware facts — trading card", () => {
  it("does not auto-demand card_set", () => {
    const fill = {
      title: "Floyd Samba Rookie",
      listingType: "physical" as const,
      category: "Collectibles",
      extras: ["subject:Floyd Samba"],
    };
    expect(resolveFactDomain(fill)).toBe("TRADING_CARD");
    const missing = computeDomainAwareMissingSlots(fill);
    expect(missing).not.toContain("card_set");
    expect(computeMissingListingSlots(fill)).not.toContain("card_set");
  });
});

describe("repeated-question + uncertainty guards", () => {
  it("does not ask about price when price just filled", () => {
    const g = guardResponseBeforeEmit({
      reply: "Got it. What's the asking price?",
      draft: { title: "Bike", price: "200", condition: "Used - Good" },
      filledSlotsThisTurn: ["price"],
      pendingSlotAfter: "price",
    });
    expect(g.failures).toContain("A_ASK_KNOWN");
    expect(g.safePendingSlot).not.toBe("price");
    expect(g.safeReply || "").not.toMatch(/asking price/i);
  });

  it("uncertainty allows continue", () => {
    expect(isUncertaintyOrSkipMessage("not sure")).toBe(true);
    expect(isUncertaintyOrSkipMessage("idk")).toBe(true);
    const result = runIntelligenceTurn({
      message: "not sure",
      activeSlot: "card_set",
      baseDraft: {
        title: "Rookie Card",
        listingType: "physical",
        extras: ["subject:Player"],
      },
    });
    expect(result.skipActiveSlot).toBe(true);
    expect(result.canonicalState.skippedSlots).toContain("card_set");
  });
});

describe("VISION CORRECTION conversation replay (canonical)", () => {
  it("user correction after wrong vision identity is understood + not re-asked as set", () => {
    const id = anon();
    // Seed sell draft with wrong vision subject + pending card_set (legacy trap state)
    const t0 = processCanonicalAwhina("selling trading card floyd", {
      pathname: "/post/ai",
      anonSessionId: id,
    });
    // Force the failure-class state via clientTask echo
    const t1 = processCanonicalAwhina("It's Floyd Samba", {
      pathname: "/post/ai",
      anonSessionId: id,
      listingContext: {
        title: "Samuels",
        listingType: "physical",
        category: "Collectibles",
        extras: ["subject:Samuels"],
      },
      clientTask: {
        task: "selling",
        pendingClarification: {
          kind: "listing_slots",
          status: "open",
          priorMessage: "card",
          askedAt: Date.now(),
          pendingSlot: "card_set",
          missingListingSlots: ["card_set", "price", "location"],
        },
        updatedAt: Date.now(),
      },
      history: [
        {
          role: "assistant",
          content: "Looks like a Samuels card. Which set / product line is the card from?",
        },
      ],
    });
    expect(t1.handled).toBe(true);
    const fill = t1.listingFill;
    expect(fill).toBeTruthy();
    const extras = fill?.extras || [];
    expect(extras.some((e) => /^set:/i.test(e) && /floyd/i.test(e))).toBe(false);
    expect(
      extras.some((e) => /subject:.*floyd samba/i.test(e)) ||
        /floyd samba/i.test(fill?.title || "")
    ).toBe(true);
    expect(t1.sessionState?.pendingSlot).not.toBe("card_set");
    // Must not re-ask the same known identity
    expect(t1.reply || "").not.toMatch(/which set/i);
    void t0;
  });

  it("MULTI FACT: new auckland 200 fills condition+location+price", () => {
    const id = anon();
    const r = processCanonicalAwhina("new auckland 200", {
      pathname: "/post/ai",
      anonSessionId: id,
      listingContext: {
        title: "Desk Lamp",
        listingType: "physical",
      },
      clientTask: {
        task: "selling",
        pendingClarification: {
          kind: "listing_slots",
          status: "open",
          priorMessage: "lamp",
          askedAt: Date.now(),
          pendingSlot: "condition",
          missingListingSlots: ["condition", "price", "location"],
        },
        updatedAt: Date.now(),
      },
    });
    expect(r.handled).toBe(true);
    expect(r.listingFill?.condition).toMatch(/new/i);
    expect(r.listingFill?.location).toMatch(/auckland/i);
    expect(r.listingFill?.price).toBe("200");
    expect(r.sessionState?.pendingSlot).not.toBe("condition");
    expect(r.sessionState?.pendingSlot).not.toBe("price");
    expect(r.sessionState?.pendingSlot).not.toBe("location");
  });

  it("messy vehicle: nah bro its r33 then 450", () => {
    const id = anon();
    const t1 = processCanonicalAwhina("nah bro its r33", {
      pathname: "/post/ai",
      anonSessionId: id,
      listingContext: {
        title: "Nissan Skyline",
        listingType: "vehicle",
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
      },
      clientTask: {
        task: "selling",
        pendingClarification: {
          kind: "listing_slots",
          status: "open",
          priorMessage: "skyline",
          askedAt: Date.now(),
          pendingSlot: "year",
          missingListingSlots: ["generation", "year", "price"],
        },
        updatedAt: Date.now(),
      },
    });
    expect(t1.handled).toBe(true);
    expect(t1.listingFill?.vehicleGeneration || "").toMatch(/R33/i);

    const t2 = processCanonicalAwhina("actually 45000", {
      pathname: "/post/ai",
      anonSessionId: id,
      listingContext: {
        ...t1.listingFill,
        listingType: "vehicle",
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
      },
      clientTask: t1.sessionState?.task,
    });
    expect(t2.listingFill?.price || t2.handled).toBeTruthy();
  });
});

describe("USER description + PHOTO AGAIN authority", () => {
  it("facts bag: USER description/subject survives IMAGE merge", () => {
    let bag = emptyListingFacts();
    setFact(bag, "cardSubject", "Floyd Samba", "USER", "HIGH");
    setFact(bag, "description", "My custom blurb", "USER", "HIGH");
    const vision = emptyListingFacts();
    setFact(vision, "cardSubject", "Samuels", "IMAGE", "HIGH");
    setFact(vision, "description", "Vision prose dump", "IMAGE", "MEDIUM");
    bag = mergeListingFacts(bag, vision);
    expect(bag.fields.cardSubject?.value).toBe("Floyd Samba");
    expect(bag.fields.description?.value).toBe("My custom blurb");
  });

  it("vision bridge re-photo cannot resurrect wrong identity over USER_CORRECTED", async () => {
    const { prepareVisionConversationBridge } = await import(
      "./awhina-vision-conversation-bridge"
    );
    const bridge = prepareVisionConversationBridge({
      listingFill: {
        title: "Samuels",
        listingType: "physical",
        extras: ["subject:Samuels"],
        description: "Vision thinks Samuels",
      },
      displayIdentity: "Samuels",
      needsIdentityConfirm: false,
      fieldProvenance: { title: "USER_CORRECTED" },
      existingDraft: {
        title: "Floyd Samba",
        extras: ["subject:Floyd Samba"],
        listingType: "physical",
      },
    });
    expect(bridge.listingFill.title).toMatch(/Floyd Samba/i);
    expect((bridge.listingFill.extras || []).join(" ")).toMatch(/Floyd Samba/i);
    expect((bridge.listingFill.extras || []).join(" ")).not.toMatch(/subject:Samuels/i);
  });
});

describe("self-check layer", () => {
  it("flags pendingSlot unrelated consume", () => {
    const g = guardResponseBeforeEmit({
      draft: { title: "Floyd Samba", extras: ["subject:Floyd Samba"] },
      pendingConsumedUnrelated: true,
      pendingSlotBefore: "card_set",
      pendingSlotAfter: "price",
    });
    expect(g.failures).toContain("F_PENDING_SLOT_UNRELATED");
  });
});

describe("CONTEXT-aware domain", () => {
  it("same physical title routes to trading card domain when card cues present", () => {
    expect(
      resolveFactDomain({
        title: "Rookie",
        extras: ["subject:Player"],
        category: "Collectibles",
      })
    ).toBe("TRADING_CARD");
    expect(
      resolveFactDomain({
        title: "iPhone 14 Pro",
        category: "Tech",
      })
    ).toBe("PHONE");
  });
});
