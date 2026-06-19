import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth, isAdminInitialized } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { writeAuditLog } from "../../../lib/admin-utils";
import { blacklistPhone, recordUsedIp } from "../../../lib/ban-store";

type UserAction = "suspend" | "ban" | "unban" | "verify" | "delete";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action as UserAction;
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";

    if (!uid || !action) {
      return NextResponse.json({ error: "uid and action required" }, { status: 400 });
    }

    const db = getAdminDb();
    const profileRef = db.collection("profiles").doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const profile = profileSnap.data()!;

    switch (action) {
      case "suspend":
        await profileRef.set(
          { suspended: true, restricted: true, suspendedAt: new Date(), restrictionReason: "Admin suspension" },
          { merge: true }
        );
        break;
      case "unban":
        await profileRef.set(
          {
            restricted: false,
            suspended: false,
            bannedAt: null,
            banReason: "",
            suspendedAt: null,
            restrictionReason: "",
          },
          { merge: true }
        );
        break;
      case "verify":
        await profileRef.set({ kycStatus: "approved", kycReviewedAt: new Date(), kycReviewedBy: admin.email }, { merge: true });
        break;
      case "ban": {
        if (!isAdminInitialized()) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
        const userRecord = await getAdminAuth().getUser(uid);
        const phone = profile.phone || userRecord.phoneNumber || "";
        if (phone) await blacklistPhone(phone);
        const email = String(profile.email || userRecord.email || "");
        const listings = await db.collection("listings").where("sellerId", "==", uid).get();
        const batch = db.batch();
        listings.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        const ip = String(profile.ip || "");
        if (ip) await recordUsedIp(ip);
        await profileRef.update({
          restricted: true,
          suspended: true,
          bannedAt: new Date(),
          banReason: "admin_action",
          kycStatus: "banned_fake",
        });
        break;
      }
      case "delete": {
        if (!isAdminInitialized()) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
        const listings = await db.collection("listings").where("sellerId", "==", uid).get();
        const batch = db.batch();
        listings.docs.forEach((d) => batch.delete(d.ref));
        batch.delete(profileRef);
        await batch.commit();
        try {
          await getAdminAuth().deleteUser(uid);
        } catch {
          /* profile removed even if auth delete fails */
        }
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await writeAuditLog({
      action: `user_${action}`,
      actorEmail: admin.email!,
      actorUid: admin.uid,
      targetUserId: uid,
      metadata: { email: profile.email },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/user-action]", e);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
