import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { adminGetListing, requireAdminForCheckout } from "../../lib/checkout-server";
import {
  buildArrangePurchaseBuyerMessage,
  buildArrangePurchaseData,
  buildArrangePurchaseSellerMessage,
  buildArrangePaymentDetailsMessage,
  makePurchaseId,
  resolvePurchaseDocRef,
} from "../../lib/purchase-service";
import { listingTracksStock } from "../../lib/listing-stock";
import {
  adminGetProfileByEmail,
  adminGetPublicHandle,
  adminGetPublicName,
} from "../../lib/profile-display-admin";
import {
  hasArrangePaymentDetails,
  pickArrangePaymentDetails,
} from "../../lib/arrange-payment-details";
import {
  assertListingAvailableForPurchase,
  isListingAvailableForPurchase,
} from "../../lib/listing-stock";

function makeConversationId(listingId: string, buyerEmail: string): string {
  return `conv_${listingId}_${buyerEmail.replace(/[@.]/g, "_")}`;
}

export async function POST(req: NextRequest) {
  try {
    requireAdminForCheckout();

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`arrange-purchase:${ip}`, 15, 60_000);
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

    const buyerEmail = decoded.email || "";
    if (!buyerEmail) {
      return NextResponse.json({ error: "Could not determine buyer email" }, { status: 400 });
    }

    const { listingId, collectionName: colBody } = await req.json();
    const collectionName =
      typeof colBody === "string" && colBody ? colBody : "listings";
    if (!listingId) {
      return NextResponse.json({ error: "Missing listingId" }, { status: 400 });
    }

    const listing = await adminGetListing(collectionName, listingId);
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const paymentType = String(listing.paymentType || "stripe");
    if (paymentType !== "contact") {
      return NextResponse.json(
        {
          error:
            "This listing uses Stripe checkout. Use Buy Now instead of Arrange Purchase.",
        },
        { status: 400 }
      );
    }

    const sellerEmail = String(listing.sellerEmail || "");
    if (!sellerEmail) {
      return NextResponse.json({ error: "Listing has no seller" }, { status: 400 });
    }
    if (sellerEmail === buyerEmail) {
      return NextResponse.json({ error: "You cannot purchase your own listing" }, { status: 400 });
    }
    if (!isListingAvailableForPurchase(listing as Record<string, unknown>)) {
      return NextResponse.json(
        { error: "This listing is no longer available" },
        { status: 400 }
      );
    }

    const listingRecord = listing as Record<string, unknown>;
    if (listingRecord.onePerBuyer) {
      const { getAdminDb: getDbEarly } = await import("../../lib/firebase-admin");
      const priorSnap = await getDbEarly()
        .collection("purchases")
        .where("listingId", "==", listingId)
        .where("buyerEmail", "==", buyerEmail)
        .get();
      const hasPrior = priorSnap.docs.some((d) => {
        const s = String(d.data().status || "").toLowerCase();
        return s && s !== "cancelled" && s !== "failed";
      });
      if (hasPrior) {
        return NextResponse.json(
          { error: "You can only purchase this item once per buyer." },
          { status: 400 }
        );
      }
    }

    const { getAdminDb } = await import("../../lib/firebase-admin");
    const db = getAdminDb();
    const listingRef = db.collection(collectionName).doc(listingId);
    const convId = makeConversationId(listingId, buyerEmail);
    const convRef = db.collection("conversations").doc(convId);
    const title = String(listing.title || "Item");
    const price = String(listing.price || "0");
    const image =
      (Array.isArray(listing.images) ? listing.images[0] : "") ||
      String(listing.imageUrl || listing.image || "");
    const buyerName = await adminGetPublicName(buyerEmail);
    const buyerHandle = await adminGetPublicHandle(buyerEmail);
    const sellerProfile = await adminGetProfileByEmail(sellerEmail);
    const paymentDetails = pickArrangePaymentDetails(sellerProfile);
    const sellerHasPay = hasArrangePaymentDetails(paymentDetails);
    const sellerMessageText = buildArrangePurchaseSellerMessage(
      buyerHandle,
      title,
      sellerHasPay
    );
    const buyerMessageText = buildArrangePurchaseBuyerMessage(title);
    const paymentDetailsText = buildArrangePaymentDetailsMessage(title, price, paymentDetails);
    const convLastMessage = sellerHasPay
      ? `Payment details — "${title}"`
      : `Purchase request — "${title}"`;

    let conversationId = convId;
    let isExisting = false;
    let purchaseId = makePurchaseId(listingId, buyerEmail);

    const existingRequestSnap = await db
      .collection("purchases")
      .where("listingId", "==", listingId)
      .where("buyerEmail", "==", buyerEmail)
      .where("status", "==", "arrange_requested")
      .limit(1)
      .get();
    if (!existingRequestSnap.empty) {
      const existing = existingRequestSnap.docs[0];
      return NextResponse.json({
        success: true,
        conversationId: String(existing.data().conversationId || convId),
        sellerEmail,
        purchaseId: existing.id,
        existing: true,
      });
    }

    await db.runTransaction(async (tx) => {
      const listingSnap = await tx.get(listingRef);
      const convSnap = await tx.get(convRef);

      if (!listingSnap.exists) throw new Error("Listing not found");
      const data = listingSnap.data()! as Record<string, unknown>;

      const purchaseRef = resolvePurchaseDocRef(db, data, listingId, buyerEmail);
      purchaseId = purchaseRef.id;
      const purchaseSnap = await tx.get(purchaseRef);

      if (purchaseSnap.exists) {
        const existingStatus = String(purchaseSnap.data()?.status || "");
        if (
          existingStatus === "arrange_requested" ||
          (!listingTracksStock(data) &&
            existingStatus === "pending" &&
            String(purchaseSnap.data()?.paymentType || "") === "contact")
        ) {
          isExisting = true;
          conversationId = String(purchaseSnap.data()?.conversationId || convId);
          return;
        }
      }

      assertListingAvailableForPurchase(data);

      if (convSnap.exists) {
        tx.update(convRef, {
          updatedAt: FieldValue.serverTimestamp(),
          lastMessage: convLastMessage,
          orderStatus: "arranged",
        });
      } else {
        tx.set(convRef, {
          convKey: `listing_${listingId}`,
          participants: [buyerEmail, sellerEmail],
          buyerEmail,
          sellerEmail,
          listingId,
          listingTitle: title,
          listingPrice: price,
          listingImage: image,
          orderStatus: "arranged",
          paymentType: "contact",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastMessage: convLastMessage,
        });
      }

      const sellerMsgRef = db.collection("messages").doc();
      tx.set(sellerMsgRef, {
        type: "system",
        text: sellerMessageText,
        sender: "system",
        receiver: sellerEmail,
        participants: [buyerEmail, sellerEmail],
        conversationId: convId,
        listingId,
        listingTitle: title,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      const buyerMsgRef = db.collection("messages").doc();
      tx.set(buyerMsgRef, {
        type: "system",
        text: buyerMessageText,
        sender: "system",
        receiver: buyerEmail,
        participants: [buyerEmail, sellerEmail],
        conversationId: convId,
        listingId,
        listingTitle: title,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      const paymentMsgRef = db.collection("messages").doc();
      tx.set(paymentMsgRef, {
        type: "system",
        text: paymentDetailsText,
        sender: "system",
        receiver: buyerEmail,
        participants: [buyerEmail, sellerEmail],
        conversationId: convId,
        listingId,
        listingTitle: title,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        purchaseRef,
        buildArrangePurchaseData(
          listing as Record<string, unknown>,
          listingId,
          buyerEmail,
          convId,
          collectionName,
          buyerName
        )
      );
    });

    return NextResponse.json({
      success: true,
      conversationId,
      sellerEmail,
      purchaseId,
      existing: isExisting,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to arrange purchase";
    console.error("[arrange-purchase]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
