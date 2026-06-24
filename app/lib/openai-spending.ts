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

function getConfig(): SpendingConfig {
  return {
    dailyLimitUSD: Number(process.env.OPENAI_DAILY_LIMIT_USD) || DEFAULT_CONFIG.dailyLimitUSD,
    monthlyLimitUSD: Number(process.env.OPENAI_MONTHLY_LIMIT_USD) || DEFAULT_CONFIG.monthlyLimitUSD,
    perUserDailyLimitTokens: Number(process.env.OPENAI_PER_USER_DAILY_TOKENS) || DEFAULT_CONFIG.perUserDailyLimitTokens,
    perUserMonthlyLimitTokens: Number(process.env.OPENAI_PER_USER_MONTHLY_TOKENS) || DEFAULT_CONFIG.perUserMonthlyLimitTokens,
    perIPDailyLimitRequests: Number(process.env.OPENAI_PER_IP_DAILY_REQUESTS) || DEFAULT_CONFIG.perIPDailyLimitRequests,
  };
}

// OpenAI pricing (gpt-4o-mini as of 2024)
const PRICING = {
  "gpt-4o-mini": { input: 0.00000015, output: 0.0000006 }, // per token
  "gpt-4o": { input: 0.0000025, output: 0.00001 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING["gpt-4o-mini"];
  return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}

async function getSpendingRecord(): Promise<SpendingRecord> {
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

export async function checkSpendingLimits(
  uid: string | null,
  ip: string
): Promise<{ allowed: boolean; reason?: string }> {
  const config = getConfig();
  const spending = await getSpendingRecord();

  // Check daily limit
  if (spending.dailySpendUSD >= config.dailyLimitUSD) {
    logSecurityWarning("openai_daily_limit_exceeded", "OpenAI daily spend limit exceeded", {
      metadata: {
        dailySpend: spending.dailySpendUSD,
        dailyLimit: config.dailyLimitUSD,
      },
    });
    return { allowed: false, reason: "Daily spend limit exceeded" };
  }

  // Check monthly limit
  if (spending.monthlySpendUSD >= config.monthlyLimitUSD) {
    logSecurityWarning("openai_monthly_limit_exceeded", "OpenAI monthly spend limit exceeded", {
      metadata: {
        monthlySpend: spending.monthlySpendUSD,
        monthlyLimit: config.monthlyLimitUSD,
      },
    });
    return { allowed: false, reason: "Monthly spend limit exceeded" };
  }

  // Check per-user limits
  if (uid) {
    const userSpending = await getUserSpending(uid);
    if (userSpending.dailyTokens >= config.perUserDailyLimitTokens) {
      return { allowed: false, reason: "Daily token limit exceeded for this user" };
    }
    if (userSpending.monthlyTokens >= config.perUserMonthlyLimitTokens) {
      return { allowed: false, reason: "Monthly token limit exceeded for this user" };
    }
  }

  // Check per-IP limits
  const ipSpending = await getIPSpending(ip);
  if (ipSpending.dailyRequests >= config.perIPDailyLimitRequests) {
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
  await updateSpendingRecord(inputTokens, outputTokens, model);
  if (uid) {
    await updateUserSpending(uid, inputTokens, outputTokens);
  }
  await updateIPSpending(ip);
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
