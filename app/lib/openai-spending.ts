import "server-only";
import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import { logSecurityWarning } from "./security-log";
import * as admin from "firebase-admin";

interface SpendingConfig {
  dailyLimitUSD: number;
  monthlyLimitUSD: number;
  perUserDailyLimitTokens: number;
  perUserMonthlyLimitTokens: number;
  perIPDailyLimitRequests: number;
}

interface SpendingRecord {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  dailySpendUSD: number;
  monthlySpendUSD: number;
  dailyTokens: number;
  monthlyTokens: number;
  dailyRequests: number;
  monthlyRequests: number;
  lastAlertLevel: "50" | "75" | "90" | "100" | null;
}

interface UserSpending {
  uid: string;
  date: string;
  month: string;
  dailyTokens: number;
  monthlyTokens: number;
  dailyRequests: number;
  monthlyRequests: number;
}

interface IPSpending {
  ip: string;
  date: string;
  dailyRequests: number;
}

// Default configuration - can be overridden by environment variables
const DEFAULT_CONFIG: SpendingConfig = {
  dailyLimitUSD: 50, // $50/day
  monthlyLimitUSD: 1000, // $1000/month
  perUserDailyLimitTokens: 100000, // 100K tokens/day per user
  perUserMonthlyLimitTokens: 1000000, // 1M tokens/month per user
  perIPDailyLimitRequests: 50, // 50 requests/day per IP
};

/** Parse env numbers so `0` is a real cap (not treated as unset). */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function getConfig(): SpendingConfig {
  return {
    dailyLimitUSD: envNumber("OPENAI_DAILY_LIMIT_USD", DEFAULT_CONFIG.dailyLimitUSD),
    monthlyLimitUSD: envNumber("OPENAI_MONTHLY_LIMIT_USD", DEFAULT_CONFIG.monthlyLimitUSD),
    perUserDailyLimitTokens: envNumber(
      "OPENAI_PER_USER_DAILY_TOKENS",
      DEFAULT_CONFIG.perUserDailyLimitTokens
    ),
    perUserMonthlyLimitTokens: envNumber(
      "OPENAI_PER_USER_MONTHLY_TOKENS",
      DEFAULT_CONFIG.perUserMonthlyLimitTokens
    ),
    perIPDailyLimitRequests: envNumber(
      "OPENAI_PER_IP_DAILY_REQUESTS",
      DEFAULT_CONFIG.perIPDailyLimitRequests
    ),
  };
}

/** In-memory override for unit tests — never used in production. */
export type OpenAiSpendingTestState = {
  dailySpendUSD?: number;
  monthlySpendUSD?: number;
  userDailyTokens?: Record<string, number>;
  userMonthlyTokens?: Record<string, number>;
  ipDailyRequests?: Record<string, number>;
};

let spendingTestState: OpenAiSpendingTestState | null = null;
let spendingTestFailure: Error | null = null;

export function __setOpenAiSpendingForTests(state: OpenAiSpendingTestState | null): void {
  spendingTestFailure = null;
  spendingTestState = state ? { ...state } : null;
}

/** Simulate Firestore/admin tracker failure so spend-guard tests can assert fail-closed. */
export function __failOpenAiSpendingForTests(error?: Error): void {
  spendingTestState = null;
  spendingTestFailure =
    error || new Error("simulated OpenAI spend tracker error");
}

export function __resetOpenAiSpendingForTests(): void {
  spendingTestState = null;
  spendingTestFailure = null;
}

function assertTrackerAvailableForCheck(): void {
  if (spendingTestFailure) {
    throw spendingTestFailure;
  }
  if (spendingTestState) return;
  if (!isAdminInitialized()) {
    throw new Error("OpenAI spend tracker unavailable (admin not initialized)");
  }
}

/** Audio seconds -> synthetic tokens for whisper-1 (shared with openai-spend-guard). ESTIMATE. */
export const WHISPER_TOKENS_PER_SECOND = 25;

