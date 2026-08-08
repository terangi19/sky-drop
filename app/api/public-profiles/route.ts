import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { pickPublicProfileFields } from "../../lib/public-profile-fields";

const MAX_UIDS = 40;

/**
 * Batch public profiles by UID — used by listing-card enrichment to avoid N+1
 * client profile reads (profiles are owner-only in Firestore rules).
 */
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { allowed } = await rateLimit(`public-profiles-batch:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    const rawUids = Array.isArray(body?.uids) ? (body.uids as unknown[]) : [];
    const uids: string[] = [
      ...new Set(
        rawUids
          .map((u) => String(u || "").trim())
          .filter((u) => u.length > 0 && u.length < 128)
      ),
    ].slice(0, MAX_UIDS);

    if (uids.length === 0) {
      return NextResponse.json({ profiles: {} });
    }

    const db = getAdminDb();
    const profiles: Record<string, Record<string, unknown>> = {};

    // Firestore getAll supports up to 100 refs; we cap below that.
    const refs = uids.map((uid) => db.collection("profiles").doc(uid));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      profiles[snap.id] = pickPublicProfileFields(snap.id, snap.data() || {});
    }

    return NextResponse.json({ profiles });
  } catch {
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
  }
}
