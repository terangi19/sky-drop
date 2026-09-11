import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

function watchlistVoteId(uid: string, listingId: string): string {
  return `${encodeURIComponent(uid)}:${encodeURIComponent(listingId)}`;
}

export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json();
    const listingId =
      typeof body?.listingId === "string" ? body.listingId.trim() : "";
    const delta = body?.delta === -1 ? -1 : body?.delta === 1 ? 1 : 0;

    if (!listingId || listingId.length > 128 || delta === 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json(
        { error: "Watchlist count unavailable" },
        { status: 503 }
      );
    }

    const rl = await rateLimit(
      `listing-watchlist-count:${decoded.uid}:${listingId}`,
      20,
      60_000
    );
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const db = getAdminDb();
    const listingRef = db.collection("listings").doc(listingId);
    const voteRef = db.collection("watchlistCountVotes").doc(
      watchlistVoteId(decoded.uid, listingId)
    );

    const result = await db.runTransaction(async (tx) => {
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists) {
        throw new Error("LISTING_NOT_FOUND");
      }
      const voteSnap = await tx.get(voteRef);
      const current = Math.max(0, Number(listingSnap.data()?.watchlistCount) || 0);

      if (delta === 1) {
        if (voteSnap.exists) {
          return { watchlistCount: current };
        }
        tx.set(voteRef, {
          uid: decoded.uid,
          listingId,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(listingRef, { watchlistCount: current + 1 });
        return { watchlistCount: current + 1 };
      }

      if (!voteSnap.exists) {
        return { watchlistCount: current };
      }
      tx.delete(voteRef);
      const after = Math.max(0, current - 1);
      tx.update(listingRef, { watchlistCount: after });
      return { watchlistCount: after };
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "LISTING_NOT_FOUND") {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    console.error("[listing-watchlist-count]", e);
    return NextResponse.json(
      { error: "Failed to update watchlist count" },
      { status: 500 }
    );
  }
}