// OpenAI pricing, USD per token (ESTIMATE; update when OpenAI changes list prices).
// Every model this app uses by default MUST be listed explicitly here:
//   gpt-4o-mini (OPENAI_MODEL default), gpt-4o (OPENAI_VISION_MODEL default),
//   whisper-1 (sky-ai/transcribe).
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.00000015, output: 0.0000006 },
  "gpt-4o": { input: 0.0000025, output: 0.00001 },
  // whisper-1 is billed per audio minute ($0.006/min = $0.0001/s), not per token.
  // The spend guard maps 1 audio second to WHISPER_TOKENS_PER_SECOND input
  // "tokens" (see openai-spend-guard.ts), so the per-"token" rate is
  // $0.0001 / WHISPER_TOKENS_PER_SECOND and cost stays $0.006/min.
  "whisper-1": { input: 0.0001 / WHISPER_TOKENS_PER_SECOND, output: 0 },
};

/**
 * Unknown models are priced at the HIGHEST known per-token rate (never cheaper
 * than a known model), so a typo or a new OPENAI_MODEL cannot make the dollar
 * budget under-count. whisper-1 is excluded: its synthetic per-token rate is
 * not comparable with chat-model rates.
 */
const CHAT_PRICING_KEYS = Object.keys(PRICING).filter((k) => k !== "whisper-1");
const HIGHEST_KNOWN_PRICING = CHAT_PRICING_KEYS.reduce(
  (max, key) => {
    const p = PRICING[key];
    return p.input + p.output > max.input + max.output ? p : max;
  },
  PRICING[CHAT_PRICING_KEYS[0]]
);

/**
 * Resolve a model name to a price. Exact (case-insensitive) match first, then
 * the longest known id followed by "-" (dated snapshots such as
 * "gpt-4o-2024-08-06" or "gpt-4o-mini-2024-07-18"), else the highest known rate.
 */
