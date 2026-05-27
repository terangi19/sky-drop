import { NextRequest, NextResponse } from "next/server";

function fallbackDescription(prompt: string, category: string): string {
  const p = prompt.trim();
  const cat = category && category !== "General" ? ` (${category})` : "";
  return `${p.charAt(0).toUpperCase() + p.slice(1)}${cat}. In good condition and ready for a new home. Please message me if you have any questions or would like to arrange a viewing.`;
}

async function callGemini(apiKey: string, systemPrompt: string, userText: string, model: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nCustomer notes:\n${userText}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
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

    const apiKey = process.env.GEMINI_API_KEY;
    const systemPrompt = `You are a listing writer for Sky Drop, a New Zealand marketplace. Write a compelling 2-4 sentence product description based on the customer's notes.

Rules:
- Write naturally, like a person selling their item
- No emoji, no markdown, no bullet points
- Do not use phrases like "I can't see the item" or "based on the notes" — just write the description
- Keep it concise and accurate to the details given
- Category: ${category || "General"}`;

    let text: string | null = null;

    // Try Gemini Flash first
    if (apiKey) {
      text = await callGemini(apiKey, systemPrompt, prompt.trim(), "gemini-2.0-flash");
      if (!text) text = await callGemini(apiKey, systemPrompt, prompt.trim(), "gemini-1.5-flash");
    }

    // Fallback to local generation
    if (!text) {
      text = fallbackDescription(prompt, category || "General");
    }

    return NextResponse.json({ description: text });
  } catch (e) {
    console.error("Generate description error:", e);
    return NextResponse.json({ description: fallbackDescription("", "General") });
  }
}
