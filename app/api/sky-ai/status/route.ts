import { NextResponse } from "next/server";
import { checkOpenAiHealth, openAiIssueHint } from "../../../lib/openai-health";

/** Confirms server env + whether OpenAI accepts requests (never returns the key). */
export async function GET() {
  const health = await checkOpenAiHealth();
  return NextResponse.json({
    openaiConfigured: health.configured,
    openaiReady: health.ready,
    openaiIssue: health.issue ?? null,
    hint: health.ready ? null : openAiIssueHint(health.issue),
    model: health.model,
  });
}
