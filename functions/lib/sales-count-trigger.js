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
exports.onPurchaseWrittenSalesCount = exports.SALES_COUNT_LEDGER = void 0;
exports.syncPurchaseSalesCount = syncPurchaseSalesCount;
exports.handlePurchaseWritten = handlePurchaseWritten;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const sales_count_1 = require("./sales-count");
exports.SALES_COUNT_LEDGER = "salesCountLedger";
async function resolveSellerProfileRef(db, tx, sellerEmail) {
    if (typeof sellerEmail !== "string" || !sellerEmail.trim())
        return null;
    const snap = await tx.get(db.collection("profiles").where("email", "==", sellerEmail.trim()).limit(1));
    return snap.empty ? null : snap.docs[0].ref;
}
/**
 * Reconcile profiles.salesCount for one purchase inside a transaction. Reads the purchase's current
 * state (not the event payload) so out-of-order or repeated deliveries converge.
 */
async function syncPurchaseSalesCount(db, purchaseId, before) {
    const purchaseRef = db.collection("purchases").doc(purchaseId);
    const ledgerRef = db.collection(exports.SALES_COUNT_LEDGER).doc(purchaseId);
    return db.runTransaction(async (tx) => {
        var _a;
        const [purchaseSnap, ledgerSnap] = await Promise.all([tx.get(purchaseRef), tx.get(ledgerRef)]);
        const purchase = purchaseSnap.exists ? purchaseSnap.data() : null;
        const ledger = ledgerSnap.exists ? ledgerSnap.data() : null;
        const counted = (0, sales_count_1.wasCounted)(ledger, before);
        const decision = (0, sales_count_1.decideSalesCountChange)(counted, (0, sales_count_1.purchaseCountsAsSale)(purchase));
        // Decrement the profile that was credited; increment the purchase's current seller.
        let profileRef = null;
        if (decision.kind === "decrement" && (ledger === null || ledger === void 0 ? void 0 : ledger.sellerProfileId)) {
            profileRef = db.collection("profiles").doc(ledger.sellerProfileId);
        }
        else if (decision.kind !== "none") {
            profileRef = await resolveSellerProfileRef(db, tx, (_a = purchase === null || purchase === void 0 ? void 0 : purchase.sellerEmail) !== null && _a !== void 0 ? _a : before === null || before === void 0 ? void 0 : before.sellerEmail);
        }
        const profileSnap = profileRef ? await tx.get(profileRef) : null;
        if (decision.kind === "none") {
            if (!ledger)
                tx.set(ledgerRef, { counted, sellerProfileId: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            return `none:${counted}`;
        }
        if (!profileRef || !(profileSnap === null || profileSnap === void 0 ? void 0 : profileSnap.exists)) {
            // No seller profile: record the decision without touching any count (never goes negative).
            tx.set(ledgerRef, { counted: false, sellerProfileId: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            return `${decision.kind}:no-profile`;
        }
        tx.update(profileRef, { salesCount: (0, sales_count_1.nextSalesCount)(profileSnap.get("salesCount"), decision) });
        tx.set(ledgerRef, {
            counted: decision.kind === "increment",
            sellerProfileId: decision.kind === "increment" ? profileRef.id : null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return decision.kind;
    });
}
/** Handler body (exported for tests; `db` injected). */
async function handlePurchaseWritten(db, event) {
    var _a, _b, _c, _d;
    const before = ((_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.exists) ? event.data.before.data() : null;
    const after = ((_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.exists) ? event.data.after.data() : null;
    // Cheap skip: the sale/non-sale state and seller didn't change, so the count can't change.
    if (before && after && (0, sales_count_1.purchaseCountsAsSale)(before) === (0, sales_count_1.purchaseCountsAsSale)(after) && before.sellerEmail === after.sellerEmail) {
        return "skip";
    }
    try {
        return await syncPurchaseSalesCount(db, event.params.purchaseId, before);
    }
    catch (e) {
        console.error("[onPurchaseWrittenSalesCount] sync failed:", event.params.purchaseId, e);
        throw e; // idempotent: safe for Functions to retry
    }
}
/** Single writer of profiles.salesCount (every purchase create/update/delete). */
exports.onPurchaseWrittenSalesCount = (0, firestore_1.onDocumentWritten)("purchases/{purchaseId}", (event) => handlePurchaseWritten(admin.firestore(), event).then(() => undefined));
//# sourceMappingURL=sales-count-trigger.js.map