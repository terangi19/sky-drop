import {
  createUserWithEmailAndPassword,
  type User,
} from "firebase/auth";
import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { validatePasswordStrength } from "./password-strength";
import { getTurnstileSiteKey } from "./turnstile";
import {
  defaultUsernameFromEmail,
  normalizeUsernameInput,
  validateUsername,
} from "./username";

function candidateUsername(base: string, attempt: number): string {
  if (attempt === 0) return base;
  return `${base}${attempt + 1}`.slice(0, 30);
}

async function createProfileWithReservedUsername(
  uid: string,
  email: string,
  profileData: Record<string, unknown>,
  preferredUsername?: string
): Promise<string> {
  const fromEmail = defaultUsernameFromEmail(email);
  const userPicked = preferredUsername ? normalizeUsernameInput(preferredUsername) : "";
  const base = userPicked || fromEmail;

  return runTransaction(db, async (transaction) => {
    if (userPicked) {
      const usernameKey = userPicked.toLowerCase();
      const usernameRef = doc(db, "usernames", usernameKey);
      const usernameSnap = await transaction.get(usernameRef);
      if (usernameSnap.exists() && usernameSnap.data()?.uid !== uid) {
        throw new Error("That username is already taken. Try another one.");
      }
      transaction.set(usernameRef, { uid }, { merge: true });
      transaction.set(
        doc(db, "profiles", uid),
        { ...profileData, email, username: userPicked },
        { merge: true }
      );
      return userPicked;
    }

    for (let attempt = 0; attempt < 20; attempt++) {
      const username = candidateUsername(base, attempt);
      const usernameKey = username.toLowerCase();
      const usernameRef = doc(db, "usernames", usernameKey);
      const usernameSnap = await transaction.get(usernameRef);
      if (!usernameSnap.exists() || usernameSnap.data()?.uid === uid) {
        transaction.set(usernameRef, { uid }, { merge: true });
        transaction.set(
          doc(db, "profiles", uid),
          { ...profileData, email, username },
          { merge: true }
        );
        return username;
      }
    }
    throw new Error("Could not reserve username — try choosing one manually.");
  });
}

export async function verifyTurnstileToken(token: string): Promise<boolean> {
  if (!getTurnstileSiteKey()) return true;
  if (!token) return false;
  const verifyRes = await fetch("/api/verify-turnstile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const verifyData = await verifyRes.json().catch(() => ({}));
  return !!verifyData.success;
}

export async function checkEmailAllowed(email: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/check-email-temp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.disposable) {
    return { ok: false, error: "Temporary email addresses aren't allowed. Use a permanent email." };
  }
  return { ok: true };
}

export function signupAuthError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: string }).code)
      : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try logging in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return error instanceof Error ? error.message : "Something went wrong";
  }
}

export type CreateAccountInput = {
  email: string;
  password: string;
  turnstileToken: string;
  username?: string;
  inviteCode?: string;
};

export async function createSkyDropAccount(input: CreateAccountInput): Promise<User> {
  const email = input.email.trim();
  const password = input.password;

  const turnstileOk = await verifyTurnstileToken(input.turnstileToken);
  if (!turnstileOk) {
    throw new Error("Security check failed. Please try again.");
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error || "Password does not meet requirements");
  }

  const emailCheck = await checkEmailAllowed(email);
  if (!emailCheck.ok) {
    throw new Error(emailCheck.error);
  }

  const preferredUsername = input.username?.trim()
    ? normalizeUsernameInput(input.username)
    : "";
  if (preferredUsername) {
    const usernameValidation = validateUsername(preferredUsername);
    if (!usernameValidation.valid) {
      throw new Error(usernameValidation.error);
    }
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const user = cred.user;

  try {
    const token = await user.getIdToken();
    await fetch("/api/send-verification-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: user.email }),
    });
  } catch (e) {
    console.error("Email verification send failed:", e);
  }

  const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  await createProfileWithReservedUsername(
    user.uid,
    user.email || email,
    {
      phone: "",
      phoneVerified: false,
      referralCode,
      memberSince: Timestamp.now(),
      lastActive: Timestamp.now(),
      createdAt: serverTimestamp(),
    },
    preferredUsername || undefined
  );

  const invite = input.inviteCode?.trim().toUpperCase();
  if (invite) {
    try {
      const token = await user.getIdToken();
      const refRes = await fetch("/api/track-referral", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ referralCode: invite }),
      });
      const refData = await refRes.json().catch(() => ({}));
      if (refRes.ok && refData.tracked && refData.referredBy) {
        await setDoc(doc(db, "profiles", user.uid), { referredBy: refData.referredBy }, { merge: true });
      }
    } catch (e) {
      console.error("Referral tracking failed:", e);
    }
  }

  return user;
}
