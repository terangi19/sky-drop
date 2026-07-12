import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { listingStockCount } from "./listing-stock";

export interface StripeRefundSyncInput {
  paymentIntentId?: string;
  purchaseId?: string;
  refundId?: string;
  refundAmount: number;
  refundStatus?: string;
  refundedAt?: Date;
  fullyRefunded: boolean;
}

export interface StripeRefundSyncResult {
  updated: boolean;
  purchaseId?: string;
  skipped?: string;
}

type PurchaseRecord = FirebaseFirestore.DocumentData & {
  orderId?: string;
  conversationId?: string;
  listingId?: string;
  listingTitle?: string;
  listingPrice?: string | number;
  listingImage?: string;
  buyerEmail?: string;
  sellerEmail?: string;
  total?: number;
  status?: string;
  refundId?: string;
};

function purchaseDocIdFromPaymentIntent(stripePaymentIntentId: string): string {
  return `pi_${stripePaymentIntentId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export async function findPurchaseForStripeRefund(
  db: Firestore,
  paymentIntentId?: string,
  purchaseIdFromMeta?: string
): Promise<{ ref: DocumentReference; data: PurchaseRecord; id: string } | null> {
  if (purchaseIdFromMeta) {
    const doc = await db.collection("purchases").doc(purchaseIdFromMeta).get();
    if (doc.exists) {
      return { ref: doc.ref, data: doc.data() as PurchaseRecord, id: doc.id };
    }
  }

  if (!paymentIntentId) return null;

  const byField = await db
    .collection("purchases")
    .where("stripePaymentIntentId", "==", paymentIntentId)
    .limit(1)
    .get();
  if (!byField.empty) {
    const doc = byField.docs[0];
    return { ref: doc.ref, data: doc.data() as PurchaseRecord, id: doc.id };
  }

  const byDocId = await db
    .collection("purchases")
    .doc(purchaseDocIdFromPaymentIntent(paymentIntentId))
    .get();
  if (byDocId.exists) {
    return { ref: byDocId.ref, data: byDocId.data() as PurchaseRecord, id: byDocId.id };
  }

  return null;
}

export async function applyStripeRefundToPurchase(
  input: StripeRefundSyncInput,
  db: Firestore = getAdminDb()
): Promise<StripeRefundSyncResult> {
  const purchase = await findPurchaseForStripeRefund(
    db,
    input.paymentIntentId,
    input.purchaseId
  );

  if (!purchase) {
    return { updated: false, skipped: "purchase_not_found" };
  }

  const { data, ref, id: purchaseId } = purchase;

  if (
    input.refundId &&
    data.refundId === input.refundId &&
    data.status === "refunded" &&
    input.fullyRefunded
  ) {
    return { updated: false, purchaseId, skipped: "already_refunded" };
  }

  const now = input.refundedAt || new Date();
  const refundAmount = input.refundAmount;
  const purchasePatch: Record<string, unknown> = {
    refundStatus: input.refundStatus || "succeeded",
    refundAmount,
    refundId: input.refundId || data.refundId || null,
    refundedAt: now,
    updatedAt: now,
  };

  if (input.fullyRefunded) {
    purchasePatch.status = "refunded";
    purchasePatch.fundsReleased = false;
    purchasePatch.destinationCharge = false;
    if (data.disputeStatus) {
      purchasePatch.disputeStatus = "refunded";
      purchasePatch.disputeResolvedAt = now;
    }
  }

  await ref.update(purchasePatch);

  if (input.fullyRefunded && data.listingId) {
    await restoreListingAfterFullRefund(db, String(data.listingId), data);
  }

  const orderId = String(data.orderId || "");
  if (orderId) {
    const orderPatch: Record<string, unknown> = {
      updatedAt: now,
      refundAmount,
      refundId: input.refundId || null,
    };
    if (input.fullyRefunded) {
      orderPatch.status = "refunded";
    }
    await db.collection("orders").doc(orderId).set(orderPatch, { merge: true });
  }

  const conversationId = String(data.conversationId || "");
  const refundLabel = `$${refundAmount.toFixed(2)}`;
  const lastMessage = input.fullyRefunded
    ? `Payment refunded — ${refundLabel}`
    : `Partial refund issued — ${refundLabel}`;

  if (conversationId) {
    await db.collection("conversations").doc(conversationId).set(
      {
        updatedAt: now,
        lastMessage,
        ...(input.fullyRefunded ? { orderStatus: "refunded" } : {}),
      },
      { merge: true }
    );
  }

  if (input.fullyRefunded && data.buyerEmail && data.sellerEmail) {
    const messageBase = {
      type: "order",
      orderId: orderId || null,
      sender: "system",
      participants: [data.buyerEmail, data.sellerEmail],
      listingId: data.listingId || "",
      listingTitle: data.listingTitle || "",
      listingPrice: data.listingPrice || "",
      listingImage: data.listingImage || "",
      orderStatus: "refunded",
      purchaseId,
      text: `Payment refunded for "${data.listingTitle || "this item"}" — ${refundLabel}.`,
      read: false,
      createdAt: now,
    };

    await db.collection("messages").add({
      ...messageBase,
      receiver: data.buyerEmail,
    });
    await db.collection("messages").add({
      ...messageBase,
      receiver: data.sellerEmail,
    });
  }

  const openDisputes = await db
    .collection("disputes")
    .where("purchaseId", "==", purchaseId)
    .limit(5)
    .get();
  if (!openDisputes.empty) {
    const batch = db.batch();
    for (const disputeDoc of openDisputes.docs) {
      const disputeStatus = String(disputeDoc.data().status || "");
      if (["open", "under_review", "pending"].includes(disputeStatus)) {
        batch.update(disputeDoc.ref, {
          status: "refunded",
          updatedAt: now,
          closedAt: now,
          stripeRefundId: input.refundId || null,
        });
      }
    }
    await batch.commit();
  }

  return { updated: true, purchaseId };
}

async function restoreListingAfterFullRefund(
  db: Firestore,
  listingId: string,
  purchase: PurchaseRecord
): Promise<void> {
  const listingRef = db.collection("listings").doc(listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) return;

  const listing = listingSnap.data()!;
  const buyerEmail = String(purchase.buyerEmail || "");
  const stock = listingStockCount(listing);
  const update: Record<string, unknown> = {};

  if (stock !== null) {
    update.stockQuantity = stock + 1;
    update.status = "live";
    update.soldTo = FieldValue.delete();
    update.soldAt = FieldValue.delete();
  } else if (
    listing.status === "sold" &&
    (!listing.soldTo || !buyerEmail || listing.soldTo === buyerEmail)
  ) {
    update.status = "live";
    update.soldTo = FieldValue.delete();
    update.soldAt = FieldValue.delete();
  }

  if (Object.keys(update).length > 0) {
    update.updatedAt = new Date();
    await listingRef.update(update);
  }
}

export function isFullStripeRefund(
  amountRefundedCents: number,
  chargeAmountCents: number,
  chargeRefundedFlag?: boolean
): boolean {
  if (chargeRefundedFlag === true) return true;
  if (chargeAmountCents <= 0) return amountRefundedCents > 0;
  return amountRefundedCents >= chargeAmountCents;
}

export async function resolveStripeRefundContext(stripe: {
  charges: { retrieve: (id: string) => Promise<any> };
  paymentIntents: { retrieve: (id: string, params?: any) => Promise<any> };
}, input: {
  chargeId?: string;
  paymentIntentId?: string;
  refundAmountCents?: number;
}): Promise<{ paymentIntentId: string; fullyRefunded: boolean; refundAmountCents: number }> {
  let paymentIntentId = input.paymentIntentId || "";
  let fullyRefunded = false;
  let refundAmountCents = Number(input.refundAmountCents || 0);

  if (input.chargeId) {
    try {
      const charge = await stripe.charges.retrieve(input.chargeId);
      paymentIntentId =
        paymentIntentId ||
        (typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id || "");
      refundAmountCents = Number(charge.amount_refunded || refundAmountCents || 0);
      fullyRefunded = isFullStripeRefund(
        refundAmountCents,
        Number(charge.amount || 0),
        charge.refunded === true
      );
      return { paymentIntentId, fullyRefunded, refundAmountCents };
    } catch {}
  }

  if (paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const latestCharge = pi.latest_charge;
      if (latestCharge && typeof latestCharge === "object") {
        refundAmountCents = Number(latestCharge.amount_refunded || refundAmountCents || 0);
        fullyRefunded = isFullStripeRefund(
          refundAmountCents,
          Number(latestCharge.amount || pi.amount_received || pi.amount || 0),
          latestCharge.refunded === true
        );
        return { paymentIntentId, fullyRefunded, refundAmountCents };
      }

      const paidCents = Number(pi.amount_received || pi.amount || 0);
      if (paidCents > 0 && refundAmountCents > 0) {
        fullyRefunded = refundAmountCents >= paidCents;
      }
    } catch {}
  }

  return { paymentIntentId, fullyRefunded, refundAmountCents };
}
