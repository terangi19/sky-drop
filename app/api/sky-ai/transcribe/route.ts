import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { parseIpFromRequest } from "../../../lib/geo-check";
import { rateLimit } from "../../../lib/rate-limit";
import { openaiErrorResponse } from "../../../lib/openai-errors";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // 8 MB

/** Fallback STT when browser Web Speech API is blocked (e.g. Brave cloud STT). */
export async function POST(req: NextRequest) {
  const ip = parseIpFromRequest(req.headers);
  const { allowed } = await rateLimit(`sky-ai-transcribe:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests — wait a moment." }, { status: 429 });
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "Voice transcription is unavailable — type your message instead." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid audio upload." }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording too long — keep it under 20 seconds." }, { status: 413 });
  }

  const openai = new OpenAI({ apiKey: key });

  try {
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "en",
      prompt: "Sky Drop marketplace New Zealand. Navigation: services, sell, messages, profile.",
    });

    const text = (transcription.text || "").trim();
    return NextResponse.json({ text });
  } catch (err) {
    const mapped = openaiErrorResponse(err);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
}
