import { NextResponse } from "next/server";
import { getMetrics } from "../../lib/security-metrics";
import { runIntegrityCheck } from "../../lib/runtime-integrity-check";
import { isAdminInitialized, getAdminDb } from "../../lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  // Basic server check — no auth required for health
  const integrity = await runIntegrityCheck();

  // Metrics are always available (in-memory)
  const metrics = getMetrics();

  // Firestore data (requires Admin SDK)
  let recentDecisions: unknown[] = [];
  let recentSecurityEvents: unknown[] = [];

  if (isAdminInitialized()) {
    try {
      const db = getAdminDb();
      const [decisionSnap, eventSnap] = await Promise.all([
        db.collection("abuse_decision_log").orderBy("timestamp", "desc").limit(50).get(),
        db.collection("securityEvents").orderBy("timestamp", "desc").limit(50).get(),
      ]);
      recentDecisions = decisionSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      recentSecurityEvents = eventSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {}
  }

  return NextResponse.json({
    integrity,
    metrics,
    recentDecisions,
    recentSecurityEvents,
  });
}
