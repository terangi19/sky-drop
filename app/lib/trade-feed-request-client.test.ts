import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  TRADE_FEED_ENDPOINTS,
  interpretTradeFeedResponse,
  submitTradeFeedRequest,
  type TradeFeedAction,
} from "./trade-feed-request-client";

const ACTIONS: TradeFeedAction[] = ["shout", "post", "delete", "status", "reply"];

const json = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

const getIdToken = async () => "id-token";

describe("interpretTradeFeedResponse: success only on 2xx + success:true", () => {
  it.each(ACTIONS)("%s: 200 {success:true} is ok and carries the created id", (action) => {
    expect(interpretTradeFeedResponse(action, 200, { success: true })).toEqual({ ok: true, id: null });
    expect(interpretTradeFeedResponse(action, 200, { success: true, id: "abc" })).toEqual({ ok: true, id: "abc" });
  });

  it.each(ACTIONS)("%s: 2xx without success:true is a failure", (action) => {
    for (const body of [null, {}, { success: false }, "<html>", undefined]) {
      expect(interpretTradeFeedResponse(action, 200, body)).toMatchObject({ ok: false, code: "bad_response" });
    }
    expect(interpretTradeFeedResponse(action, 204, undefined)).toMatchObject({ ok: false });
  });

  it.each(ACTIONS)("%s: every non-2xx is a failure with a message", (action) => {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 502, 503]) {
      const r = interpretTradeFeedResponse(action, status, { success: true, error: "x" });
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.message.length).toBeGreaterThan(0);
    }
  });

  it("401 asks the user to sign in again, per action", () => {
    expect(interpretTradeFeedResponse("reply", 401, { error: "Unauthorized" })).toMatchObject({
      ok: false, code: "unauthorized", message: "Please sign in again to reply.",
    });
    expect(interpretTradeFeedResponse("shout", 401, {})).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("429 tells the user to slow down", () => {
    expect(interpretTradeFeedResponse("post", 429, { error: "Too many requests" })).toMatchObject({
      ok: false, code: "rate_limited", retryable: false,
      message: "You're doing that too quickly. Please wait a moment and try again.",
    });
  });

  it("surfaces the server's message for 400/403/404/409 but never for 5xx", () => {
    expect(interpretTradeFeedResponse("delete", 403, { error: "You can only delete your own posts" }))
      .toMatchObject({ ok: false, message: "You can only delete your own posts" });
    expect(interpretTradeFeedResponse("delete", 404, { error: "Post not found" })).toMatchObject({ message: "Post not found" });
    expect(interpretTradeFeedResponse("shout", 400, { error: "Shout must be 1–500 characters" }))
      .toMatchObject({ message: "Shout must be 1–500 characters" });
    expect(interpretTradeFeedResponse("post", 409, { error: "You already have an active listing for this badge." }))
      .toMatchObject({ message: "You already have an active listing for this badge." });
    expect(interpretTradeFeedResponse("status", 400, {})).toMatchObject({ message: "Couldn't update the post status. Please try again." });
    expect(interpretTradeFeedResponse("reply", 500, { error: "stack trace leak" }))
      .toMatchObject({ ok: false, retryable: true, message: "Couldn't send your reply. Please try again." });
  });

  it("maps the Turnstile 'captchaRequired' 403 to an actionable message", () => {
    expect(interpretTradeFeedResponse("post", 403, { error: "Security check required", captchaRequired: true }))
      .toMatchObject({ ok: false, code: "captcha_required", message: "A security check is required. Please reload the page and try again." });
    // other 403s keep the server's text ("Action could not be completed")
    expect(interpretTradeFeedResponse("post", 403, { error: "Action could not be completed" }))
      .toMatchObject({ message: "Action could not be completed" });
  });

  it("caps very long server messages", () => {
    const r = interpretTradeFeedResponse("reply", 400, { error: "x".repeat(500) });
    expect(r.ok === false && r.message.length).toBe(200);
  });
});

