import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {
  decideSalesCountChange,
  nextSalesCount,
  purchaseCountsAsSale,
  wasCounted,
  type PurchaseSaleFields,
} from "./sales-count";

export const SALES_COUNT_LEDGER = "salesCountLedger";

type Db = admin.firestore.Firestore;

async function resolveSellerProfileRef(
  db: Db,
  tx: admin.firestore.Transaction,
  sellerEmail: unknown
): Promise<admin.firestore.DocumentReference | null> {
  if (typeof sellerEmail !== "string" || !sellerEmail.trim()) return null;
  const snap = await tx.get(db.collection("profiles").where("email", "==", sellerEmail.trim()).limit(1));
  return snap.empty ? null : snap.docs[0].ref;
}

/**
 * Reconcile profiles.salesCount for one purchase inside a transaction. Reads the purchase's current
 * state (not the event payload) so out-of-order or repeated deliveries converge.
 */
export async function syncPurchaseSalesCount(
  db: Db,
  purchaseId: string,
  before: PurchaseSaleFields | null | undefined
): Promise<string> {
  const purchaseRef = db.collection("purchases").doc(purchaseId);
  const ledgerRef = db.collection(SALES_COUNT_LEDGER).doc(purchaseId);
  return db.runTransaction(async (tx) => {
    const [purchaseSnap, ledgerSnap] = await Promise.all([tx.get(purchaseRef), tx.get(ledgerRef)]);
    const purchase = purchaseSnap.exists ? (purchaseSnap.data() as PurchaseSaleFields) : null;
    const ledger = ledgerSnap.exists ? (ledgerSnap.data() as { counted: boolean; sellerProfileId?: string | null }) : null;
    const counted = wasCounted(ledger, before);
    const decision = decideSalesCountChange(counted, purchaseCountsAsSale(purchase));

    // Decrement the profile that was credited; increment the purchase's current seller.
    let profileRef: admin.firestore.DocumentReference | null = null;
    if (decision.kind === "decrement" && ledger?.sellerProfileId) {
      profileRef = db.collection("profiles").doc(ledger.sellerProfileId);
    } else if (decision.kind !== "none") {
      profileRef = await resolveSellerProfileRef(db, tx, purchase?.sellerEmail ?? before?.sellerEmail);
    }
    const profileSnap = profileRef ? await tx.get(profileRef) : null;

    if (decision.kind === "none") {
      if (!ledger) tx.set(ledgerRef, { counted, sellerProfileId: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return `none:${counted}`;
    }
    if (!profileRef || !profileSnap?.exists) {
      // No seller profile: record the decision without touching any count (never goes negative).
      tx.set(ledgerRef, { counted: false, sellerProfileId: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return `${decision.kind}:no-profile`;
    }
    tx.update(profileRef, { salesCount: nextSalesCount(profileSnap.get("salesCount"), decision) });
    tx.set(ledgerRef, {
      counted: decision.kind === "increment",
      sellerProfileId: decision.kind === "increment" ? profileRef.id : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return decision.kind;
  });
}

type PurchaseWrittenEvent = {
  params: { purchaseId: string };
  data?: {
    before?: { exists: boolean; data(): unknown };
    after?: { exists: boolean; data(): unknown };
  };
};

/** Handler body (exported for tests; `db` injected). */
export async function handlePurchaseWritten(db: Db, event: PurchaseWrittenEvent): Promise<string> {
  const before = event.data?.before?.exists ? (event.data.before.data() as PurchaseSaleFields) : null;
  const after = event.data?.after?.exists ? (event.data.after.data() as PurchaseSaleFields) : null;
  // Cheap skip: the sale/non-sale state and seller didn't change, so the count can't change.
  if (before && after && purchaseCountsAsSale(before) === purchaseCountsAsSale(after) && before.sellerEmail === after.sellerEmail) {
    return "skip";
  }
  try {
    return await syncPurchaseSalesCount(db, event.params.purchaseId, before);
  } catch (e) {
    console.error("[onPurchaseWrittenSalesCount] sync failed:", event.params.purchaseId, e);
    throw e; // idempotent: safe for Functions to retry
  }
}

/** Single writer of profiles.salesCount (every purchase create/update/delete). */
export const onPurchaseWrittenSalesCount = onDocumentWritten("purchases/{purchaseId}", (event) =>
  handlePurchaseWritten(admin.firestore(), event as unknown as PurchaseWrittenEvent).then(() => undefined)
);
