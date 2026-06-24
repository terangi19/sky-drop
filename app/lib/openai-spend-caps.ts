/**
 * OpenAI Spend Caps and Rate Limits
 * 
 * Prevents unlimited OpenAI spending by enforcing:
 * - Daily spend cap per user
 * - Monthly spend cap per user
 * - Global daily spend cap
 * - Global monthly spend cap
 * - Rate limits per user
 * 
 * If limits are reached, fallback mode is activated.
 */

interface SpendLimits {
  dailyUserCap: number; // USD per user per day
  monthlyUserCap: number; // USD per user per month
  dailyGlobalCap: number; // USD total per day
  monthlyGlobalCap: number; // USD total per month
  rateLimitPerUser: number; // Requests per minute per user
}

const SPEND_LIMITS: SpendLimits = {
  dailyUserCap: 1.00, // $1 per user per day
  monthlyUserCap: 10.00, // $10 per user per month
  dailyGlobalCap: 50.00, // $50 total per day
  monthlyGlobalCap: 500.00, // $500 total per month
  rateLimitPerUser: 10, // 10 requests per minute per user
};

interface SpendTracking {
  userId: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  dailySpend: number;
  monthlySpend: number;
  requestCount: number;
  lastRequestTime: number;
}

/**
 * Check if user can make OpenAI request
 * Returns true if allowed, false if limit reached
 */
export async function canMakeOpenAIRequest(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  // Check rate limit (in-memory for simplicity, use Redis in production)
  const rateLimitKey = `openai-rate-limit-${userId}`;
  const now = Date.now();
  const lastRequest = parseInt(localStorage.getItem(rateLimitKey) || "0");
  
  if (now - lastRequest < 60000 / SPEND_LIMITS.rateLimitPerUser) {
    return { allowed: false, reason: "Rate limit exceeded. Please wait a moment." };
  }
  
  // Update last request time
  localStorage.setItem(rateLimitKey, now.toString());
  
  // Check spend limits (would use Firestore in production)
  const today = new Date().toISOString().split("T")[0];
  const month = today.substring(0, 7);
  
  const dailySpend = await getUserDailySpend(userId, today);
  const monthlySpend = await getUserMonthlySpend(userId, month);
  
  if (dailySpend >= SPEND_LIMITS.dailyUserCap) {
    return { allowed: false, reason: `Daily spend cap of $${SPEND_LIMITS.dailyUserCap} reached.` };
  }
  
  if (monthlySpend >= SPEND_LIMITS.monthlyUserCap) {
    return { allowed: false, reason: `Monthly spend cap of $${SPEND_LIMITS.monthlyUserCap} reached.` };
  }
  
  // Check global limits
  const globalDailySpend = await getGlobalDailySpend(today);
  const globalMonthlySpend = await getGlobalMonthlySpend(month);
  
  if (globalDailySpend >= SPEND_LIMITS.dailyGlobalCap) {
    return { allowed: false, reason: "Global daily spend cap reached. Please try again tomorrow." };
  }
  
  if (globalMonthlySpend >= SPEND_LIMITS.monthlyGlobalCap) {
    return { allowed: false, reason: "Global monthly spend cap reached. Please try again next month." };
  }
  
  return { allowed: true };
}

/**
 * Record OpenAI spend after successful request
 */
export async function recordOpenAISpend(userId: string, costUSD: number): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const month = today.substring(0, 7);
  
  // Record user spend (would use Firestore in production)
  await recordUserSpend(userId, today, month, costUSD);
  
  // Record global spend (would use Firestore in production)
  await recordGlobalSpend(today, month, costUSD);
}

/**
 * Get fallback response when limits are reached
 */
export function getFallbackResponse(): string {
  return "I'm currently unable to process your request due to usage limits. Please try again later or contact support.";
}

// In production, these would interact with Firestore
// For now, using localStorage as a simple implementation

async function getUserDailySpend(userId: string, date: string): Promise<number> {
  const key = `openai-spend-${userId}-${date}`;
  return parseFloat(localStorage.getItem(key) || "0");
}

async function getUserMonthlySpend(userId: string, month: string): Promise<number> {
  const key = `openai-spend-${userId}-${month}`;
  return parseFloat(localStorage.getItem(key) || "0");
}

async function getGlobalDailySpend(date: string): Promise<number> {
  const key = `openai-global-spend-${date}`;
  return parseFloat(localStorage.getItem(key) || "0");
}

async function getGlobalMonthlySpend(month: string): Promise<number> {
  const key = `openai-global-spend-${month}`;
  return parseFloat(localStorage.getItem(key) || "0");
}

async function recordUserSpend(userId: string, date: string, month: string, cost: number): Promise<void> {
  const dailyKey = `openai-spend-${userId}-${date}`;
  const monthlyKey = `openai-spend-${userId}-${month}`;
  
  const currentDaily = parseFloat(localStorage.getItem(dailyKey) || "0");
  const currentMonthly = parseFloat(localStorage.getItem(monthlyKey) || "0");
  
  localStorage.setItem(dailyKey, (currentDaily + cost).toString());
  localStorage.setItem(monthlyKey, (currentMonthly + cost).toString());
}

async function recordGlobalSpend(date: string, month: string, cost: number): Promise<void> {
  const dailyKey = `openai-global-spend-${date}`;
  const monthlyKey = `openai-global-spend-${month}`;
  
  const currentDaily = parseFloat(localStorage.getItem(dailyKey) || "0");
  const currentMonthly = parseFloat(localStorage.getItem(monthlyKey) || "0");
  
  localStorage.setItem(dailyKey, (currentDaily + cost).toString());
  localStorage.setItem(monthlyKey, (currentMonthly + cost).toString());
}

export { SPEND_LIMITS };
export type { SpendLimits, SpendTracking };