export function resolveModelPricing(model: string | undefined | null): {
  input: number;
  output: number;
  known: boolean;
} {
  const id = String(model || "").trim().toLowerCase();
  if (id && PRICING[id]) return { ...PRICING[id], known: true };
  let best: string | null = null;
  for (const key of Object.keys(PRICING)) {
    if (id.startsWith(`${key}-`) && (!best || key.length > best.length)) best = key;
  }
  if (best) return { ...PRICING[best], known: true };
  return { ...HIGHEST_KNOWN_PRICING, known: false };
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = resolveModelPricing(model);
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

async function getSpendingRecord(): Promise<SpendingRecord> {
  if (spendingTestState) {
    const now = new Date();
    return {
      date: now.toISOString().slice(0, 10),
      month: now.toISOString().slice(0, 7),
      dailySpendUSD: spendingTestState.dailySpendUSD || 0,
      monthlySpendUSD: spendingTestState.monthlySpendUSD || 0,
      dailyTokens: 0,
      monthlyTokens: 0,
      dailyRequests: 0,
      monthlyRequests: 0,
      lastAlertLevel: null,
    };
  }

  if (!isAdminInitialized()) {
    return {
      date: "",
      month: "",
      dailySpendUSD: 0,
      monthlySpendUSD: 0,
      dailyTokens: 0,
      monthlyTokens: 0,
      dailyRequests: 0,
      monthlyRequests: 0,
      lastAlertLevel: null,
    };
  }

  const db = getAdminDb();
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const month = now.toISOString().slice(0, 7); // YYYY-MM

  const ref = db.collection("openaiSpending").doc("current");
  const snap = await ref.get();

  if (!snap.exists) {
    return {
      date,
      month,
      dailySpendUSD: 0,
      monthlySpendUSD: 0,
      dailyTokens: 0,
      monthlyTokens: 0,
      dailyRequests: 0,
      monthlyRequests: 0,
      lastAlertLevel: null,
    };
  }

  const data = snap.data();
  const recordDate = data?.date || "";
  const recordMonth = data?.month || "";

  // Reset daily counters if date changed
  if (recordDate !== date) {
    return {
      date,
      month,
      dailySpendUSD: 0,
      monthlySpendUSD: data?.monthlySpendUSD || 0,
      dailyTokens: 0,
      monthlyTokens: data?.monthlyTokens || 0,
      dailyRequests: 0,
      monthlyRequests: data?.monthlyRequests || 0,
      lastAlertLevel: null,
    };
  }

  // Reset monthly counters if month changed
  if (recordMonth !== month) {
    return {
      date,
      month,
      dailySpendUSD: data?.dailySpendUSD || 0,
      monthlySpendUSD: 0,
      dailyTokens: data?.dailyTokens || 0,
      monthlyTokens: 0,
      dailyRequests: data?.dailyRequests || 0,
      monthlyRequests: 0,
      lastAlertLevel: null,
    };
  }

  return {
    date,
    month,
    dailySpendUSD: data?.dailySpendUSD || 0,
    monthlySpendUSD: data?.monthlySpendUSD || 0,
    dailyTokens: data?.dailyTokens || 0,
    monthlyTokens: data?.monthlyTokens || 0,
    dailyRequests: data?.dailyRequests || 0,
    monthlyRequests: data?.monthlyRequests || 0,
    lastAlertLevel: data?.lastAlertLevel || null,
  };
}

async function updateSpendingRecord(
  inputTokens: number,
  outputTokens: number,
  model: string
): Promise<void> {
  if (!isAdminInitialized()) return;

  const db = getAdminDb();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  const cost = calculateCost(model, inputTokens, outputTokens);

  const ref = db.collection("openaiSpending").doc("current");

  await ref.set(
    {
      date,
      month,
      dailySpendUSD: admin.firestore.FieldValue.increment(cost),
      monthlySpendUSD: admin.firestore.FieldValue.increment(cost),
      dailyTokens: admin.firestore.FieldValue.increment(inputTokens + outputTokens),
      monthlyTokens: admin.firestore.FieldValue.increment(inputTokens + outputTokens),
      dailyRequests: admin.firestore.FieldValue.increment(1),
      monthlyRequests: admin.firestore.FieldValue.increment(1),
    },
    { merge: true }
  );
}

async function getUserSpending(uid: string): Promise<UserSpending> {
  if (spendingTestState) {
    const now = new Date();
    return {
      uid,
      date: now.toISOString().slice(0, 10),
      month: now.toISOString().slice(0, 7),
      dailyTokens: spendingTestState.userDailyTokens?.[uid] || 0,
      monthlyTokens: spendingTestState.userMonthlyTokens?.[uid] || 0,
      dailyRequests: 0,
      monthlyRequests: 0,
    };
  }

  if (!isAdminInitialized()) {
    return {
      uid,
      date: "",
      month: "",
      dailyTokens: 0,
      monthlyTokens: 0,
      dailyRequests: 0,
      monthlyRequests: 0,
    };
  }

  const db = getAdminDb();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  const ref = db.collection("openaiUserSpending").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    return {
      uid,
      date,
      month,
      dailyTokens: 0,
      monthlyTokens: 0,
      dailyRequests: 0,
      monthlyRequests: 0,
    };
  }

  const data = snap.data();
  const recordDate = data?.date || "";
  const recordMonth = data?.month || "";

  // Reset daily counters if date changed
  if (recordDate !== date) {
    return {
      uid,
      date,
      month,
      dailyTokens: 0,
      monthlyTokens: data?.monthlyTokens || 0,
      dailyRequests: 0,
      monthlyRequests: data?.monthlyRequests || 0,
    };
  }

  // Reset monthly counters if month changed
  if (recordMonth !== month) {
    return {
      uid,
      date,
      month,
      dailyTokens: data?.dailyTokens || 0,
      monthlyTokens: 0,
      dailyRequests: data?.dailyRequests || 0,
      monthlyRequests: 0,
    };
  }

  return {
    uid,
    date,
    month,
    dailyTokens: data?.dailyTokens || 0,
    monthlyTokens: data?.monthlyTokens || 0,
    dailyRequests: data?.dailyRequests || 0,
    monthlyRequests: data?.monthlyRequests || 0,
  };
}

async function updateUserSpending(
  uid: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  if (!isAdminInitialized()) return;

  const db = getAdminDb();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  const ref = db.collection("openaiUserSpending").doc(uid);

  await ref.set(
    {
      date,
      month,
      dailyTokens: admin.firestore.FieldValue.increment(inputTokens + outputTokens),
      monthlyTokens: admin.firestore.FieldValue.increment(inputTokens + outputTokens),
      dailyRequests: admin.firestore.FieldValue.increment(1),
      monthlyRequests: admin.firestore.FieldValue.increment(1),
    },
    { merge: true }
  );
}

