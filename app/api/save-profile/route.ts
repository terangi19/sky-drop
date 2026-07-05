import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { requireCsrf } from "../../lib/csrf";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import { verifiedFlagAfterUpdate } from "../../lib/seller-verified";

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`save-profile:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

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
      notifOffersTrades,
      notifMessageRequests,
      notifListingActivity,
      notifListingReplies,
      notifReactions,
      notifMentions,
      notifDisputes,
      notifReports,
      notifAccountReview,
      notifPurchases,
      notifRefunds,
      notifSecurity,
      notifPlatform,
      notifIntensity,
      notifQuietHours,
      notifQuietHoursStart,
      notifQuietHoursEnd,
      notifDigest,
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
    const isAdmin = decodedToken.email && (await import("../../lib/admin-check")).isAdminEmail(decodedToken.email);
    if (trimmedUsername.includes(" ") && !isAdmin) {
      return NextResponse.json({ error: "Usernames cannot contain spaces." }, { status: 400 });
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

    const nextPhoneVerified =
      existingData?.phoneVerified === true || phoneVerified === true;
    const nextEmailVerified = !!decodedToken.email_verified;

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
      notifOffersTrades: notifOffersTrades !== false,
      notifMessageRequests: notifMessageRequests !== false,
      notifListingActivity: notifListingActivity !== false,
      notifListingReplies: notifListingReplies !== false,
      notifReactions: notifReactions !== false,
      notifMentions: !!notifMentions,
      notifDisputes: true,
      notifReports: true,
      notifAccountReview: true,
      notifPurchases: true,
      notifRefunds: true,
      notifSecurity: notifSecurity !== false,
      notifPlatform: notifPlatform !== false,
      notifIntensity: notifIntensity || "balanced",
      notifQuietHours: !!notifQuietHours,
      notifQuietHoursStart: notifQuietHoursStart || "22:00",
      notifQuietHoursEnd: notifQuietHoursEnd || "08:00",
      notifDigest: !!notifDigest,
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
      phoneVerified: nextPhoneVerified,
      verified: verifiedFlagAfterUpdate(existingData, {
        phoneVerified: nextPhoneVerified,
        emailVerified: nextEmailVerified,
      }),
      email: decodedToken.email || "",
      emailVerified: nextEmailVerified,
      memberSince: existingData?.memberSince || new Date(),
      lastActive: new Date(),
    };

    // Validate bank details before saving
    if (typeof bankAccountNumber === "string" && bankAccountNumber.trim()) {
      const trimmedAccountNumber = bankAccountNumber.trim();
      if (!/^[0-9- ]{8,20}$/.test(trimmedAccountNumber)) {
        return NextResponse.json(
          { error: "Invalid bank account number format. Must be 8-20 characters (numbers, hyphens, spaces only)." },
          { status: 400 }
        );
      }
    }

    if (typeof bankAccountName === "string" && bankAccountName.trim()) {
      const trimmedAccountName = bankAccountName.trim();
      if (trimmedAccountName.length < 2) {
        return NextResponse.json(
          { error: "Bank account name is too short (minimum 2 characters)." },
          { status: 400 }
        );
      }
    }

    if (typeof bankReference === "string" && bankReference.trim()) {
      const trimmedReference = bankReference.trim();
      if (trimmedReference.length > 50) {
        return NextResponse.json(
          { error: "Bank reference is too long (maximum 50 characters)." },
          { status: 400 }
        );
      }
    }

    const bankData: Record<string, string> = {};
    if (typeof bankAccountName === "string") bankData.bankAccountName = bankAccountName.trim();
    if (typeof bankAccountNumber === "string") bankData.bankAccountNumber = bankAccountNumber.trim();
    if (typeof bankReference === "string") bankData.bankReference = bankReference.trim();

    if (Object.keys(bankData).length > 0) {
      await db.collection("profiles").doc(decodedToken.uid).collection("bankDetails").doc("private").set(bankData, { merge: true });
    }

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
