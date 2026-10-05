import { describe, expect, it } from "vitest";
import {
  TRADE_OFFER_LIMITS,
  buildTradeOfferNotification,
  decideTradeOffer,
  parseTradeOfferBody,
  sanitizeNotificationText,
} from "./trade-offer-validation";

const buyer = { uid: "buyer-uid", email: "Buyer@Example.com" };
const livePost = {
  sellerEmail: "Seller@Example.com",
  sellerId: "seller-uid",
  status: "live",
  title: "  Rare card  ",
  images: ["https://cdn.example.com/a.jpg"],
};

describe("parseTradeOfferBody", () => {
  it("accepts a plain postId and an optional requestId", () => {
    expect(parseTradeOfferBody({ postId: "abc123" })).toEqual({ ok: true, postId: "abc123", requestId: undefined });
    expect(parseTradeOfferBody({ postId: " abc123 ", requestId: "11111111-2222-3333-4444-555555555555" })).toMatchObject({
      ok: true,
      postId: "abc123",
      requestId: "11111111-2222-3333-4444-555555555555",
    });
  });

  it.each([null, undefined, "x", 5, [], {}, { postId: "" }, { postId: 12 }])("rejects bad body %j", (body) => {
    const r = parseTradeOfferBody(body);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.status).toBe(400);
  });

  it.each(["a/b", "../x", ".", "..", "__name__", "x".repeat(129)])("rejects unsafe postId %s", (postId) => {
    const r = parseTradeOfferBody({ postId });
    expect(r).toMatchObject({ ok: false, status: 400, code: "post_id_invalid" });
  });

  it.each(["short", "has space here", "x".repeat(65), 123])("rejects bad requestId %j", (requestId) => {
    expect(parseTradeOfferBody({ postId: "p1", requestId })).toMatchObject({ ok: false, code: "request_id_invalid" });
  });

  it("ignores client-supplied seller/offers/title fields (they are not part of the result)", () => {
    const r = parseTradeOfferBody({ postId: "p1", offers: 9999, sellerEmail: "evil@x.com", title: "x" });
    expect(r).toEqual({ ok: true, postId: "p1", requestId: undefined });
  });
});

describe("decideTradeOffer", () => {
  it("allows a buyer on a live post and normalises seller/title/image", () => {
    expect(decideTradeOffer(livePost, buyer)).toEqual({
      ok: true,
      sellerEmail: "seller@example.com",
      title: "Rare card",
      image: "https://cdn.example.com/a.jpg",
    });
  });

  it("404s a missing post", () => {
    expect(decideTradeOffer(null, buyer)).toMatchObject({ ok: false, status: 404, code: "post_not_found" });
    expect(decideTradeOffer(undefined, buyer)).toMatchObject({ ok: false, status: 404 });
  });

  it("rejects the owner by email (case-insensitive) or by uid", () => {
    expect(decideTradeOffer(livePost, { uid: "x", email: "seller@EXAMPLE.com" })).toMatchObject({ ok: false, status: 400, code: "own_post" });
    expect(decideTradeOffer(livePost, { uid: "seller-uid", email: "other@example.com" })).toMatchObject({ ok: false, code: "own_post" });
    expect(decideTradeOffer({ ...livePost, sellerId: undefined, sellerUid: "seller-uid" }, { uid: "seller-uid", email: "o@e.com" })).toMatchObject({ code: "own_post" });
  });

  it.each(["sold", "completed", "closed", "expired", "SOLD"])("409s a %s post", (status) => {
    expect(decideTradeOffer({ ...livePost, status }, buyer)).toMatchObject({ ok: false, status: 409, code: "post_closed" });
  });

  it.each(["live", "hot", undefined, ""])("allows status %j", (status) => {
    expect(decideTradeOffer({ ...livePost, status }, buyer).ok).toBe(true);
  });

  it("409s a post with no seller email (cannot notify anyone)", () => {
    expect(decideTradeOffer({ ...livePost, sellerEmail: "" }, buyer)).toMatchObject({ ok: false, status: 409, code: "post_has_no_seller" });
  });

  it("400s a buyer without uid/email", () => {
    expect(decideTradeOffer(livePost, { uid: "u", email: "" })).toMatchObject({ ok: false, status: 400, code: "buyer_identity_missing" });
    expect(decideTradeOffer(livePost, { uid: "", email: "a@b.com" })).toMatchObject({ ok: false, code: "buyer_identity_missing" });
  });

  it("drops non-http(s) images and falls back to legacy `image`", () => {
    expect(decideTradeOffer({ ...livePost, images: ["javascript:alert(1)"] }, buyer)).toMatchObject({ ok: true, image: "" });
    expect(decideTradeOffer({ ...livePost, images: [], image: "http://x.test/i.png" }, buyer)).toMatchObject({ ok: true, image: "http://x.test/i.png" });
  });

  it("falls back to 'a trade' for a blank title", () => {
    expect(decideTradeOffer({ ...livePost, title: "   " }, buyer)).toMatchObject({ ok: true, title: "a trade" });
  });
});

describe("notification text", () => {
  it("strips control characters and caps length", () => {
    expect(sanitizeNotificationText("a\nb\u0000c\t d", 50)).toBe("a b c d");
    expect(sanitizeNotificationText("x".repeat(500), 10)).toHaveLength(10);
    expect(sanitizeNotificationText(null, 10)).toBe("");
  });

  it("uses a safe profile username, else 'Someone' — never the email local part", () => {
    expect(buildTradeOfferNotification({ buyerLabel: "kiwi_trader", buyerEmail: "k@x.com", postTitle: "Card" }).message).toBe('kiwi_trader sent an offer on "Card".');
    expect(buildTradeOfferNotification({ buyerLabel: "", buyerEmail: "kiwi@x.com", postTitle: "Card" }).message).toBe('Someone sent an offer on "Card".');
    expect(buildTradeOfferNotification({ buyerLabel: "kiwi", buyerEmail: "kiwi@x.com", postTitle: "Card" }).message).toBe('Someone sent an offer on "Card".');
    expect(buildTradeOfferNotification({ buyerLabel: "", buyerEmail: "@x.com", postTitle: "Card" }).message).toBe('Someone sent an offer on "Card".');
    expect(buildTradeOfferNotification({ buyerLabel: "", buyerEmail: "a@b.com", postTitle: "T" }).title).toBe("New offer received! 💰");
  });
});

describe("limits", () => {
  it("per-post limit is tighter than the per-user limit", () => {
    expect(TRADE_OFFER_LIMITS.perUserPost.max).toBeLessThan(TRADE_OFFER_LIMITS.perUser.max);
  });
});
