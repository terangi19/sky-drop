import { NextRequest, NextResponse } from "next/server";
import { parseIpFromRequest } from "../../../lib/geo-check";
import { rateLimit } from "../../../lib/rate-limit";
import { checkOpenAiHealth } from "../../../lib/openai-health";
import { withOpenAiSpendContext } from "../../../lib/openai-spend-guard";

/** Confirms server env + whether OpenAI accepts requests (never returns the key). */
export async function GET(req: NextRequest) {
  const ip = parseIpFromRequest(req.headers);
  const { allowed } = await rateLimit(`sky-ai-status:${ip}`, 100, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  return withOpenAiSpendContext({ uid: null, ip }, async () => {
    const health = await checkOpenAiHealth();
    return NextResponse.json({
      openaiConfigured: health.configured,
      openaiReady: health.ready,
    });
  });
}
