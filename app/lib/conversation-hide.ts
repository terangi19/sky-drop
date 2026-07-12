/** Per-user inbox hide — shared between client and server. */

export type HiddenConversationRecord = {
  otherEmail: string;
  listingId: string | null;
  conversationId?: string | null;
  hiddenAtMs: number;
};

export function hiddenConversationDocId(
  otherEmail: string,
  listingId?: string | null
): string {
  const safeOther = otherEmail.trim().toLowerCase().replace(/[@.]/g, "_");
  const safeListing = (listingId || "general").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeOther}__${safeListing}`;
}

export function conversationKeyFromHide(
  otherEmail: string,
  listingId?: string | null
): string {
  return `${otherEmail}||${listingId || ""}`;
}

export function messageCreatedAtMs(createdAt: unknown): number {
  if (!createdAt || typeof createdAt !== "object") return 0;
  const ts = createdAt as { toMillis?: () => number; seconds?: number };
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

/** Show in inbox unless hidden and no new inbound message since hide. */
export function shouldShowConversationInInbox(
  conversationKey: string,
  hiddenMap: Map<string, HiddenConversationRecord>,
  latestMsg: { sender?: string; createdAt?: unknown },
  userEmail: string
): boolean {
  const hidden = hiddenMap.get(conversationKey);
  if (!hidden) return true;

  const msgTime = messageCreatedAtMs(latestMsg.createdAt);
  if (msgTime <= hidden.hiddenAtMs) return false;

  const sender = String(latestMsg.sender || "");
  if (sender && sender !== userEmail) return true;

  return false;
}

export function hiddenMapFromDocs(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>
): Map<string, HiddenConversationRecord> {
  const map = new Map<string, HiddenConversationRecord>();
  for (const doc of docs) {
    const data = doc.data();
    const otherEmail = String(data.otherEmail || "").trim();
    if (!otherEmail) continue;
    const listingId =
      typeof data.listingId === "string" && data.listingId ? data.listingId : null;
    const hiddenAt = data.hiddenAt as { toMillis?: () => number; seconds?: number } | undefined;
    const hiddenAtMs =
      hiddenAt?.toMillis?.() ||
      (hiddenAt?.seconds ? hiddenAt.seconds * 1000 : 0) ||
      Number(data.hiddenAtMs) ||
      0;
    const key = conversationKeyFromHide(otherEmail, listingId);
    map.set(key, {
      otherEmail,
      listingId,
      conversationId:
        typeof data.conversationId === "string" ? data.conversationId : null,
      hiddenAtMs,
    });
  }
  return map;
}
