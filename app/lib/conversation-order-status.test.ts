import { describe, expect, it } from "vitest";
import {
  dedupeConversationOrderMessages,
  resolveConversationOrderStatus,
  shouldHideSupersededPaidOrderCard,
} from "./conversation-order-status";

describe("conversation-order-status", () => {
  it("keeps the newest order card when deduping", () => {
    const newestFirst = [
      { type: "order", orderId: "ord_1", orderStatus: "refunded", createdAt: { seconds: 200 } },
      { type: "order", orderId: "ord_1", orderStatus: "paid", createdAt: { seconds: 100 } },
      { type: "text", text: "hello", createdAt: { seconds: 50 } },
    ];

    expect(dedupeConversationOrderMessages(newestFirst)).toEqual([
      newestFirst[0],
      newestFirst[2],
    ]);
  });

  it("uses live purchase refund status over stale paid message", () => {
    const status = resolveConversationOrderStatus(
      { type: "order", purchaseId: "p1", orderStatus: "paid", listingId: "l1" },
      { id: "p1", status: "refunded", listingId: "l1" },
      "l1"
    );
    expect(status).toBe("refunded");
  });

  it("matches stale paid cards to purchase by order id", () => {
    const status = resolveConversationOrderStatus(
      { type: "order", orderId: "ord_1", orderStatus: "paid" },
      { id: "p1", status: "refunded", orderId: "ord_1" },
      "l1"
    );
    expect(status).toBe("refunded");
  });

  it("hides stale paid cards when a newer refunded card exists", () => {
    const messages = [
      { type: "order", orderId: "ord_1", orderStatus: "refunded", createdAt: { seconds: 200 } },
      { type: "order", orderId: "ord_1", orderStatus: "paid", createdAt: { seconds: 100 } },
    ];

    expect(
      shouldHideSupersededPaidOrderCard(messages[1], null, messages)
    ).toBe(true);
  });
});
