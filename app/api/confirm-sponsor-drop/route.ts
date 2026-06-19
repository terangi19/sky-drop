import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { getStripe } from "../../lib/stripe-server";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";

export async function POST(req: NextRequest) {
  const ip = parseIpFromRequest(req.headers);
  const { allowed } = await rateLimit(`sponsor-confirm:${ip}`, 5, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const paymentIntentId =
      typeof body.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";
    if (!paymentIntentId) {
      return NextResponse.json({ error: "Missing paymentIntentId" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    const meta = pi.metadata || {};
    if (meta.type !== "sponsor" || !meta.listingId || !meta.sellerEmail) {
      return NextResponse.json({ error: "Invalid payment" }, { status: 400 });
    }

    if (decoded.email !== meta.sellerEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getAdminDb();
    const existing = await db
      .collection("sponsoredDrops")
      .where("paymentIntentId", "==", paymentIntentId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ success: true, id: existing.docs[0].id });
    }

    const batch = db.batch();
    const sponsorRef = db.collection("sponsoredDrops").doc();
    batch.set(sponsorRef, {
      listingId: meta.listingId,
      listingTitle: meta.listingTitle || "",
      sellerEmail: meta.sellerEmail,
      sellerUid: meta.sellerUid || decoded.uid,
      targetPage: typeof body.targetPage === "string" ? body.targetPage : null,
      status: "pending",
      paid: true,
      paymentIntentId,
      createdAt: new Date(),
    });

    for (let i = 0; i < 2; i++) {
      const tokenRef = db.collection("dropTokens").doc();
      batch.set(tokenRef, {
        ownerId: meta.sellerUid || decoded.uid,
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

    return NextResponse.json({ success: true, id: sponsorRef.id });
  } catch (e: unknown) {
    console.error("[confirm-sponsor-drop]", e);
    return NextResponse.json({ error: "Failed to confirm sponsorship" }, { status: 500 });
  }
}
