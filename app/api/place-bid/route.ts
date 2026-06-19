import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { FieldValue } from "firebase-admin/firestore";

const MIN_BID_INCREMENT = 1;

function getBidIncrement(currentBid: number): number {
  if (currentBid < 50) return 1;
  if (currentBid < 100) return 5;
  if (currentBid < 500) return 10;
  if (currentBid < 1000) return 25;
  if (currentBid < 5000) return 50;
  if (currentBid < 10000) return 100;
  if (currentBid < 50000) return 500;
  return 1000;
}

function getMinimumNextBid(currentBid: number): number {
  return Math.floor(currentBid) + getBidIncrement(currentBid);
}

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`place-bid:${ip}`, 10, 60_000);
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
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    const amountRaw = body.amount;
    const autoBid = body.autoBid === true;

    if (!listingId) {
      return NextResponse.json({ error: "Listing ID is required" }, { status: 400 });
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid bid amount" }, { status: 400 });
    }

    if (amount > 10000000) {
      return NextResponse.json({ error: "Bid amount exceeds maximum" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    const listingRef = db.collection("listings").doc(listingId);

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(listingRef);
      if (!snap.exists) {
        throw new Error("Listing not found");
      }

      const listing = snap.data();
      const currentBid = listing.currentBid || listing.startingBid || 0;
      const highestBidder = listing.highestBidder || "";
      const auctionEndsAt = listing.auctionEndsAt?.toMillis?.() || listing.auctionEndsAt;
      const reservePrice = listing.reservePrice || 0;
      const sellerEmail = listing.sellerEmail || "";

      if (decoded.email === sellerEmail) {
        throw new Error("Cannot bid on your own listing");
      }

      const isEnded = typeof auctionEndsAt === "number" && Date.now() > auctionEndsAt;
      if (isEnded) {
        throw new Error("Auction has ended");
      }

      if (listing.status === "sold" || listing.status === "draft" || listing.status === "deleted") {
        throw new Error("Listing is no longer available");
      }

      if (reservePrice > 0 && amount < reservePrice) {
        throw new Error(`Bid must meet the reserve price of $${reservePrice}`);
      }

      const changes: Record<string, unknown> = {};

      if (autoBid) {
        const currentMaxBid = listing.currentMaxBid || 0;
        const secondMaxBid = listing.secondMaxBid || 0;

        if (!highestBidder) {
          if (amount < (listing.startingBid || 0)) {
            throw new Error(`Bid must be at least $${listing.startingBid || 0}`);
          }
          changes.currentBid = listing.startingBid || 0;
          changes.currentMaxBid = amount;
          changes.secondMaxBid = 0;
          changes.highestBidder = decoded.email;
        } else if (highestBidder === decoded.email) {
          if (amount <= currentMaxBid) {
            throw new Error(`Your max bid is already $${currentMaxBid} or higher`);
          }
          changes.currentMaxBid = amount;
        } else {
          const minNext = getMinimumNextBid(currentBid);
          if (amount < minNext) {
            throw new Error(`Minimum bid is $${minNext}`);
          }
          if (amount > currentMaxBid) {
            const inc = getBidIncrement(currentBid);
            const newPrice = Math.min(amount, currentMaxBid + inc);
            changes.currentBid = newPrice;
            changes.currentMaxBid = amount;
            changes.secondMaxBid = Math.max(secondMaxBid, currentMaxBid);
            changes.highestBidder = decoded.email;
          } else if (amount > secondMaxBid) {
            const inc = getBidIncrement(currentBid);
            const newPrice = Math.min(currentMaxBid, amount + inc);
            if (newPrice <= currentBid) {
              throw new Error("Bid too low to change current price");
            }
            changes.currentBid = newPrice;
            changes.secondMaxBid = amount;
          } else {
            throw new Error(`Bid must be at least $${getMinimumNextBid(secondMaxBid)}`);
          }
        }
        changes.bidCount = (listing.bidCount || 0) + 1;
      } else {
        if (decoded.email === highestBidder) {
          throw new Error("You are already the highest bidder");
        }
        const minNext = getMinimumNextBid(currentBid);
        if (amount < minNext) {
          throw new Error(`Minimum bid is $${minNext}`);
        }
        changes.currentBid = amount;
        changes.highestBidder = decoded.email;
        changes.bidCount = (listing.bidCount || 0) + 1;
      }

      if (auctionEndsAt) {
        const msLeft = auctionEndsAt - Date.now();
        if (msLeft > 0 && msLeft < 300000) {
          const newEndMs = Date.now() + 300000;
          changes.auctionEndsAt = new Date(newEndMs);
          changes.auctionExtended = true;
        }
      }

      transaction.update(listingRef, changes);

      const bidHistoryRef = db.collection("bidHistory").doc();
      transaction.create(bidHistoryRef, {
        listingId,
        bidderEmail: decoded.email,
        sellerEmail,
        amount,
        autoBid,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        currentBid: changes.currentBid !== undefined ? changes.currentBid : currentBid,
        outbidUser: changes.highestBidder === decoded.email && highestBidder && highestBidder !== decoded.email ? highestBidder : null,
        newMaxBid: changes.currentMaxBid !== undefined ? changes.currentMaxBid : undefined,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to place bid";
    const knownErrors = [
      "Listing not found", "Listing is no longer available", "Auction has ended",
      "Cannot bid on your own listing", "You are already the highest bidder",
    ];
    const isKnownError = knownErrors.some((k) => message.startsWith(k) || message === k) ||
      message.startsWith("Minimum bid") || message.startsWith("Bid must meet") ||
      message.startsWith("Your max bid") || message.startsWith("Bid too low");
    if (isKnownError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[place-bid]", e);
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}
