import { logSecurityCritical } from "./security-log";
import { getAdminDb, isAdminInitialized } from "./firebase-admin";

const TRACKING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const FAILED_AUTH_THRESHOLD = 5;
const RAPID_ACCOUNT_THRESHOLD = 3; // 3 accounts from same IP in 5 minutes

interface FailedAuthAttempt {
  ip: string;
  email?: string;
  timestamp: number;
}

interface AccountCreation {
  ip: string;
  email: string;
  timestamp: number;
}

const failedAuthAttempts = new Map<string, FailedAuthAttempt[]>();
const accountCreations = new Map<string, AccountCreation[]>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  
  // Clean up failed auth attempts
  for (const [key, attempts] of failedAuthAttempts) {
    const valid = attempts.filter(a => now - a.timestamp < TRACKING_WINDOW_MS);
    if (valid.length === 0) {
      failedAuthAttempts.delete(key);
    } else {
      failedAuthAttempts.set(key, valid);
    }
  }
  
  // Clean up account creations
  for (const [key, creations] of accountCreations) {
    const valid = creations.filter(a => now - a.timestamp < TRACKING_WINDOW_MS);
    if (valid.length === 0) {
      accountCreations.delete(key);
    } else {
      accountCreations.set(key, valid);
    }
  }
}, 60 * 1000); // Every minute

export async function trackFailedAuth(ip: string, email?: string): Promise<void> {
  const now = Date.now();
  const key = ip;
  
  const attempts = failedAuthAttempts.get(key) || [];
  attempts.push({ ip, email, timestamp: now });
  failedAuthAttempts.set(key, attempts);
  
  // Check if threshold exceeded
  const recentAttempts = attempts.filter(a => now - a.timestamp < TRACKING_WINDOW_MS);
  if (recentAttempts.length >= FAILED_AUTH_THRESHOLD) {
    await logSecurityCritical(
      "repeated_failed_auth",
      `Multiple failed authentication attempts from IP: ${ip}`,
      { ip, actorEmail: email, metadata: { attempts: recentAttempts.length } }
    );
  }
}

export async function trackAccountCreation(ip: string, email: string): Promise<void> {
  const now = Date.now();
  const key = ip;
  
  const creations = accountCreations.get(key) || [];
  creations.push({ ip, email, timestamp: now });
  accountCreations.set(key, creations);
  
  // Check if threshold exceeded
  const recentCreations = creations.filter(a => now - a.timestamp < TRACKING_WINDOW_MS);
  if (recentCreations.length >= RAPID_ACCOUNT_THRESHOLD) {
    await logSecurityCritical(
      "rapid_account_creation",
      `Multiple accounts created from same IP: ${ip}`,
      { ip, metadata: { accounts: recentCreations.length, emails: recentCreations.map(c => c.email) } }
    );
  }
}

export async function checkSuspiciousPatterns(uid: string, email: string): Promise<boolean> {
  if (!isAdminInitialized()) return false;
  
  try {
    const db = getAdminDb();
    const profile = await db.collection("profiles").doc(uid).get();
    if (!profile.exists) return false;
    
    const data = profile.data();
    const createdAt = data?.createdAt?.toDate?.();
    if (!createdAt) return false;
    
    const accountAge = Date.now() - createdAt.getTime();
    
    // Check if account is very young (< 1 hour) and has high activity
    if (accountAge < 3600_000) {
      const listings = await db.collection("listings").where("sellerEmail", "==", email).count().get();
      const messages = await db.collection("messages").where("sender", "==", email).count().get();
      
      if (listings.data().count > 5 || messages.data().count > 20) {
        await logSecurityCritical(
          "suspicious_new_account",
          `New account with unusually high activity: ${email}`,
          { actorEmail: email, actorUid: uid, metadata: { accountAge, listings: listings.data().count, messages: messages.data().count } }
        );
        return true;
      }
    }
  } catch (e) {
    console.error("Error checking suspicious patterns:", e);
  }
  
  return false;
}
