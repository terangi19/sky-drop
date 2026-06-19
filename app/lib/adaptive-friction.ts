/**
 * Adaptive Friction Engine
 *
 * Invisible anti-bot layer. Instead of hard blocks, applies dynamic delays,
 * probabilistic CAPTCHA, and silent downgrades based on per-user risk signals.
 *
 * Real users experience zero friction (0–200ms). Bots experience escalating
 * delays, uncertainty, and wasted actions.
 */

// ── Risk signal store (in-memory, per-instance) ──
const signalStore = new Map<string, {
  requests: number[];
  violations: number;
  firstSeen: number;
  lastAction: number;
  consecutiveSimilar: number;
  lastSimilarHash: string;
}>();

const FRICTION_LOG_PREFIX = "[friction]";

// ── Public interface ──

export interface FrictionDecision {
  /** Milliseconds to delay before responding */
  delayMs: number;
  /** Whether a CAPTCHA challenge should be triggered */
  captchaProbability: number;
  /** Whether this action should be silently downgraded (wasted effort) */
  downgrade: boolean;
  /** New risk tier after this action */
  riskTier: "low" | "medium" | "high" | "bot";
}

export interface FrictionInput {
  uid?: string;
  ip: string;
  action: "listing" | "message" | "report" | "dispute" | "signup" | "login" | "offer" | "review" | "purchase";
  /** Optional hash of content to detect repetition (e.g. listing title hash, message text hash) */
  contentHash?: string;
  /** Account age in seconds (0 if unknown/new) */
  accountAgeSec?: number;
  /** Whether the user already has a riskFlag */
  flagged?: boolean;
}

// ── Configuration ──

const TIERS = {
  low:    { baseDelayMs: 0,   maxDelayMs: 200,  captchaChance: 0.01, downgradeChance: 0 },
  medium: { baseDelayMs: 200, maxDelayMs: 1500, captchaChance: 0.03, downgradeChance: 0 },
  high:   { baseDelayMs: 500, maxDelayMs: 5000, captchaChance: 0.10, downgradeChance: 0.05 },
  bot:    { baseDelayMs: 1000,maxDelayMs: 10000,captchaChance: 0.40, downgradeChance: 0.20 },
};

