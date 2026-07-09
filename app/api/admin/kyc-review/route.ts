import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { writeAuditLog } from "../../../lib/admin-utils";
import { verifiedFlagAfterUpdate } from "../../../lib/seller-verified";
import { sendEmail as sendEmailTransport } from "../../../lib/email-transport";

type KycReviewAction = "approve" | "reject" | "revoke";

const VERIFIED_EMAIL_HTML = (name: string) => `
<div style="background:#0a0a0a;padding:40px 20px;font-family:sans-serif">
<div style="max-width:480px;margin:0 auto;background:#141414;border-radius:12px;border:1px solid #242424;padding:32px">
<div style="font-size:32px;margin-bottom:8px">🎉</div>
<h1 style="color:#ececec;font-size:20px;margin:0 0 4px">You're Now Verified on Sky Drop</h1>
<p style="color:#a0a0a0;font-size:14px;line-height:1.6;margin:16px 0">
Kia ora${name ? ` ${name}` : ""},<br><br>
Great news! Your account has been reviewed and verified by the Sky Drop team.<br><br>
Your verified badge is now visible on your profile and listings, helping buyers identify you as a trusted member of the community.<br><br>
Thank you for helping keep Sky Drop safe and trustworthy.
</p>
<a href="https://skydrop.co.nz/profile" style="display:inline-block;background:#0ea5e9;color:#000;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:10px">View your profile →</a>
</div>
<div style="text-align:center;padding:24px 20px;font-size:11px;color:#555;max-width:480px;margin:0 auto">
Ngā mihi,<br>The Sky Drop Team<br>
<a href="https://skydrop.co.nz" style="color:#0ea5e9;text-decoration:none">skydrop.co.nz</a>
</div>
</div>`;

const REJECTED_EMAIL_HTML = (name: string, reason: string) => `
<div style="background:#0a0a0a;padding:40px 20px;font-family:sans-serif">
<div style="max-width:480px;margin:0 auto;background:#141414;border-radius:12px;border:1px solid #242424;padding:32px">
<div style="font-size:32px;margin-bottom:8px">ℹ️</div>
<h1 style="color:#ececec;font-size:20px;margin:0 0 4px">Verification Update</h1>
<p style="color:#a0a0a0;font-size:14px;line-height:1.6;margin:16px 0">
Kia ora${name ? ` ${name}` : ""},<br><br>
Your identity verification was not approved at this time.<br><br>
Reason: ${reason}<br><br>
You can resubmit your verification from your profile page with corrected information.
</p>
<a href="https://skydrop.co.nz/profile" style="display:inline-block;background:#0ea5e9;color:#000;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:10px">View your profile →</a>
</div>
<div style="text-align:center;padding:24px 20px;font-size:11px;color:#555;max-width:480px;margin:0 auto">
Ngā mihi,<br>The Sky Drop Team<br>
<a href="https://skydrop.co.nz" style="color:#0ea5e9;text-decoration:none">skydrop.co.nz</a>
</div>
</div>`;

const KYC_APPROVED_PARTIAL_EMAIL_HTML = (name: string) => `
<div style="background:#0a0a0a;padding:40px 20px;font-family:sans-serif">
<div style="max-width:480px;margin:0 auto;background:#141414;border-radius:12px;border:1px solid #242424;padding:32px">
<div style="font-size:32px;margin-bottom:8px">✅</div>
<h1 style="color:#ececec;font-size:20px;margin:0 0 4px">ID Verification Approved</h1>
<p style="color:#a0a0a0;font-size:14px;line-height:1.6;margin:16px 0">
Kia ora${name ? ` ${name}` : ""},<br><br>
Your identity verification was approved.<br><br>
You can start listing items for sale. Optionally verify your phone to unlock your verified seller badge on listings and your public profile.
</p>
<a href="https://skydrop.co.nz/profile" style="display:inline-block;background:#0ea5e9;color:#000;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:10px">Complete verification →</a>
</div>
<div style="text-align:center;padding:24px 20px;font-size:11px;color:#555;max-width:480px;margin:0 auto">
Ngā mihi,<br>The Sky Drop Team<br>
<a href="https://skydrop.co.nz" style="color:#0ea5e9;text-decoration:none">skydrop.co.nz</a>
</div>
</div>`;

const REVOKED_EMAIL_HTML = (name: string) => `
<div style="background:#0a0a0a;padding:40px 20px;font-family:sans-serif">
<div style="max-width:480px;margin:0 auto;background:#141414;border-radius:12px;border:1px solid #242424;padding:32px">
<div style="font-size:32px;margin-bottom:8px">ℹ️</div>
<h1 style="color:#ececec;font-size:20px;margin:0 0 4px">Verification Update</h1>
<p style="color:#a0a0a0;font-size:14px;line-height:1.6;margin:16px 0">
Kia ora${name ? ` ${name}` : ""},<br><br>
Your Sky Drop account verification has been revoked. Your verified badge has been removed.<br><br>
If you believe this is an error, contact Sky Drop support.
</p>
</div>
<div style="text-align:center;padding:24px 20px;font-size:11px;color:#555;max-width:480px;margin:0 auto">
Ngā mihi,<br>The Sky Drop Team<br>
<a href="https://skydrop.co.nz" style="color:#0ea5e9;text-decoration:none">skydrop.co.nz</a>
</div>
</div>`;

