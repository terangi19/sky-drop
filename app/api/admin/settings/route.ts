import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { writeAuditLog } from "../../../lib/admin-utils";
import { isSuperAdminEmail } from "../../../lib/admin-roles";

const DEFAULTS = {
  maintenanceMode: false,
  announcementBanner: { message: "", active: false, type: "info" },
  referralRewardAmount: 10,
  listingLimitPerUser: 50,
  uploadLimitMb: 10,
};

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const db = getAdminDb();
    const [siteSnap, featuresSnap, announceSnap] = await Promise.all([
      db.collection("config").doc("siteSettings").get(),
      db.collection("config").doc("features").get(),
      db.collection("config").doc("announcement").get(),
    ]);

    const site = siteSnap.exists ? siteSnap.data() : {};
    const features = featuresSnap.exists ? featuresSnap.data() : {};
    const announcement = announceSnap.exists ? announceSnap.data() : {};

    return NextResponse.json({
      settings: { ...DEFAULTS, ...site },
      features,
      announcement,
    });
  } catch (e) {
    console.error("[admin/settings GET]", e);
    return NextResponse.json({ settings: DEFAULTS, features: {}, announcement: {} });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (!isSuperAdminEmail(admin.email)) {
      return NextResponse.json({ error: "Super admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const db = getAdminDb();

    if (body.settings && typeof body.settings === "object") {
      await db.collection("config").doc("siteSettings").set(body.settings, { merge: true });
    }
    if (body.features && typeof body.features === "object") {
      await db.collection("config").doc("features").set(body.features, { merge: true });
    }
    if (body.announcement && typeof body.announcement === "object") {
      await db.collection("config").doc("announcement").set(
        { ...body.announcement, updatedAt: new Date(), updatedBy: admin.email },
        { merge: true }
      );
    }

    await writeAuditLog({
      action: "update_site_settings",
      actorEmail: admin.email!,
      actorUid: admin.uid,
      metadata: { keys: Object.keys(body) },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/settings POST]", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
