import { describe, it, expect, beforeEach } from "vitest";
import {
  prepareVisionConversationBridge,
  commitVisionBridgeToConversation,
} from "./awhina-vision-conversation-bridge";
import {
  __resetAwhinaConversationStoreForTests,
  getAwhinaConversationState,
} from "./awhina-conversation-store";

beforeEach(() => {
  __resetAwhinaConversationStoreForTests();
});

describe("prepareVisionConversationBridge", () => {
  it("high-confidence PS5 → composed description + price pendingSlot", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: {
        title: "PlayStation 5",
        listingType: "physical",
        category: "Gaming",
        description: "Black console visible in frame with DualSense.",
      },
      displayIdentity: "PlayStation 5",
      needsIdentityConfirm: false,
    });

    expect(bridge.needsIdentityConfirm).toBe(false);
    expect(bridge.listingFill.title).toMatch(/PlayStation 5/i);
    expect(bridge.listingFill.description).toBeTruthy();
    expect(bridge.listingFill.description).not.toMatch(/Black console visible in frame/i);
    expect(bridge.imageFieldKeys).toContain("title");
    expect(bridge.imageFieldKeys).not.toContain("price");
    expect(bridge.pendingSlot).toBeTruthy();
    expect(bridge.assistantMessage).toMatch(/PlayStation 5/i);
    expect(bridge.assistantMessage.toLowerCase()).toMatch(
      /price|condition|located|asking/
    );
  });

  it("needs identity confirm → no price pendingSlot yet + CONFIRM_IDENTITY pendingAction", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: {
        title: "Black game console",
        listingType: "physical",
        category: "Gaming",
      },
      displayIdentity: "Black game console",
      needsIdentityConfirm: true,
    });

    expect(bridge.needsIdentityConfirm).toBe(true);
    expect(bridge.pendingSlot).toBeNull();
    expect(bridge.pendingClarification).toBeNull();
    expect(bridge.assistantMessage).toMatch(/Is that right/i);
    expect(bridge.pendingAction?.type).toBe("CONFIRM_IDENTITY");
    expect(bridge.pendingAction?.status).toBe("active");
    expect(bridge.pendingAction?.identity).toMatch(/Black game console/i);
  });

  it("identityConfirmed after Yes → establishes next slot and clears pendingAction", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: {
        title: "PlayStation 5",
        listingType: "physical",
        category: "Gaming",
      },
      displayIdentity: "PlayStation 5",
      needsIdentityConfirm: true,
      identityConfirmed: true,
    });

    expect(bridge.needsIdentityConfirm).toBe(false);
    expect(bridge.pendingSlot).toBeTruthy();
    expect(bridge.assistantMessage).not.toMatch(/Is that right/i);
    expect(bridge.pendingAction).toBeNull();
  });

  it("existing USER price → does not ask price again", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: {
        title: "PlayStation 5",
        listingType: "physical",
        category: "Gaming",
      },
      displayIdentity: "PlayStation 5",
      needsIdentityConfirm: false,
      existingDraft: {
        title: "PlayStation 5",
        price: "500",
        listingType: "physical",
      },
    });

    expect(bridge.pendingSlot).not.toBe("price");
    expect(bridge.assistantMessage.toLowerCase()).not.toMatch(
      /what'?s the asking price/
    );
  });

  it("USER description provenance → never overwrite", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: {
        title: "PlayStation 5",
        listingType: "physical",
        description: "Vision raw prose should be ignored",
      },
      displayIdentity: "PlayStation 5",
      needsIdentityConfirm: false,
      descriptionProvenance: "USER",
      existingDraft: {
        description: "My custom seller description",
      },
    });

    expect(bridge.listingFill.description).toBeUndefined();
    expect(bridge.provenanceOverrides.description).toBeUndefined();
  });

  it("companion price in fill → USER provenance override", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: {
        title: "PlayStation 5",
        listingType: "physical",
        price: "500",
        location: "Auckland",
      },
      displayIdentity: "PlayStation 5",
      needsIdentityConfirm: false,
    });

    expect(bridge.provenanceOverrides.price).toBe("USER");
    expect(bridge.provenanceOverrides.location).toBe("USER");
    expect(bridge.pendingSlot).not.toBe("price");
  });
});

describe("commitVisionBridgeToConversation", () => {
  it("writes assistant message + pendingSlot into canonical store", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: {
        title: "PlayStation 5",
        listingType: "physical",
        category: "Gaming",
      },
      displayIdentity: "PlayStation 5",
      needsIdentityConfirm: false,
    });

    commitVisionBridgeToConversation(bridge);

    const state = getAwhinaConversationState();
    expect(state.listingFillOccurred).toBe(true);
    expect(state.pendingSlot).toBe(bridge.pendingSlot);
    expect(state.messages.some((m) => m.text.includes("PlayStation 5"))).toBe(
      true
    );
    expect(state.awhinaSession?.task?.task).toBe("selling");
    expect(state.awhinaSession?.pendingAction).toBeNull();
  });

  it("identity confirm commit persists CONFIRM_IDENTITY pendingAction", () => {
    const bridge = prepareVisionConversationBridge({
      listingFill: {
        title: "Razer Gaming Mouse",
        listingType: "physical",
        category: "Gaming",
      },
      displayIdentity: "Razer Gaming Mouse",
      needsIdentityConfirm: true,
    });
    commitVisionBridgeToConversation(bridge);
    const state = getAwhinaConversationState();
    expect(state.awhinaSession?.pendingAction?.type).toBe("CONFIRM_IDENTITY");
    expect(state.awhinaSession?.pendingAction?.identity).toMatch(/Razer/i);
  });
});
