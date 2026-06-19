/**
 * Security Metrics Aggregator
 *
 * In-memory counters for real-time observability of the abuse protection system.
 * All counters reset on instance cold start. For persistent metrics, query
 * Firestore `abuse_decision_log` and `securityEvents` collections.
 */

// ── Counter types ──

interface RouteCounter {
  requests: number;
  blocked: number;
  captchaTriggers: number;
  slowDelays: number;
  shadowDegrades: number;
}

interface MetricWindow {
  timestamp: number;
  requests: number;
  blocks: number;
  captchas: number;
  shadows: number;
  rateLimitHits: number;
}

// ── Store ──

const routeCounters = new Map<string, RouteCounter>();
const requestHistory: MetricWindow[] = [];
const decisionOutcomes = new Map<string, number>(); // verdict → count
const topIps = new Map<string, { count: number; lastSeen: number; blocked: number }>();
const topUsers = new Map<string, { uid: string; email?: string; count: number; blocked: number; lastSeen: number }>();
const windowStart = Date.now();

const WINDOW_MS = 900_000; // 15 min rolling window
const METRICS_LOG = "[metrics]";

// ── Record functions (called by enforce-protection.ts and abuse-decision-engine.ts) ──

export function recordRequest(
  route: string,
  verdict: string,
  ip: string,
  uid?: string,
  email?: string
) {
  const now = Date.now();

  // Route counter
  let rc = routeCounters.get(route);
  if (!rc) { rc = { requests: 0, blocked: 0, captchaTriggers: 0, slowDelays: 0, shadowDegrades: 0 }; routeCounters.set(route, rc); }
  rc.requests++;

  if (verdict === "block") rc.blocked++;
  if (verdict === "captcha_required") rc.captchaTriggers++;
  if (verdict === "slow") rc.slowDelays++;
  if (verdict === "shadow_degrade") rc.shadowDegrades++;

  // Decision outcomes
  decisionOutcomes.set(verdict, (decisionOutcomes.get(verdict) || 0) + 1);

  // Top IPs
  let ipEntry = topIps.get(ip);
  if (!ipEntry) { ipEntry = { count: 0, lastSeen: now, blocked: 0 }; topIps.set(ip, ipEntry); }
  ipEntry.count++;
  ipEntry.lastSeen = now;
  if (verdict === "block") ipEntry.blocked++;

  // Top users
  if (uid) {
    let uEntry = topUsers.get(uid);
    if (!uEntry) { uEntry = { uid, email, count: 0, blocked: 0, lastSeen: now }; topUsers.set(uid, uEntry); }
    uEntry.count++;
    uEntry.lastSeen = now;
    if (verdict === "block") uEntry.blocked++;
  }

  // Rolling window
  const windowKey = Math.floor(now / 60_000) * 60_000;
  let window_entry = requestHistory.find(w => w.timestamp === windowKey);
  if (!window_entry) {
    window_entry = { timestamp: windowKey, requests: 0, blocks: 0, captchas: 0, shadows: 0, rateLimitHits: 0 };
    requestHistory.push(window_entry);
  }
  window_entry.requests++;
  if (verdict === "block") window_entry.blocks++;
  if (verdict === "captcha_required") window_entry.captchas++;
  if (verdict === "shadow_degrade") window_entry.shadows++;

  // Prune old windows
  const cutoff = now - WINDOW_MS;
  for (let i = requestHistory.length - 1; i >= 0; i--) {
    if (requestHistory[i].timestamp < cutoff) requestHistory.splice(i, 1);
  }

  // Prune old IPs/users
  for (const [key, val] of topIps) { if (val.lastSeen < cutoff) topIps.delete(key); }
  for (const [key, val] of topUsers) { if (val.lastSeen < cutoff) { val.count = 0; val.lastSeen = now; } }
}

export function recordRateLimitHit(ip: string) {
  const windowKey = Math.floor(Date.now() / 60_000) * 60_000;
  let window_entry = requestHistory.find(w => w.timestamp === windowKey);
  if (!window_entry) {
    window_entry = { timestamp: windowKey, requests: 0, blocks: 0, captchas: 0, shadows: 0, rateLimitHits: 0 };
    requestHistory.push(window_entry);
  }
  window_entry.rateLimitHits++;
}

// ── Query functions ──

export function getMetrics() {
  const now = Date.now();
  const recentWindows = requestHistory.filter(w => now - w.timestamp < WINDOW_MS);
  const totalRequests = recentWindows.reduce((s, w) => s + w.requests, 0);
  const totalBlocks = recentWindows.reduce((s, w) => s + w.blocks, 0);
  const totalCaptchas = recentWindows.reduce((s, w) => s + w.captchas, 0);
  const totalShadows = recentWindows.reduce((s, w) => s + w.shadows, 0);
  const totalRateHits = recentWindows.reduce((s, w) => s + w.rateLimitHits, 0);
  const elapsedMin = (now - windowStart) / 60000;

  return {
    uptimeMinutes: Math.round(elapsedMin),
    requestsPerSecond: elapsedMin > 0 ? (totalRequests / (elapsedMin * 60)).toFixed(2) : "0",
    captchaRate: totalRequests > 0 ? ((totalCaptchas / totalRequests) * 100).toFixed(1) : "0",
    blockRate: totalRequests > 0 ? ((totalBlocks / totalRequests) * 100).toFixed(1) : "0",
    shadowRate: totalRequests > 0 ? ((totalShadows / totalRequests) * 100).toFixed(1) : "0",
    rateLimitHits: totalRateHits,
    totalRequests,
    totalBlocks,
    totalCaptchas,
    totalShadows,
    decisionDistribution: Object.fromEntries(decisionOutcomes),
    routeBreakdown: Object.fromEntries(routeCounters),
    topIps: [...topIps.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([ip, data]) => ({ ip, count: data.count, blocked: data.blocked, lastSeen: new Date(data.lastSeen).toISOString() })),
    topUsers: [...topUsers.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([uid, data]) => ({ uid, email: data.email || "", count: data.count, blocked: data.blocked })),
    timeSeries: recentWindows.map(w => ({
      time: new Date(w.timestamp).toISOString(),
      requests: w.requests,
      blocks: w.blocks,
      captchas: w.captchas,
      shadows: w.shadows,
      rateLimitHits: w.rateLimitHits,
    })),
  };
}

export function getUpstashStatus(): "active" | "fallback" | "unknown" {
  if (typeof process !== "undefined" && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return "active";
  }
  return "fallback";
}

export function getTurnstileStatus(): "active" | "disabled" {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY) {
    return "active";
  }
  return "disabled";
}
