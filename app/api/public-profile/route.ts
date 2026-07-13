import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";

const PUBLIC_FIELDS = [
  "username", "photoURL", "bannerURL", "bio", "region",
  "memberSince", "createdAt", "followers", "following",
  "verified", "emailVerified", "phoneVerified", "kycStatus", "trustedSeller", "fastReply", "topTrader",
  "profileBadge", "profileViews", "salesCount",
  "averageRating", "reviewCount",
  "responseTime", "hideOnline",
  "email", // already public via listings
];

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    const normalized = slug.trim();
    const lower = normalized.toLowerCase();
    let uid = "";

    // Step 1: check usernames collection
    const unameSnap = await db.collection("usernames").doc(lower).get();
    if (unameSnap.exists && unameSnap.data()?.uid) {
      uid = String(unameSnap.data()!.uid);
    }

    // Step 2: if no uid found, search profiles by username
    if (!uid) {
      const candidates = [...new Set([normalized, lower, lower.charAt(0).toUpperCase() + lower.slice(1)])];
      for (const candidate of candidates) {
        const snap = await db.collection("profiles").where("username", "==", candidate).limit(1).get();
        if (!snap.empty) {
          uid = snap.docs[0].id;
          break;
        }
      }
    }

    // Step 3: try by email
    if (!uid) {
      const snap = await db.collection("profiles").where("email", "==", normalized).limit(1).get();
      if (!snap.empty) {
        uid = snap.docs[0].id;
      }
    }

    // Step 4: try by listing sellerEmail
    if (!uid) {
      const listingSnap = await db.collection("listings")
        .where("sellerUsername", "==", lower).limit(1).get();
      if (!listingSnap.empty) {
        const sellerEmail = listingSnap.docs[0]?.data()?.sellerEmail;
        if (sellerEmail) {
          const snap = await db.collection("profiles").where("email", "==", sellerEmail).limit(1).get();
          if (!snap.empty) {
            uid = snap.docs[0].id;
          }
        }
      }
    }

    if (!uid) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    const profileSnap = await db.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    const data = profileSnap.data()!;
    const profile: Record<string, unknown> = { uid };
    for (const field of PUBLIC_FIELDS) {
      if (data[field] !== undefined) profile[field] = data[field];
    }

    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
