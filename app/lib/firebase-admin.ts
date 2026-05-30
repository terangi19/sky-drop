import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app: App | null = null;

function getAdminApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT not set");
  }
  app = initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  return app;
}

let _auth: ReturnType<typeof getAuth> | null = null;
export function getAdminAuth() {
  if (!_auth) _auth = getAuth(getAdminApp());
  return _auth;
}

let _db: ReturnType<typeof getFirestore> | null = null;
export function getAdminDb() {
  if (!_db) _db = getFirestore(getAdminApp());
  return _db;
}

export function isAdminInitialized(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

// Verify a Firebase ID token — uses Admin SDK in production, decodes JWT in dev
export async function verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; email_verified?: boolean }> {
  if (isAdminInitialized()) {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email, email_verified: decoded.email_verified };
  }
  // Dev fallback: decode JWT payload without signature verification
  // Firebase ID tokens are JWTs with payload in the second segment
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new Error("Invalid token format");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload.sub) throw new Error("Invalid token payload");
    return { uid: payload.sub, email: payload.email, email_verified: payload.email_verified };
  } catch {
    throw new Error("Invalid or expired token");
  }
}

export { getAdminApp };
