import { NextRequest, NextResponse } from "next/server";

function fallbackDescription(prompt: string, category: string): string {
  const p = prompt.trim();
  const first = p.charAt(0).toUpperCase() + p.slice(1);
  return `${first}. This item is in good condition and has been well looked after. Pickup available — feel free to message me with any questions.`;
}

const SYSTEM_PROMPT = `You are a professional copywriter for Sky Drop, a New Zealand marketplace. Write a polished, natural product description based on the seller's notes.

Guidelines:
- Write 2-4 sentences in a warm, professional tone — like a real person selling their item
- Mention key details naturally (brand, model, size, colour, condition, what's included)
- Do not use phrases like "the seller says", "based on the notes", or "according to the customer"
- Do not mention that you're an AI or that this is a generated description
- Never use emoji, hashtags, markdown, or bullet points
- Write in plain English paragraphs only
- Category: {category}`;

async function callGemini(apiKey: string, prompt: string, category: string, model: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM_PROMPT.replace("{category}", category || "General")}\n\nSeller's notes:\n${prompt}` }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 300 },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, category } = await req.json();
    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: "No details provided" }, { status: 400 });
    }

    let text: string | null = null;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      text = await callGemini(apiKey, prompt.trim(), category || "General", "gemini-2.0-flash");
      if (!text) text = await callGemini(apiKey, prompt.trim(), category || "General", "gemini-1.5-flash");
    }

    return NextResponse.json({ description: text || fallbackDescription(prompt, category || "General") });
  } catch {
    return NextResponse.json({ description: fallbackDescription("", "General") });
  }
}
