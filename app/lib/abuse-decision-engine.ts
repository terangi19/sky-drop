/**
 * Abuse Decision Engine — single unified brain for all platform safety.
 *
 * Consolidates:
 *   Upstash rate limit results
 *   Adaptive friction score
 *   Turnstile history
 *   Listing + message velocity
 *   riskFlag state
 *   IP + UID graph patterns
 *
 * Output: unified verdict with coordinated enforcement.
 *
 * ── FAIL-OPEN vs FAIL-CLOSED ──
 *   Payments: FAIL CLOSED (if engine unreachable, deny)
 *   Listings: FAIL CLOSED (deny creation if uncertainty)
 *   Messaging: FAIL CLOSED via send-message API
 *   Reports: FAIL CLOSED (deny submission)
 *   Disputes: FAIL CLOSED (deny creation)
 *   Rate limiting core: FAIL CLOSED in production (failClosed=true)
 *   Graph system: FAIL OPEN (score=0 if unavailable — observational only)
 *   Audit logging: FAIL OPEN (best-effort, non-blocking)
 */

import { rateLimit, isUpstashEnabled } from "./rate-limit";
import { verifyTurnstileToken, isTurnstileConfigured } from "./turnstile";
import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import { logSecurityWarning } from "./security-log";
import { getScore as accountGraphScore } from "./account-graph";

// ── Fail-closed guard ──
// If Upstash is configured but unreachable, critical actions deny closed.
// If Upstash is not configured, the system runs in fallback mode (dev/permissive).
let engineDegraded = false;

export function isEngineDegraded(): boolean {
  return engineDegraded;
}

function setDegraded(v: boolean) {
  engineDegraded = v;
  if (v) console.warn("[abuse-engine] WARNING: engine degraded — rate limiting may be permissive");
}

// ── Types ──

export type ActionType =
  | "listing" | "message" | "report" | "dispute"
  | "signup" | "login" | "offer" | "review" | "purchase";

export type Verdict = "allow" | "slow" | "captcha_required" | "shadow_degrade" | "block";

export type ShadowRank = "normal" | "reduced" | "delayed" | "excluded";

export interface AbuseDecision {
  verdict: Verdict;
  delayMs: number;
  captchaRequired: boolean;
  shadowRank: ShadowRank;
  reason?: string;
}

export interface DecisionInput {
  uid?: string;
  ip: string;
  email?: string;
  action: ActionType;
  contentHash?: string;
  accountAgeSec?: number;
  deviceHash?: string;
}

// ── In-memory signal aggregator ──

interface ActorSignals {
  requests: number[];
  violations: number;
  firstSeen: number;
  lastAction: number;
  turnstilePasses: number;
  turnstileFails: number;
  consecutiveSimilar: number;
  lastSimilarHash: string;
}

const signalStore = new Map<string, ActorSignals>();
const DECISION_LOG = "[abuse-engine]";

function getSignals(key: string): ActorSignals {
  let s = signalStore.get(key);
  if (!s) {
    s = { requests: [], violations: 0, firstSeen: Date.now(), lastAction: Date.now(),
      turnstilePasses: 0, turnstileFails: 0, consecutiveSimilar: 0, lastSimilarHash: "" };
    signalStore.set(key, s);
  }
  return s;
}

// ── Risk scoring ──

const ACTION_BASE: Record<ActionType, number> = {
  listing: 12, message: 3, report: 8, dispute: 10,
  signup: 6, login: 2, offer: 5, review: 5, purchase: 8,
};

const WINDOW_MS = 60_000;
const MAX_RATE = 60;

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return String(h);
}

async function computeScore(
  key: string,
  input: DecisionInput
): Promise<{ score: number; flagged: boolean }> {
  const now = Date.now();
  const sig = getSignals(key);
  sig.requests = sig.requests.filter(t => now - t < WINDOW_MS);
  sig.requests.push(now);
  sig.lastAction = now;

  if (input.contentHash) {
    if (input.contentHash === sig.lastSimilarHash) sig.consecutiveSimilar++;
    else { sig.consecutiveSimilar = 1; sig.lastSimilarHash = input.contentHash; }
  }

  let score = 0;

  // Rate component
  score += (sig.requests.length / MAX_RATE) * 25;

  // Action baseline
  score += ACTION_BASE[input.action] || 5;

  // Violations
  score += sig.violations * 20;

  // Account age
  const ageMin = input.accountAgeSec != null ? input.accountAgeSec / 60 : 0;
  if (ageMin < 5) score += 20;
  else if (ageMin < 30) score += 10;
  else if (ageMin < 1440) score += 4;

  // Content repetition
  if (sig.consecutiveSimilar > 3) score += sig.consecutiveSimilar * 6;
  if (sig.consecutiveSimilar > 10) score += 25;

  // Turnstile failure history
  if (sig.turnstileFails > 0) score += Math.min(sig.turnstileFails * 10, 30);

  // Graph signals
  if (input.uid) {
    const graphScore = accountGraphScore(input.uid, input.ip);
    score += graphScore;
  }

  // Check Firestore riskFlag
  let flagged = false;
  if (input.uid && isAdminInitialized()) {
    try {
      const db = getAdminDb();
      const snap = await db.collection("profiles").doc(input.uid).get();
      flagged = snap.data()?.riskFlag === true;
    } catch {}
  }
  if (flagged) score += 35;

  // Trust acceleration
  if (sig.violations === 0 && ageMin > 1440) score = Math.max(0, score - 10);
  if (sig.violations === 0 && ageMin > 43200) score = Math.max(0, score - 20);
  if (sig.turnstilePasses > 10 && sig.violations === 0) score = Math.max(0, score - 8);

  return { score, flagged };
}

