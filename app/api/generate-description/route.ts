import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt, category } = await req.json();

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: "No details provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const systemPrompt = `You are a listing writer for Sky Drop, a New Zealand marketplace. Write a compelling 2-4 sentence product description based on the customer's notes.

Rules:
- Write naturally, like a person selling their item
- No emoji, no markdown, no bullet points
- Do not use phrases like "I can't see the item" or "based on the notes" — just write the description
- Keep it concise and accurate to the details given
- Category: ${category || "General"}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${systemPrompt}\n\nCustomer notes:\n${prompt.trim()}` }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 200,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 502 });
    }

    return NextResponse.json({ description: text });
  } catch (e) {
    console.error("Generate description error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
