import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

/* ── Live market research helpers ── */

async function searchWeb(query: string): Promise<string> {
  // Prefer SerpAPI if available
  const serpApiKey = process.env.SERPAPI_KEY;
  if (serpApiKey) {
    try {
      const url = new URL("https://serpapi.com/search");
      url.searchParams.set("q", query);
      url.searchParams.set("engine", "google");
      url.searchParams.set("gl", "nz");
      url.searchParams.set("hl", "en");
      url.searchParams.set("num", "5");
      url.searchParams.set("api_key", serpApiKey);
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (res.ok) {
        const data = await res.json();
        const snippets: string[] = [];
        for (const item of data.answer_box?.contents || [data.answer_box]) {
          if (item?.snippet) snippets.push(item.snippet);
        }
        for (const r of data.organic_results || []) {
          if (r?.snippet) snippets.push(r.snippet);
        }
        for (const r of data.related_questions || []) {
          if (r?.snippet) snippets.push(r.snippet);
        }
        return snippets.slice(0, 8).join("\n").trim();
      }
    } catch (e) {
      console.warn("SerpAPI search failed:", e);
    }
  }

  // Fallback to Google Custom Search
  const googleKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (googleKey && cx) {
    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("q", query);
      url.searchParams.set("cx", cx);
      url.searchParams.set("key", googleKey);
      url.searchParams.set("num", "5");
      url.searchParams.set("gl", "nz");
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (res.ok) {
        const data = await res.json();
        const snippets = (data.items || [])
          .map((i: any) => i.snippet)
          .filter(Boolean)
          .slice(0, 8);
        return snippets.join("\n").trim();
      }
    } catch (e) {
      console.warn("Google Custom Search failed:", e);
    }
  }

  return "";
}

async function fetchMarketResearch(
  title: string,
  category: string,
  context: Record<string, unknown>
): Promise<string> {
  const q = `${title} ${category} price New Zealand`.replace(/\s+/g, " ").trim();
  const snippets = await searchWeb(q);
  if (snippets) {
    return `Live NZ web search results:\n${snippets}`;
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`ai-price-suggestion:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

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
    const {
      title,
      description,
      category,
      listingType,
      condition,
      price,
      location,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleOdometer,
      vehicleBodyType,
      vehicleFuelType,
      vehicleTransmission,
      vehicleColour,
      bedrooms,
      bathrooms,
      landArea,
      floorArea,
      rentalSubType,
      rentalPriceWeekly,
      salaryMin,
      salaryMax,
      serviceDuration,
      stockQuantity,
      year,
      mileage,
      brand,
      model,
    } = body;

    if (!title || !category) {
      return NextResponse.json({ error: "Title and category are required" }, { status: 400 });
    }

    // Build a rich context for the pricing expert
    const context = {
      title,
      description: description || "Not provided",
      category,
      listingType: listingType || "Not specified",
      condition: condition || "Not specified",
      currentPrice: price || "Not set",
      location: location || "Not specified",
      vehicle: {
        make: vehicleMake || brand || "Not specified",
        model: vehicleModel || model || "Not specified",
        year: vehicleYear || year || "Not specified",
        odometer: vehicleOdometer || mileage || "Not specified",
        bodyType: vehicleBodyType || "Not specified",
        fuelType: vehicleFuelType || "Not specified",
        transmission: vehicleTransmission || "Not specified",
        colour: vehicleColour || "Not specified",
      },
      property: {
        bedrooms: bedrooms || "Not specified",
        bathrooms: bathrooms || "Not specified",
        landArea: landArea || "Not specified",
        floorArea: floorArea || "Not specified",
      },
      rental: {
        subType: rentalSubType || "Not specified",
        weeklyPrice: rentalPriceWeekly || "Not specified",
      },
      job: {
        salaryMin: salaryMin || "Not specified",
        salaryMax: salaryMax || "Not specified",
      },
      service: {
        duration: serviceDuration || "Not specified",
      },
      stock: stockQuantity || "Not specified",
    };

    // Try to fetch live market data for the exact item
    let marketResearch = "";
    try {
      marketResearch = await fetchMarketResearch(title, category, context);
    } catch (e) {
      console.warn("Market research failed:", e);
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
            content: `You are a pricing expert for the New Zealand marketplace Sky Drop. Your job is to suggest a fair, accurate NZD price range for an item the user is listing.

RULES:
1. Be realistic and specific to the NZ market. Do not overestimate prices for generic items.
2. If critical details are missing (e.g., year, mileage, condition, specs, location, model variant), you MUST ask for them in the "missingDetails" array.
3. For vehicles, you MUST know: year, make, model, odometer, transmission, fuel type, body style, and condition before giving a confident price. A "BMW 335i" without year/mileage is impossible to price accurately.
4. Use the live market research results if provided. If not provided, base your answer on your training knowledge of NZ market values.
5. Explain why the price is what it is, and what factors matter most.
6. Return ONLY a JSON object with this exact structure:
{
  "suggestedMin": number,
  "suggestedMax": number,
  "reasoning": string,
  "marketFactors": string[],
  "confidence": "high" | "medium" | "low",
  "missingDetails": string[]
}

missingDetails should be empty when you have enough info. Otherwise, list the exact questions the user should answer, e.g. "What year is the vehicle?", "What is the odometer reading?", "What condition is it in?", "Where is it located?".

Be conservative. A vague title like "BMW 335i" with no year or mileage should NOT produce a $50,000+ suggestion. Use typical NZ used car market values for the model unless the context proves otherwise.`
          },
          {
            role: "user",
            content: `I need a price suggestion for this item on Sky Drop (New Zealand marketplace).

Listing context:
${JSON.stringify(context, null, 2)}

${marketResearch ? marketResearch + "\n\n" : ""}Based on the information above, suggest a fair NZD price range. If you don't have enough detail to be confident, tell me exactly what I need to add.`
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
        marketResearch: marketResearch ? true : false,
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
