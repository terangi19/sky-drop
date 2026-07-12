import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  type Auth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFirebaseStorageBucket } from "./firebase-storage-config";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDwIex86XMiqO5FIxl_Uhck1pbCX8O32yI",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "sky-drop-de459.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://sky-drop-de459-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459",
  storageBucket: getFirebaseStorageBucket(),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "564551137643",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:564551137643:web:8d64159394b148fc09b42e",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-24M12L6HFB",
};

function getOrCreateApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/**
 * Client: initializeAuth with LOCAL persistence before any auth reads.
 * Server: getAuth only (no browser storage).
 *
 * Using setPersistence() after getAuth() races session restore on refresh.
 */
function createAuth(app: FirebaseApp): Auth {
  if (typeof window === "undefined") {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const app = getOrCreateApp();
export const auth = createAuth(app);
if (typeof window !== "undefined") {
  auth.useDeviceLanguage();
}

export const db = getFirestore(app);
export const storage = getStorage(app);

// App Check — initializes if NEXT_PUBLIC_RECAPTCHA_SITE_KEY is set.
import { initAppCheck } from "./app-check";
if (typeof window !== "undefined") {
  initAppCheck();
}

export { onAuthStateChanged } from "firebase/auth";
