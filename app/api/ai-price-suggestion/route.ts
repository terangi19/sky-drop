import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const { title, category, condition, price } = body;

    if (!title || !category) {
      return NextResponse.json({ error: "Title and category are required" }, { status: 400 });
    }

    // Call OpenAI to analyze pricing
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a pricing expert for New Zealand marketplace Sky Drop. Analyze the item and suggest a fair price range in NZD.

Return ONLY a JSON object with this exact structure:
{
  "suggestedMin": number,
  "suggestedMax": number,
  "reasoning": string,
  "marketFactors": string[],
  "confidence": "high" | "medium" | "low"
}

Consider:
- Similar items on NZ marketplaces
- Condition (New, Used - Like New, Used - Good, Used - Fair)
- Category demand
- Seasonal factors
- Typical NZ pricing

Be realistic for NZ market.`
          },
          {
            role: "user",
            content: `Item: ${title}
Category: ${category}
Condition: ${condition || "Not specified"}
Current price: ${price || "Not set"}

Suggest a fair price range and explain your reasoning.`
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!openaiResponse.ok) {
      console.error("OpenAI API error:", await openaiResponse.text());
      return NextResponse.json({ error: "Failed to analyze pricing" }, { status: 500 });
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Parse JSON response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const pricingData = JSON.parse(jsonMatch[0]);
      
      return NextResponse.json({
        success: true,
        ...pricingData,
      });
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json({ error: "Failed to parse pricing suggestion" }, { status: 500 });
    }
  } catch (error) {
    console.error("Price suggestion error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
