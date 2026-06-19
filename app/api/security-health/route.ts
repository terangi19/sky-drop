import { NextRequest, NextResponse } from "next/server";
import { getMetrics } from "../../lib/security-metrics";
import { runIntegrityCheck } from "../../lib/runtime-integrity-check";
import { isAdminInitialized, getAdminDb } from "../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../lib/admin-request";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const integrity = await runIntegrityCheck();

  try {
    await requireAdminFromRequest(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({
        ok: integrity.overall !== "UNSAFE",
        status: integrity.overall || "HEALTHY",
      });
    }
    throw err;
  }

  const metrics = getMetrics();

  let recentDecisions: unknown[] = [];
  let recentSecurityEvents: unknown[] = [];

  if (isAdminInitialized()) {
    try {
      const db = getAdminDb();
      const [decisionSnap, eventSnap] = await Promise.all([
        db.collection("abuse_decision_log").orderBy("timestamp", "desc").limit(50).get(),
        db.collection("securityEvents").orderBy("timestamp", "desc").limit(50).get(),
      ]);
      recentDecisions = decisionSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      recentSecurityEvents = eventSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {}
  }

  return NextResponse.json({
    integrity,
    metrics,
    recentDecisions,
    recentSecurityEvents,
  });
}
