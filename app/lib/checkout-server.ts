import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import {
  isReservationHeldByOtherBuyer,
  sanitizeCheckoutCollectionName,
} from "./payment-checkout";

const RESERVATION_MS = 15 * 60 * 1000;

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
  const snap = await getAdminDb()
    .collection(sanitizeCheckoutCollectionName(collectionName))
    .doc(listingId)
    .get();
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
  const safeCollection = sanitizeCheckoutCollectionName(collectionName);
  await getAdminDb().runTransaction(async (tx) => {
    const ref = getAdminDb().collection(safeCollection).doc(listingId);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error("LISTING_NOT_FOUND");
    }
    const listing = snap.data() as Record<string, unknown>;
    if (
      isReservationHeldByOtherBuyer(
        listing as { reservedAt?: { toMillis?: () => number } | string; reservedBy?: unknown },
        buyerUid,
        RESERVATION_MS
      )
    ) {
      throw new Error("LISTING_RESERVED");
    }
    tx.update(ref, {
      reservedAt: FieldValue.serverTimestamp(),
      reservedBy: buyerUid,
    });
  });
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
