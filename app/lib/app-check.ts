/**
 * Firebase App Check setup for web.
 *
 * Requires:
 *   NEXT_PUBLIC_RECAPTCHA_SITE_KEY — reCAPTCHA v3 site key from Google Cloud Console
 *   Firebase Console: App Check → reCAPTCHA Enterprise → register site key
 *
 * Activation steps:
 *   1. Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY in Vercel env
 *   2. In Firebase Console: App Check → Apps → Web → "Enforce" (after testing)
 *   3. This provider automatically protects Firestore, Auth, and Storage
 */

import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";

let appCheckInstance: AppCheck | null = null;

export function getAppCheckSiteKey(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  }
  return "";
}

export function initAppCheck(): AppCheck | null {
  if (appCheckInstance) return appCheckInstance;

  const siteKey = getAppCheckSiteKey();
  if (!siteKey) {
    console.warn("[app-check] NEXT_PUBLIC_RECAPTCHA_SITE_KEY not set — App Check disabled");
    return null;
  }

  // Lazy-import app to avoid circular dependency
  const { app } = require("./firebase");

  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });

  if (process.env.NODE_ENV !== "production") console.log("[app-check] reCAPTCHA v3 App Check initialized");
  return appCheckInstance;
}

// Note: initAppCheck() is called explicitly from firebase.ts after the app is created.
// The require() inside initAppCheck avoids circular dependency since firebase.ts
// also imports from this module.
