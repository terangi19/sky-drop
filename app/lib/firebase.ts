import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDwIex86XMiqO5FIxl_Uhck1pbCX8O32yI",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "sky-drop-de459.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://sky-drop-de459-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "sky-drop-de459.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "564551137643",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:564551137643:web:8d64159394b148fc09b42e",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-24M12L6HFB",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
auth.useDeviceLanguage();

auth.setPersistence?.(browserLocalPersistence).catch(() => {});

export const db = getFirestore(app);
export const storage = getStorage(app);

// App Check disabled — not enforced in Firebase Console and causing reCAPTCHA errors
// Re-enable once you have a valid reCAPTCHA v3 site key configured for your domain
// import { initAppCheck } from "./app-check";
// if (typeof window !== "undefined") {
//   initAppCheck();
// }

// Re-export for convenience — all files import from here
export { onAuthStateChanged } from "firebase/auth";