const ACTION_WEIGHTS: Record<string, number> = {
  listing:  5,
  message:  1,
  report:   3,
  dispute:  4,
  signup:   2,
  login:    1,
  offer:    2,
  review:   2,
  purchase: 3,
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

// ── Simple hash for content dedup ──

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

// ── Signal tracking ──

function getOrCreateSignals(key: string) {
  let s = signalStore.get(key);
  if (!s) {
    s = { requests: [], violations: 0, firstSeen: Date.now(), lastAction: Date.now(), consecutiveSimilar: 0, lastSimilarHash: "" };
    signalStore.set(key, s);
  }
  return s;
}

function pruneSignals() {
  const cutoff = Date.now() - 3600_000;
  for (const [key, s] of signalStore) {
    if (s.lastAction < cutoff && s.requests.length === 0) signalStore.delete(key);
  }
}
setInterval(pruneSignals, 300_000);

function trackRequest(key: string, action: string, contentHash?: string) {
  const now = Date.now();
  const s = getOrCreateSignals(key);
  s.requests = s.requests.filter(t => now - t < WINDOW_MS);
  s.requests.push(now);
  s.lastAction = now;

  if (contentHash) {
    if (contentHash === s.lastSimilarHash) {
      s.consecutiveSimilar++;
    } else {
      s.consecutiveSimilar = 1;
      s.lastSimilarHash = contentHash;
    }
  }
}

// ── Risk score computation ──

function computeRiskTier(
  key: string,
  action: string,
  input: FrictionInput
): { tier: "low" | "medium" | "high" | "bot"; score: number } {
  const s = getOrCreateSignals(key);
  const now = Date.now();
  let score = 0;

  // Rate component: request count in window
  const requestCount = s.requests.filter(t => now - t < WINDOW_MS).length;
  const rateRatio = requestCount / MAX_REQUESTS_PER_WINDOW;
  score += rateRatio * 30;

  // Action weight component
  score += (ACTION_WEIGHTS[action] || 1) * 3;

  // Violations component
  score += s.violations * 15;

  // New account component
  const ageMin = input.accountAgeSec != null ? input.accountAgeSec / 60 : 0;
  if (ageMin < 10) score += 15;
  else if (ageMin < 60) score += 8;
  else if (ageMin < 1440) score += 3;

  // Content repetition component
  if (s.consecutiveSimilar > 3) score += s.consecutiveSimilar * 5;
  if (s.consecutiveSimilar > 10) score += 20;

  // Flagged users
  if (input.flagged) score += 30;

  // Trust acceleration: reduce score for established users with no violations
  if (s.violations === 0 && ageMin > 1440) {
    score = Math.max(0, score - 10);
  }
  if (s.violations === 0 && ageMin > 43200) {
    score = Math.max(0, score - 20);
  }

  // Map score to tier
  if (score >= 70) return { tier: "bot", score };
  if (score >= 40) return { tier: "high", score };
  if (score >= 15) return { tier: "medium", score };
  return { tier: "low", score };
}

// ── Delay computation with jitter ──

function jitter(ms: number): number {
  return ms + (Math.random() * ms * 0.3) - (ms * 0.15);
}

function computeDelay(tier: keyof typeof TIERS): number {
  const cfg = TIERS[tier];
  if (cfg.baseDelayMs === 0 && Math.random() > 0.3) return 0;
  const raw = cfg.baseDelayMs + Math.random() * (cfg.maxDelayMs - cfg.baseDelayMs);
  return Math.round(jitter(raw));
}

// ── Probabilistic CAPTCHA ──

function shouldCaptcha(tier: keyof typeof TIERS): boolean {
  const cfg = TIERS[tier];
  return Math.random() < cfg.captchaChance;
}

// ── Wasted effort ──

function shouldDowngrade(tier: keyof typeof TIERS): boolean {
  const cfg = TIERS[tier];
  if (cfg.downgradeChance === 0) return false;
  return Math.random() < cfg.downgradeChance;
}

// ── Public API ──

/**
 * Evaluate friction for an incoming action.
 *
 * 1. Tracks behavioral signals (request rate, content repetition)
 * 2. Computes risk tier
 * 3. Returns delay, captcha probability, and downgrade flag
 *
 * Call this at the START of each API route, before business logic.
 * Apply the delay via await sleep(decision.delayMs).
 */
export async function evaluateFriction(input: FrictionInput): Promise<FrictionDecision> {
  const key = input.uid || input.ip;
  trackRequest(key, input.action, input.contentHash ? simpleHash(input.contentHash) : undefined);

  const { tier, score } = computeRiskTier(key, input.action, input);

  const delayMs = computeDelay(tier);
  const cp = shouldCaptcha(tier);
  const downgrade = shouldDowngrade(tier);

  if (score >= 15 && process.env.NODE_ENV !== "production") {
    console.warn(`${FRICTION_LOG_PREFIX} ${input.action} | ${key.slice(0, 16)}... | tier=${tier} score=${Math.round(score)} delay=${delayMs}ms captcha=${cp} downgrade=${downgrade}`);
  }

  return { delayMs, captchaProbability: cp ? TIERS[tier].captchaChance : 0, downgrade, riskTier: tier };
}

/**
 * Record a known violation for a user (e.g., they triggered a hard rate limit).
 * Call from the rate limiter when a hard block fires.
 */
export function recordViolation(uidOrIp: string) {
  const s = getOrCreateSignals(uidOrIp);
  s.violations++;
  if (process.env.NODE_ENV !== "production") console.warn(`${FRICTION_LOG_PREFIX} violation recorded for ${uidOrIp.slice(0, 16)}... (total: ${s.violations})`);
}

/**
 * Sleep helper — use in API routes to apply adaptive delay:
 *   await applyDelay(decision.delayMs);
 */
export function applyDelay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Should we skip Turnstile verification for this request?
 * Uses probabilistic logic so bots can't predict when CAPTCHA fires.
 */
export function shouldSkipCaptcha(riskTier: "low" | "medium" | "high" | "bot"): boolean {
  return !shouldCaptcha(riskTier);
}

/**
 * Should this action be silently ignored (wasted effort)?
 * Returns true for a percentage of high-risk/bot actions.
 */
export function shouldWaste(riskTier: "low" | "medium" | "high" | "bot"): boolean {
  return shouldDowngrade(riskTier);
}
