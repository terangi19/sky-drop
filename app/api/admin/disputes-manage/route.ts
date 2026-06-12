import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest, serializeTimestamp } from "../../../lib/admin-request";
import { writeAuditLog } from "../../../lib/admin-utils";

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const status = req.nextUrl.searchParams.get("status") || "all";
    const db = getAdminDb();

    const snap = await db.collection("disputes").orderBy("createdAt", "desc").limit(100).get();
    type DisputeRow = Record<string, unknown> & { id: string; createdAtMs: number | null; status?: string };
    let disputes: DisputeRow[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAtMs: serializeTimestamp(data.createdAt),
      };
    });

    if (status !== "all") {
      disputes = disputes.filter((d) => d.status === status);
    }

    return NextResponse.json({ disputes });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/disputes-manage GET]", e);
    return NextResponse.json({ error: "Failed to load disputes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const disputeId = typeof body.disputeId === "string" ? body.disputeId.trim() : "";
    const action = body.action as "review" | "resolve" | "close";

    if (!disputeId || !action) {
      return NextResponse.json({ error: "disputeId and action required" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("disputes").doc(disputeId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    const data = snap.data()!;

    if (action === "review") {
      await ref.set({ status: "under_review", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else if (action === "resolve") {
      await ref.set({ status: "resolved_buyer", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else if (action === "close") {
      await ref.set({ status: "closed", closedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    await writeAuditLog({
      action: `dispute_${action}`,
      actorEmail: admin.email!,
      actorUid: admin.uid,
      disputeId,
      metadata: { purchaseId: data.purchaseId, listingId: data.listingId },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/disputes-manage POST]", e);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
