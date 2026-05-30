import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../../lib/stripe-server";
import { getAdminDb } from "../../../lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get("stripe-signature");
    if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });

    const buf = Buffer.from(await req.arrayBuffer());
    const stripe = getStripe();
    let event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

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
        const listingRef = db.collection("listings").doc(meta.listingId);
        batch.update(listingRef, {
          promotedUntil: new Date(Date.now() + 3 * 86400000),
        });
        await batch.commit();
        return NextResponse.json({ received: true });
      }

      if (meta.listingId && meta.buyerUid && meta.title) {
        const db = getAdminDb();
        const listingDoc = await db.collection("listings").doc(meta.listingId).get();
        if (!listingDoc.exists) return NextResponse.json({ received: true });
        const listing = listingDoc.data()!;

        // Idempotency: check by stripePaymentIntentId first
        const existingByPi = await db.collection("purchases")
          .where("stripePaymentIntentId", "==", pi.id)
          .limit(1)
          .get();
        if (!existingByPi.empty) return NextResponse.json({ received: true });

        // Use deterministic purchase ID if buyerEmail is available
        const buyerEmail = meta.buyerEmail || "";
        const purchaseId = buyerEmail
          ? `${meta.listingId}_${buyerEmail.replace(/[@.]/g, "_")}`
          : undefined;

        // Idempotency: check by deterministic ID
        if (purchaseId) {
          const existingByDoc = await db.collection("purchases").doc(purchaseId).get();
          if (existingByDoc.exists) return NextResponse.json({ received: true });
        }

        const total = Number(pi.amount_received || 0) / 100;
        const purchaseData: Record<string, unknown> = {
          listingId: meta.listingId,
          listingTitle: meta.title,
          listingPrice: listing.price || "",
          listingImage: (listing.images?.[0] || listing.imageUrl || listing.image || ""),
          sellerEmail: listing.sellerEmail || "",
          buyerEmail: buyerEmail,
          buyerName: meta.buyerName || buyerEmail || meta.buyerUid,
          deliveryMethod: "pending",
          total,
          processingFee: 1.00,
          status: "pending",
          paidAt: new Date(),
          stripePaymentIntentId: pi.id,
          createdAt: new Date(),
        };

        // Use batch for atomicity
        const batch = db.batch();
        if (purchaseId) {
          batch.set(db.collection("purchases").doc(purchaseId), purchaseData);
        } else {
          batch.set(db.collection("purchases").doc(), purchaseData);
        }
        batch.update(db.collection("listings").doc(meta.listingId), { status: "sold" });
        await batch.commit();

        const convKey = `listing_${meta.listingId}`;
        const existingConvs = await db.collection("conversations")
          .where("convKey", "==", convKey)
          .where("participants", "array-contains", buyerEmail || meta.buyerUid)
          .limit(1).get();

        if (existingConvs.empty) {
          const convRef = await db.collection("conversations").add({
            convKey,
            participants: [listing.sellerEmail, buyerEmail || meta.buyerUid],
            listingId: meta.listingId,
            listingTitle: meta.title,
            orderStatus: "paid",
            createdAt: new Date(),
          });
          const systemMsg = {
            text: `🛒 Order placed for "${meta.title}". Payment confirmed.`,
            sender: "system",
            participants: [listing.sellerEmail, buyerEmail || meta.buyerUid],
            type: "order",
            conversationId: convRef.id,
            createdAt: new Date(),
          };
          await db.collection("messages").add(systemMsg);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("[stripe-webhook] Error:", e);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
