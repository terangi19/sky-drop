import "server-only";

import { getServerDb } from "./firebase-admin";

type AuthProfileIdentity = {
  uid: string;
  email?: string;
  emailVerified?: boolean;
};

function usernameBase(email: string): string {
  const local = (email.split("@")[0] || "").replace(/[^a-zA-Z0-9_]/g, "");
  const withLetterPrefix = /^[a-zA-Z]/.test(local) ? local : `user${local}`;
  const candidate = (withLetterPrefix || "user").slice(0, 20);
  return candidate.length >= 3 ? candidate : `${candidate}user`.slice(0, 20);
}

function usernameCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const suffix = String(attempt + 1);
  return `${base.slice(0, 30 - suffix.length)}${suffix}`;
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
    const existingProfile = existing.exists ? existing.data()! : null;

    const email = identity.email?.trim().toLowerCase() || "";
    const base = usernameBase(email);
    let username = "";
    const currentUsername = String(existingProfile?.username || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 30);

    if (currentUsername) {
      const currentRef = db.collection("usernames").doc(currentUsername.toLowerCase());
      const currentSnap = await transaction.get(currentRef);
      if (!currentSnap.exists || currentSnap.data()?.uid === identity.uid) {
        username = currentUsername;
        if (!currentSnap.exists) transaction.set(currentRef, { uid: identity.uid });
      }
    }

    if (!username) {
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
    }

    if (!username) throw new Error("Unable to reserve a profile username");

    if (existingProfile && username === currentUsername) return existingProfile;

    const now = new Date();
    const profile = {
      ...(existingProfile || {}),
      email: String(existingProfile?.email || email),
      username,
      displayName: String(existingProfile?.displayName || ""),
      phone: String(existingProfile?.phone || ""),
      phoneVerified: existingProfile?.phoneVerified === true,
      emailVerified:
        identity.emailVerified === true || existingProfile?.emailVerified === true,
      referralCode:
        String(existingProfile?.referralCode || "") ||
        Math.random().toString(36).slice(2, 8).toUpperCase(),
      memberSince: existingProfile?.memberSince || now,
      lastActive: existingProfile?.lastActive || now,
      createdAt: existingProfile?.createdAt || now,
      recoveredAt: now,
    };
    transaction.set(profileRef, profile, { merge: true });
    return profile;
  });
}
