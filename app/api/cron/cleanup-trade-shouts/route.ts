import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { isAuthorizedCronRequest } from "../../../lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Only Next.js route-config names may be exported from a route file; keep the tunables local.
/** Shouts are shown for 1 h; delete only after 2 h so we never race the feed or an author's own delete. */
const SHOUT_TTL_MS = 60 * 60 * 1000;
const SHOUT_GRACE_MS = 60 * 60 * 1000;
const BATCH_SIZE = 400; // < 500 writes per batch
const MAX_ROUNDS = 5; // <= 2000 deletes per run
const TIME_BUDGET_MS = 40_000; // stop well inside maxDuration (60 s)

/**
 * GET /api/cron/cleanup-trade-shouts  (Vercel Cron; sends Authorization: Bearer $CRON_SECRET)
 * Deletes tradeShouts whose createdAt is older than TTL + grace. Reads no query string or body.
 * Responds and logs counts only; never shout text or authors.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (!isAuthorizedCronRequest(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminInitialized()) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const started = Date.now();
  let deleted = 0;
  let rounds = 0;
  let more = false;
  try {
    const db = getAdminDb();
    const cutoff = Timestamp.fromMillis(started - SHOUT_TTL_MS - SHOUT_GRACE_MS);
    while (rounds < MAX_ROUNDS) {
      const snap = await db
        .collection("tradeShouts")
        .where("createdAt", "<", cutoff)
        .orderBy("createdAt")
        .limit(BATCH_SIZE)
        .get();
      if (snap.empty) {
        more = false;
        break;
      }
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      rounds += 1;
      deleted += snap.size;
      more = snap.size === BATCH_SIZE;
      if (!more) break;
      if (Date.now() - started > TIME_BUDGET_MS) break;
    }
    console.info("[cron/cleanup-trade-shouts]", { deleted, rounds, more });
    return NextResponse.json({ deleted, rounds, more });
  } catch (e: unknown) {
    // Sanitized: error class + gRPC/Firestore code only (no message, no doc data).
    const code = typeof (e as { code?: unknown })?.code === "string" || typeof (e as { code?: unknown })?.code === "number"
      ? String((e as { code: string | number }).code).slice(0, 40)
      : undefined;
    console.error("[cron/cleanup-trade-shouts] failed", { name: e instanceof Error ? e.name : "error", code, deleted, rounds });
    return NextResponse.json({ error: "Cleanup failed", deleted, rounds }, { status: 500 });
  }
}
