import { NextRequest, NextResponse } from "next/server";
import { parseIpFromRequest } from "../../../lib/geo-check";
import { rateLimit } from "../../../lib/rate-limit";
import { RATE_LIMITS } from "../../../lib/rate-limit-config";
import { checkOpenAiHealth } from "../../../lib/openai-health";
import { withOpenAiSpendContext } from "../../../lib/openai-spend-guard";

const STATUS_LIMIT = RATE_LIMITS.skyAiStatus;

/** Confirms server env + whether OpenAI accepts requests (never returns the key). */
export async function GET(req: NextRequest) {
  const started = Date.now();
  const ip = parseIpFromRequest(req.headers);

  const rateLimitStarted = Date.now();
  const { allowed } = await rateLimit(
    `sky-ai-status:${ip}`,
    STATUS_LIMIT.max,
    STATUS_LIMIT.windowMs,
    { fallback: "memory" }
  );
  const rateLimitMs = Date.now() - rateLimitStarted;
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const healthStarted = Date.now();
  return withOpenAiSpendContext({ uid: null, ip }, async () => {
    const health = await checkOpenAiHealth();
    const healthMs = Date.now() - healthStarted;
    return NextResponse.json(
      {
        openaiConfigured: health.configured,
        openaiReady: health.ready,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
          "Server-Timing": `rateLimit;dur=${rateLimitMs}, health;dur=${healthMs}, total;dur=${
            Date.now() - started
          }`,
        },
      }
    );
  });
}
