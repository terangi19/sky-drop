/**
 * Firebase App Check setup for web.
 *
 * Requires:
 *   NEXT_PUBLIC_RECAPTCHA_SITE_KEY — reCAPTCHA v3 or Enterprise site key
 *   Firebase Console: App Check → register provider + site key
 *
 * Local dev:
 *   - Set NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN (from Firebase Console → App Check → Debug tokens)
 *   - Or leave NEXT_PUBLIC_RECAPTCHA_SITE_KEY unset to skip App Check locally
 *   - Or NEXT_PUBLIC_DISABLE_APP_CHECK=true
 *
 * If Firebase Console uses reCAPTCHA Enterprise, set NEXT_PUBLIC_APP_CHECK_ENTERPRISE=true
 */

import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";

let appCheckInstance: AppCheck | null = null;
let initAttempted = false;

export function getAppCheckSiteKey(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY.trim();
  }
  return "";
}

function isLocalHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function configureDebugToken(): void {
  if (typeof window === "undefined") return;

  const explicit = process.env.NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN?.trim();
  if (explicit) {
    (globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      explicit;
    return;
  }

  if (isLocalHost() || process.env.NODE_ENV === "development") {
    (globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      true;
  }
}

export function initAppCheck(): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (appCheckInstance) return appCheckInstance;
  if (initAttempted) return null;
  initAttempted = true;

  if (process.env.NEXT_PUBLIC_DISABLE_APP_CHECK === "true") {
    console.warn("[app-check] Disabled via NEXT_PUBLIC_DISABLE_APP_CHECK");
    return null;
  }

  const siteKey = getAppCheckSiteKey();
  if (!siteKey) {
    if (!isLocalHost()) {
      console.warn("[app-check] NEXT_PUBLIC_RECAPTCHA_SITE_KEY not set — App Check disabled");
    }
    return null;
  }

  configureDebugToken();

  try {
    const { app } = require("./firebase");

    const useEnterprise = process.env.NEXT_PUBLIC_APP_CHECK_ENTERPRISE === "true";
    const provider = useEnterprise
      ? new ReCaptchaEnterpriseProvider(siteKey)
      : new ReCaptchaV3Provider(siteKey);

    appCheckInstance = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[app-check] Initialized (${useEnterprise ? "Enterprise" : "v3"})${
          isLocalHost() ? " — register debug token in Firebase Console if needed" : ""
        }`
      );
    }
    return appCheckInstance;
  } catch (err) {
    console.error("[app-check] Initialization failed — Firestore/Auth may fail if enforcement is on:", err);
    return null;
  }
}

// Note: initAppCheck() is called explicitly from firebase.ts after the app is created.
// The require() inside initAppCheck avoids circular dependency since firebase.ts
// also imports from this module.
