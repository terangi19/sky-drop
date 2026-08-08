/**
 * Shared conversation store + homepage→workspace handoff policy.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetAwhinaConversationStoreForTests,
  __replaceAwhinaConversationStoreForTests,
  beginListingWorkspaceHandoff,
  consumeListingWorkspaceHandoff,
  getAwhinaConversationState,
  setAwhinaSurface,
  setMessages,
  setConversationId,
  startFreshListingTask,
  surfaceFromPathname,
} from "./awhina-conversation-store";
import {
  decideSellWorkspaceHandoff,
  preferBriefHandoffReply,
} from "./awhina-sell-handoff";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { hasInlineAwhinaAssistant, resolveAwhinaUiSurface } from "./awhina-ui-surface";

describe("awhina conversation store — surface ≠ identity", () => {
  beforeEach(() => {
    __resetAwhinaConversationStoreForTests();
  });

  it("surface switch does not clear messages or conversationId", () => {
    setConversationId("conv-flow-1");
    setMessages([
      { id: "u1", role: "user", text: "sell my skyline r34" },
      { id: "a1", role: "assistant", text: "Got it — Nissan Skyline R34." },
    ]);
    setAwhinaSurface("global");
    beginListingWorkspaceHandoff({ autoContinue: true });
    const after = getAwhinaConversationState();
    expect(after.surface).toBe("listing_workspace");
    expect(after.conversationId).toBe("conv-flow-1");
    expect(after.messages.map((m) => m.text).join("|")).toMatch(/skyline/i);
    expect(after.handoff?.pending).toBe(true);
    expect(after.handoff?.autoOpen).toBe(true);

    const consumed = consumeListingWorkspaceHandoff();
    expect(consumed?.autoContinue).toBe(true);
    expect(getAwhinaConversationState().handoff).toBeNull();
    expect(getAwhinaConversationState().messages).toHaveLength(2);
  });

  it("route change helpers map surfaces without task reset", () => {
    expect(surfaceFromPathname("/")).toBe("global");
    expect(surfaceFromPathname("/post/ai")).toBe("listing_workspace");
    expect(resolveAwhinaUiSurface("/post/ai")).toBe("listing_workspace");
    expect(hasInlineAwhinaAssistant("/post/ai")).toBe(true);
    expect(hasInlineAwhinaAssistant("/")).toBe(false);
  });

  it("fresh listing task clears transcript", () => {
    setConversationId("old");
    setMessages([{ id: "u1", role: "user", text: "sell ps5" }]);
    startFreshListingTask("Welcome");
    const s = getAwhinaConversationState();
    expect(s.conversationId).toBeNull();
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]?.id).toBe("welcome");
  });
});

describe("sell workspace handoff policy", () => {
  it("expands clear sell intents from homepage", () => {
    const cases = [
      "sell my skyline r34",
      "sell my ps5",
      "I mow lawns for $50",
      "rent my trailer for $60/day",
    ];
    for (const message of cases) {
      const d = decideSellWorkspaceHandoff({ message, pathname: "/" });
      expect(d.shouldExpand, message).toBe(true);
      expect(d.briefLead || "", message).toMatch(/Got it/i);
    }
  });

  it("does not expand ambiguous bare product", () => {
    const d = decideSellWorkspaceHandoff({ message: "skyline", pathname: "/" });
    expect(d.shouldExpand).toBe(false);
    expect(d.reason).toBe("ambiguous");
  });

  it("does not expand when already in workspace", () => {
    const d = decideSellWorkspaceHandoff({
      message: "sell my ps5",
      pathname: "/post/ai",
      listingFill: { title: "PS5" },
    });
    expect(d.shouldExpand).toBe(false);
    expect(d.reason).toBe("already_workspace");
  });

  it("prefers brief reply over multi-question homepage spam", () => {
    const decision = decideSellWorkspaceHandoff({
      message: "sell my skyline r34",
      pathname: "/",
      listingFill: { vehicleMake: "Nissan", vehicleModel: "Skyline R34", title: "Nissan Skyline R34" },
    });
    const brief = preferBriefHandoffReply(
      "What year? What colour? What odometer? What price?",
      decision
    );
    expect(brief || "").toMatch(/Got it/i);
    expect((brief || "").match(/\?/g)?.length || 0).toBeLessThan(3);
  });
});

describe("home sell → workspace continuity (canonical)", () => {
  const id = "flow-home-skyline-handoff";

  beforeEach(() => {
    clearAllListingDraftCacheForTests();
    clearTaskScope(taskScopeKey({ conversationId: id }));
    __resetAwhinaConversationStoreForTests();
  });

  it("sell my skyline r34 from / navigates with fill and preserves store messages", () => {
    const r = processCanonicalAwhina("sell my skyline r34", {
      conversationId: id,
      pathname: "/",
    });
    expect(r.handled).toBe(true);
    expect(r.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(r.listingFill?.vehicleModel || "")).toMatch(/Skyline/i);
    expect(r.navigateTo === "/post/ai" || !!r.listingFill).toBe(true);

    const handoff = decideSellWorkspaceHandoff({
      message: "sell my skyline r34",
      pathname: "/",
      listingFill: r.listingFill as never,
      navigateTo: r.navigateTo,
    });
    expect(handoff.shouldExpand).toBe(true);

    setConversationId(id);
    setMessages([
      { id: "u1", role: "user", text: "sell my skyline r34" },
      {
        id: "a1",
        role: "assistant",
        text: preferBriefHandoffReply(r.reply, handoff) || handoff.briefLead || "",
      },
    ]);
    beginListingWorkspaceHandoff({ autoContinue: true });

    // Simulate surface remount on /post/ai
    setAwhinaSurface("listing_workspace");
    const state = getAwhinaConversationState();
    expect(state.conversationId).toBe(id);
    expect(state.messages.some((m) => /skyline/i.test(m.text))).toBe(true);
    expect(state.handoff?.autoOpen).toBe(true);

    // Continue on workspace — next turn asks year (no reset)
    const t2 = processCanonicalAwhina("1999 manual", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: r.listingFill as never,
    });
    expect(t2.handled).toBe(true);
    expect(String(t2.listingFill?.vehicleYear || "")).toMatch(/1999/);
    expect(String(t2.listingFill?.vehicleTransmission || "").toLowerCase()).toMatch(/manual/);
  });

  it("compound categories still work after handoff identity preserved", () => {
    const cases: Array<{ msg: string; id: string }> = [
      { msg: "sell iPhone 15 Pro", id: "flow-iphone" },
      { msg: "sell my ps5", id: "flow-ps5" },
      { msg: "I mow lawns for $50", id: "flow-service" },
      { msg: "rent my trailer for $60/day", id: "flow-rental" },
    ];
    for (const c of cases) {
      clearAllListingDraftCacheForTests();
      clearTaskScope(taskScopeKey({ conversationId: c.id }));
      const r = processCanonicalAwhina(c.msg, { conversationId: c.id, pathname: "/" });
      expect(r.handled, c.msg).toBe(true);
      const d = decideSellWorkspaceHandoff({
        message: c.msg,
        pathname: "/",
        listingFill: r.listingFill as never,
        navigateTo: r.navigateTo,
      });
      expect(d.shouldExpand, c.msg).toBe(true);
    }
  });
});

describe("refresh persistence snapshot", () => {
  beforeEach(() => {
    __resetAwhinaConversationStoreForTests();
  });

  it("messages survive surface flip like remount", () => {
    __replaceAwhinaConversationStoreForTests({
      conversationId: "persist-1",
      messages: [
        { id: "u1", role: "user", text: "sell couch $200" },
        { id: "a1", role: "assistant", text: "Got it — couch." },
      ],
      surface: "global",
    });
    beginListingWorkspaceHandoff();
    setAwhinaSurface("listing_workspace");
    consumeListingWorkspaceHandoff();
    setAwhinaSurface("global");
    setAwhinaSurface("listing_workspace");
    expect(getAwhinaConversationState().messages).toHaveLength(2);
    expect(getAwhinaConversationState().conversationId).toBe("persist-1");
  });
});
