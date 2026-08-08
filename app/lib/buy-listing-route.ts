import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "./firebase";
import { purchaseCheckoutAction } from "./purchase-button-labels";
import { logPurchaseFlow } from "./purchase-flow-debug";

const PAYMENT_TYPE_TTL_MS = 45_000;
const paymentTypeCache = new Map<
  string,
  { value: "stripe" | "contact" | undefined; at: number }
>();
const paymentTypeInflight = new Map<
  string,
  Promise<"stripe" | "contact" | undefined>
>();

async function fetchListingPaymentTypeUncached(
  listingId: string
): Promise<"stripe" | "contact" | undefined> {
  try {
    const res = await fetch(
      `/api/listing-checkout-mode?listingId=${encodeURIComponent(listingId)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = (await res.json()) as { paymentType?: string };
      if (data.paymentType === "stripe" || data.paymentType === "contact") {
        logPurchaseFlow("firestore-server-api", { listingId, source: "api", paymentType: data.paymentType });
        return data.paymentType;
      }
    } else {
      logPurchaseFlow("firestore-server-api", { listingId, source: "api", httpStatus: res.status, ok: false });
    }
  } catch (e) {
    console.error("[fetchListingPaymentType] api", e);
    logPurchaseFlow("firestore-server-api", { listingId, source: "api", error: String(e) });
  }

  try {
    const snap = await getDocFromServer(doc(db, "listings", listingId));
    if (snap.exists()) {
      const pt = snap.data()?.paymentType;
      const normalized = pt === "stripe" ? "stripe" : pt === "contact" ? "contact" : undefined;
      logPurchaseFlow("firestore-server-api", { listingId, source: "getDocFromServer", paymentType: normalized, raw: pt });
      return normalized;
    }
  } catch (e) {
    console.error("[fetchListingPaymentType] firestore", e);
    logPurchaseFlow("firestore-server-api", { listingId, source: "getDocFromServer", error: String(e) });
  }
  return undefined;
}

/** Authoritative paymentType — deduped + short TTL so detail open does not triple-fetch. */
export async function fetchListingPaymentType(
  listingId: string
): Promise<"stripe" | "contact" | undefined> {
  const cached = paymentTypeCache.get(listingId);
  if (cached && Date.now() - cached.at < PAYMENT_TYPE_TTL_MS) {
    return cached.value;
  }
  const inflight = paymentTypeInflight.get(listingId);
  if (inflight) return inflight;

  const request = fetchListingPaymentTypeUncached(listingId)
    .then((value) => {
      paymentTypeCache.set(listingId, { value, at: Date.now() });
      return value;
    })
    .finally(() => {
      paymentTypeInflight.delete(listingId);
    });
  paymentTypeInflight.set(listingId, request);
  return request;
}

export function listingBuyHref(listingId: string): string {
  return `/post/listing/${listingId}?buy=1`;
}

export async function resolvePurchaseCheckoutAction(
  listingId: string,
  fallbackPaymentType?: string | null
): Promise<"arrange" | "stripe" | "message"> {
  const { isStripeCheckoutVisibleClient } = await import("./stripe-checkout-flags");
  if (!isStripeCheckoutVisibleClient()) return "message";
  const fresh = await fetchListingPaymentType(listingId);
  const action = purchaseCheckoutAction(fresh ?? fallbackPaymentType);
  logPurchaseFlow("routing-decision", {
    listingId,
    serverPaymentType: fresh ?? null,
    fallbackPaymentType: fallbackPaymentType ?? null,
    action,
  });
  return action;
}

/** Server stripe always wins — arrange modal must never open when API says stripe. */
export function purchaseModalForPaymentType(
  paymentType: string | undefined | null
): "CheckoutModal" | "ArrangePurchaseModal" | "message" {
  const action = purchaseCheckoutAction(paymentType);
  if (action === "message") return "message";
  return action === "stripe" ? "CheckoutModal" : "ArrangePurchaseModal";
}
