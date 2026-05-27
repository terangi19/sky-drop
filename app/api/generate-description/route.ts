import { NextRequest, NextResponse } from "next/server";

function fallbackDescription(prompt: string): string {
  const p = prompt.trim();
  if (!p) return "Item is in great condition. Pickup available — feel free to message me with any questions.";

  const lower = p.toLowerCase();
  const itemName = p.charAt(0).toUpperCase() + p.slice(1).replace(/\..*$/, "");

  let cond = "great";
  if (/new|unused|never worn/i.test(lower)) cond = "excellent, like-new";
  else if (/mint|perfect|flawless/i.test(lower)) cond = "mint";
  else if (/excellent|barely/i.test(lower)) cond = "excellent";
  else if (/good/i.test(lower)) cond = "good";
  else if (/fair|used|worn/i.test(lower)) cond = "good used";

  let details = "";
  if (/box|packaging|original/i.test(lower)) details += " Comes with original packaging.";
  if (/size/i.test(lower)) {
    const m = lower.match(/size\s*[:\-]?\s*([\d.]+(\s*(us|uk|eu|cm))?)/i);
    if (m) details += ` Size ${m[1].toUpperCase()}.`;
  }

  return `${itemName}. In ${cond} condition${details} Pickup available — message me with any questions.`;
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
      if (!text) text = await callGemini(apiKey, prompt.trim(), category || "General", "gemini-1.5-pro");
      if (!text) text = await callGemini(apiKey, prompt.trim(), category || "General", "gemini-2.0-flash-lite");
    }

    return NextResponse.json({ description: text || fallbackDescription(prompt) });
  } catch {
    return NextResponse.json({ description: fallbackDescription("") });
  }
}
