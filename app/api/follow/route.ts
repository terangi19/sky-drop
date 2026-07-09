import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`follow:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Please log in to follow sellers" }, { status: 401 });
    }

    let decoded: { uid: string; email?: string };
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const sellerUid = typeof body.sellerUid === "string" ? body.sellerUid.trim() : "";
    const action = body.action === "unfollow" ? "unfollow" : body.action === "follow" ? "follow" : null;

    if (!sellerUid) {
      return NextResponse.json({ error: "Missing seller" }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    if (sellerUid === decoded.uid) {
      return NextResponse.json({ error: "You cannot follow yourself" }, { status: 400 });
    }

    const db = getAdminDb();
    const profileRef = db.collection("profiles").doc(sellerUid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      return NextResponse.json({ error: "Seller not found" }, { status: 404 });
    }

    const profileData = profileSnap.data()!;
    if (profileData.allowFollowers === false) {
      return NextResponse.json({ error: "This seller is not accepting followers" }, { status: 403 });
    }

    const followerRef = db.collection("followers").doc(`${sellerUid}_${decoded.uid}`);
    const followerSnap = await followerRef.get();
    const isFollowing = followerSnap.exists;

    if (action === "follow") {
      if (isFollowing) {
        return NextResponse.json({
          following: true,
          followerCount: profileData.followers ?? 0,
        });
      }

      await db.runTransaction(async (transaction) => {
        transaction.set(followerRef, {
          sellerId: sellerUid,
          followerId: decoded.uid,
          sellerEmail: profileData.email ?? null,
          followerEmail: decoded.email ?? null,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(profileRef, { followers: FieldValue.increment(1) });
      });

      const updated = await profileRef.get();
      return NextResponse.json({
        following: true,
        followerCount: updated.data()?.followers ?? (profileData.followers ?? 0) + 1,
      });
    }

    if (!isFollowing) {
      return NextResponse.json({
        following: false,
        followerCount: profileData.followers ?? 0,
      });
    }

    await db.runTransaction(async (transaction) => {
      transaction.delete(followerRef);
      const currentFollowers = profileData.followers ?? 0;
      if (currentFollowers > 0) {
        transaction.update(profileRef, { followers: FieldValue.increment(-1) });
      }
    });

    const updated = await profileRef.get();
    const followerCount = updated.data()?.followers ?? 0;
    return NextResponse.json({
      following: false,
      followerCount: Math.max(0, followerCount),
    });
  } catch {
    return NextResponse.json({ error: "Failed to update follow status" }, { status: 500 });
  }
}
