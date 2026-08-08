import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { pickPublicProfileFields } from "../../lib/public-profile-fields";

const MAX_UIDS = 40;
const MAX_EMAILS = 40;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Batch public profiles by UID (and optionally seller email for legacy listings).
 * Used by listing-card enrichment to avoid N+1 client profile reads
 * (profiles are owner-only in Firestore rules).
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
    const rawEmails = Array.isArray(body?.emails) ? (body.emails as unknown[]) : [];

    const uids: string[] = [
      ...new Set(
        rawUids
          .map((u) => String(u || "").trim())
          .filter((u) => u.length > 0 && u.length < 128)
      ),
    ].slice(0, MAX_UIDS);

    const emails: string[] = [
      ...new Set(
        rawEmails
          .map((e) => String(e || "").trim().toLowerCase())
          .filter((e) => e.length > 3 && e.length < 254 && EMAIL_RE.test(e))
      ),
    ].slice(0, MAX_EMAILS);

    if (uids.length === 0 && emails.length === 0) {
      return NextResponse.json({ profiles: {}, emailToUid: {} });
    }

    const db = getAdminDb();
    const profiles: Record<string, Record<string, unknown>> = {};
    const emailToUid: Record<string, string> = {};

    if (uids.length > 0) {
      // Firestore getAll supports up to 100 refs; we cap below that.
      const refs = uids.map((uid) => db.collection("profiles").doc(uid));
      const snaps = await db.getAll(...refs);
      for (const snap of snaps) {
        if (!snap.exists) continue;
        profiles[snap.id] = pickPublicProfileFields(snap.id, snap.data() || {});
      }
    }

    // Legacy listings may only store sellerEmail — resolve to profile UID in chunks of 10.
    for (let i = 0; i < emails.length; i += 10) {
      const chunk = emails.slice(i, i + 10);
      const snap = await db
        .collection("profiles")
        .where("email", "in", chunk)
        .limit(chunk.length)
        .get();
      for (const doc of snap.docs) {
        const data = doc.data() || {};
        const email = String(data.email || "").trim().toLowerCase();
        if (!email) continue;
        emailToUid[email] = doc.id;
        if (!profiles[doc.id]) {
          profiles[doc.id] = pickPublicProfileFields(doc.id, data);
        }
      }
    }

    return NextResponse.json({ profiles, emailToUid });
  } catch {
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
  }
}
