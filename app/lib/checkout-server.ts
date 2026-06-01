import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized } from "./firebase-admin";

export function requireAdminForCheckout(): void {
  if (!isAdminInitialized()) {
    throw new Error(
      "CHECKOUT_SERVER_NOT_CONFIGURED: Set FIREBASE_SERVICE_ACCOUNT in Vercel (Production)."
    );
  }
}

export async function adminGetListing(
  collectionName: string,
  listingId: string
): Promise<Record<string, unknown> | null> {
  requireAdminForCheckout();
  const snap = await getAdminDb().collection(collectionName).doc(listingId).get();
  if (!snap.exists) return null;
  return snap.data() as Record<string, unknown>;
}

export async function adminGetSellerProfileByEmail(
  sellerEmail: string
): Promise<Record<string, unknown> | null> {
  requireAdminForCheckout();
  const snap = await getAdminDb()
    .collection("profiles")
    .where("email", "==", sellerEmail)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as Record<string, unknown>;
}

export async function adminReserveListing(
  collectionName: string,
  listingId: string,
  buyerUid: string
): Promise<void> {
  requireAdminForCheckout();
  try {
    await getAdminDb().collection(collectionName).doc(listingId).update({
      reservedAt: FieldValue.serverTimestamp(),
      reservedBy: buyerUid,
    });
  } catch (e) {
    console.warn("[checkout] reservation skipped:", e);
  }
}

export async function adminCreateCheckoutMessage(data: {
  text: string;
  sender: string;
  receiver: string;
  listingId: string;
}): Promise<string> {
  requireAdminForCheckout();
  const ref = await getAdminDb().collection("messages").add({
    type: "text",
    text: data.text,
    sender: data.sender,
    receiver: data.receiver,
    participants: [data.sender, data.receiver],
    listingId: data.listingId,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