describe("submitTradeFeedRequest", () => {
  it.each(ACTIONS)("%s: POSTs the body with a Bearer token to the right route and returns ok on 200", async (action) => {
    const fetchImpl = vi.fn(async () => json(200, { success: true, id: "p9" }));
    const body = { action, postId: "p1" };
    const r = await submitTradeFeedRequest({ action, body, getIdToken, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, id: "p9" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TRADE_FEED_ENDPOINTS[action]);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    expect(JSON.parse(String(init.body))).toEqual(body);
  });

  it("routes shout/post/manage actions to the existing endpoints", () => {
    expect(TRADE_FEED_ENDPOINTS).toEqual({
      shout: "/api/create-trade-shout",
      post: "/api/create-trade-post",
      delete: "/api/manage-trade-post",
      status: "/api/manage-trade-post",
      reply: "/api/manage-trade-post",
    });
  });

  it.each(ACTIONS)("%s: returns a failure (never success) on HTTP 401/403/404/409/429/500", async (action) => {
    for (const status of [401, 403, 404, 409, 429, 500]) {
      const fetchImpl = vi.fn(async () => json(status, { error: "nope" }));
      const r = await submitTradeFeedRequest({ action, body: {}, getIdToken, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(r.ok).toBe(false);
    }
  });

  it("returns a failure on network error and on an unparsable 2xx body", async () => {
    const boom = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await submitTradeFeedRequest({ action: "reply", body: {}, getIdToken, fetchImpl: boom as unknown as typeof fetch }))
      .toMatchObject({ ok: false, code: "network", retryable: true });
    const badJson = vi.fn(async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("x"); } }) as unknown as Response);
    expect(await submitTradeFeedRequest({ action: "reply", body: {}, getIdToken, fetchImpl: badJson as unknown as typeof fetch }))
      .toMatchObject({ ok: false, code: "bad_response" });
  });

  it("a getIdToken rejection is a failure result, not a thrown error", async () => {
    const fetchImpl = vi.fn();
    const r = await submitTradeFeedRequest({
      action: "post", body: {}, getIdToken: async () => { throw new Error("token refresh failed"); },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call fetch without a token", async () => {
    const fetchImpl = vi.fn();
    const r = await submitTradeFeedRequest({ action: "shout", body: {}, getIdToken: async () => null, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, code: "unauthorized" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("trade-feed/page.tsx wiring (source guard)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../trade-feed/page.tsx"), "utf8");
  // Lazy (inside each test) so that on unpatched main every guard fails on its own assertion
  // instead of the whole file failing at collection time.
  const fn = (name: string, next: string) => {
    const start = src.indexOf(`async function ${name}(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const end = src.indexOf(next, start);
    expect(end, `end marker for ${name} not found`).toBeGreaterThan(start);
    return src.slice(start, end);
  };
  const handlers = () => ({
    sendShout: fn("sendShout", "async function postTrade("),
    submitPost: fn("postTrade", "async function deleteTrade("), // wrapper + submitPost
    deleteTrade: fn("deleteTrade", "async function updateTradeStatus("),
    updateStatus: fn("updateTradeStatus", "async function addReply("),
    addReply: fn("addReply", "async function sendOffer("),
  });

  it("no raw fetch() is left in the page: every write goes through the checked helper", () => {
    const { sendShout, submitPost, deleteTrade, updateStatus, addReply } = handlers();
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).toContain('from "../lib/trade-feed-request-client"');
    for (const [name, body] of Object.entries({ sendShout, submitPost, deleteTrade, updateStatus, addReply })) {
      expect(body, name).toContain("submitTradeFeedRequest(");
    }
  });

  it("each handler returns on !result.ok BEFORE any success side effect", () => {
    const { sendShout, submitPost, updateStatus, addReply } = handlers();
    const cases: Array<[string, string, string[]]> = [
      ["sendShout", sendShout, ["setShoutText(", "playClick()"]],
      ["submitPost", submitPost, ["setTitle(", "setShowComposer(false)"]],
      ["updateTradeStatus", updateStatus, ["Marked as", "playSuccess()", "confetti("]],
      ["addReply", addReply, ["createNotification(", "setReplyTexts(", "setLiveEvents("]],
    ];
    for (const [name, body, effects] of cases) {
      const failIdx = body.indexOf("!result.ok");
      expect(failIdx, `${name} must check !result.ok`).toBeGreaterThan(-1);
      expect(body.indexOf('showToast(result.message, "error")', failIdx), `${name} must toast the error`).toBeGreaterThan(failIdx);
      for (const effect of effects) {
        expect(body.indexOf(effect), `${name}: ${effect}`).toBeGreaterThan(failIdx);
      }
    }
  });

  it("deleteTrade tells the user when the server rejected the delete", () => {
    const { deleteTrade } = handlers();
    expect(deleteTrade).toMatch(/if \(!result\.ok\) showToast\(result\.message, "error"\)/);
  });

  it("sendShout keeps the typed text on failure and only clears it if it is unchanged", () => {
    const { sendShout } = handlers();
    const failIdx = sendShout.indexOf("!result.ok");
    expect(failIdx).toBeGreaterThan(-1);
    expect(sendShout.indexOf("return;", failIdx)).toBeLessThan(sendShout.indexOf("setShoutText("));
    expect(sendShout).toMatch(/setShoutText\(\(cur\) => \(cur\.trim\(\) === msg \? "" : cur\)\)/);
  });

  it("postTrade keeps the composer open on failure and surfaces upload errors", () => {
    const { submitPost } = handlers();
    const failIdx = submitPost.indexOf("if (!result.ok)");
    const elseIdx = submitPost.indexOf("} else {", failIdx);
    expect(elseIdx).toBeGreaterThan(failIdx);
    expect(submitPost.indexOf("setShowComposer(false)")).toBeGreaterThan(elseIdx);
    // the catch around upload/NSFW checks must not be silent any more
    const catchIdx = submitPost.indexOf("catch (e)");
    expect(submitPost.indexOf("showToast(", catchIdx)).toBeGreaterThan(catchIdx);
  });

  it("prevents double-submit while a request is pending", () => {
    const { sendShout, deleteTrade, addReply } = handlers();
    expect(sendShout).toContain("shoutInFlight");
    expect(src).toContain("postInFlight");
    expect(deleteTrade).toContain("deleteInFlight");
    expect(addReply).toContain("replyInFlight");
    expect(addReply).toMatch(/finally\s*{[^}]*replyInFlight\.current\.delete/);
  });

  it("deleting your own shout reports a failed delete instead of an unhandled rejection", () => {
    expect(src).not.toMatch(/onClick=\{[^}]*deleteDoc\(doc\(db, "tradeShouts"/);
    const start = src.indexOf("async function deleteShout(");
    expect(start).toBeGreaterThan(-1);
    expect(src.slice(start, start + 400)).toContain("showToast(");
  });
});
