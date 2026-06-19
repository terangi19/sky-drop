import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminApp, getAdminAuth, isAdminInitialized } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { blacklistPhone, recordUsedIp } from "../../../lib/ban-store";

export async function POST(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);

    const { uid } = await req.json();
    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ error: "uid is required" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();

    // 1. Get user profile
    const profileSnap = await db.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const profile = profileSnap.data()!;

    // 2. Get user auth record
    let userRecord;
    try {
      userRecord = await getAdminAuth().getUser(uid);
    } catch {
      return NextResponse.json({ error: "Auth user not found" }, { status: 404 });
    }

    // 3. Blacklist phone
    const phone = profile.phone || userRecord.phoneNumber || "";
    if (phone) {
      await blacklistPhone(phone);
    }

    const email = (profile.email || userRecord.email || "").toString();

    // 4. Delete all listings
    const listings = await db.collection("listings")
      .where("sellerId", "==", uid)
      .get();
    const batch = db.batch();
    for (const doc of listings.docs) {
      batch.delete(doc.ref);
    }
    // Delete trade posts too
    const tradePosts = await db.collection("tradePosts")
      .where("sellerEmail", "==", email)
      .get();
    for (const doc of tradePosts.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    // 5. Delete all reviews by this user
    const reviewsByUser = await db.collection("reviews")
      .where("reviewerEmail", "==", email)
      .get();
    const reviewBatch = db.batch();
    for (const doc of reviewsByUser.docs) {
      reviewBatch.delete(doc.ref);
    }
    await reviewBatch.commit();

    // 6. Hide reviews of this user (as seller)
    const reviewsOfUser = await db.collection("reviews")
      .where("sellerEmail", "==", email)
      .get();
    const hideBatch = db.batch();
    for (const doc of reviewsOfUser.docs) {
      hideBatch.update(doc.ref, { hidden: true });
    }
    await hideBatch.commit();

    // 7. Disconnect followers
    const followers = await db.collection("followers")
      .where("followingId", "==", uid)
      .get();
    const followerBatch = db.batch();
    for (const doc of followers.docs) {
      followerBatch.delete(doc.ref);
    }
    await followerBatch.commit();

    // 8. Record IP for cooldown
    const ip = String(profile.ip || "");
    if (ip) {
      await recordUsedIp(ip);
    }

    // 9. Update profile as banned
    await db.collection("profiles").doc(uid).update({
      restricted: true,
      bannedAt: new Date(),
      banReason: "admin_action",
      kycStatus: "banned_fake",
    });

    // 10. Delete KYC images from Storage
    const kycSubmissionSnap = await db.collection("kycSubmissions").doc(uid).get();
    if (kycSubmissionSnap.exists) {
      const kycData = kycSubmissionSnap.data()!;
      const kycImageUrls: string[] = [];
      if (kycData.idImageUrl) kycImageUrls.push(kycData.idImageUrl);
      if (kycData.selfieImageUrl) kycImageUrls.push(kycData.selfieImageUrl);
      for (const url of kycImageUrls) {
        if (url && url.includes("/o/")) {
          try {
            const decodedPath = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
            await fetch(url, { method: "DELETE" }).catch(() => {});
          } catch {}
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[ban-user] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to ban user" }, { status: 500 });
  }
}