async function getIPSpending(ip: string): Promise<IPSpending> {
  if (spendingTestState) {
    const now = new Date();
    return {
      ip,
      date: now.toISOString().slice(0, 10),
      dailyRequests: spendingTestState.ipDailyRequests?.[ip] || 0,
    };
  }

  if (!isAdminInitialized()) {
    return {
      ip,
      date: "",
      dailyRequests: 0,
    };
  }

  const db = getAdminDb();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);

  const ref = db.collection("openaiIPSpending").doc(ip.replace(/[^a-zA-Z0-9]/g, "_"));
  const snap = await ref.get();

  if (!snap.exists) {
    return {
      ip,
      date,
      dailyRequests: 0,
    };
  }

  const data = snap.data();
  const recordDate = data?.date || "";

  // Reset daily counters if date changed
  if (recordDate !== date) {
    return {
      ip,
      date,
      dailyRequests: 0,
    };
  }

  return {
    ip,
    date,
    dailyRequests: data?.dailyRequests || 0,
  };
}

async function updateIPSpending(ip: string): Promise<void> {
  if (!isAdminInitialized()) return;

  const db = getAdminDb();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);

  const ref = db.collection("openaiIPSpending").doc(ip.replace(/[^a-zA-Z0-9]/g, "_"));

  await ref.set(
    {
      date,
      dailyRequests: admin.firestore.FieldValue.increment(1),
    },
    { merge: true }
  );
}

export interface SpendingCheckResult {
  allowed: boolean;
  reason?: string;
  currentDailySpend: number;
  currentMonthlySpend: number;
  dailyLimit: number;
  monthlyLimit: number;
  exceededLimit?: "daily" | "monthly";
}

export interface SpendingAlertResult {
  shouldAlert: boolean;
  level: "50" | "75" | "90" | "100" | null;
  message?: string;
}

function evaluateGlobalBudgetCaps(
  spending: SpendingRecord,
  config: SpendingConfig
): { allowed: boolean; reason?: string } {
  if (spending.dailySpendUSD >= config.dailyLimitUSD) {
    logSecurityWarning("openai_daily_limit_exceeded", "OpenAI daily spend limit exceeded", {
      metadata: {
        dailySpend: spending.dailySpendUSD,
        dailyLimit: config.dailyLimitUSD,
      },
    });
    return { allowed: false, reason: "Daily spend limit exceeded" };
  }

  if (spending.monthlySpendUSD >= config.monthlyLimitUSD) {
    logSecurityWarning("openai_monthly_limit_exceeded", "OpenAI monthly spend limit exceeded", {
      metadata: {
        monthlySpend: spending.monthlySpendUSD,
        monthlyLimit: config.monthlyLimitUSD,
      },
    });
    return { allowed: false, reason: "Monthly spend limit exceeded" };
  }

  return { allowed: true };
}

/** Daily/monthly USD caps only — used by `/api/sky-ai/status`. Billed calls still use `checkSpendingLimits`. */
export async function checkGlobalBudgetCaps(): Promise<{ allowed: boolean; reason?: string }> {
  assertTrackerAvailableForCheck();
  const config = getConfig();
  const spending = await getSpendingRecord();
  return evaluateGlobalBudgetCaps(spending, config);
}

export async function checkSpendingLimits(
  uid: string | null,
  ip: string
): Promise<{ allowed: boolean; reason?: string }> {
  assertTrackerAvailableForCheck();
  const config = getConfig();
  const [spending, userSpending, ipSpending] = await Promise.all([
    getSpendingRecord(),
    uid ? getUserSpending(uid) : Promise.resolve(null),
    ip ? getIPSpending(ip) : Promise.resolve(null),
  ]);

  const global = evaluateGlobalBudgetCaps(spending, config);
  if (!global.allowed) return global;

  if (uid && userSpending) {
    if (userSpending.dailyTokens >= config.perUserDailyLimitTokens) {
      return { allowed: false, reason: "Daily token limit exceeded for this user" };
    }
    if (userSpending.monthlyTokens >= config.perUserMonthlyLimitTokens) {
      return { allowed: false, reason: "Monthly token limit exceeded for this user" };
    }
  }

  if (ipSpending && ipSpending.dailyRequests >= config.perIPDailyLimitRequests) {
    return { allowed: false, reason: "Daily request limit exceeded for this IP" };
  }

  return { allowed: true };
}

