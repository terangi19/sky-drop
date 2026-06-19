import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth, isAdminInitialized } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { writeAuditLog } from "../../../lib/admin-utils";
import { blacklistPhone, recordUsedIp } from "../../../lib/ban-store";

const SERIOUS_ACTIONS = new Set(["restrict_user", "suspend_user", "delete_listing", "ban_user"]);

type ReportAction =
  | "mark_reviewed"
  | "dismiss"
  | "warn_user"
  | "restrict_user"
  | "suspend_user"
  | "delete_listing"
  | "ban_user"
  | "delete_report";

async function resolveTargetUid(report: FirebaseFirestore.DocumentData): Promise<string | null> {
  if (report.reportedUserId) return String(report.reportedUserId);
  const email = String(report.reportedUserEmail || "").toLowerCase();
  if (!email) return null;
  const snap = await getAdminDb().collection("profiles").where("email", "==", email).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function banUser(uid: string, adminEmail: string, adminUid: string, reportId: string) {
  if (!isAdminInitialized()) throw new Error("Server not configured");

  const db = getAdminDb();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  if (!profileSnap.exists) throw new Error("User not found");

  const profile = profileSnap.data()!;
  const userRecord = await getAdminAuth().getUser(uid);
  const phone = profile.phone || userRecord.phoneNumber || "";
  if (phone) await blacklistPhone(phone);

  const email = String(profile.email || userRecord.email || "");

  const listings = await db.collection("listings").where("sellerId", "==", uid).get();
  const batch = db.batch();
  listings.docs.forEach((doc) => batch.delete(doc.ref));

  const tradePosts = await db.collection("tradePosts").where("sellerEmail", "==", email).get();
  tradePosts.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  const reviewsByUser = await db.collection("reviews").where("reviewerEmail", "==", email).get();
  const reviewBatch = db.batch();
  reviewsByUser.docs.forEach((doc) => reviewBatch.delete(doc.ref));
  await reviewBatch.commit();

  const reviewsOfUser = await db.collection("reviews").where("sellerEmail", "==", email).get();
  const hideBatch = db.batch();
  reviewsOfUser.docs.forEach((doc) => hideBatch.update(doc.ref, { hidden: true }));
  await hideBatch.commit();

  const followers = await db.collection("followers").where("followingId", "==", uid).get();
  const followerBatch = db.batch();
  followers.docs.forEach((doc) => followerBatch.delete(doc.ref));
  await followerBatch.commit();

  const ip = String(profile.ip || "");
  if (ip) await recordUsedIp(ip);

  await db.collection("profiles").doc(uid).update({
    restricted: true,
    suspended: true,
    bannedAt: new Date(),
    banReason: "admin_report_action",
    kycStatus: "banned_fake",
  });

  await writeAuditLog({
    action: "ban_user",
    actorEmail: adminEmail,
    actorUid: adminUid,
    targetUserId: uid,
    metadata: { reportId, email },
  });
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action as ReportAction;
    const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";

    if (!reportId || !action) {
      return NextResponse.json({ error: "reportId and action required" }, { status: 400 });
    }

    const db = getAdminDb();
    const reportRef = db.collection("reports").doc(reportId);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    const report = reportSnap.data()!;
    const targetUid = await resolveTargetUid(report);
    const targetEmail = String(report.reportedUserEmail || "");

    switch (action) {
      case "mark_reviewed": {
        await reportRef.set({ status: "reviewed", reviewedAt: FieldValue.serverTimestamp() }, { merge: true });
        await writeAuditLog({
          action: "report_mark_reviewed",
          actorEmail: admin.email!,
          actorUid: admin.uid,
          targetUserId: targetUid || undefined,
          listingId: report.listingId || undefined,
          metadata: { reportId, reason: report.reason },
        });
        break;
      }
      case "dismiss": {
        await reportRef.set({ status: "dismissed", reviewedAt: FieldValue.serverTimestamp() }, { merge: true });
        await writeAuditLog({
          action: "report_dismissed",
          actorEmail: admin.email!,
          actorUid: admin.uid,
          targetUserId: targetUid || undefined,
          metadata: { reportId, reason: report.reason },
        });
        break;
      }
      case "warn_user": {
        if (!targetUid || !targetEmail) {
          return NextResponse.json({ error: "Could not resolve reported user" }, { status: 400 });
        }
        const warningMessage =
          typeof body.message === "string" && body.message.trim()
            ? body.message.trim()
            : `You received a warning from moderation regarding: ${report.reason || "a report"}. Please review our seller guidelines.`;

        await db.collection("profiles").doc(targetUid).set(
          {
            warningCount: FieldValue.increment(1),
            lastWarningAt: new Date(),
            lastWarningReason: report.reason || "moderation",
          },
          { merge: true }
        );

        await db.collection("notifications").add({
          targetEmail,
          fromEmail: "system@skydrop.nz",
          type: "moderation_warning",
          title: "Account warning",
          message: warningMessage,
          listingId: report.listingId || "",
          read: false,
          createdAt: new Date(),
        });

        await writeAuditLog({
          action: "warn_user",
          actorEmail: admin.email!,
          actorUid: admin.uid,
          targetUserId: targetUid,
          metadata: { reportId, reason: report.reason, message: warningMessage },
        });
        break;
      }
      case "restrict_user": {
        if (!targetUid) {
          return NextResponse.json({ error: "Could not resolve reported user" }, { status: 400 });
        }
        await db.collection("profiles").doc(targetUid).set(
          {
            restricted: true,
            restrictionReason: `Report: ${report.reason || "moderation review"}`,
            restrictedAt: new Date(),
          },
          { merge: true }
        );
        await writeAuditLog({
          action: "restrict_user",
          actorEmail: admin.email!,
          actorUid: admin.uid,
          targetUserId: targetUid,
          metadata: { reportId, reason: report.reason },
        });
        break;
      }
      case "suspend_user": {
        if (!targetUid) {
          return NextResponse.json({ error: "Could not resolve reported user" }, { status: 400 });
        }
        await db.collection("profiles").doc(targetUid).set(
          {
            suspended: true,
            restricted: true,
            suspensionReason: `Report: ${report.reason || "moderation review"}`,
            suspendedAt: new Date(),
            restrictedAt: new Date(),
          },
          { merge: true }
        );
        await writeAuditLog({
          action: "suspend_user",
          actorEmail: admin.email!,
          actorUid: admin.uid,
          targetUserId: targetUid,
          metadata: { reportId, reason: report.reason },
        });
        break;
      }
      case "delete_listing": {
        const listingId = String(report.listingId || body.listingId || "").trim();
        if (!listingId) {
          return NextResponse.json({ error: "No listing on this report" }, { status: 400 });
        }
        await db.collection("listings").doc(listingId).delete();
        await writeAuditLog({
          action: "delete_listing",
          actorEmail: admin.email!,
          actorUid: admin.uid,
          targetUserId: targetUid || undefined,
          listingId,
          metadata: { reportId, reason: report.reason },
        });
        break;
      }
      case "ban_user": {
        if (!targetUid) {
          return NextResponse.json({ error: "Could not resolve reported user" }, { status: 400 });
        }
        await banUser(targetUid, admin.email!, admin.uid, reportId);
        break;
      }
      case "delete_report": {
        await reportRef.delete();
        await writeAuditLog({
          action: "delete_report",
          actorEmail: admin.email!,
          actorUid: admin.uid,
          targetUserId: targetUid || undefined,
          metadata: { reportId, reason: report.reason },
        });
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      action,
      serious: SERIOUS_ACTIONS.has(action),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/report-action]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Action failed" },
      { status: 500 }
    );
  }
}
