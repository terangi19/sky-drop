import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const EXACT_R34_ANSWER =
  "1999 Nissan Skyline R34, 145,000 km, manual, good used condition, asking $38,000. Aftermarket exhaust, wheels, coilovers and intake. Recently serviced with fresh oil and filters. Interior is tidy for its age. Paint has a few minor marks and stone chips. No known mechanical faults, starts and drives well. WOF and rego current. Located in Auckland.";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/sky-ai", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `batch-${Date.now()}-${Math.random()}` },
    body: JSON.stringify({ pathname: "/post/ai", stream: false, ...body }),
  });
}

describe("POST /api/sky-ai batched seller details", () => {
  it("consumes the exact long R34 answer using the browser API contract", async () => {
    const anonSessionId = `route-r34-${Date.now()}`;
    const firstResponse = await POST(request({ message: "list my r34", anonSessionId }));
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json();
    expect(first.reply).toMatch(/year.*mileage.*transmission.*condition.*asking price/i);

    const secondResponse = await POST(
      request({
        message: EXACT_R34_ANSWER,
        anonSessionId,
        listingContext: first.listingFill,
        awhinaSession: first.awhinaSession,
      })
    );
    expect(secondResponse.status).toBe(200);
    const second = await secondResponse.json();
    expect(second.listingFill?.vehicleYear, JSON.stringify(second)).toBe("1999");
    expect(second.listingFill.vehicleOdometer).toBe("145000");
    expect(second.listingFill.vehicleTransmission).toBe("Manual");
    expect(second.listingFill.condition).toBe("Used - Good");
    expect(second.listingFill.price).toBe("38000");
    expect(second.listingFill.location).toBe("Auckland");
    expect(second.listingFill.extras.join(" ")).toMatch(
      /aftermarket exhaust.*wheels.*coilovers.*intake/i
    );
    expect(second.reply).not.toMatch(
      /year.*mileage.*transmission.*condition.*asking price/i
    );
  });

  it.each([
    {
      name: "iPhone",
      start: "list my iPhone 15 Pro",
      answer: "256GB, black, good condition, 91% battery health, $1200",
      assert: (fill: Record<string, unknown>, reply: string) => {
        expect(String(fill.extras || "")).toMatch(/storage:256GB/i);
        expect(fill.condition).toBe("Used - Good");
        expect(fill.price).toBe("1200");
        expect(reply).not.toMatch(/storage size.*condition.*colour/i);
      },
    },
    {
      name: "Riftbound display",
      start: "list my Riftbound Unleashed booster display",
      answer: "Factory sealed, box is mint, asking $240",
      assert: (fill: Record<string, unknown>, reply: string) => {
        expect(fill.condition).toBe("New");
        expect(fill.price).toBe("240");
        expect(reply).not.toMatch(/factory sealed.*condition.*box/i);
      },
    },
    {
      name: "Nike shoes",
      start: "list my Nike Air Max 90 shoes",
      answer: "Size 10, good condition, asking $90",
      assert: (fill: Record<string, unknown>, reply: string) => {
        expect(String(fill.extras || "")).toMatch(/size:10/i);
        expect(fill.price).toBe("90");
        expect(reply).not.toMatch(/size.*condition.*asking price/i);
      },
    },
    {
      name: "mountain bike",
      start: "list my Trek Marlin mountain bike",
      answer: "Medium frame, good condition, recently serviced, asking $650",
      assert: (fill: Record<string, unknown>, reply: string) => {
        expect(fill.condition).toBe("Used - Good");
        expect(fill.price).toBe("650");
        expect(String(fill.extras || "")).toMatch(/seller_notes:serviced|seller_notes:maintenance/i);
        expect(reply).not.toMatch(/condition.*asking price/i);
      },
    },
  ])("$name advances through the browser API after a compound answer", async ({ start, answer, assert }) => {
    const anonSessionId = `route-${Date.now()}-${Math.random()}`;
    const first = await (await POST(request({ message: start, anonSessionId }))).json();
    const second = await (
      await POST(
        request({
          message: answer,
          anonSessionId,
          listingContext: first.listingFill,
          awhinaSession: first.awhinaSession,
        })
      )
    ).json();
    assert(second.listingFill, second.reply);
  });
});
