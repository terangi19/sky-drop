import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";

setGlobalOptions({ region: "asia-southeast1" });

admin.initializeApp();
const db = admin.firestore();

const RISKY_KEYWORDS = [
  "pay outside", "bank transfer only", "crypto", "gift card",
  "whatsapp", "telegram", "friends and family", "urgent payment",
  "wire transfer", "western union", "cashapp", "send money first",
  "pay before viewing", "dm privately", "off platform", "outside sky drop",
];

function containsRiskyContent(text: string): { flagged: boolean; keywords: string[] } {
  const lower = text.toLowerCase();
  const keywords = RISKY_KEYWORDS.filter((kw) => lower.includes(kw));
  return { flagged: keywords.length > 0, keywords };
}

async function createNotification(input: {
  targetEmail: string;
  fromEmail?: string;
  type: string;
  title: string;
  message: string;
  listingId?: string;
  listingTitle?: string;
  listingImage?: string;
  total?: number;
}) {
  const doc = {
    ...input,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection("notifications").add(doc);
}

export const onListingUpdated = onDocumentUpdated("listings/{listingId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const listingId = event.params.listingId;
  if (!before || !after) return;

  const oldPrice = Number(before.price) || 0;
  const newPrice = Number(after.price) || 0;

  if (newPrice > 0 && newPrice < oldPrice) {
    try {
      const watchers = await db.collection("watchlist").where("listingId", "==", listingId).get();
      for (const doc of watchers.docs) {
        const data = doc.data();
        const watcherEmail = data.userEmail;
        if (!watcherEmail || typeof watcherEmail !== "string") continue;
        await createNotification({
          targetEmail: watcherEmail,
          fromEmail: after.sellerEmail || "",
          type: "price_drop",
          title: "Price dropped",
          message: `"${String(after.title || "A listing")}" dropped from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}`,
          listingId,
          listingTitle: String(after.title || ""),
          listingImage: String((after.images as string[])?.[0] || after.imageUrl || ""),
        });
      }
    } catch (e) {
      console.error("[onListingUpdated] Price-drop notification failed:", e);
    }
  }
});

export const onListingCreated = onDocumentCreated("listings/{listingId}", async (event) => {
  const data = event.data?.data();
  const listingId = event.params.listingId;
  if (!data) return;

  const title = String(data.title || "").toLowerCase();
  const category = String(data.category || "").toLowerCase();
  const price = Number(data.price) || 0;

  try {
    const savedSearches = await db.collection("savedSearches").get();
    for (const doc of savedSearches.docs) {
      const search = doc.data();
      const query = String(search.query || "").toLowerCase();
      const searchCategory = String(search.category || "").toLowerCase();
      const userEmail = search.userEmail;

      if (!userEmail || typeof userEmail !== "string") continue;
      if (searchCategory !== "all" && searchCategory !== category && searchCategory !== "") continue;
      if (query && !title.includes(query)) continue;

      const minPrice = Number(search.minPrice) || 0;
      const maxPrice = Number(search.maxPrice) || Infinity;
      if (price > 0 && (price < minPrice || price > maxPrice)) continue;

      await createNotification({
        targetEmail: userEmail,
        fromEmail: "system@skydrop.nz",
        type: "saved_search_match",
        title: "New match for your saved search",
        message: `A new listing "${String(data.title || "")}" matches your search "${search.query || search.category}"`,
        listingId,
        listingTitle: String(data.title || ""),
        listingImage: String((data.images as string[])?.[0] || data.imageUrl || ""),
      });
    }
  } catch (e) {
    console.error("[onListingCreated] Saved-search notification failed:", e);
  }
});

