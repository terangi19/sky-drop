import { NextRequest, NextResponse } from "next/server";

function fallbackDescription(prompt: string, category: string): string {
  const p = prompt.trim();
  const first = p.charAt(0).toUpperCase() + p.slice(1);
  return `${first}. This item is in good condition and has been well looked after. Pickup available — feel free to message me with any questions.`;
}

async function callGemini(apiKey: string, prompt: string, category: string, model: string): Promise<string | null> {
  try {
    const sys = `You write product listings for Sky Drop, a New Zealand marketplace. Write a natural 2-4 sentence description based on the seller's notes. Do not mention the notes, the seller, or that you're an AI — just write the listing. No emoji, no markdown, no bullet points. Category: ${category || "General"}.`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${sys}\n\nSeller's notes:\n${prompt}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
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
