import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../../lib/stripe-server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { createPurchaseWithAdmin } from "../../../lib/purchase-service";
import { notifyAdmin, writeFailureRecord } from "../../../lib/admin-alerts";
import * as Sentry from "@sentry/nextjs";
import { logSecurityCritical } from "../../../lib/security-log";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });

  const buf = Buffer.from(await req.arrayBuffer());
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (sigErr: any) {
    await writeFailureRecord("webhookFailures", {
      eventType: "signature_verification_failed",
      stripeEventId: null,
      error: sigErr.message || "Invalid signature",
    });
    await logSecurityCritical("stripe_webhook_sig_failed", "Stripe webhook signature verification failed", {
      metadata: { error: sigErr.message },
    });
    await notifyAdmin({
      type: "webhook_failure",
      title: "Stripe Webhook Signature Verification Failed",
      message: sigErr.message || "Invalid signature",
      metadata: { stripeEventId: null },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventRef = getAdminDb().collection("webhookEvents").doc(event.id);

  try {

    const alreadyProcessed = await getAdminDb().runTransaction(async (tx) => {
      const snap = await tx.get(eventRef);
      if (snap.exists) return true;
      tx.set(eventRef, {
        eventId: event.id,
        type: event.type,
        status: "processing",
        createdAt: new Date(),
      });
      return false;
    });

    if (alreadyProcessed) {
      return NextResponse.json({ received: true });
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as any;
      const meta = pi.metadata || {};

      if (meta.type === "bump" && meta.listingId) {
        await getAdminDb().collection("listings").doc(meta.listingId).update({
          promotedUntil: new Date(Date.now() + 7 * 86400000),
          bumpedAt: new Date(),
        });
        await eventRef.update({ status: "completed", processedAt: new Date() });
        return NextResponse.json({ received: true });
      }

      if (meta.type === "sponsor" && meta.listingId && meta.sellerEmail) {
        const db = getAdminDb();
        const batch = db.batch();
        const sponsorRef = db.collection("sponsoredDrops").doc();
        batch.set(sponsorRef, {
          listingId: meta.listingId,
          listingTitle: meta.listingTitle || "",
          sellerEmail: meta.sellerEmail,
          status: "pending",
          paid: true,
          createdAt: new Date(),
        });
        for (let i = 0; i < 2; i++) {
          const tokenRef = db.collection("dropTokens").doc();
          batch.set(tokenRef, {
            ownerId: meta.sellerUid || "",
            ownerEmail: meta.sellerEmail,
            originDropId: "sponsor_reward",
            status: "available",
            createdAt: new Date(),
          });
        }
        batch.update(db.collection("listings").doc(meta.listingId), {
          promotedUntil: new Date(Date.now() + 3 * 86400000),
        });
        await batch.commit();
        await eventRef.update({ status: "completed", processedAt: new Date() });
        return NextResponse.json({ received: true });
      }

      if (meta.listingId && meta.buyerUid && meta.title) {
        const db = getAdminDb();

        const listingCollection = meta.collectionName || "listings";
        const listingDoc = await db.collection(listingCollection).doc(meta.listingId).get();
        if (!listingDoc.exists) {
          await eventRef.update({ status: "completed", processedAt: new Date() });
          return NextResponse.json({ received: true });
        }
        const listing = listingDoc.data()!;

        const buyerEmail = meta.buyerEmail || `${meta.buyerUid}@firebase.user`;
        const total = Number(pi.amount_received || 0) / 100;

        const listingType = listing.type || "physical";
        const deliveryMethod = listingType === "digital" ? "digital" : listingType === "service" ? "service" : listingType === "rental" ? "rental" : "shipping";

        // createPurchaseWithAdmin uses a Firestore transaction internally
        // and returns existing purchase data if already created
        await createPurchaseWithAdmin({
          listingId: meta.listingId,
          listingTitle: meta.title,
          listingPrice: listing.price || "",
          listingImage: (listing.images?.[0] || listing.imageUrl || listing.image || ""),
          sellerEmail: listing.sellerEmail || "",
          buyerEmail,
          buyerName: meta.buyerName || buyerEmail,
          deliveryMethod,
          processingFee: 1.00,
          total,
          type: listingType,
          stripePaymentIntentId: pi.id,
          collectionName: meta.collectionName || "listings",
          destinationCharge: true,
        });
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as any;
      const meta = pi.metadata || {};
      const db = getAdminDb();

      await writeFailureRecord("webhookFailures", {
        eventType: "payment_intent.payment_failed",
        stripeEventId: event.id,
        paymentIntentId: pi.id,
        error: pi.last_payment_error?.message || "Payment failed",
        metadata: meta,
      });

      await notifyAdmin({
        type: "payment_failed",
        title: "Payment Failed",
        message: `Payment intent ${pi.id} failed: ${pi.last_payment_error?.message || "Unknown error"}`,
        metadata: {
          paymentIntentId: pi.id,
          listingId: meta.listingId || "unknown",
          error: pi.last_payment_error?.message,
        },
      });

      if (meta.listingId && meta.buyerEmail) {
        const buyerEmail = meta.buyerEmail || `${meta.buyerUid}@firebase.user`;
        const purchaseId = `${meta.listingId}_${buyerEmail.replace(/[@.]/g, "_")}`;
        const purchaseRef = db.collection("purchases").doc(purchaseId);
        const purchaseDoc = await purchaseRef.get();
        if (purchaseDoc.exists) {
          await purchaseRef.update({
            status: "payment_failed",
            failedReason: pi.last_payment_error?.message || "Payment failed",
            failedAt: new Date(),
          });
        }
      }
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as any;
      const chargeId = dispute.charge as string;
      const db = getAdminDb();

      let paymentIntentId = "";
      let listingId = "";
      let buyerEmail = "";
      let sellerEmail = "";

      try {
        const charge = await stripe.charges.retrieve(chargeId, { expand: ["payment_intent"] });
        const pi = charge.payment_intent as any;
        paymentIntentId = pi?.id || "";
        listingId = pi?.metadata?.listingId || "";
        buyerEmail = pi?.metadata?.buyerEmail || "";
        sellerEmail = pi?.metadata?.sellerEmail || "";
      } catch {}

      await db.collection("disputes").doc(dispute.id).set({
        stripeDisputeId: dispute.id,
        chargeId,
        paymentIntentId,
        listingId,
        buyerEmail,
        sellerEmail,
        amount: dispute.amount / 100,
        reason: dispute.reason,
        status: dispute.status,
        createdAt: new Date(dispute.created * 1000),
        updatedAt: new Date(),
      });

      await notifyAdmin({
        type: "dispute_created",
        title: "Dispute Created",
        message: `Dispute ${dispute.id} — Reason: ${dispute.reason}, Amount: $${(dispute.amount / 100).toFixed(2)}`,
        metadata: {
          disputeId: dispute.id,
          chargeId,
          paymentIntentId,
          listingId,
          reason: dispute.reason,
          amount: dispute.amount / 100,
        },
      });

      if (paymentIntentId) {
        const purchases = await db.collection("purchases")
          .where("stripePaymentIntentId", "==", paymentIntentId)
          .limit(1)
          .get();
        if (!purchases.empty) {
          await purchases.docs[0].ref.update({
            disputeStatus: "disputed",
            disputedAt: new Date(),
            disputeId: dispute.id,
          });
        }
      }
    }

    if (event.type === "charge.dispute.closed") {
      const dispute = event.data.object as any;
      const db = getAdminDb();

      const disputeRef = db.collection("disputes").doc(dispute.id);
      const disputeDoc = await disputeRef.get();
      if (disputeDoc.exists) {
        await disputeRef.update({
          status: dispute.status,
          closedAt: new Date(),
        });
      } else {
        await disputeRef.set({
          stripeDisputeId: dispute.id,
          status: dispute.status,
          closedAt: new Date(),
        });
      }

      await notifyAdmin({
        type: "dispute_closed",
        title: "Dispute Closed",
        message: `Dispute ${dispute.id} closed with status: ${dispute.status}`,
        metadata: {
          disputeId: dispute.id,
          status: dispute.status,
        },
      });

      const purchases = await db.collection("purchases")
        .where("disputeId", "==", dispute.id)
        .limit(1)
        .get();
      if (!purchases.empty) {
        await purchases.docs[0].ref.update({
          disputeStatus: dispute.status === "won" ? "dispute_won" : dispute.status === "lost" ? "dispute_lost" : "dispute_closed",
          disputeClosedAt: new Date(),
        });
      }
    }

    await eventRef.update({ status: "completed", processedAt: new Date() });
    return NextResponse.json({ received: true });
  } catch (e: any) {
    try { await eventRef.delete(); } catch {}
    console.error("[stripe-webhook] Error:", e);
    Sentry.captureException(e, { tags: { type: "stripe-webhook" }, extra: { eventType: event?.type, eventId: event?.id } });

    await writeFailureRecord("webhookFailures", {
      eventType: event.type,
      stripeEventId: event.id,
      error: e.message || "Unknown webhook error",
    });

    await notifyAdmin({
      type: "webhook_failure",
      title: "Stripe Webhook Processing Failed",
      message: `Event ${event.id} (${event.type}) failed: ${e.message || "Unknown error"}`,
      metadata: {
        eventType: event.type,
        stripeEventId: event.id,
        error: e.message,
      },
    });

    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