export const onMessageCreated = onDocumentCreated("messages/{messageId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const text = String(data.text || "");
  const { flagged, keywords } = containsRiskyContent(text);

  if (!flagged) return;

  try {
    const messageId = event.params.messageId;
    await db.collection("messageFlags").add({
      messageId,
      sender: data.sender,
      participants: data.participants,
      keywords,
      text: text.slice(0, 500),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending_review",
    });

    if (data.sender && typeof data.sender === "string") {
      await createNotification({
        targetEmail: data.sender,
        fromEmail: "system@skydrop.nz",
        type: "system",
        title: "Message flagged",
        message: "Your message may contain off-platform payment language. Keep all payments and communication inside Sky Drop for protection.",
      });
    }
  } catch (e) {
    console.error("[onMessageCreated] Message flagging failed:", e);
  }
});

// Auto-hide listings when they receive multiple verified reports
export const onReportCreated = onDocumentCreated("reports/{reportId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.status !== "pending") return;

  try {
    const listingId = data.listingId;
    const reportedUserId = data.reportedUserId;

    if (listingId && typeof listingId === "string") {
      const reportsSnap = await db
        .collection("reports")
        .where("listingId", "==", listingId)
        .where("status", "in", ["pending", "reviewed"])
        .get();
      if (reportsSnap.size >= 3) {
        await db.collection("listings").doc(listingId).update({
          status: "flagged",
          flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
          flagReason: "Multiple reports received",
        });
      }
    }

    if (reportedUserId && typeof reportedUserId === "string") {
      const userReportsSnap = await db
        .collection("reports")
        .where("reportedUserId", "==", reportedUserId)
        .where("status", "in", ["pending", "reviewed"])
        .get();
      if (userReportsSnap.size >= 5) {
        await db.collection("profiles").doc(reportedUserId).update({
          restricted: true,
          restrictedAt: admin.firestore.FieldValue.serverTimestamp(),
          restrictedReason: "Multiple reports received",
        });
      }
    }
  } catch (e) {
    console.error("[onReportCreated] Auto-moderation failed:", e);
  }
});

// Auto-complete delivered orders 14 days after delivery if no dispute.
// Does NOT move Stripe funds — destination charges already paid the seller at checkout.
export const autoCompleteDeliveredOrders = onSchedule("every 24 hours", async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000);
  try {
    const snapshot = await db
      .collection("purchases")
      .where("status", "==", "delivered")
      .where("deliveredAt", "<=", cutoff)
      .limit(200)
      .get();

    for (const doc of snapshot.docs) {
      const purchase = doc.data();
      if (purchase.orderCompleted === true || purchase.fundsReleased === true) continue;
      const disputeStatus = purchase.disputeStatus;
      if (["open", "pending", "under_review"].includes(disputeStatus)) continue;

      await doc.ref.update({
        orderCompleted: true,
        orderCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "completed",
        autoCompleted: true,
      });

      console.log("[autoCompleteDeliveredOrders] Completed order:", doc.id);
    }
  } catch (e) {
    console.error("[autoCompleteDeliveredOrders] Failed:", e);
  }
});

// Automatic cleanup of old notifications and logs (30 days)
export const cleanupOldData = onSchedule("every 24 hours", async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    // Clean up old notifications
    const notificationsSnap = await db
      .collection("notifications")
      .where("createdAt", "<", cutoff)
      .limit(1000)
      .get();
    
    const batch = db.batch();
    notificationsSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log("[cleanupOldData] Deleted old notifications:", notificationsSnap.size);

    // Clean up old security events
    const securitySnap = await db
      .collection("securityEvents")
      .where("timestamp", "<", cutoff)
      .limit(1000)
      .get();
    
    const batch2 = db.batch();
    securitySnap.docs.forEach(doc => batch2.delete(doc.ref));
    await batch2.commit();
    console.log("[cleanupOldData] Deleted old security events:", securitySnap.size);

    // Clean up old admin notifications
    const adminNotifSnap = await db
      .collection("adminNotifications")
      .where("createdAt", "<", cutoff)
      .limit(500)
      .get();
    
    const batch3 = db.batch();
    adminNotifSnap.docs.forEach(doc => batch3.delete(doc.ref));
    await batch3.commit();
    console.log("[cleanupOldData] Deleted old admin notifications:", adminNotifSnap.size);
  } catch (e) {
    console.error("[cleanupOldData] Failed:", e);
  }
});
