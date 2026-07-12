import { describe, expect, it } from "vitest";
import {
  conversationKeyFromHide,
  hiddenConversationDocId,
  shouldShowConversationInInbox,
  type HiddenConversationRecord,
} from "./conversation-hide";

describe("conversation hide helpers", () => {
  it("builds stable hidden doc ids", () => {
    expect(hiddenConversationDocId("buyer@test.com", "abc123")).toBe(
      "buyer_test_com__abc123"
    );
    expect(hiddenConversationDocId("buyer@test.com", null)).toBe(
      "buyer_test_com__general"
    );
  });

  it("hides conversation until a new inbound message arrives", () => {
    const hidden = new Map<string, HiddenConversationRecord>([
      [
        conversationKeyFromHide("seller@test.com", "listing1"),
        {
          otherEmail: "seller@test.com",
          listingId: "listing1",
          hiddenAtMs: 1_000,
        },
      ],
    ]);
    const key = conversationKeyFromHide("seller@test.com", "listing1");

    expect(
      shouldShowConversationInInbox(
        key,
        hidden,
        { sender: "seller@test.com", createdAt: { seconds: 1 } },
        "buyer@test.com"
      )
    ).toBe(false);

    expect(
      shouldShowConversationInInbox(
        key,
        hidden,
        { sender: "seller@test.com", createdAt: { seconds: 2 } },
        "buyer@test.com"
      )
    ).toBe(true);
  });

  it("keeps conversation hidden when only the clearing user sends again", () => {
    const hidden = new Map<string, HiddenConversationRecord>([
      [
        conversationKeyFromHide("seller@test.com", null),
        {
          otherEmail: "seller@test.com",
          listingId: null,
          hiddenAtMs: 1_000,
        },
      ],
    ]);
    const key = conversationKeyFromHide("seller@test.com", null);

    expect(
      shouldShowConversationInInbox(
        key,
        hidden,
        { sender: "buyer@test.com", createdAt: { seconds: 2 } },
        "buyer@test.com"
      )
    ).toBe(false);
  });
});
