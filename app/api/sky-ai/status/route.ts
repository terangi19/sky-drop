import { NextRequest, NextResponse } from "next/server";
import { parseIpFromRequest } from "../../../lib/geo-check";
import { rateLimit } from "../../../lib/rate-limit";
import { checkOpenAiHealth, openAiIssueHint } from "../../../lib/openai-health";

/** Confirms server env + whether OpenAI accepts requests (never returns the key). */
export async function GET(req: NextRequest) {
  const ip = parseIpFromRequest(req.headers);
  const { allowed } = await rateLimit(`sky-ai-status:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const health = await checkOpenAiHealth();
  return NextResponse.json({
    openaiConfigured: health.configured,
    openaiReady: health.ready,
    openaiIssue: health.issue ?? null,
    hint: health.ready ? null : openAiIssueHint(health.issue),
    model: health.model,
  });
}
