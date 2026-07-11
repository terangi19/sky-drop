import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "./firebase";
import { purchaseCheckoutAction } from "./purchase-button-labels";

/** Authoritative paymentType — API first (Admin SDK), Firestore server read as fallback. */
export async function fetchListingPaymentType(
  listingId: string
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `/api/listing-checkout-mode?listingId=${encodeURIComponent(listingId)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = (await res.json()) as { paymentType?: string };
      if (data.paymentType === "stripe" || data.paymentType === "contact") {
        return data.paymentType;
      }
    }
  } catch (e) {
    console.error("[fetchListingPaymentType] api", e);
  }

  try {
    const snap = await getDocFromServer(doc(db, "listings", listingId));
    if (snap.exists()) {
      const pt = snap.data()?.paymentType;
      return typeof pt === "string" ? pt : undefined;
    }
  } catch (e) {
    console.error("[fetchListingPaymentType] firestore", e);
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
  if (fresh) return purchaseCheckoutAction(fresh);
  return purchaseCheckoutAction(fallbackPaymentType);
}
