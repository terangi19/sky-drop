import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { interpretTradeOfferResponse, submitTradeOffer } from "./trade-offer-client";

const json = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

const getIdToken = async () => "id-token";

describe("interpretTradeOfferResponse: success only on 2xx + success:true", () => {
  it("reports success with the server counter", () => {
    expect(interpretTradeOfferResponse(200, { success: true, offers: 4, notified: true })).toEqual({
      ok: true, offers: 4, notified: true, message: "Offer sent!", kind: "success",
    });
  });

  it("is honest when the seller could not be notified", () => {
    const r = interpretTradeOfferResponse(200, { success: true, offers: 1, notified: false });
    expect(r).toMatchObject({ ok: true, notified: false, kind: "info" });
    expect(r.ok && r.message).not.toBe("Offer sent!");
  });

  it.each([
    [200, null], [200, {}], [200, { success: false }], [200, "<html>"], [204, undefined],
  ])("2xx without success:true is a failure (%s %j)", (status, body) => {
    expect(interpretTradeOfferResponse(status as number, body)).toMatchObject({ ok: false, code: "bad_response" });
  });

  it.each([400, 401, 403, 404, 409, 429, 500, 502, 503])("%i is never success", (status) => {
    const r = interpretTradeOfferResponse(status, { success: true, error: "x" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.message).not.toMatch(/Offer sent/);
  });

  it("surfaces the server's message for 4xx business errors but not for 5xx", () => {
    expect(interpretTradeOfferResponse(409, { error: "This trade is no longer open for offers.", code: "post_closed" }))
      .toMatchObject({ ok: false, code: "post_closed", message: "This trade is no longer open for offers." });
    expect(interpretTradeOfferResponse(500, { error: "stack trace leak" })).toMatchObject({ ok: false, message: "Couldn't send your offer. Please try again." });
    expect(interpretTradeOfferResponse(429, {})).toMatchObject({ ok: false, code: "rate_limited" });
    expect(interpretTradeOfferResponse(401, {})).toMatchObject({ ok: false, code: "unauthorized" });
  });
});

describe("submitTradeOffer", () => {
  it("POSTs only postId/requestId with a Bearer token and returns ok on 200", async () => {
    const fetchImpl = vi.fn(async () => json(200, { success: true, offers: 2, notified: true }));
    const r = await submitTradeOffer({ getIdToken, postId: "p1", requestId: "req-12345678", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: true, offers: 2 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/trade-offer");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    expect(JSON.parse(String(init.body))).toEqual({ postId: "p1", requestId: "req-12345678" });
  });

  it.each([401, 403, 404, 409, 429, 500])("returns a failure (no success) on HTTP %i", async (status) => {
    const fetchImpl = vi.fn(async () => json(status, { error: "nope" }));
    const r = await submitTradeOffer({ getIdToken, postId: "p1", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
  });

  it("returns a failure on network error and on an unparsable body", async () => {
    const boom = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await submitTradeOffer({ getIdToken, postId: "p1", fetchImpl: boom as unknown as typeof fetch })).toMatchObject({ ok: false, code: "network", retryable: true });
    const badJson = vi.fn(async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("x"); } }) as unknown as Response);
    expect(await submitTradeOffer({ getIdToken, postId: "p1", fetchImpl: badJson as unknown as typeof fetch })).toMatchObject({ ok: false, code: "bad_response" });
  });

  it("does not call fetch without a token", async () => {
    const fetchImpl = vi.fn();
    const r = await submitTradeOffer({ getIdToken: async () => null, postId: "p1", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, code: "unauthorized" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("trade-feed/page.tsx wiring (source guard)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../trade-feed/page.tsx"), "utf8");
  const start = src.indexOf("async function sendOffer(");
  const body = src.slice(start, src.indexOf("async function toggleWatchlist", start));

  it("never writes tradePosts from the client", () => {
    expect(src).not.toMatch(/updateDoc\s*\(\s*doc\(\s*db\s*,\s*["']tradePosts["']/);
    expect(src).not.toMatch(/\bupdateDoc\b/);
  });

  it("sendOffer goes through the server route and only toasts success from the helper result", () => {
    expect(body).toContain("submitTradeOffer(");
    expect(body).not.toContain("createNotification");
    expect(body).not.toContain("Offer sent!");
    // the failure branch must return before any success side-effect
    const failIdx = body.indexOf("if (!result.ok)");
    expect(failIdx).toBeGreaterThan(-1);
    expect(body.indexOf("return;", failIdx)).toBeLessThan(body.indexOf("playOffer()"));
    expect(body.indexOf('showToast(result.message, "error")')).toBeGreaterThan(failIdx);
    expect(body).toContain("offerInFlight");
  });
});
