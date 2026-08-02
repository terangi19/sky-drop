"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupOldData = exports.autoCompleteDeliveredOrders = exports.onReportCreated = exports.onMessageCreated = exports.onListingCreated = exports.onListingUpdated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
(0, v2_1.setGlobalOptions)({ region: "asia-southeast1" });
admin.initializeApp();
const db = admin.firestore();
const RISKY_KEYWORDS = [
    "pay outside", "bank transfer only", "crypto", "gift card",
    "whatsapp", "telegram", "friends and family", "urgent payment",
    "wire transfer", "western union", "cashapp", "send money first",
    "pay before viewing", "dm privately", "off platform", "outside sky drop",
];
function containsRiskyContent(text) {
    const lower = text.toLowerCase();
    const keywords = RISKY_KEYWORDS.filter((kw) => lower.includes(kw));
    return { flagged: keywords.length > 0, keywords };
}
async function createNotification(input) {
    const doc = Object.assign(Object.assign({}, input), { read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection("notifications").add(doc);
}
exports.onListingUpdated = (0, firestore_1.onDocumentUpdated)("listings/{listingId}", async (event) => {
    var _a, _b, _c, _d, _e;
    const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
    const after = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
    const listingId = event.params.listingId;
    if (!before || !after)
        return;
    const oldPrice = Number(before.price) || 0;
    const newPrice = Number(after.price) || 0;
    if (newPrice > 0 && newPrice < oldPrice) {
        try {
            const watchers = await db.collection("watchlist").where("listingId", "==", listingId).get();
            for (const doc of watchers.docs) {
                const data = doc.data();
                const watcherEmail = data.userEmail;
                if (!watcherEmail || typeof watcherEmail !== "string")
                    continue;
                await createNotification({
                    targetEmail: watcherEmail,
                    fromEmail: after.sellerEmail || "",
                    type: "price_drop",
                    title: "Price dropped",
                    message: `"${String(after.title || "A listing")}" dropped from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}`,
                    listingId,
                    listingTitle: String(after.title || ""),
                    listingImage: String(((_e = after.images) === null || _e === void 0 ? void 0 : _e[0]) || after.imageUrl || ""),
                });
            }
        }
        catch (e) {
            console.error("[onListingUpdated] Price-drop notification failed:", e);
        }
    }
});
exports.onListingCreated = (0, firestore_1.onDocumentCreated)("listings/{listingId}", async (event) => {
    var _a, _b;
    const data = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    const listingId = event.params.listingId;
    if (!data)
        return;
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
            if (!userEmail || typeof userEmail !== "string")
                continue;
            if (searchCategory !== "all" && searchCategory !== category && searchCategory !== "")
                continue;
            if (query && !title.includes(query))
                continue;
            const minPrice = Number(search.minPrice) || 0;
            const maxPrice = Number(search.maxPrice) || Infinity;
            if (price > 0 && (price < minPrice || price > maxPrice))
                continue;
            await createNotification({
                targetEmail: userEmail,
                fromEmail: "system@skydrop.nz",
                type: "saved_search_match",
                title: "New match for your saved search",
                message: `A new listing "${String(data.title || "")}" matches your search "${search.query || search.category}"`,
                listingId,
                listingTitle: String(data.title || ""),
                listingImage: String(((_b = data.images) === null || _b === void 0 ? void 0 : _b[0]) || data.imageUrl || ""),
            });
        }
    }
    catch (e) {
        console.error("[onListingCreated] Saved-search notification failed:", e);
    }
});
exports.onMessageCreated = (0, firestore_1.onDocumentCreated)("messages/{messageId}", async (event) => {
    var _a;
    const data = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!data)
        return;
    const text = String(data.text || "");
    const { flagged, keywords } = containsRiskyContent(text);
    if (!flagged)
        return;
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
    }
    catch (e) {
        console.error("[onMessageCreated] Message flagging failed:", e);
    }
});
// Auto-hide listings when they receive multiple verified reports
exports.onReportCreated = (0, firestore_1.onDocumentCreated)("reports/{reportId}", async (event) => {
    var _a;
    const data = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!data || data.status !== "pending")
        return;
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
    }
    catch (e) {
        console.error("[onReportCreated] Auto-moderation failed:", e);
    }
});
// Auto-complete delivered orders 14 days after delivery if no dispute.
// Does NOT move Stripe funds — destination charges already paid the seller at checkout.
exports.autoCompleteDeliveredOrders = (0, scheduler_1.onSchedule)("every 24 hours", async () => {
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
            if (purchase.orderCompleted === true || purchase.fundsReleased === true)
                continue;
            const disputeStatus = purchase.disputeStatus;
            if (["open", "pending", "under_review"].includes(disputeStatus))
                continue;
            await doc.ref.update({
                orderCompleted: true,
                orderCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
                status: "completed",
                autoCompleted: true,
            });
            console.log("[autoCompleteDeliveredOrders] Completed order:", doc.id);
        }
    }
    catch (e) {
        console.error("[autoCompleteDeliveredOrders] Failed:", e);
    }
});
// Automatic cleanup of old notifications and logs (30 days)
exports.cleanupOldData = (0, scheduler_1.onSchedule)("every 24 hours", async () => {
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
    }
    catch (e) {
        console.error("[cleanupOldData] Failed:", e);
    }
});
//# sourceMappingURL=index.js.map