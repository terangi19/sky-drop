import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { requireAdminForCheckout } from "../../lib/checkout-server";
import {
  adminGetProfileByEmail,
  adminGetPublicHandle,
} from "../../lib/profile-display-admin";
import { requireVerifiedEmail } from "../../lib/require-verified";
import {
  REVIEW_COMMENT_MAX,
  reviewDocId,
  evaluateReviewEligibility,
} from "../../lib/order-reviews";
import { incrementProfileReviewAggregates } from "../../lib/review-aggregates";

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

    const reviewerId = decoded.uid || "";
    const reviewerEmail = decoded.email || "";
    if (!reviewerId || !reviewerEmail) {
      return NextResponse.json({ error: "Could not determine reviewer identity" }, { status: 400 });
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
    if (reviewText.length > REVIEW_COMMENT_MAX) {
      return NextResponse.json(
        { error: `Comment must be ${REVIEW_COMMENT_MAX} characters or fewer` },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const purchaseRef = db.collection("purchases").doc(purchaseId);
    const purchaseSnap = await purchaseRef.get();

    if (!purchaseSnap.exists) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    const purchase = purchaseSnap.data()!;
    const docId = reviewDocId(purchaseId, reviewerId);
    const reviewRef = db.collection("reviews").doc(docId);
    const existing = await reviewRef.get();

    const eligibility = evaluateReviewEligibility(purchase, reviewerEmail, {
      reviewDocExists: existing.exists,
    });
    if (!eligibility.ok) {
      return NextResponse.json({ error: eligibility.error }, { status: eligibility.status });
    }

    const { role, revieweeEmail } = eligibility;

    const [revieweeProfile] = await Promise.all([
      adminGetProfileByEmail(revieweeEmail),
    ]);

    const revieweeId = revieweeProfile?.uid || "";
    if (!revieweeId) {
      return NextResponse.json({ error: "Could not resolve reviewee profile" }, { status: 400 });
    }

    const reviewerUsername = await adminGetPublicHandle(reviewerEmail, role === "buyer" ? "Buyer" : "Seller");
    const revieweeUsername = await adminGetPublicHandle(
      revieweeEmail,
      role === "buyer" ? "Seller" : "Buyer"
    );

    const comment = reviewText;
    const orderId = String(purchase.orderId || "");
    const listingId = String(purchase.listingId || "");
    const listingTitle = String(purchase.listingTitle || "");
    const buyerEmail = String(purchase.buyerEmail || "");
    const sellerEmail = String(purchase.sellerEmail || "");

    await reviewRef.set({
      orderId,
      listingId,
      listingTitle,
      purchaseId,
      reviewerId,
      reviewerEmail,
      reviewerUsername,
      revieweeId,
      revieweeEmail,
      revieweeUsername,
      role,
      rating,
      comment,
      createdAt: FieldValue.serverTimestamp(),
      // Legacy fields for existing UI queries
      buyerEmail,
      sellerEmail,
      buyerName: role === "buyer" ? reviewerUsername : revieweeUsername,
      reviewText: comment,
    });

    const purchasePatch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (role === "buyer") {
      purchasePatch.buyerReviewed = true;
      purchasePatch.reviewed = true;
    } else {
      purchasePatch.sellerReviewed = true;
    }
    await purchaseRef.update(purchasePatch);

    await incrementProfileReviewAggregates(revieweeId, rating);

    return NextResponse.json({ success: true, reviewId: docId, role });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to submit review";
    console.error("[submit-review]", msg);
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
}
