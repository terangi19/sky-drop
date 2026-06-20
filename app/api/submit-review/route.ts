import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { requireAdminForCheckout } from "../../lib/checkout-server";
import { adminGetPublicName } from "../../lib/profile-display-admin";
import { requireVerifiedEmail } from "../../lib/require-verified";

export async function POST(req: NextRequest) {
  try {
    requireAdminForCheckout();

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`submit-review:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Invalid or expired token";
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const verified = requireVerifiedEmail(decoded, "submitting a review");
    if (verified.ok === false) {
      return NextResponse.json({ error: verified.error }, { status: 403 });
    }

    const buyerEmail = decoded.email || "";
    if (!buyerEmail) {
      return NextResponse.json({ error: "Could not determine buyer email" }, { status: 400 });
    }

    const body = await req.json();
    const purchaseId = typeof body.purchaseId === "string" ? body.purchaseId : "";
    const rating = Number(body.rating);
    const reviewText = typeof body.reviewText === "string" ? body.reviewText.trim() : "";

    if (!purchaseId) {
      return NextResponse.json({ error: "Missing purchaseId" }, { status: 400 });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
    }

    const db = getAdminDb();
    const purchaseRef = db.collection("purchases").doc(purchaseId);
    const purchaseSnap = await purchaseRef.get();

    if (!purchaseSnap.exists) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    const purchase = purchaseSnap.data()!;
    if (String(purchase.buyerEmail || "") !== buyerEmail) {
      return NextResponse.json({ error: "Only the buyer can review this order" }, { status: 403 });
    }

    const sellerEmail = String(purchase.sellerEmail || "");
    if (!sellerEmail || sellerEmail === buyerEmail) {
      return NextResponse.json({ error: "Invalid seller for this order" }, { status: 400 });
    }

    const status = String(purchase.status || "");
    if (!["delivered", "completed", "returned"].includes(status)) {
      return NextResponse.json(
        { error: "You can review after confirming receipt" },
        { status: 400 }
      );
    }

    const existing = await db
      .collection("reviews")
      .where("purchaseId", "==", purchaseId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ error: "You already reviewed this order" }, { status: 409 });
    }

    const buyerName = await adminGetPublicName(buyerEmail);
    const comment = reviewText || "";

    const reviewRef = await db.collection("reviews").add({
      purchaseId,
      reviewerEmail: buyerEmail,
      buyerEmail,
      sellerEmail,
      listingId: String(purchase.listingId || ""),
      listingTitle: String(purchase.listingTitle || ""),
      rating,
      reviewText: comment,
      comment,
      buyerName,
      createdAt: FieldValue.serverTimestamp(),
    });

    await purchaseRef.update({
      reviewed: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, reviewId: reviewRef.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to submit review";
    console.error("[submit-review]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
