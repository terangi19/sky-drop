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
  } catch (sigErr: any) {
    await writeFailureRecord("webhookFailures", {
      eventType: "signature_verification_failed",
      stripeEventId: null,
      error: sigErr.message || "Invalid signature",
    });
    await notifyAdmin({
      type: "webhook_failure",
      title: "Stripe Webhook Signature Verification Failed",
      message: sigErr.message || "Invalid signature",
      metadata: { stripeEventId: null },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as any;
      const meta = pi.metadata || {};

      if (meta.type === "bump" && meta.listingId) {
        await getAdminDb().collection("listings").doc(meta.listingId).update({
          promotedUntil: new Date(Date.now() + 7 * 86400000),
          bumpedAt: new Date(),
        });
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
        return NextResponse.json({ received: true });
      }

      if (meta.listingId && meta.buyerUid && meta.title) {
        const db = getAdminDb();

        const existingByPi = await db.collection("purchases")
          .where("stripePaymentIntentId", "==", pi.id)
          .limit(1)
          .get();
        if (!existingByPi.empty) return NextResponse.json({ received: true });

        const listingDoc = await db.collection("listings").doc(meta.listingId).get();
        if (!listingDoc.exists) return NextResponse.json({ received: true });
        const listing = listingDoc.data()!;

        const buyerEmail = meta.buyerEmail || `${meta.buyerUid}@firebase.user`;

        const purchaseId = `${meta.listingId}_${buyerEmail.replace(/[@.]/g, "_")}`;
        const existingById = await db.collection("purchases").doc(purchaseId).get();
        if (existingById.exists) return NextResponse.json({ received: true });

        const total = Number(pi.amount_received || 0) / 100;

        await createPurchaseWithAdmin({
          listingId: meta.listingId,
          listingTitle: meta.title,
          listingPrice: listing.price || "",
          listingImage: (listing.images?.[0] || listing.imageUrl || listing.image || ""),
          sellerEmail: listing.sellerEmail || "",
          buyerEmail,
          buyerName: meta.buyerName || buyerEmail,
          deliveryMethod: "pending",
          processingFee: 1.00,
          total,
          type: listing.type || "physical",
          stripePaymentIntentId: pi.id,
          collectionName: "listings",
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
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
