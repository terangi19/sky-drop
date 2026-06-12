import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { enrichReports } from "../../../lib/enrich-reports.server";
import { writeAuditLog } from "../../../lib/admin-utils";

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 100), 200);
    const against = req.nextUrl.searchParams.get("against")?.trim().toLowerCase() || "";

    let query = getAdminDb().collection("reports").orderBy("createdAt", "desc") as FirebaseFirestore.Query;
    if (against) {
      query = getAdminDb()
        .collection("reports")
        .where("reportedUserEmail", "==", against)
        .orderBy("createdAt", "desc");
    }

    const snap = await query.limit(limit).get();
    const reports = await enrichReports(snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
    const pendingReports = reports.filter((r) => !r.status || r.status === "pending").length;

    return NextResponse.json({ reports, pendingReports });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/reports GET]", e);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";

    if (!reportId || !status) {
      return NextResponse.json({ error: "reportId and status required" }, { status: 400 });
    }

    await getAdminDb().collection("reports").doc(reportId).set(
      { status, reviewedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    await writeAuditLog({
      action: `report_${status}`,
      actorEmail: admin.email!,
      actorUid: admin.uid,
      metadata: { reportId, status },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/reports PATCH]", e);
    return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";

    if (!reportId) {
      return NextResponse.json({ error: "reportId required" }, { status: 400 });
    }

    await getAdminDb().collection("reports").doc(reportId).delete();

    await writeAuditLog({
      action: "delete_report",
      actorEmail: admin.email!,
      actorUid: admin.uid,
      metadata: { reportId },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/reports DELETE]", e);
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}
