import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

const OPEN_SALE_STATUSES = new Set([
  "arrange_requested",
  "pending",
  "seller_confirming",
  "shipped",
  "in_progress",
  "rented",
]);

/** Hide seller sales for a deleted listing; cancel in-progress orders. */
export async function detachPurchasesForDeletedListing(
  db: Firestore,
  listingId: string,
  sellerEmail: string
): Promise<number> {
  const snap = await db
    .collection("purchases")
    .where("listingId", "==", listingId)
    .where("sellerEmail", "==", sellerEmail)
    .get();

  if (snap.empty) return 0;

  const batch = db.batch();
  let count = 0;

  for (const doc of snap.docs) {
    const status = String(doc.data().status || "").toLowerCase();
    const update: Record<string, unknown> = {
      listingDeleted: true,
      listingDeletedAt: FieldValue.serverTimestamp(),
    };
    if (OPEN_SALE_STATUSES.has(status)) {
      update.status = "cancelled";
      update.cancelledReason = "listing_deleted";
    }
    batch.update(doc.ref, update);
    count += 1;
  }

  await batch.commit();
  return count;
}
