/**
 * Firestore Admin for scripts/scrub-email-derived-names.ts.
 *
 * The Next.js helper app/lib/firebase-admin.ts imports `server-only`, which
 * throws under plain `npx tsx` (that package only loads in a react-server
 * condition). This module talks to firebase-admin directly so the scrub
 * script can start without weakening that guard for the app.
 *
 * Credentials stay in the environment (FIREBASE_SERVICE_ACCOUNT or
 * GOOGLE_APPLICATION_CREDENTIALS). Nothing here writes until the script
 * is passed --apply.
 */
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getFirebaseStorageBucket } from "../../app/lib/firebase-storage-config";

export const SCRUB_ADMIN_MISSING =
  "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT or ADC, then re-run.";

export function scrubAdminConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT?.trim() || !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

function parseServiceAccountJson(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as ServiceAccount;
  } catch {
    /* try double-encoded JSON (common Vercel copy-paste mistake) */
  }
  try {
    const parsed = JSON.parse(JSON.parse(raw)) as unknown;
    if (parsed && typeof parsed === "object") return parsed as ServiceAccount;
  } catch {
    /* fall through */
  }
  throw new Error("FIREBASE_SERVICE_ACCOUNT is invalid JSON");
}

export function initScrubAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  const storageBucket = getFirebaseStorageBucket();
  if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) {
    return initializeApp({ credential: cert(parseServiceAccountJson()), storageBucket });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      return initializeApp({ credential: applicationDefault(), storageBucket });
    } catch {
      throw new Error(
        "Firebase Admin SDK could not use GOOGLE_APPLICATION_CREDENTIALS. " +
          "Set FIREBASE_SERVICE_ACCOUNT to your service account JSON instead."
      );
    }
  }
  throw new Error(SCRUB_ADMIN_MISSING);
}

export function openScrubDb(): Firestore {
  if (!scrubAdminConfigured()) {
    throw new Error(SCRUB_ADMIN_MISSING);
  }
  return getFirestore(initScrubAdminApp());
}
