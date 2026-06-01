import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`save-profile:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const {
      username,
      displayName,
      bio,
      region,
      discord,
      instagram,
      tiktok,
      website,
      hideOnline,
      isPublic,
      showViews,
      allowFollowers,
      notifEmail,
      notifMessages,
      notifAlerts,
      notifWatchlist,
      notifOffers,
      notifPriceDrop,
      phone,
      phoneVerified,
    } = body;

    if (!username || typeof username !== "string" || !username.trim()) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const db = getServerDb(idToken);
    const profileRef = db.collection("profiles").doc(decodedToken.uid);

    // Read existing to preserve memberSince
    const existingSnap = await profileRef.get();
    const existingData = existingSnap.exists ? existingSnap.data() : {};

    await profileRef.update({
      username: username.trim(),
      displayName: displayName || "",
      bio: bio || "",
      region: region || "",
      discord: discord || "",
      instagram: instagram || "",
      tiktok: tiktok || "",
      website: website || "",
      hideOnline: !!hideOnline,
      isPublic: isPublic !== false,
      showViews: showViews !== false,
      allowFollowers: allowFollowers !== false,
      notifEmail: notifEmail !== false,
      notifMessages: notifMessages !== false,
      notifAlerts: notifAlerts !== false,
      notifWatchlist: notifWatchlist !== false,
      notifOffers: notifOffers !== false,
      notifPriceDrop: !!notifPriceDrop,
      phone: phone || "",
      phoneVerified: !!phoneVerified,
      email: decodedToken.email || "",
      memberSince: existingData?.memberSince || new Date(),
      lastActive: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("save-profile error:", e);
    return NextResponse.json({ error: e.message || "Failed to save profile" }, { status: 500 });
  }
}
