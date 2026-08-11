/**
 * Thin camera-first vision listing route.
 * Auth + rate limit + feature flag → runVisionListing → existing listingFill schema.
 * OpenAI keys stay server-side only.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { frictionLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import { isAwhinaVisionListingEnabledServer } from "../../lib/awhina-vision-listing-flags";
import { runVisionListing } from "../../lib/awhina-vision-listing";
import type { SkyAiListingContext } from "../../lib/sky-ai-types";

export const runtime = "nodejs";
export const maxDuration = 60;

async function checkRateLimit(req: NextRequest) {
  const ip = parseIpFromRequest(req.headers);
  const authHeader = req.headers.get("authorization");
  let uid: string | null = null;
  let email = "";

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = await verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
      email = decoded.email || "";
    } catch {
      /* optional auth */
    }
  }

  const limitKey = uid ? `awhina-vision:${uid}` : `awhina-vision:ip:${ip}`;
  const max = uid ? 40 : 12;

  await frictionLimit(limitKey, max, 15 * 60_000, {
    ip,
    uid: uid ?? undefined,
    email,
    action: "sky-ai-chat",
  });

  return { uid, email };
}

export async function POST(req: NextRequest) {
  try {
    if (!isAwhinaVisionListingEnabledServer()) {
      return NextResponse.json(
        {
          ok: false,
          enabled: false,
          error: "Vision listing is not enabled",
          code: "vision_listing_disabled",
        },
        { status: 503 }
      );
    }

    const { uid } = await checkRateLimit(req);
    const body = await req.json();

    const images = Array.isArray(body.images)
      ? body.images.filter((x: unknown) => typeof x === "string").slice(0, 4)
      : [];
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
    const draftKey =
      typeof body.draftKey === "string" && body.draftKey.trim()
        ? body.draftKey.trim().slice(0, 80)
        : uid || "anon";
    const force = body.force === true;
    const listingContext =
      body.listingContext && typeof body.listingContext === "object"
        ? (body.listingContext as SkyAiListingContext)
        : null;

    const result = await runVisionListing({
      images,
      message,
      listingContext,
      draftKey,
      force,
      pathname: typeof body.pathname === "string" ? body.pathname : "/post/ai",
    });

    const status =
      result.errorCode === "vision_listing_disabled"
        ? 503
        : result.errorCode === "missing_openai_key"
          ? 503
          : result.errorCode === "no_images"
            ? 400
            : 200;

    return NextResponse.json(
      {
        ok: result.ok,
        enabled: result.enabled,
        cached: result.cached,
        reply: result.reply,
        listingFill: result.listingFill,
        displayIdentity: result.displayIdentity,
        needsIdentityConfirm: result.needsIdentityConfirm,
        missingPrompts: result.missingPrompts,
        observation: result.observation
          ? {
              overallConfidence: result.observation.overallConfidence,
              displayIdentity: result.observation.displayIdentity,
              uncertainties: result.observation.uncertainties,
              visibleCondition: result.observation.visibleCondition,
            }
          : undefined,
        suggestions: result.adapted?.suggestions,
        domain: result.domain,
        awhina: {
          intent: "vision_listing",
          routing: "awhina_vision_shared_pipeline",
          model: result.model,
          domain: result.domain,
          confidenceLevel: result.observation?.overallConfidence,
          latencyMs: result.latencyMs,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          cached: result.cached,
          degraded: result.degraded,
          aiCalls: result.aiCalls,
          timing: result.timing,
          continuity: result.adapted?.continuity,
        },
        ...(result.errorCode ? { code: result.errorCode } : {}),
      },
      { status }
    );
  } catch (err) {
    console.error("[awhina-vision]", err);
    return NextResponse.json(
      { ok: false, error: "Vision request failed", code: "vision_route_error" },
      { status: 500 }
    );
  }
}
