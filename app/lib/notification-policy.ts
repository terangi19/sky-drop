import type { Firestore } from "firebase-admin/firestore";
import { isAdminEmail } from "./admin-check";

const BLOCKED_TYPES = new Set(["system", "admin_broadcast", "mass_message"]);

export type NotificationPolicyInput = {
  senderEmail: string;
  targetEmail: string;
  fromEmail: string;
  type: string;
  listingId?: string | null;
  purchaseId?: string | null;
};

export async function assertNotificationAllowed(
  db: Firestore,
  input: NotificationPolicyInput
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sender = input.senderEmail.toLowerCase().trim();
  const target = input.targetEmail.toLowerCase().trim();
  const from = input.fromEmail.toLowerCase().trim();
  const type = input.type.trim().slice(0, 64);

  if (!sender || !target || !from || !type) {
    return { ok: false, reason: "Invalid notification payload" };
  }

  if (target === sender) {
    return { ok: false, reason: "Cannot notify yourself" };
  }

  if (BLOCKED_TYPES.has(type)) {
    return { ok: false, reason: "Notification type not allowed" };
  }

  if (isAdminEmail(sender)) {
    return { ok: true };
  }

  if (from !== sender) {
    return { ok: false, reason: "Forbidden" };
  }

  // Throttle outbid notifications: max 1 per hour per listing per user
  if (type === "outbid" && input.listingId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOutbidSnap = await db
      .collection("notifications")
      .where("type", "==", "outbid")
      .where("targetEmail", "==", target)
      .where("listingId", "==", input.listingId)
      .where("createdAt", ">=", oneHourAgo)
      .limit(1)
      .get();
    if (!recentOutbidSnap.empty) {
      return { ok: false, reason: "Outbid notification throttled (max 1 per hour per listing)" };
    }
  }

  const listingId =
    typeof input.listingId === "string" && input.listingId.trim()
      ? input.listingId.trim()
      : "";
  const purchaseId =
    typeof input.purchaseId === "string" && input.purchaseId.trim()
      ? input.purchaseId.trim()
      : "";

  if (purchaseId) {
    const purchaseSnap = await db.collection("purchases").doc(purchaseId).get();
    if (!purchaseSnap.exists) {
      return { ok: false, reason: "Purchase not found" };
    }
    const purchase = purchaseSnap.data()!;
    const buyer = String(purchase.buyerEmail || "").toLowerCase();
    const seller = String(purchase.sellerEmail || "").toLowerCase();
    const pair =
      (sender === buyer && target === seller) || (sender === seller && target === buyer);
    if (pair) return { ok: true };
    if (type === "dispute_opened" && sender === buyer && isAdminEmail(target)) {
      return { ok: true };
    }
    return { ok: false, reason: "Not a participant on this purchase" };
  }

  if (listingId) {
    const listingSnap = await db.collection("listings").doc(listingId).get();
    if (!listingSnap.exists) {
      return { ok: false, reason: "Listing not found" };
    }
    const seller = String(listingSnap.data()?.sellerEmail || "").toLowerCase();
    if (!seller) {
      return { ok: false, reason: "Listing has no seller" };
    }
    if (sender !== seller && target === seller) {
      return { ok: true };
    }
    if (sender === seller && target !== seller) {
      const purchaseSnap = await db
        .collection("purchases")
        .where("listingId", "==", listingId)
        .where("sellerEmail", "==", sender)
        .where("buyerEmail", "==", target)
        .limit(1)
        .get();
      if (!purchaseSnap.empty) return { ok: true };
    }
  }

  if (type === "message" || type === "offer" || type === "offer_received") {
    const convSnap = await db
      .collection("conversations")
      .where("participants", "array-contains", sender)
      .limit(25)
      .get();
    for (const doc of convSnap.docs) {
      const participants = (doc.data().participants as string[] | undefined) || [];
      const normalized = participants.map((p) => String(p).toLowerCase());
      if (normalized.includes(sender) && normalized.includes(target)) {
        return { ok: true };
      }
    }
  }

  if (type === "dispute_opened" && isAdminEmail(target)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "Provide a valid listingId or purchaseId for this notification",
  };
}
