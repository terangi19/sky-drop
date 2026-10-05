import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { decoratePublicProfile, pickPublicProfileFields } from "../../lib/public-profile-fields";
import { selectPublicProfileLookups } from "../../lib/public-profile-lookups";

const MAX_UIDS = 40;
const MAX_EMAILS = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Counts only. Never include raw email addresses in this warning.
 * `requested` is the number of valid emails in the body (before the cap)
 * so a single oversized probe can exceed the enumeration gap.
 */
function warnEmailLookupStats(stats: {
  uid: string;
  requested: number;
  resolved: number;
  dailyBudgetExceeded: boolean;
}): void {
  const uid = stats.uid;
  const requested = stats.requested;
  const resolved = stats.resolved;
  console.warn(JSON.stringify({ uid, requested, resolved }));
  if (requested - resolved > 50 || stats.dailyBudgetExceeded) {
    console.warn(
      JSON.stringify({
        event: "public_profiles_email_enumeration",
        uid,
        requested,
        resolved,
      })
    );
  }
}

/**
 * Batch public profiles by UID (and optionally seller email for signed-in callers).
 * Email lookups are an account-existence oracle — unauthenticated requests
 * resolve UIDs only. Signed-in email lookups are capped per uid (minute + day);
 * over budget we still return UID profiles and an empty email map (not 429).
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

    let callerUid = "";
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ") && isAdminInitialized()) {
      try {
        const decoded = await verifyIdToken(authHeader.slice(7));
        callerUid = String(decoded.uid || "").trim();
      } catch {
        callerUid = "";
      }
    }
    const authenticated = callerUid.length > 0;

    const normalizedEmails = [
      ...new Set(
        rawEmails
          .map((e) => String(e || "").trim().toLowerCase())
          .filter((e) => e.length > 3 && e.length < 254 && EMAIL_RE.test(e))
      ),
    ];
    const requestedEmailCount = normalizedEmails.length;

    let emailBudgetOk = true;
    let dailyBudgetExceeded = false;
    if (authenticated && requestedEmailCount > 0) {
      const [minute, day] = await Promise.all([
        rateLimit(`public-profiles-email:${callerUid}`, 20, 60_000),
        rateLimit(`public-profiles-email-day:${callerUid}`, 300, 86_400_000),
      ]);
      emailBudgetOk = minute.allowed && day.allowed;
      dailyBudgetExceeded = !day.allowed;
    } else if (requestedEmailCount > 0) {
      emailBudgetOk = false;
    }

    const selected = selectPublicProfileLookups({
      uids: [
        ...new Set(
          rawUids
            .map((u) => String(u || "").trim())
            .filter((u) => u.length > 0 && u.length < 128)
        ),
      ].slice(0, MAX_UIDS),
      emails: normalizedEmails.slice(0, MAX_EMAILS),
      authenticated,
      emailBudgetOk,
    });
    const uids = selected.uids;
    const emails = selected.emails;

    const profiles: Record<string, Record<string, unknown>> = {};
    const emailToUid: Record<string, string> = {};

    if (uids.length > 0 || emails.length > 0) {
      const db = getAdminDb();

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
        const raw = snap.data() || {};
        profiles[snap.id] = decoratePublicProfile(pickPublicProfileFields(snap.id, raw), raw);
      }

      for (const snap of emailSnaps) {
        for (const doc of snap.docs) {
          const data = doc.data() || {};
          const email = String(data.email || "").trim().toLowerCase();
          if (!email) continue;
          emailToUid[email] = doc.id;
          if (!profiles[doc.id]) {
            profiles[doc.id] = decoratePublicProfile(pickPublicProfileFields(doc.id, data), data);
          }
        }
      }
    }

    if (requestedEmailCount > 0) {
      warnEmailLookupStats({
        uid: callerUid,
        requested: requestedEmailCount,
        resolved: Object.keys(emailToUid).length,
        dailyBudgetExceeded,
      });
    }

    return NextResponse.json({ profiles, emailToUid });
  } catch {
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
  }
}
