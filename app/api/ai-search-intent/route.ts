import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import {
  OPENAI_SPEND_BLOCKED_STATUS,
  checkOpenAiSpendGate,
  createGatedOpenAI,
  spendBlockedPayload,
  withOpenAiSpendContext,
} from "../../lib/openai-spend-guard";

export interface SearchIntent {
  category?: string;
  priceRange?: { min: number; max: number };
  location?: string;
  listingType?: string;
  condition?: string;
  keywords?: string[];
  ambiguous?: boolean;
  clarifyingQuestion?: string;
  reasoning?: string;
}

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`ai-search-intent:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let uid: string | null = null;
    try {
      const decoded = await verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    return await withOpenAiSpendContext({ uid, ip }, async () => {
    const gate = await checkOpenAiSpendGate(uid, ip);
    if (!gate.allowed) {
      return NextResponse.json(spendBlockedPayload(gate), {
        status: OPENAI_SPEND_BLOCKED_STATUS,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Failed to parse search intent" }, { status: 503 });
    }

    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }
    if (query.length > 500) {
      return NextResponse.json({ error: "Query too long (max 500 characters)" }, { status: 400 });
    }

    // Call OpenAI to parse search intent
    const openai = createGatedOpenAI({ apiKey });
    let openaiData: {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    try {
      openaiData = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a search intent parser for Sky Drop, a New Zealand marketplace. Extract structured search filters from natural language queries.

Valid categories: Tech, Cars, Gaming, Fashion, Home, Collectibles, Sports, Other
Valid listing types: physical, digital, service, rental, vehicle, wanted
Valid conditions: New, Used - Like New, Used - Good, Used - Fair

Return ONLY a JSON object with this exact structure:
{
  "category": string | undefined,
  "priceRange": { "min": number, "max": number } | undefined,
  "location": string | undefined,
  "listingType": string | undefined,
  "condition": string | undefined,
  "keywords": string[],
  "ambiguous": boolean,
  "clarifyingQuestion": string | undefined,
  "reasoning": string
}

Rules:
- Extract NZ locations (Auckland, Wellington, Christchurch, etc.)
- Parse price ranges like "under $1500" → max: 1500
- Parse "gaming PC" → keywords: ["gaming", "PC"]
- If query is ambiguous, set ambiguous: true and provide clarifyingQuestion
- Always provide reasoning for your extraction
- If no filters found, return empty object with keywords from the query`
          },
          {
            role: "user",
            content: `Parse this search query: "${query}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      });
    } catch (e) {
      console.error("OpenAI API error:", e);
      return NextResponse.json({ error: "Failed to parse search intent" }, { status: 500 });
    }
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Parse JSON response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const intent: SearchIntent = JSON.parse(jsonMatch[0]);
      
      return NextResponse.json({
        success: true,
        ...intent,
      });
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json({ error: "Failed to parse search intent" }, { status: 500 });
    }
    });
  } catch (error) {
    console.error("Search intent parsing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
