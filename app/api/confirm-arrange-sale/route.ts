import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { requireAdminForCheckout } from "../../lib/checkout-server";
import {
  assertListingAvailableForPurchase,
  buildListingUpdateAfterSale,
} from "../../lib/listing-stock";
import { adminGetPublicHandle } from "../../lib/profile-display-admin";
import { incrementProfileSalesCount } from "../../lib/seller-sales-admin";

const CONFIRMABLE_STATUSES = new Set(["arrange_requested", "pending"]);

export async function POST(req: NextRequest) {
  try {
    requireAdminForCheckout();

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`confirm-arrange-sale:${ip}`, 50, 60_000);
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

    const sellerEmail = decoded.email || "";
    if (!sellerEmail) {
      return NextResponse.json({ error: "Could not determine seller email" }, { status: 400 });
    }

    const { purchaseId } = await req.json();
    if (!purchaseId || typeof purchaseId !== "string") {
      return NextResponse.json({ error: "Missing purchaseId" }, { status: 400 });
    }

    const db = getAdminDb();
    const purchaseRef = db.collection("purchases").doc(purchaseId);
    let alreadyConfirmed = false;

    await db.runTransaction(async (tx) => {
      const purchaseSnap = await tx.get(purchaseRef);
      if (!purchaseSnap.exists) throw new Error("Purchase not found");

      const purchase = purchaseSnap.data()!;
      if (String(purchase.sellerEmail || "") !== sellerEmail) {
        throw new Error("Only the seller can confirm this sale");
      }
      if (String(purchase.paymentType || "") !== "contact") {
        throw new Error("This is not an Arrange Purchase order");
      }

      const status = String(purchase.status || "");
      if (status === "seller_confirming" || status === "completed" || status === "delivered") {
        alreadyConfirmed = true;
        return;
      }
      if (!CONFIRMABLE_STATUSES.has(status)) {
        throw new Error("This purchase cannot be confirmed");
      }

      const listingId = String(purchase.listingId || "");
      const collectionName = String(purchase.collectionName || "listings");
      const buyerEmail = String(purchase.buyerEmail || "");
      const convId = String(purchase.conversationId || "");

      const listingRef = db.collection(collectionName).doc(listingId);
      const convRef = convId ? db.collection("conversations").doc(convId) : null;

      const listingSnap = await tx.get(listingRef);
      const convSnap = convRef ? await tx.get(convRef) : null;

      if (!listingSnap.exists) throw new Error("Listing not found");
      const listing = listingSnap.data()! as Record<string, unknown>;

      assertListingAvailableForPurchase(listing);

      const listingUpdate = buildListingUpdateAfterSale(listing, {
        soldTo: buyerEmail,
        useServerTimestamp: true,
      });
      if (Object.keys(listingUpdate).length > 0) {
        tx.update(listingRef, listingUpdate);
      }

      tx.update(purchaseRef, {
        status: "seller_confirming",
        confirmedAt: FieldValue.serverTimestamp(),
      });

      if (convRef && convSnap?.exists) {
        tx.update(convRef, {
          orderStatus: "seller_confirming",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    if (alreadyConfirmed) {
      return NextResponse.json({ success: true, purchaseId, status: "seller_confirming", existing: true });
    }

    await incrementProfileSalesCount(sellerEmail);

    const purchaseSnap = await purchaseRef.get();
    const purchase = purchaseSnap.data()!;
    const buyerHandle = await adminGetPublicHandle(String(purchase.buyerEmail || ""));
    const title = String(purchase.listingTitle || "Item");
    const buyerEmail = String(purchase.buyerEmail || "");
    const convId = String(purchase.conversationId || "");

    const sellerNote = `✅ You marked "${title}" as sold to ${buyerHandle}.`;
    const buyerNote = `✅ The seller confirmed your purchase of "${title}".`;

    const batch = db.batch();
    const sellerMsg = db.collection("messages").doc();
    batch.set(sellerMsg, {
      type: "system",
      text: sellerNote,
      sender: "system",
      receiver: sellerEmail,
      participants: [buyerEmail, sellerEmail],
      conversationId: convId,
      listingId: purchase.listingId,
      listingTitle: title,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    const buyerMsg = db.collection("messages").doc();
    batch.set(buyerMsg, {
      type: "system",
      text: buyerNote,
      sender: "system",
      receiver: buyerEmail,
      participants: [buyerEmail, sellerEmail],
      conversationId: convId,
      listingId: purchase.listingId,
      listingTitle: title,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return NextResponse.json({ success: true, purchaseId, status: "seller_confirming" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to confirm sale";
    console.error("[confirm-arrange-sale]", msg);
    const status = msg.includes("not found") ? 404 : msg.includes("Only the seller") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
