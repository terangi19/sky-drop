import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";

/** Bump stored salesCount on the seller profile (listing limits, legacy UI). */
export async function incrementProfileSalesCount(sellerEmail: string): Promise<void> {
  if (!sellerEmail) return;
  const db = getAdminDb();
  const snap = await db
    .collection("profiles")
    .where("email", "==", sellerEmail)
    .limit(1)
    .get();
  if (snap.empty) return;
  await snap.docs[0].ref.update({
    salesCount: FieldValue.increment(1),
  });
}
