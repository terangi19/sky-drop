import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { writeAuditLog } from "../../../lib/admin-utils";

type KycReviewAction = "approve" | "reject";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    const action = body.action as KycReviewAction;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!uid || (action !== "approve" && action !== "reject")) {
      return NextResponse.json({ error: "uid and action (approve|reject) required" }, { status: 400 });
    }
    if (action === "reject" && !reason) {
      return NextResponse.json({ error: "Rejection reason required" }, { status: 400 });
    }

    const db = getAdminDb();
    const profileRef = db.collection("profiles").doc(uid);
    const kycRef = db.collection("kycSubmissions").doc(uid);
    const profileSnap = await profileRef.get();
    const profile = profileSnap.data();
    const now = new Date();
    const reviewer = admin.email || "admin";

    if (action === "approve") {
      await kycRef.set(
        { status: "approved", reviewedAt: now, reviewedBy: reviewer },
        { merge: true }
      );
      await profileRef.set(
        { kycStatus: "approved", kycReviewedAt: now, kycReviewedBy: reviewer },
        { merge: true }
      );

      if (profile?.email) {
        await db.collection("notifications").add({
          type: "verification",
          targetEmail: profile.email,
          fromEmail: admin.email!,
          title: "ID Verified ✓",
          message: "Your identity verification has been approved. You can list items for sale on Sky Drop.",
          read: false,
          createdAt: now,
        });
      }

      const referredBy = profile?.referredBy;
      if (referredBy && profile?.phoneVerified) {
        const referrerSnap = await db
          .collection("profiles")
          .where("referralCode", "==", referredBy)
          .limit(1)
          .get();
        if (!referrerSnap.empty) {
          const referrer = referrerSnap.docs[0];
          const referrerData = referrer.data();
          for (let i = 0; i < 3; i++) {
            await db.collection("dropTokens").add({
              ownerId: referrer.id,
              ownerEmail: referrerData.email || "",
              originDropId: "referral_reward",
              status: "available",
              createdAt: now,
            });
          }
          if (referrerData.email) {
            await db.collection("notifications").add({
              type: "referral_reward",
              targetEmail: referrerData.email,
              fromEmail: admin.email!,
              title: "🎁 Referral Reward Earned!",
              message: "Your referral completed verification — you earned 3 Drop Tokens!",
              read: false,
              createdAt: now,
            });
          }
        }
      }
    } else {
      await kycRef.set(
        { status: "rejected", rejectReason: reason, reviewedAt: now, reviewedBy: reviewer },
        { merge: true }
      );
      await profileRef.set(
        {
          kycStatus: "rejected",
          kycRejectReason: reason,
          kycReviewedAt: now,
          kycReviewedBy: reviewer,
        },
        { merge: true }
      );

      if (profile?.email) {
        await db.collection("notifications").add({
          type: "verification",
          targetEmail: profile.email,
          fromEmail: admin.email!,
          title: "ID Verification Rejected",
          message: `Your ID verification was rejected. Reason: ${reason}`,
          read: false,
          createdAt: now,
        });
      }
    }

    await writeAuditLog({
      action: action === "approve" ? "kyc_approve" : "kyc_reject",
      actorEmail: admin.email!,
      actorUid: admin.uid,
      targetUserId: uid,
      metadata: { email: profile?.email, reason: action === "reject" ? reason : undefined },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/kyc-review]", e);
    return NextResponse.json({ error: "Review failed" }, { status: 500 });
  }
}
