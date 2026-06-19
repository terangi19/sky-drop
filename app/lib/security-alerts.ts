/**
 * Security Alert System
 *
 * Monitors metrics thresholds and triggers alerts via Discord webhook (primary)
 * and email (Resend fallback).
 *
 * Called periodically by the security dashboard or by metrics check endpoints.
 */

const ALERT_LOG = "[security-alert]";
const ALERT_COOLDOWN_MS = 300_000; // 5 min between same alert types
const alertCooldowns = new Map<string, number>();

interface AlertPayload {
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
}

// ── Discord webhook ──

async function sendDiscordAlert(payload: AlertPayload): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return false;

  const colors = { info: 3066993, warning: 16776960, critical: 15158332 };
  const embed = {
    title: payload.title,
    description: payload.message,
    color: colors[payload.severity],
    timestamp: new Date().toISOString(),
    fields: payload.metadata
      ? Object.entries(payload.metadata).map(([name, value]) => ({ name, value: String(value), inline: true }))
      : [],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Email alert (Resend fallback) ──

async function sendEmailAlert(payload: AlertPayload): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim();
  if (!resendKey || !adminEmail) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.SMTP_FROM || "alerts@skydrop.app",
        to: adminEmail,
        subject: `[${payload.severity.toUpperCase()}] ${payload.title}`,
        text: `${payload.message}\n\n${payload.metadata ? JSON.stringify(payload.metadata, null, 2) : ""}`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Core alert function ──

async function fireAlert(payload: AlertPayload): Promise<void> {
  // Cooldown check
  const cooldownKey = payload.title;
  const lastFired = alertCooldowns.get(cooldownKey) || 0;
  if (Date.now() - lastFired < ALERT_COOLDOWN_MS) return;
  alertCooldowns.set(cooldownKey, Date.now());

  console.log(`${ALERT_LOG} [${payload.severity}] ${payload.title}: ${payload.message}`);

  const discordSent = await sendDiscordAlert(payload);
  if (!discordSent) {
    await sendEmailAlert(payload);
  }
}

// ── Public check functions ──

export async function checkCaptchaRate(captchaRate: number, totalRequests: number) {
  if (totalRequests < 50) return; // not enough data
  if (captchaRate > 15) {
    await fireAlert({
      title: "High CAPTCHA Trigger Rate",
      message: `CAPTCHA rate is ${captchaRate.toFixed(1)}% (threshold: 15%). Possible bot wave.`,
      severity: "warning",
      metadata: { captchaRate: `${captchaRate.toFixed(1)}%`, totalRequests },
    });
  }
}

export async function checkBlockSpike(currentBlocks: number, baselineBlocks: number) {
  if (baselineBlocks === 0) return;
  const ratio = currentBlocks / baselineBlocks;
  if (ratio > 2) {
    await fireAlert({
      title: "Block Rate Spike Detected",
      message: `Block rate is ${ratio.toFixed(1)}x baseline. Possible attack in progress.`,
      severity: "critical",
      metadata: { currentBlocks, baselineBlocks, ratio: ratio.toFixed(1) },
    });
  }
}

export async function checkUpstashFallback() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    await fireAlert({
      title: "Upstash Redis Fallback Active",
      message: "Rate limiting running in fallback mode. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      severity: "warning",
    });
  }
}

export async function checkBotFarmScore(score: number) {
  if (score > 50) {
    await fireAlert({
      title: "Bot Farm Score Threshold Exceeded",
      message: `Account graph detected abnormal clustering (score: ${score}).`,
      severity: "critical",
      metadata: { accountGraphScore: score },
    });
  }
}

export async function sendTestAlert() {
  await fireAlert({
    title: "Security Alert System Test",
    message: "This is a test alert to verify the security alert system is working.",
    severity: "info",
  });
}
