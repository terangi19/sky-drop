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
            ? `Your auction for "${title}" has ended with a winning bid of $${bidAmount} from ${listing.highestBidder}.`
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

    // Handle unpaid wins — flag auctions where winner hasn't paid within 24 hours
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

      // Check if a purchase was actually made
      const purchaseSnap = await db.collection("purchases")
        .where("listingId", "==", doc.id)
        .where("status", "in", ["paid", "confirmed", "delivered"])
        .get();

      if (purchaseSnap.empty) {
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
            title: "Auction Winner Didn't Pay ⏰",
            message: `Your auction for "${listing.title || ""}" ended with a winning bid of $${listing.currentBid || 0} but the winner hasn't paid within 24 hours. The listing has been marked as unpaid. You can relist it.`,
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
