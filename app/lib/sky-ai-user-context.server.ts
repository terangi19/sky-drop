import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import { canSellerConfirmArrangeSale } from "./arrange-purchase-status";
import { isFullyVerifiedSeller } from "./seller-verified";
import type { SkyAiUserContext, SkyAiUserTodo } from "./sky-ai-user-context";

const THREE_DAYS_MS = 3 * 86400000;

function buyerNeedsConfirm(p: { status?: string; deliveryMethod?: string }): boolean {
  const status = String(p.status || "");
  if (status === "shipped") return true;
  if (p.deliveryMethod === "pickup" && status === "seller_confirming") return true;
  if (p.deliveryMethod === "service" && status === "completed") return true;
  return false;
}

function sellerNeedsAction(p: {
  status?: string;
  paymentType?: string;
  disputeStatus?: string;
}): boolean {
  if (p.disputeStatus === "open" || p.disputeStatus === "under_review") return false;
  const status = String(p.status || "");
  if (canSellerConfirmArrangeSale(status, p.paymentType)) return true;
  if (["pending", "seller_confirming", "in_progress", "rented"].includes(status)) return true;
  return false;
}

function listingExpiringSoon(data: Record<string, unknown>): boolean {
  const status = String(data.status || "");
  if (status === "sold") return false;
  const stock = data.stockQuantity;
  if (stock != null && stock !== "" && Number(stock) <= 0) return false;
  const expiresAt = data.expiresAt as { toMillis?: () => number } | undefined;
  if (!expiresAt?.toMillis) return false;
  const ms = expiresAt.toMillis() - Date.now();
  return ms > 0 && ms < THREE_DAYS_MS;
}

export async function loadSkyAiUserContext(
  uid: string | null,
  email: string | null,
  authEmailVerified: boolean
): Promise<SkyAiUserContext | null> {
  if (!uid) return null;

  let emailVerified = authEmailVerified;
  let sellerVerified = false;
  let stripeConnected = false;
  let kycStatus = "none";
  let accountAgeDays = 0;
  const todos: SkyAiUserTodo[] = [];

  if (!isAdminInitialized()) {
    return { signedIn: true, emailVerified, sellerVerified, stripeConnected, kycStatus, accountAgeDays, todos };
  }

  const db = getAdminDb();

  try {
    const snap = await db.collection("profiles").doc(uid).get();
    const data = snap.data();
    if (data) {
      if (data.emailVerified) emailVerified = true;
      sellerVerified = isFullyVerifiedSeller(data);
      stripeConnected = !!data.stripeAccountId;
      kycStatus = String(data.kycStatus || "none");
      const memberSince = data.memberSince || data.createdAt;
      if (memberSince) {
        let ms = 0;
        if (typeof memberSince.toMillis === "function") ms = memberSince.toMillis();
        else if (memberSince.seconds) ms = memberSince.seconds * 1000;
        else if (memberSince instanceof Date) ms = memberSince.getTime();
        accountAgeDays = Math.floor((Date.now() - ms) / 86400000);
      }
    }
  } catch {
    /* profile optional */
  }

  if (!email) {
    return { signedIn: true, emailVerified, sellerVerified, stripeConnected, kycStatus, accountAgeDays, todos };
  }

  try {
    const [buyerSnap, sellerSnap, listingsSnap] = await Promise.all([
      db.collection("purchases").where("buyerEmail", "==", email).limit(40).get(),
      db.collection("purchases").where("sellerEmail", "==", email).limit(40).get(),
      db.collection("listings").where("sellerEmail", "==", email).limit(40).get(),
    ]);

    const buyerPurchases = buyerSnap.docs.map((d) => d.data());
    const sellerPurchases = sellerSnap.docs.map((d) => d.data());

    const buyerConfirmCount = buyerPurchases.filter(buyerNeedsConfirm).length;
    if (buyerConfirmCount > 0) {
      todos.push({
        kind: "buyer_confirm",
        count: buyerConfirmCount,
        summary: `${buyerConfirmCount} purchase${buyerConfirmCount > 1 ? "s" : ""} ready to confirm received`,
        path: "/purchases",
      });
    }

    const sellerActionCount = sellerPurchases.filter(sellerNeedsAction).length;
    if (sellerActionCount > 0) {
      todos.push({
        kind: "seller_orders",
        count: sellerActionCount,
        summary: `${sellerActionCount} sale${sellerActionCount > 1 ? "s" : ""} need seller action (confirm, ship, or complete)`,
        path: "/sales",
      });
    }

    const openDisputes = buyerPurchases.filter(
      (p) => p.disputeStatus === "open" || p.disputeStatus === "under_review"
    ).length;
    if (openDisputes > 0) {
      todos.push({
        kind: "dispute",
        count: openDisputes,
        summary: `${openDisputes} open dispute${openDisputes > 1 ? "s" : ""} on purchases`,
        path: "/purchases",
      });
    }

    const expiringCount = listingsSnap.docs.filter((d) => listingExpiringSoon(d.data())).length;
    if (expiringCount > 0) {
      todos.push({
        kind: "expiring_listings",
        count: expiringCount,
        summary: `${expiringCount} listing${expiringCount > 1 ? "s" : ""} expiring within 3 days`,
        path: "/list-list",
      });
    }

    if (!stripeConnected && sellerPurchases.some((p) => p.paymentType === "stripe")) {
      todos.push({
        kind: "stripe_connect",
        count: 1,
        summary: "Connect a payout account to receive Card Checkout sales",
        path: "/profile?tab=payouts",
      });
    }
  } catch {
    /* snapshot optional */
  }

  return { signedIn: true, emailVerified, sellerVerified, stripeConnected, kycStatus, accountAgeDays, todos };
}
