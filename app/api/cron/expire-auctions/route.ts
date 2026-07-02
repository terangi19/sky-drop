import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";

export async function GET(req: NextRequest) {
  const expectedToken = process.env.CRON_SECRET;
  if (!expectedToken) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const now = new Date();

    // Find ended auctions that haven't been processed yet
    const endedAuctions = await db.collection("listings")
      .where("saleType", "in", ["auction", "auction_buy_now"])
      .where("auctionEndsAt", "<", now)
      .where("status", "not-in", ["ended", "sold", "expired", "unpaid"])
      .get();

    let endedCount = 0;
    const batch = db.batch();

    for (const doc of endedAuctions.docs) {
      const listing = doc.data();
      const listingId = doc.id;

      batch.update(doc.ref, { status: "ended", endedAt: now });

      const bidAmount = listing.currentBid || listing.startingBid || 0;
      const sellerEmail = listing.sellerEmail || "";
      const title = listing.title || "";

      // Create purchase record for auction winner
      if (listing.highestBidder) {
        const purchaseRef = db.collection("purchases").doc();
        batch.set(purchaseRef, {
          listingId,
          listingTitle: title,
          listingImage: listing.images?.[0] || "",
          listingPrice: String(bidAmount),
          sellerEmail,
          buyerEmail: listing.highestBidder,
          buyerName: listing.highestBidder,
          winningBid: bidAmount,
          status: "awaiting_payment",
          paymentDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          createdAt: now,
          type: listing.listingType || "physical",
          deliveryMethod: "pickup",
          collectionName: "listings",
        });

        // Create conversation between buyer and seller
        const conversationRef = db.collection("conversations").doc();
        const conversationId = conversationRef.id;
        batch.set(conversationRef, {
          participants: [sellerEmail, listing.highestBidder],
          listingId,
          listingTitle: title,
          createdAt: now,
          updatedAt: now,
          lastMessage: null,
          lastMessageAt: now,
          purchaseId: purchaseRef.id,
        });

        // Send initial message from system
        const messageRef = db.collection("messages").doc();
        batch.set(messageRef, {
          conversationId,
          sender: "system",
          content: `🎉 Congratulations! You won the auction for "${title}" with a bid of $${bidAmount}.\n\nContact the seller to arrange payment and collection using their preferred payment method.`,
          timestamp: now,
          read: false,
          type: "auction_won",
        });
      }

      // Notify the winner
      if (listing.highestBidder) {
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          type: "auction_won",
          targetEmail: listing.highestBidder,
          fromEmail: sellerEmail,
          title: "You Won the Auction! 🎉",
          message: `Congratulations! You won the auction for "${title}" with a bid of $${bidAmount}.\n\nComplete your purchase within 24 hours to secure the item.`,
          listingId,
          listingTitle: title,
          total: bidAmount,
          read: false,
          createdAt: now,
        });
      }

      // Notify the seller
      if (sellerEmail) {
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          type: "purchase",
          targetEmail: sellerEmail,
          fromEmail: listing.highestBidder || "",
          title: "Auction Ended — Winner Found! 🎉",
          message: listing.highestBidder
            ? `Your auction for "${title}" has ended with a winning bid of $${bidAmount} from ${listing.highestBidder}. Contact them to arrange payment.`
            : `Your auction for "${title}" has ended with no bids.`,
          listingId,
          listingTitle: title,
          total: bidAmount,
          read: false,
          createdAt: now,
        });
      }

      endedCount++;
    }

    if (endedCount > 0) {
      await batch.commit();
    }

    // Handle unpaid wins — flag auctions where winner hasn't completed purchase within 24 hours
    const unpaidDeadline = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const unpaidWins = await db.collection("listings")
      .where("saleType", "in", ["auction", "auction_buy_now"])
      .where("status", "==", "ended")
      .where("auctionEndsAt", "<", unpaidDeadline)
      .get();

    let unpaidCount = 0;
    const unpaidBatch = db.batch();

    for (const doc of unpaidWins.docs) {
      const listing = doc.data();

      // Check if a purchase was actually completed
      const purchaseSnap = await db.collection("purchases")
        .where("listingId", "==", doc.id)
        .where("status", "not-in", ["cancelled", "failed"])
        .get();

      let hasCompletedPurchase = false;
      for (const purchaseDoc of purchaseSnap.docs) {
        const purchase = purchaseDoc.data();
        if (purchase.status && purchase.status !== "awaiting_payment") {
          hasCompletedPurchase = true;
          break;
        }
      }

      if (!hasCompletedPurchase) {
        unpaidBatch.update(doc.ref, {
          status: "unpaid",
          unpaidAt: now,
        });

        const sellerEmail = listing.sellerEmail || "";
        if (sellerEmail) {
          const notifRef = db.collection("notifications").doc();
          unpaidBatch.set(notifRef, {
            type: "auction_unpaid",
            targetEmail: sellerEmail,
            fromEmail: "system",
            title: "Auction Winner Didn't Complete Purchase ⏰",
            message: `Your auction for "${listing.title || ""}" ended with a winning bid of $${listing.currentBid || 0} but the winner hasn't completed the purchase within 24 hours. You can relist the item or contact them directly.`,
            listingId: doc.id,
            listingTitle: listing.title || "",
            read: false,
            createdAt: now,
          });
        }

        unpaidCount++;
      }
    }

    if (unpaidCount > 0) {
      await unpaidBatch.commit();
    }

    return NextResponse.json({ ended: endedCount, unpaid: unpaidCount });
  } catch (e: any) {
    console.error("[cron-expire-auctions] Error:", e);
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
