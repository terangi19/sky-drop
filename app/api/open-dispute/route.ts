import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`open-dispute:${ip}`, 5, 60_000);
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
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const buyerEmail = decoded.email || "";
    if (!buyerEmail) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const body = await req.json();
    const purchaseId = typeof body.purchaseId === "string" ? body.purchaseId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!purchaseId || !reason || !description) {
      return NextResponse.json({ error: "purchaseId, reason, and description are required" }, { status: 400 });
    }

    const db = getAdminDb();
    const purchaseRef = db.collection("purchases").doc(purchaseId);
    const purchaseSnap = await purchaseRef.get();
    if (!purchaseSnap.exists) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    const purchase = purchaseSnap.data()!;
    if (String(purchase.buyerEmail || "") !== buyerEmail) {
      return NextResponse.json({ error: "Only the buyer can open a dispute" }, { status: 403 });
    }

    const existingDispute = String(purchase.disputeStatus || "");
    if (existingDispute && existingDispute !== "resolved_seller") {
      return NextResponse.json({ error: "A dispute is already open for this purchase" }, { status: 400 });
    }

    const disputeRef = await db.collection("disputes").add({
      purchaseId,
      listingId: purchase.listingId || "",
      listingTitle: purchase.listingTitle || "",
      listingPrice: purchase.listingPrice || purchase.total || "",
      buyerEmail,
      sellerEmail: purchase.sellerEmail || "",
      reason,
      description,
      status: "open",
      stripePaymentIntentId: purchase.stripePaymentIntentId || "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await purchaseRef.update({
      disputeStatus: "open",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, disputeId: disputeRef.id });
  } catch (e: unknown) {
    console.error("[open-dispute]", e);
    return NextResponse.json({ error: "Failed to open dispute" }, { status: 500 });
  }
}
