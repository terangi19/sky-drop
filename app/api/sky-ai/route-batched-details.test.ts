import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

export const EXACT_R34_ANSWER =
  "1999 Nissan Skyline R34, 145,000 km, manual, good used condition, asking $38,000. Gunmetal grey, located in Auckland. Aftermarket exhaust, intake, coilovers and 18-inch wheels. Recently serviced with fresh engine oil and filters. Interior is tidy, paint has a few minor stone chips and age-related marks. No known mechanical faults and it starts and drives well. WOF and rego are current.";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/sky-ai", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `batch-${Date.now()}-${Math.random()}` },
    body: JSON.stringify({ pathname: "/post/ai", stream: false, ...body }),
  });
}

function extrasText(fill: Record<string, unknown> | undefined): string {
  return Array.isArray(fill?.extras) ? fill.extras.join(" ") : String(fill?.extras || "");
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
    expect(String(second.listingFill.vehicleColour || "")).toMatch(/grey|gray/i);
    const extras = extrasText(second.listingFill);
    expect(extras).toMatch(/exhaust/i);
    expect(extras).toMatch(/intake/i);
    expect(extras).toMatch(/coilover/i);
    expect(extras).toMatch(/18-?inch wheels/i);
    expect(extras).toMatch(/servic|oil|filter/i);
    expect(extras).toMatch(/tidy|stone chip|age-related/i);
    expect(extras).toMatch(/no known mechanical faults/i);
    expect(extras).toMatch(/starts and drives/i);
    expect(extras).toMatch(/wof/i);
    expect(extras).toMatch(/registration current|rego/i);
    expect(second.reply).not.toMatch(
      /year.*mileage.*transmission.*condition.*asking price/i
    );
    const description = String(second.listingFill?.description || "");
    expect(description).toMatch(/exhaust/i);
    expect(description).toMatch(/coilover|intake|wheels/i);
    expect(description).toMatch(/servic|oil|filter/i);
    expect(description).toMatch(/tidy|stone chip|age-related|marks/i);
    expect(description).toMatch(/fault|drives well/i);
    expect(description).toMatch(/wof|registration|rego/i);
    expect(description).toMatch(/auckland/i);
    expect(description).not.toMatch(/classic era of nissan performance/i);
    expect(description).not.toMatch(/\$38,?000|asking/i);
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
        expect(extrasText(fill)).toMatch(/maintenance:|serviced/i);
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

  it("keeps a rich phone follow-up in listingFill and the public description", async () => {
    const anonSessionId = `route-phone-${Date.now()}`;
    const first = await (await POST(request({ message: "I want to sell my iPhone 15 Pro", anonSessionId }))).json();
    expect(String(first.listingFill?.description || "")).not.toMatch(/for sale in/i);
    const second = await (
      await POST(
        request({
          message:
            "256GB, Natural Titanium, like-new condition, $1,250, Auckland. Battery health is 94%. Comes with the original box and USB-C cable. Always used with a case and screen protector. No cracks, faults or repairs.",
          anonSessionId,
          listingContext: first.listingFill,
          awhinaSession: first.awhinaSession,
        })
      )
    ).json();
    expect(second.listingFill?.condition).toBe("Used - Like New");
    expect(second.listingFill?.price).toBe("1250");
    expect(second.listingFill?.location).toBe("Auckland");
    expect(String(second.listingFill?.vehicleColour || extrasText(second.listingFill))).toMatch(
      /titanium/i
    );
    const description = String(second.listingFill?.description || "");
    expect(description).toMatch(/256\s*GB/i);
    expect(description).toMatch(/like[- ]new/i);
    expect(description).toMatch(/battery|94/i);
    expect(description).toMatch(/box/i);
    expect(description).toMatch(/cable|usb/i);
    expect(description).not.toMatch(/for sale in/i);
    expect(description).not.toMatch(/good used condition/i);
  });

  it("keeps console accessories after a rich follow-up", async () => {
    const anonSessionId = `route-console-${Date.now()}`;
    const first = await (await POST(request({ message: "sell my PS5", anonSessionId }))).json();
    const second = await (
      await POST(
        request({
          message: "Like new, $550, Auckland. Comes with one controller and all cables. No faults or damage.",
          anonSessionId,
          listingContext: first.listingFill,
          awhinaSession: first.awhinaSession,
        })
      )
    ).json();
    expect(second.listingFill?.condition).toBe("Used - Like New");
    const description = String(second.listingFill?.description || "");
    expect(description).toMatch(/controller/i);
    expect(description).toMatch(/cable/i);
    expect(description).not.toMatch(/for sale in/i);
  });
});
