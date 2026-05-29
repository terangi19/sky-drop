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
    throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set");
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

export { getAdminApp };
