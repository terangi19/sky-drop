"use client";

import { showToast } from "../components/Toast";

let hasShownWarning = false;

/**
 * Detects if an ad blocker is blocking Firebase requests.
 * Shows a toast notification if Firebase is blocked.
 */
export function detectAdBlocker() {
  if (hasShownWarning || typeof window === "undefined") return;

  // Try to load a Firebase script - if blocked, ad blocker is active
  const testScript = document.createElement("script");
  testScript.src = "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel";
  testScript.async = true;
  
  testScript.onerror = () => {
    if (!hasShownWarning) {
      hasShownWarning = true;
      showToast(
        "Ad blocker detected. Please whitelist skydrop.co.nz, firestore.googleapis.com, and firebasestorage.googleapis.com to use all features.",
        "error"
      );
    }
  };

  testScript.onload = () => {
    // If it loads, remove it
    document.head.removeChild(testScript);
  };

  document.head.appendChild(testScript);

  // Also listen for global errors from Firebase
  const originalError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    if (typeof message === "string" && message.includes("ERR_BLOCKED_BY_CLIENT") && !hasShownWarning) {
      hasShownWarning = true;
      showToast(
        "Ad blocker detected. Please whitelist skydrop.co.nz, firestore.googleapis.com, and firebasestorage.googleapis.com to use all features.",
        "error"
      );
    }
    if (originalError) {
      return originalError(message, source, lineno, colno, error);
    }
    return false;
  };
}

/**
 * Shows the ad blocker warning manually (call this when Firebase operations fail)
 */
export function showAdBlockerWarning() {
  if (!hasShownWarning) {
    hasShownWarning = true;
    showToast(
      "Ad blocker detected. Please whitelist skydrop.co.nz, firestore.googleapis.com, and firebasestorage.googleapis.com to use all features.",
      "error"
    );
  }
}
