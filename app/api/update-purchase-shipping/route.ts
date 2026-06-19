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
    const { allowed } = await rateLimit(`update-purchase-shipping:${ip}`, 20, 60_000);
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
    const shippingAddress =
      typeof body.shippingAddress === "string" ? body.shippingAddress.trim() : "";

    if (!purchaseId || !shippingAddress) {
      return NextResponse.json({ error: "purchaseId and shippingAddress are required" }, { status: 400 });
    }

    const db = getAdminDb();
    const purchaseRef = db.collection("purchases").doc(purchaseId);
    const purchaseSnap = await purchaseRef.get();
    if (!purchaseSnap.exists) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    const purchase = purchaseSnap.data()!;
    if (String(purchase.buyerEmail || "") !== buyerEmail) {
      return NextResponse.json({ error: "Only the buyer can update the shipping address" }, { status: 403 });
    }

    const status = String(purchase.status || "");
    if (["shipped", "delivered", "completed", "cancelled", "refunded"].includes(status)) {
      return NextResponse.json({ error: "Shipping address can no longer be changed for this order" }, { status: 400 });
    }

    await purchaseRef.update({
      shippingAddress,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[update-purchase-shipping]", e);
    return NextResponse.json({ error: "Failed to update shipping address" }, { status: 500 });
  }
}
