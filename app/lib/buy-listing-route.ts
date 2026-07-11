import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "./firebase";
import { purchaseCheckoutAction } from "./purchase-button-labels";

/** Server read — bypasses Firestore offline cache (stale paymentType after seller edits). */
export async function fetchListingPaymentType(
  listingId: string
): Promise<string | undefined> {
  try {
    const snap = await getDocFromServer(doc(db, "listings", listingId));
    if (snap.exists()) {
      const pt = snap.data()?.paymentType;
      return typeof pt === "string" ? pt : undefined;
    }
  } catch (e) {
    console.error("[fetchListingPaymentType]", e);
  }
  return undefined;
}

export function listingBuyHref(listingId: string): string {
  return `/post/listing/${listingId}?buy=1`;
}

export async function resolvePurchaseCheckoutAction(
  listingId: string,
  fallbackPaymentType?: string | null
): Promise<"arrange" | "stripe"> {
  const fresh = await fetchListingPaymentType(listingId);
  return purchaseCheckoutAction(fresh ?? fallbackPaymentType);
}