function sendEmail(to: string, subject: string, html: string) {
  return sendEmailTransport({ to, subject, html }).catch((err: any) =>
    console.error("[kyc-review] Email send failed:", err)
  );
}

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

    if (!uid || !["approve", "reject", "revoke"].includes(action)) {
      return NextResponse.json({ error: "uid and action (approve|reject|revoke) required" }, { status: 400 });
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

    // Prevent duplicate: check if the status is already what we're setting
    if (profile) {
      if (action === "approve" && profile.kycStatus === "approved") {
        return NextResponse.json({ error: "User is already verified" }, { status: 409 });
      }
      if (action === "reject" && profile.kycStatus === "rejected") {
        return NextResponse.json({ error: "User is already rejected" }, { status: 409 });
      }
      if (action === "revoke" && profile.kycStatus !== "approved") {
        return NextResponse.json({ error: "User is not currently verified" }, { status: 409 });
      }
    }

    const email = profile?.email || "";
    const displayName = profile?.displayName || profile?.username || "";

    if (action === "approve") {
      const fullyVerified = verifiedFlagAfterUpdate(profile, {
        emailVerified: profile?.emailVerified === true,
        phoneVerified: profile?.phoneVerified === true,
        kycStatus: "approved",
      });

      await kycRef.set(
        { status: "approved", reviewedAt: now, reviewedBy: reviewer },
        { merge: true }
      );
      await profileRef.set(
        {
          kycStatus: "approved",
          verified: fullyVerified,
          kycReviewedAt: now,
          kycReviewedBy: reviewer,
        },
        { merge: true }
      );

      // In-app notification
      if (email) {
        await db.collection("notifications").add({
          type: "verification",
          targetEmail: email,
          fromEmail: admin.email!,
          title: "🎉 Your Sky Drop Account Has Been Verified",
          message: "Kia ora! Great news! Your account has been reviewed and verified by the Sky Drop team. Your verified badge is now visible on your profile and listings, helping buyers and sellers identify you as a trusted member of the community.",
          href: "/profile",
          read: false,
          createdAt: now,
        });
      }

      // Email
      if (email) {
        await sendEmail(
          email,
          fullyVerified ? "🎉 You're Now Verified on Sky Drop" : "ID Verification Approved — Sky Drop",
          fullyVerified
            ? VERIFIED_EMAIL_HTML(displayName)
            : KYC_APPROVED_PARTIAL_EMAIL_HTML(displayName)
        );
      }

      // Referral reward
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

      await writeAuditLog({
        action: "kyc_approve",
        actorEmail: admin.email!,
        actorUid: admin.uid,
        targetUserId: uid,
        metadata: { email },
      });

    } else if (action === "reject") {
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

      if (email) {
        await db.collection("notifications").add({
          type: "verification",
          targetEmail: email,
          fromEmail: admin.email!,
          title: "Verification Rejected",
          message: `Your identity verification was not approved. Reason: ${reason}`,
          href: "/profile",
          read: false,
          createdAt: now,
        });
      }

      if (email) {
        await sendEmail(
          email,
          "Verification Update — Sky Drop",
          REJECTED_EMAIL_HTML(displayName, reason)
        );
      }

      await writeAuditLog({
        action: "kyc_reject",
        actorEmail: admin.email!,
        actorUid: admin.uid,
        targetUserId: uid,
        metadata: { email, reason },
      });

    } else if (action === "revoke") {
      await kycRef.set(
        { status: "revoked", reviewedAt: now, reviewedBy: reviewer },
        { merge: true }
      );
      await profileRef.set(
        {
          kycStatus: "banned_fake",
          verified: false,
          kycReviewedAt: now,
          kycReviewedBy: reviewer,
        },
        { merge: true }
      );

      if (email) {
        await db.collection("notifications").add({
          type: "verification",
          targetEmail: email,
          fromEmail: admin.email!,
          title: "Verification Revoked",
          message: "Your Sky Drop account verification has been revoked. Your verified badge has been removed.",
          href: "/profile",
          read: false,
          createdAt: now,
        });
      }

      if (email) {
        await sendEmail(
          email,
          "Verification Update — Sky Drop",
          REVOKED_EMAIL_HTML(displayName)
        );
      }

      await writeAuditLog({
        action: "kyc_revoke",
        actorEmail: admin.email!,
        actorUid: admin.uid,
        targetUserId: uid,
        metadata: { email },
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/kyc-review]", e);
    return NextResponse.json({ error: "Review failed" }, { status: 500 });
  }
}