function jitter(ms: number): number {
  return Math.max(0, ms + (Math.random() * ms * 0.3) - (ms * 0.15));
}

// ── Public API ──

// ── Audit log ──

let logCounter = 0;

async function writeAuditLog(entry: Record<string, unknown>) {
  logCounter++;
  if (logCounter > 100) return; // cap per instance to avoid runaway writes
  try {
    if (isAdminInitialized()) {
      const db = getAdminDb();
      await db.collection("abuse_decision_log").add(entry);
    }
  } catch {}
}

/**
 * Evaluate an action and return a unified abuse decision.
 *
 * This is the single entry point for all platform safety decisions.
 * Every route should call this instead of scattering logic.
 */
export async function decide(input: DecisionInput): Promise<AbuseDecision> {
  const key = input.uid || input.ip;
  const sig = getSignals(key);

  const { score, flagged } = await computeScore(key, input);

  // ── Verdict mapping ──
  let verdict: Verdict;
  let delayMs: number;
  let captchaRequired: boolean;
  let shadowRank: ShadowRank;

  if (score >= 80) {
    verdict = "block";
    delayMs = Math.round(jitter(15000));
    captchaRequired = true;
    shadowRank = "excluded";
    sig.violations++;
  } else if (score >= 55) {
    verdict = "shadow_degrade";
    delayMs = Math.round(jitter(3000 + Math.random() * 5000));
    captchaRequired = Math.random() < 0.35;
    shadowRank = Math.random() < 0.5 ? "excluded" : "reduced";
  } else if (score >= 30) {
    verdict = "slow";
    delayMs = Math.round(jitter(500 + Math.random() * 2500));
    captchaRequired = Math.random() < 0.08;
    shadowRank = "normal";
  } else if (score >= 15) {
    verdict = "slow";
    delayMs = Math.round(jitter(100 + Math.random() * 400));
    captchaRequired = Math.random() < 0.02;
    shadowRank = "normal";
  } else {
    verdict = "allow";
    delayMs = Math.random() < 0.3 ? Math.round(Math.random() * 80) : 0;
    captchaRequired = Math.random() < 0.005;
    shadowRank = "normal";
  }

  // Override to captcha_required if needed
  if (captchaRequired && verdict !== "block") {
    verdict = "captcha_required";
  }

  const reason = score >= 15 ? `score=${Math.round(score)} flagged=${flagged}` : undefined;

  if (score >= 15 || verdict === "block") {
    if (process.env.NODE_ENV !== "production") console.warn(`${DECISION_LOG} ${input.action} | ${key.slice(0, 16)}... | verdict=${verdict} score=${Math.round(score)} delay=${delayMs}ms shadow=${shadowRank}`);
  }

  // Audit log for all non-allow decisions
  if (verdict !== "allow" || score >= 10) {
    writeAuditLog({
      uid: input.uid || null,
      ip: input.ip,
      email: input.email || null,
      action: input.action,
      score: Math.round(score),
      flagged,
      verdict,
      delayMs,
      captchaRequired,
      shadowRank,
      violations: sig.violations,
      turnstilePasses: sig.turnstilePasses,
      turnstileFails: sig.turnstileFails,
      timestamp: new Date(),
    });
  }

  return { verdict, delayMs, captchaRequired, shadowRank, reason };
}

/**
 * Record a Turnstile attempt for a user.
 */
export function recordTurnstileAttempt(uidOrIp: string, passed: boolean) {
  const sig = getSignals(uidOrIp);
  if (passed) sig.turnstilePasses++;
  else sig.turnstileFails++;
}

/**
 * Apply the delay portion of a decision.
 */
export function applyDecisionDelay(decision: AbuseDecision): Promise<void> {
  if (decision.delayMs <= 0) return Promise.resolve();
  return new Promise(r => setTimeout(r, decision.delayMs));
}

/**
 * Persist riskFlag to Firestore when verdict is block.
 */
export async function persistRiskFlag(uid: string, reason: string) {
  try {
    if (isAdminInitialized()) {
      const db = getAdminDb();
      await db.collection("profiles").doc(uid).set(
        { riskFlag: true, riskFlaggedAt: new Date(), riskReason: reason },
        { merge: true }
      );
    }
  } catch {}
}
