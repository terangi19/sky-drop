import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { purchaseCheckoutAction } from "./purchase-button-labels";

/** Always read paymentType from Firestore — feed cards and snapshots can be stale. */
export async function fetchListingPaymentType(
  listingId: string
): Promise<string | undefined> {
  try {
    const snap = await getDoc(doc(db, "listings", listingId));
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
