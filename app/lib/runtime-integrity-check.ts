/**
 * Runtime Integrity Check
 *
 * Runs on server startup and when queried via API. Validates that all
 * security subsystems are operational and configured correctly.
 */

import { getUpstashStatus, getTurnstileStatus } from "./security-metrics";
import { isAdminInitialized } from "./firebase-admin";

export interface IntegrityStatus {
  overall: "HEALTHY" | "DEGRADED" | "UNSAFE";
  checks: IntegrityCheck[];
  timestamp: string;
}

interface IntegrityCheck {
  name: string;
  status: "ok" | "degraded" | "failed" | "disabled";
  message: string;
}

let cachedResult: IntegrityStatus | null = null;
let lastCheck = 0;
const CHECK_TTL_MS = 60_000;

export async function runIntegrityCheck(): Promise<IntegrityStatus> {
  const now = Date.now();
  if (cachedResult && (now - lastCheck) < CHECK_TTL_MS) return cachedResult;

  const checks: IntegrityCheck[] = [];

  // 1. Firebase Admin SDK
  const adminInit = isAdminInitialized();
  checks.push({
    name: "Firebase Admin SDK",
    status: adminInit ? "ok" : "failed",
    message: adminInit ? "Initialized" : "FIREBASE_SERVICE_ACCOUNT not set or invalid",
  });

  // 2. Upstash Redis
  const upstash = getUpstashStatus();
  checks.push({
    name: "Upstash Redis",
    status: upstash === "active" ? "ok" : "degraded",
    message: upstash === "active" ? "Distributed rate limiting active" : "Running in fallback mode (Firestore + in-memory)",
  });

  // 3. Turnstile / CAPTCHA
  const turnstile = getTurnstileStatus();
  checks.push({
    name: "Cloudflare Turnstile",
    status: turnstile === "active" ? "ok" : "disabled",
    message: turnstile === "active" ? "Bot protection active" : "Not configured — CAPTCHA skipped",
  });

  // 4. Stripe
  const stripeKey = process.env.STRIPE_SECRET_KEY ? true : false;
  checks.push({
    name: "Stripe Payments",
    status: stripeKey ? "ok" : "failed",
    message: stripeKey ? "Configured" : "STRIPE_SECRET_KEY not set",
  });

  // 5. Admin emails
  const adminEmails = process.env.ADMIN_EMAILS ? true : false;
  checks.push({
    name: "Admin Access Control",
    status: adminEmails ? "ok" : "degraded",
    message: adminEmails ? "ADMIN_EMAILS configured" : "No admin emails set — admin access may be broken",
  });

  // 6. Cookie secret
  const cookieSecret = process.env.COOKIE_SECRET ? true : false;
  checks.push({
    name: "Admin Session Cookie",
    status: cookieSecret ? "ok" : "degraded",
    message: cookieSecret ? "Configured" : "COOKIE_SECRET not set — admin session auth unavailable",
  });

  // 7. Sentry
  const sentryConfigured = process.env.SENTRY_ORG && process.env.SENTRY_PROJECT ? true : false;
  checks.push({
    name: "Sentry Error Tracking",
    status: sentryConfigured ? "ok" : "disabled",
    message: sentryConfigured ? "Configured" : "Not configured — errors may go unnoticed",
  });

  // Compute overall
  const failedCount = checks.filter(c => c.status === "failed").length;
  const degradedCount = checks.filter(c => c.status === "degraded").length;
  let overall: "HEALTHY" | "DEGRADED" | "UNSAFE";
  if (failedCount > 0) overall = "UNSAFE";
  else if (degradedCount > 0) overall = "DEGRADED";
  else overall = "HEALTHY";

  const result: IntegrityStatus = { overall, checks, timestamp: new Date().toISOString() };
  cachedResult = result;
  lastCheck = now;

  console.log(`[integrity-check] ${overall} — ${checks.filter(c => c.status === "ok").length}/${checks.length} subsystems OK`);
  if (degradedCount > 0) {
    for (const c of checks.filter(c => c.status === "degraded")) {
      console.log(`[integrity-check] DEGRADED: ${c.name} — ${c.message}`);
    }
  }
  if (failedCount > 0) {
    for (const c of checks.filter(c => c.status === "failed")) {
      console.log(`[integrity-check] FAILED: ${c.name} — ${c.message}`);
    }
  }

  return result;
}
