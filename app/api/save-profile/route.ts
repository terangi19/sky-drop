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

    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    if (!trimmedUsername) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const db = getServerDb(idToken);
    const profileRef = db.collection("profiles").doc(decodedToken.uid);
    const usernameKey = trimmedUsername.toLowerCase();

    const existingSnap = await profileRef.get();
    const existingData = existingSnap.exists ? existingSnap.data() : {};

    const usernameRef = db.collection("usernames").doc(usernameKey);
    const usernameSnap = await usernameRef.get();
    if (usernameSnap.exists) {
      const owner = usernameSnap.data()?.uid;
      if (owner && owner !== decodedToken.uid) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
    }

    const profileData = {
      username: trimmedUsername,
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
    };

    await profileRef.set(profileData, { merge: true });

    try {
      await usernameRef.set({ uid: decodedToken.uid }, { merge: true });
    } catch (usernameErr) {
      console.warn("save-profile: username reservation failed (profile still saved):", usernameErr);
    }

    return NextResponse.json({ success: true, username: trimmedUsername });
  } catch (e: unknown) {
    console.error("save-profile error:", e);
    const message = e instanceof Error ? e.message : "Failed to save profile";
    if (message.includes("NOT_FOUND") || message.includes("404")) {
      return NextResponse.json(
        { error: "Profile document missing — try saving again." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
