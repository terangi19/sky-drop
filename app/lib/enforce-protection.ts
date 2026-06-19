/**
 * Single Protection Gateway — unified entry point for ALL platform enforcement.
 *
 * Every API route that touches user-generated content MUST call this.
 * This ensures no action bypasses rate limiting, abuse scoring, idempotency,
 * or the decision engine.
 *
 * Usage:
 *   const protection = await enforceProtection(req, {
 *     action: "listing",
 *     uid: token.uid,
 *     email: token.email,
 *     ip,
 *     requestId: body.requestId,  // client-generated idempotency key
 *     turnstileToken: body.turnstileToken,
 *   });
 *   if (protection.blocked) return protection.response;
 *   // ... proceed with action ...
 */

import { NextRequest, NextResponse } from "next/server";
import {
  decide,
  applyDecisionDelay,
  persistRiskFlag,
  recordTurnstileAttempt,
  isEngineDegraded,
  type DecisionInput,
  type AbuseDecision,
} from "./abuse-decision-engine";
import { verifyTurnstileToken, isTurnstileConfigured } from "./turnstile";
import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import { isUpstashEnabled } from "./rate-limit-upstash";
import { rateLimit } from "./rate-limit";
import { registerAction } from "./account-graph";

// ── Idempotency (Redis-backed when available, in-memory fallback) ──
const IDEMPOTENCY_TTL_SEC = 90;
const idempotencyStore = new Map<string, number>();

async function checkIdempotency(requestId: string): Promise<boolean> {
  if (isUpstashEnabled()) {
    try {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (url && token) {
        const res = await fetch(`${url}/set/${requestId}/true/EX/${IDEMPOTENCY_TTL_SEC}/NX`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        // Redis returns "OK" if key was set, null if key already exists (NX)
        return data === "OK";
      }
    } catch {}
    // If Redis fails, fall through to in-memory
  }
  // Fallback: in-memory check
  const now = Date.now();
  const stored = idempotencyStore.get(requestId);
  if (stored && (now - stored) < IDEMPOTENCY_TTL_SEC * 1000) {
    return false;
  }
  idempotencyStore.set(requestId, now);
  return true;
}

// ── Action config ──

type ActionType = "listing" | "message" | "report" | "dispute" | "signup" | "login" | "offer" | "review" | "purchase" | "trade_post" | "trade_shout" | "service_inquiry";

interface ActionConfig {
  rateLimitMax: number;
  rateLimitWindowMs: number;
  requireAuth: boolean;
  requireEmailVerified: boolean;
  requireIdempotency: boolean;
  failClosed: boolean;
}

const ACTION_CONFIGS: Record<ActionType, ActionConfig> = {
  listing:        { rateLimitMax: 5,  rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: true,  requireIdempotency: true,  failClosed: true },
  message:        { rateLimitMax: 20, rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: false, requireIdempotency: false, failClosed: true },
  report:         { rateLimitMax: 20, rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: false, requireIdempotency: true,  failClosed: true },
  dispute:        { rateLimitMax: 5,  rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: false, requireIdempotency: true,  failClosed: true },
  signup:         { rateLimitMax: 3,  rateLimitWindowMs: 60_000, requireAuth: false, requireEmailVerified: false, requireIdempotency: true,  failClosed: false },
  login:          { rateLimitMax: 10, rateLimitWindowMs: 60_000, requireAuth: false, requireEmailVerified: false, requireIdempotency: false, failClosed: false },
  offer:          { rateLimitMax: 10, rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: false, requireIdempotency: true,  failClosed: true },
  review:         { rateLimitMax: 10, rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: true,  requireIdempotency: true,  failClosed: true },
  purchase:       { rateLimitMax: 10, rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: false, requireIdempotency: true,  failClosed: true },
  trade_post:     { rateLimitMax: 6,  rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: false, requireIdempotency: true,  failClosed: false },
  trade_shout:    { rateLimitMax: 10, rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: false, requireIdempotency: false, failClosed: false },
  service_inquiry:{ rateLimitMax: 15, rateLimitWindowMs: 60_000, requireAuth: true, requireEmailVerified: false, requireIdempotency: true,  failClosed: false },
};

// ── Result ──

export interface ProtectionResult {
  allowed: boolean;
  blocked: boolean;
  decision?: AbuseDecision;
  uid?: string;
  email?: string;
  response?: NextResponse;
}

// ── Gateway ──

export interface EnforceContext {
  action: ActionType;
  uid?: string;
  email?: string;
  ip: string;
  requestId?: string;
  turnstileToken?: string;
  contentHash?: string;
  accountAgeSec?: number;
  body?: Record<string, unknown>;
}

export async function enforceProtection(
  req: NextRequest,
  ctx: EnforceContext
): Promise<ProtectionResult> {
  const cfg = ACTION_CONFIGS[ctx.action];
  if (!cfg) throw new Error(`Unknown action: ${ctx.action}`);

  // 1. Idempotency check
  if (cfg.requireIdempotency && ctx.requestId) {
    if (!(await checkIdempotency(ctx.requestId))) {
      return {
        allowed: false,
        blocked: true,
        response: NextResponse.json({ error: "This action was already submitted" }, { status: 409 }),
      };
    }
  }

  // 2. Auth check
  if (cfg.requireAuth && !ctx.uid) {
    return {
      allowed: false,
      blocked: true,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  // 3. Rate limit
  const rlResult = await rateLimit(`${ctx.action}:${ctx.ip}`, cfg.rateLimitMax, cfg.rateLimitWindowMs);
  if (!rlResult.allowed && cfg.failClosed) {
    return {
      allowed: false,
      blocked: true,
      response: NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    };
  }

  // 4. Abuse decision engine
  const decisionInput: DecisionInput = {
    uid: ctx.uid,
    ip: ctx.ip,
    email: ctx.email,
    action: ctx.action as DecisionInput["action"],
    contentHash: ctx.contentHash,
    accountAgeSec: ctx.accountAgeSec,
  };

  const decision = await decide(decisionInput);
  await applyDecisionDelay(decision);

  // 5. Turnstile (probabilistic)
  if (decision.captchaRequired && isTurnstileConfigured()) {
    const token = ctx.turnstileToken || "";
    if (!token || !(await verifyTurnstileToken(token))) {
      if (ctx.uid) recordTurnstileAttempt(ctx.uid, false);
      return {
        allowed: false,
        blocked: true,
        response: NextResponse.json({ error: "Security check required", captchaRequired: true }, { status: 403 }),
      };
    }
    if (ctx.uid) recordTurnstileAttempt(ctx.uid, true);
  }

  // 6. Block verdict
  if (decision.verdict === "block") {
    if (ctx.uid) await persistRiskFlag(ctx.uid, `${ctx.action}_blocked:${decision.reason}`);
    return {
      allowed: false,
      blocked: true,
      response: NextResponse.json({ error: "Action could not be completed" }, { status: 403 }),
    };
  }

  // 7. Register graph action
  if (ctx.uid) registerAction(ctx.uid, ctx.ip, ctx.contentHash);
  if (!ctx.uid && ctx.ip) registerAction(`ip:${ctx.ip}`, ctx.ip, ctx.contentHash);

  return {
    allowed: true,
    blocked: false,
    decision,
    uid: ctx.uid,
    email: ctx.email,
  };
}
