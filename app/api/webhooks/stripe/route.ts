import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../../lib/stripe-server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { createPurchaseWithAdmin } from "../../../lib/purchase-service";
import { notifyAdmin, writeFailureRecord } from "../../../lib/admin-alerts";
import * as Sentry from "@sentry/nextjs";

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
  } catch (sigErr: unknown) {
    await writeFailureRecord("webhookFailures", {
      eventType: "signature_verification_failed",
      stripeEventId: null,
      error: (sigErr instanceof Error ? sigErr.message : "Invalid signature"),
    });
    await notifyAdmin({
      type: "webhook_failure",
      title: "Stripe Webhook Signature Verification Failed",
      message: (sigErr instanceof Error ? sigErr.message : "Invalid signature"),
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
      const pi = event.data.object as Record<string, unknown>;
      const meta = (pi.metadata || {}) as Record<string, string>;

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
          stripePaymentIntentId: String(pi.id || ""),
          collectionName: meta.collectionName || "listings",
          destinationCharge: true,
        });
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Record<string, unknown>;
      const meta = ((pi.metadata || {}) as Record<string, string>);
      const db = getAdminDb();
      const lastError = pi.last_payment_error as Record<string, unknown> | undefined;

      await writeFailureRecord("webhookFailures", {
        eventType: "payment_intent.payment_failed",
        stripeEventId: event.id,
        paymentIntentId: String(pi.id || ""),
        error: String(lastError?.message || "Payment failed"),
        metadata: meta,
      });

      await notifyAdmin({
        type: "payment_failed",
        title: "Payment Failed",
        message: `Payment intent ${String(pi.id)} failed: ${String(lastError?.message || "Unknown error")}`,
        metadata: {
          paymentIntentId: String(pi.id || ""),
          listingId: meta.listingId || "unknown",
          error: String(lastError?.message || ""),
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
            failedReason: String(lastError?.message || "Payment failed"),
            failedAt: new Date(),
          });
        }
      }
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Record<string, unknown>;
      const chargeId = String(dispute.charge || "");
      const db = getAdminDb();

      let paymentIntentId = "";
      let listingId = "";
      let buyerEmail = "";
      let sellerEmail = "";

      try {
        const charge = await stripe.charges.retrieve(chargeId, { expand: ["payment_intent"] });
        const chargePi = charge.payment_intent as unknown as Record<string, unknown> | null;
        const chargeMeta = ((chargePi?.metadata || {}) as Record<string, string>);
        paymentIntentId = String(chargePi?.id || "");
        listingId = chargeMeta.listingId || "";
        buyerEmail = chargeMeta.buyerEmail || "";
        sellerEmail = chargeMeta.sellerEmail || "";
      } catch {}

      const dId = String(dispute.id || "");
      const dAmount = Number(dispute.amount || 0);
      const dReason = String(dispute.reason || "");
      const dStatus = String(dispute.status || "");

      await db.collection("disputes").doc(dId).set({
        stripeDisputeId: dId,
        chargeId,
        paymentIntentId,
        listingId,
        buyerEmail,
        sellerEmail,
        amount: dAmount / 100,
        reason: dReason,
        status: dStatus,
        createdAt: new Date(Number(dispute.created || 0) * 1000),
        updatedAt: new Date(),
      });

      await notifyAdmin({
        type: "dispute_created",
        title: "Dispute Created",
        message: `Dispute ${dId} — Reason: ${dReason}, Amount: $${(dAmount / 100).toFixed(2)}`,
        metadata: {
          disputeId: dId,
          chargeId,
          paymentIntentId,
          listingId,
          reason: dReason,
          amount: dAmount / 100,
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
            disputeId: dId,
          });
        }
      }
    }

    if (event.type === "charge.dispute.closed") {
      const dispute = event.data.object as Record<string, unknown>;
      const disputeId = String(dispute.id || "");
      const db = getAdminDb();

      const disputeRef = db.collection("disputes").doc(disputeId);
      const disputeDoc = await disputeRef.get();
      const dStatus = String(dispute.status || "");

      if (disputeDoc.exists) {
        await disputeRef.update({
          status: dStatus,
          closedAt: new Date(),
        });
      } else {
        await disputeRef.set({
          stripeDisputeId: disputeId,
          status: dStatus,
          closedAt: new Date(),
        });
      }

      await notifyAdmin({
        type: "dispute_closed",
        title: "Dispute Closed",
        message: `Dispute ${disputeId} closed with status: ${dStatus}`,
        metadata: {
          disputeId,
          status: dStatus,
        },
      });

      const purchases = await db.collection("purchases")
        .where("disputeId", "==", disputeId)
        .limit(1)
        .get();
      if (!purchases.empty) {
        await purchases.docs[0].ref.update({
          disputeStatus: dStatus === "won" ? "dispute_won" : dStatus === "lost" ? "dispute_lost" : "dispute_closed",
          disputeClosedAt: new Date(),
        });
      }
    }

    await eventRef.update({ status: "completed", processedAt: new Date() });
    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    try { await eventRef.delete(); } catch {}
    console.error("[stripe-webhook] Error:", e);
    Sentry.captureException(e, { tags: { type: "stripe-webhook" }, extra: { eventType: event?.type, eventId: event?.id } });

    await writeFailureRecord("webhookFailures", {
      eventType: event.type,
      stripeEventId: event.id,
      error: (e instanceof Error ? e.message : "Unknown webhook error"),
    });

    await notifyAdmin({
      type: "webhook_failure",
      title: "Stripe Webhook Processing Failed",
      message: `Event ${event.id} (${event.type}) failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      metadata: {
        eventType: event.type,
        stripeEventId: event.id,
        error: (e instanceof Error ? e.message : String(e)),
      },
    });

    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
