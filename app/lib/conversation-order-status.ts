import { isRefundedStatus } from "./refund-display";

type OrderMessageLike = {
  type?: string;
  orderStatus?: string;
  orderId?: string | null;
  purchaseId?: string | null;
  listingId?: string | null;
  createdAt?: unknown;
};

type PurchaseLike = {
  id?: string;
  status?: string;
  orderId?: string;
  listingId?: string;
} | null | undefined;

function messageTimestamp(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const raw = value as { toMillis?: () => number; seconds?: number };
  if (typeof raw.toMillis === "function") return raw.toMillis();
  if (typeof raw.seconds === "number") return raw.seconds * 1000;
  return 0;
}

export function orderMessageKey(msg: OrderMessageLike): string | null {
  if (msg.type !== "order") return null;
  return String(msg.orderId || msg.purchaseId || "").trim() || null;
}

/** Keep the newest order card per order/purchase id (Firestore returns newest-first). */
export function dedupeConversationOrderMessages<T extends OrderMessageLike>(
  messagesNewestFirst: T[]
): T[] {
  const seen = new Set<string>();
  return messagesNewestFirst.filter((msg) => {
    const key = orderMessageKey(msg);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function purchaseMatchesOrderMessage(
  purchase: PurchaseLike,
  msg: OrderMessageLike,
  chatListingId?: string | null
): boolean {
  if (!purchase) return false;
  if (purchase.id && msg.purchaseId && msg.purchaseId === purchase.id) return true;
  if (purchase.orderId && msg.orderId && msg.orderId === purchase.orderId) return true;
  if (
    chatListingId &&
    msg.listingId === chatListingId &&
    purchase.listingId === chatListingId
  ) {
    return true;
  }
  return false;
}

/** Live purchase status wins over stale message snapshot fields. */
export function resolveConversationOrderStatus(
  msg: OrderMessageLike,
  purchase: PurchaseLike,
  chatListingId?: string | null
): string {
  if (msg.type !== "order") return String(msg.orderStatus || "");
  if (
    purchase &&
    isRefundedStatus(purchase.status) &&
    purchaseMatchesOrderMessage(purchase, msg, chatListingId)
  ) {
    return "refunded";
  }
  return String(msg.orderStatus || "paid");
}

export function shouldHideSupersededPaidOrderCard(
  msg: OrderMessageLike,
  purchase: PurchaseLike,
  allMessagesNewestFirst: OrderMessageLike[],
  chatListingId?: string | null
): boolean {
  if (msg.type !== "order") return false;

  const effective = resolveConversationOrderStatus(msg, purchase, chatListingId);
  if (effective === "refunded" && msg.orderStatus === "paid") {
    return true;
  }

  const key = orderMessageKey(msg);
  if (!key || msg.orderStatus !== "paid") return false;

  const newerRefund = allMessagesNewestFirst.find((candidate) => {
    if (candidate.type !== "order") return false;
    if (orderMessageKey(candidate) !== key) return false;
    if (candidate.orderStatus !== "refunded") return false;
    return messageTimestamp(candidate.createdAt) > messageTimestamp(msg.createdAt);
  });

  return !!newerRefund;
}

export function pickConversationPurchase<T extends { id: string; data: () => Record<string, unknown> }>(
  docs: T[],
  userEmail: string,
  otherEmail: string
): { id: string; data: Record<string, unknown> } | null {
  const matches = docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter((row) => {
      const sellerEmail = String(row.data.sellerEmail || "");
      const buyerEmail = String(row.data.buyerEmail || "");
      return (
        (sellerEmail === userEmail && buyerEmail === otherEmail) ||
        (buyerEmail === userEmail && sellerEmail === otherEmail)
      );
    });

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const aTime = messageTimestamp(a.data.refundedAt || a.data.updatedAt || a.data.createdAt);
    const bTime = messageTimestamp(b.data.refundedAt || b.data.updatedAt || b.data.createdAt);
    return bTime - aTime;
  });

  return matches[0];
}
