import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { pickPublicProfileFields } from "../../lib/public-profile-fields";
import { selectPublicProfileLookups } from "../../lib/public-profile-lookups";

const MAX_UIDS = 40;
const MAX_EMAILS = 40;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Batch public profiles by UID (and optionally seller email for signed-in callers).
 * Email lookups are an account-existence oracle — unauthenticated requests
 * resolve UIDs only. Used by listing-card enrichment to avoid N+1 client profile reads
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

    let authenticated = false;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ") && isAdminInitialized()) {
      try {
        await verifyIdToken(authHeader.slice(7));
        authenticated = true;
      } catch {
        authenticated = false;
      }
    }

    const selected = selectPublicProfileLookups({
      uids: [
        ...new Set(
          rawUids
            .map((u) => String(u || "").trim())
            .filter((u) => u.length > 0 && u.length < 128)
        ),
      ].slice(0, MAX_UIDS),
      emails: [
        ...new Set(
          rawEmails
            .map((e) => String(e || "").trim().toLowerCase())
            .filter((e) => e.length > 3 && e.length < 254 && EMAIL_RE.test(e))
        ),
      ].slice(0, MAX_EMAILS),
      authenticated,
    });
    const uids = selected.uids;
    const emails = selected.emails;

    if (uids.length === 0 && emails.length === 0) {
      return NextResponse.json({ profiles: {}, emailToUid: {} });
    }

    const db = getAdminDb();
    const profiles: Record<string, Record<string, unknown>> = {};
    const emailToUid: Record<string, string> = {};

    const emailChunks: string[][] = [];
    for (let i = 0; i < emails.length; i += 10) {
      emailChunks.push(emails.slice(i, i + 10));
    }

    const [uidSnaps, ...emailSnaps] = await Promise.all([
      uids.length > 0
        ? db.getAll(...uids.map((uid) => db.collection("profiles").doc(uid)))
        : Promise.resolve([] as Awaited<ReturnType<typeof db.getAll>>),
      ...emailChunks.map((chunk) =>
        db
          .collection("profiles")
          .where("email", "in", chunk)
          .limit(chunk.length)
          .get()
      ),
    ]);

    for (const snap of uidSnaps) {
      if (!snap.exists) continue;
      profiles[snap.id] = pickPublicProfileFields(snap.id, snap.data() || {});
    }

    for (const snap of emailSnaps) {
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
