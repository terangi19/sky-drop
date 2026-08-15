import "server-only";

import { getServerDb } from "./firebase-admin";

type AuthProfileIdentity = {
  uid: string;
  email?: string;
  emailVerified?: boolean;
};

function usernameBase(email: string): string {
  const local = (email.split("@")[0] || "user")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 20);
  const safe = local || "user";
  return /^[a-zA-Z]/.test(safe) ? safe : `user${safe}`.slice(0, 20);
}

function usernameCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base;
  return `${base}${attempt + 1}`.slice(0, 30);
}

/**
 * Repairs legacy/Auth-only accounts at the authenticated profile boundary.
 * The transaction reserves one canonical username and creates one profile;
 * concurrent tabs converge on the same profile instead of duplicating identity.
 */
export async function ensureProfileForAuthenticatedUser(identity: AuthProfileIdentity) {
  const db = getServerDb();
  const profileRef = db.collection("profiles").doc(identity.uid);

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(profileRef);
    if (existing.exists) return existing.data()!;

    const email = identity.email?.trim().toLowerCase() || "";
    const base = usernameBase(email);
    let username = "";

    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = usernameCandidate(base, attempt);
      const usernameRef = db.collection("usernames").doc(candidate.toLowerCase());
      const usernameSnap = await transaction.get(usernameRef);
      if (!usernameSnap.exists || usernameSnap.data()?.uid === identity.uid) {
        username = candidate;
        transaction.set(usernameRef, { uid: identity.uid }, { merge: true });
        break;
      }
    }

    if (!username) throw new Error("Unable to reserve a profile username");

    const now = new Date();
    const profile = {
      email,
      username,
      displayName: "",
      phone: "",
      phoneVerified: false,
      emailVerified: identity.emailVerified === true,
      referralCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
      memberSince: now,
      lastActive: now,
      createdAt: now,
      recoveredAt: now,
    };
    transaction.set(profileRef, profile);
    return profile;
  });
}
