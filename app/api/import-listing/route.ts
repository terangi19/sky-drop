import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { isPublicHttpUrl } from "../../lib/http-url";
import { parseIpFromRequest } from "../../lib/geo-check";
import {
  OPENAI_SPEND_BLOCKED_STATUS,
  checkOpenAiSpendGate,
  createGatedOpenAI,
  spendBlockedPayload,
  withOpenAiSpendContext,
} from "../../lib/openai-spend-guard";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`import-listing:${ip}`, 10, 60_000);
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
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    return await withOpenAiSpendContext({ uid, ip }, async () => {
    const gate = await checkOpenAiSpendGate(uid, ip);
    if (!gate.allowed) {
      return NextResponse.json(spendBlockedPayload(gate), {
        status: OPENAI_SPEND_BLOCKED_STATUS,
      });
    }

    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!isPublicHttpUrl(url) || url.length > 2000) {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Detect platform from URL
    let platform = "unknown";
    if (url.includes("trademe.co.nz")) {
      platform = "trademe";
    } else if (url.includes("facebook.com") || url.includes("fb.com")) {
      platform = "facebook";
    } else if (url.includes("marketplace")) {
      platform = "marketplace";
    } else if (url.includes("trade-me")) {
      platform = "trademe";
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Failed to extract listing data" }, { status: 503 });
    }

    // Call OpenAI to extract listing data from URL
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
            content: `You are a listing data extractor for Sky Drop, a New Zealand marketplace. Extract listing information from a provided URL.

The user will provide a URL from another marketplace (TradeMe, Facebook Marketplace, etc.). Since you cannot browse the web, you should:
1. Analyze the URL structure to infer what the listing might be
2. If the URL contains identifiable information (like item name, category, etc.), extract it
3. If the URL doesn't contain enough information, ask the user to provide more details

Valid categories: Tech, Cars, Gaming, Fashion, Home, Collectibles, Sports, Other
Valid listing types: physical, digital, service, rental, vehicle, wanted
Valid conditions: New, Used - Like New, Used - Good, Used - Fair

Return ONLY a JSON object with this exact structure:
{
  "title": string | undefined,
  "description": string | undefined,
  "category": string | undefined,
  "condition": string | undefined,
  "price": string | undefined,
  "listingType": string | undefined,
  "location": string | undefined,
  "vehicleMake": string | undefined,
  "vehicleModel": string | undefined,
  "vehicleYear": string | undefined,
  "vehicleOdometer": string | undefined,
  "vehicleColour": string | undefined,
  "needsMoreInfo": boolean,
  "request": string | undefined,
  "platform": string,
  "confidence": "high" | "medium" | "low"
}

If the URL doesn't contain enough information, set needsMoreInfo: true and specify what information you need in the request field.`
          },
          {
            role: "user",
            content: `Extract listing data from this URL: "${url}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 800,
      });
    } catch (e) {
      console.error("OpenAI API error:", e);
      return NextResponse.json({ error: "Failed to extract listing data" }, { status: 500 });
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

      const listingData = JSON.parse(jsonMatch[0]);
      
      return NextResponse.json({
        success: true,
        platform,
        ...listingData,
      });
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json({ error: "Failed to parse listing data" }, { status: 500 });
    }
    });
  } catch (error) {
    console.error("URL import error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
