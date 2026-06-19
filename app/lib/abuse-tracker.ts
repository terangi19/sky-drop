import { getAdminDb, isAdminInitialized } from "./firebase-admin";

const TRACK_WINDOW_MS = 60_000;
const LISTING_WINDOW_MS = 3600_000;
const FAILED_PAYMENT_WINDOW_MS = 3600_000;

interface AbuseThresholds {
  messagesPerMin: number;
  listingsPerHour: number;
  failedPaymentsPerHour: number;
  signupsPerMin: number;
}

const DEFAULT_THRESHOLDS: AbuseThresholds = {
  messagesPerMin: 30,
  listingsPerHour: 10,
  failedPaymentsPerHour: 5,
  signupsPerMin: 5,
};

const memCounters = new Map<string, { count: number; resetAt: number }>();

function checkMemCounter(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memCounters.get(key);
  if (!entry || now > entry.resetAt) {
    memCounters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export async function trackAndCheckAbuse(
  uid: string,
  email: string,
  action: "message" | "listing" | "failed_payment" | "signup",
  ip?: string
): Promise<boolean> {
  let allowed = true;

  switch (action) {
    case "message":
      allowed = checkMemCounter(`msg:${uid}`, DEFAULT_THRESHOLDS.messagesPerMin, TRACK_WINDOW_MS);
      break;
    case "listing":
      allowed = checkMemCounter(`listing:${uid}`, DEFAULT_THRESHOLDS.listingsPerHour, LISTING_WINDOW_MS);
      break;
    case "failed_payment":
      allowed = checkMemCounter(`payfail:${uid}`, DEFAULT_THRESHOLDS.failedPaymentsPerHour, FAILED_PAYMENT_WINDOW_MS);
      break;
    case "signup":
      allowed = checkMemCounter(`signup:${ip || uid}`, DEFAULT_THRESHOLDS.signupsPerMin, TRACK_WINDOW_MS);
      break;
  }

  if (!allowed) {
    try {
      if (isAdminInitialized()) {
        const db = getAdminDb();
        await db.collection("profiles").doc(uid).set(
          { riskFlag: true, riskFlaggedAt: new Date(), riskReason: `${action}_threshold_exceeded` },
          { merge: true }
        );
      }
    } catch {}
  }

  return allowed;
}

export async function isUserFlagged(uid: string): Promise<boolean> {
  try {
    if (isAdminInitialized()) {
      const db = getAdminDb();
      const snap = await db.collection("profiles").doc(uid).get();
      return snap.data()?.riskFlag === true;
    }
  } catch {}
  return false;
}

export async function getAbuseCounts(uid: string) {
  const msg = memCounters.get(`msg:${uid}`);
  const listing = memCounters.get(`listing:${uid}`);
  const payfail = memCounters.get(`payfail:${uid}`);
  return {
    messages: msg ? `${msg.count}/${DEFAULT_THRESHOLDS.messagesPerMin}` : "0/30",
    listings: listing ? `${listing.count}/${DEFAULT_THRESHOLDS.listingsPerHour}` : "0/10",
    failedPayments: payfail ? `${payfail.count}/${DEFAULT_THRESHOLDS.failedPaymentsPerHour}` : "0/5",
  };
}
