import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "../../lib/firebase-admin";
import { applyRateLimit, authenticateRequest, isErrorResponse } from "../../lib/api-helpers";

export async function POST(req: NextRequest) {
  try {
    const limited = await applyRateLimit(req, "save-profile", 10);
    if (limited) return limited;

    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const body = await req.json();
    const {
      username,
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
      bankAccountName,
      bankAccountNumber,
      bankReference,
    } = body;

    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    if (!trimmedUsername) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const db = getServerDb(auth.idToken);
    const profileRef = db.collection("profiles").doc(auth.uid);
    const usernameKey = trimmedUsername.toLowerCase();

    const existingSnap = await profileRef.get();
    const existingData = existingSnap.exists ? existingSnap.data() : {};

    const usernameRef = db.collection("usernames").doc(usernameKey);
    const usernameSnap = await usernameRef.get();
    if (usernameSnap.exists) {
      const owner = usernameSnap.data()?.uid;
      if (owner && owner !== auth.uid) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
    }

    const profileData = {
      username: trimmedUsername,
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
      phone:
        (typeof phone === "string" && phone.trim()) ||
        existingData?.phone ||
        existingData?.phoneNumber ||
        "",
      phoneNumber:
        (typeof phone === "string" && phone.trim()) ||
        existingData?.phoneNumber ||
        existingData?.phone ||
        "",
      phoneVerified:
        existingData?.phoneVerified === true ||
        existingData?.verified === true ||
        phoneVerified === true,
      verified:
        existingData?.phoneVerified === true ||
        existingData?.verified === true ||
        phoneVerified === true,
      email: auth.email || "",
      emailVerified: !!auth.decoded.email_verified,
      bankAccountName:
        typeof bankAccountName === "string"
          ? bankAccountName.trim()
          : existingData?.bankAccountName || "",
      bankAccountNumber:
        typeof bankAccountNumber === "string"
          ? bankAccountNumber.trim()
          : existingData?.bankAccountNumber || "",
      bankReference:
        typeof bankReference === "string"
          ? bankReference.trim()
          : existingData?.bankReference || "",
      memberSince: existingData?.memberSince || new Date(),
      lastActive: new Date(),
    };

    await profileRef.set(profileData, { merge: true });

    try {
      await usernameRef.set({ uid: auth.uid }, { merge: true });
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