export async function recordSpending(
  uid: string | null,
  ip: string,
  inputTokens: number,
  outputTokens: number,
  model: string
): Promise<void> {
  // Persist immediately so serverless requests cannot skip the flush timer,
  // and so the next checkSpendingLimits call on this instance sees the cost.
  if (spendingTestFailure) {
    throw spendingTestFailure;
  }
  if (spendingTestState) {
    const cost = calculateCost(model, inputTokens, outputTokens);
    spendingTestState.dailySpendUSD = (spendingTestState.dailySpendUSD || 0) + cost;
    spendingTestState.monthlySpendUSD = (spendingTestState.monthlySpendUSD || 0) + cost;
    if (uid) {
      spendingTestState.userDailyTokens = spendingTestState.userDailyTokens || {};
      spendingTestState.userMonthlyTokens = spendingTestState.userMonthlyTokens || {};
      const used = inputTokens + outputTokens;
      spendingTestState.userDailyTokens[uid] =
        (spendingTestState.userDailyTokens[uid] || 0) + used;
      spendingTestState.userMonthlyTokens[uid] =
        (spendingTestState.userMonthlyTokens[uid] || 0) + used;
    }
    const ipKey = ip || "unknown";
    spendingTestState.ipDailyRequests = spendingTestState.ipDailyRequests || {};
    spendingTestState.ipDailyRequests[ipKey] =
      (spendingTestState.ipDailyRequests[ipKey] || 0) + 1;
    return;
  }

  await updateSpendingRecord(inputTokens, outputTokens, model);
  if (uid) {
    await updateUserSpending(uid, inputTokens, outputTokens);
  }
  if (ip) {
    await updateIPSpending(ip);
  }
}

export async function checkAndSendAlerts(): Promise<SpendingAlertResult> {
  const config = getConfig();
  const spending = await getSpendingRecord();

  const dailyRatio = spending.dailySpendUSD / config.dailyLimitUSD;
  const monthlyRatio = spending.monthlySpendUSD / config.monthlyLimitUSD;
  const maxRatio = Math.max(dailyRatio, monthlyRatio);

  let alertLevel: "50" | "75" | "90" | "100" | null = null;
  let message = "";

  if (maxRatio >= 1.0) {
    alertLevel = "100";
    message = "CRITICAL: OpenAI budget exceeded!";
  } else if (maxRatio >= 0.9) {
    alertLevel = "90";
    message = "WARNING: 90% of OpenAI budget used";
  } else if (maxRatio >= 0.75) {
    alertLevel = "75";
    message = "ALERT: 75% of OpenAI budget used";
  } else if (maxRatio >= 0.5) {
    alertLevel = "50";
    message = "INFO: 50% of OpenAI budget used";
  }

  // Only alert if we haven't already sent this level
  if (alertLevel && alertLevel !== spending.lastAlertLevel) {
    await sendAlert(alertLevel, message, spending, config);
    
    // Update last alert level
    if (isAdminInitialized()) {
      const db = getAdminDb();
      await db.collection("openaiSpending").doc("current").set(
        { lastAlertLevel: alertLevel },
        { merge: true }
      );
    }
  }

  return {
    shouldAlert: alertLevel !== null && alertLevel !== spending.lastAlertLevel,
    level: alertLevel,
    message,
  };
}

async function sendAlert(
  level: string,
  message: string,
  spending: SpendingRecord,
  config: SpendingConfig
): Promise<void> {
  console.warn(`[OpenAI Spending Alert] ${message}`, {
    level,
    dailySpend: spending.dailySpendUSD,
    dailyLimit: config.dailyLimitUSD,
    monthlySpend: spending.monthlySpendUSD,
    monthlyLimit: config.monthlyLimitUSD,
  });

  // Send admin notification
  if (isAdminInitialized()) {
    const { createNotification } = await import("./notifications");
    const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];
    
    for (const email of adminEmails) {
      try {
        await createNotification({
          targetEmail: email,
          fromEmail: "noreply@skydrop.app",
          type: "openai_budget_alert",
          title: `OpenAI Budget Alert: ${level}%`,
          message: `${message}\n\nDaily: $${spending.dailySpendUSD.toFixed(2)}/$${config.dailyLimitUSD}\nMonthly: $${spending.monthlySpendUSD.toFixed(2)}/$${config.monthlyLimitUSD}`,
        });
      } catch (e) {
        console.error("Failed to send OpenAI alert notification:", e);
      }
    }
  }
}

export function isBudgetExceeded(spending: SpendingRecord, config: SpendingConfig): boolean {
  return spending.dailySpendUSD >= config.dailyLimitUSD || 
         spending.monthlySpendUSD >= config.monthlyLimitUSD;
}

export async function getCurrentSpending(): Promise<SpendingRecord> {
  return await getSpendingRecord();
}

export function getConfigLimits(): SpendingConfig {
  return getConfig();
}
