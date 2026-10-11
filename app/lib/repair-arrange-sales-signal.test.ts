/**
 * PROMPT-9: /api/repair-arrange-sales only backfills a purchase when a server-written buyer
 * signal exists for that buyer on that listing; otherwise skip + log (no emails). Create-only.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;
const store = new Map<string, Map<string, Doc>>();
const col = (name: string) => {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name)!;
};
const createSpy = vi.fn();
const setSpy = vi.fn();
let raceOnCreate = false;

function snap(id: string, data: Doc | undefined) {
  return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
}
function query(name: string, filters: Array<[string, unknown]>, lim = Infinity) {
  return {
    where(field: string, _op: string, value: unknown) {
      return query(name, [...filters, [field, value]], lim);
    },
    limit(n: number) {
      return query(name, filters, n);
    },
    async get() {
      const docs = [...col(name).entries()]
        .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
        .slice(0, lim)
        .map(([id, d]) => snap(id, d));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
}
const fakeDb = {
  collection(name: string) {
    return {
      ...query(name, []),
      doc(id: string) {
        return {
          id,
          async get() {
            return snap(id, col(name).get(id));
          },
          async create(data: Doc) {
            createSpy(name, id, data);
            if (raceOnCreate) col(name).set(id, { status: "pending", raced: true });
            if (col(name).has(id)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
            col(name).set(id, data);
          },
          async set(data: Doc) {
            setSpy(name, id, data);
            col(name).set(id, data);
          },
        };
      },
    };
  },
};

const verifyIdToken = vi.fn();
vi.mock("./firebase-admin", () => ({
  getAdminDb: () => fakeDb,
  isAdminInitialized: () => true,
  verifyIdToken: (t: string) => verifyIdToken(t),
}));
vi.mock("./profile-display-admin", () => ({
  adminGetPublicName: vi.fn(async () => "Buyer"),
  adminGetPublicNamesForEmails: vi.fn(async () => ({})),
  adminGetPublicHandle: vi.fn(async () => "buyer"),
}));
vi.mock("./checkout-server", () => ({ requireAdminForCheckout: () => undefined }));

import {
  BUYER_SIGNAL_CONVERSATION_STATUSES,
  conversationShowsBuyerRequest,
  findArrangeBuyerSignal,
  messageIsAcceptedOfferFromBuyer,
} from "./arrange-repair-signal";
import { repairMissingArrangePurchasesForSeller } from "./purchase-service";
import { POST } from "../api/repair-arrange-sales/route";

const SELLER = "seller@example.com";
const BUYER = "buyer@example.com";
const STRANGER = "victim@example.com";
const L = "list1";
const pid = (l: string, e: string) => `${l}_${e.replace(/[@.]/g, "_")}`;
const cid = (l: string, e: string) => `conv_${l}_${e.replace(/[@.]/g, "_")}`;

function soldListing(id: string, soldTo: string, extra: Doc = {}) {
  col("listings").set(id, {
    sellerEmail: SELLER,
    status: "sold",
    paymentType: "contact",
    soldTo,
    title: "Bike",
    price: "100",
    ...extra,
  });
}

beforeEach(() => {
  store.clear();
  createSpy.mockClear();
  setSpy.mockClear();
  verifyIdToken.mockReset();
  raceOnCreate = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("buyer-signal predicates", () => {
  const base = { listingId: L, buyerEmail: BUYER, sellerEmail: SELLER };
  it("accepts arranged / offer_accepted / seller_confirming conversations with both parties", () => {
    for (const orderStatus of BUYER_SIGNAL_CONVERSATION_STATUSES) {
      expect(
        conversationShowsBuyerRequest({ listingId: L, participants: [BUYER, SELLER], orderStatus }, base)
      ).toBe(true);
    }
  });
  it("matches emails case-insensitively", () => {
    expect(
      conversationShowsBuyerRequest(
        { listingId: L, participants: ["Buyer@Example.com", SELLER], orderStatus: "arranged" },
        base
      )
    ).toBe(true);
  });
  it("rejects plain chat (no orderStatus), other listing, missing party, terminal statuses", () => {
    const ok = { listingId: L, participants: [BUYER, SELLER], orderStatus: "arranged" };
    expect(conversationShowsBuyerRequest({ ...ok, orderStatus: undefined }, base)).toBe(false);
    expect(conversationShowsBuyerRequest({ ...ok, orderStatus: "expired" }, base)).toBe(false);
    expect(conversationShowsBuyerRequest({ ...ok, listingId: "other" }, base)).toBe(false);
    expect(conversationShowsBuyerRequest({ ...ok, participants: [SELLER, STRANGER] }, base)).toBe(false);
    expect(conversationShowsBuyerRequest({ ...ok, participants: [BUYER] }, base)).toBe(false);
    expect(conversationShowsBuyerRequest(ok, { ...base, buyerEmail: SELLER })).toBe(false);
    expect(conversationShowsBuyerRequest(null, base)).toBe(false);
  });
  it("accepted offer must be type offer, from the buyer, on the listing, status accepted", () => {
    const ok = { listingId: L, type: "offer", sender: BUYER, offerStatus: "accepted" };
    expect(messageIsAcceptedOfferFromBuyer(ok, base)).toBe(true);
    expect(messageIsAcceptedOfferFromBuyer({ ...ok, offerStatus: "pending" }, base)).toBe(false);
    expect(messageIsAcceptedOfferFromBuyer({ ...ok, offerStatus: "declined" }, base)).toBe(false);
    expect(messageIsAcceptedOfferFromBuyer({ ...ok, sender: SELLER }, base)).toBe(false);
    expect(messageIsAcceptedOfferFromBuyer({ ...ok, type: "text" }, base)).toBe(false);
    expect(messageIsAcceptedOfferFromBuyer({ ...ok, listingId: "other" }, base)).toBe(false);
  });
  it("findArrangeBuyerSignal is read-only and returns null without a signal", async () => {
    const r = await findArrangeBuyerSignal(fakeDb as never, { ...base, conversationId: cid(L, BUYER) });
    expect(r).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
  });
});

describe("repairMissingArrangePurchasesForSeller", () => {
  it("skips (and logs without emails) when soldTo has no buyer signal — the fabrication case", async () => {
    soldListing(L, STRANGER);
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(0);
    expect(col("purchases").size).toBe(0);
    expect(createSpy).not.toHaveBeenCalled();
    const warned = JSON.stringify((console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls);
    expect(warned).toContain("no buyer signal");
    expect(warned).toContain(L);
    expect(warned).not.toContain(STRANGER);
    expect(warned).not.toContain(SELLER);
  });

  it("skips a seller-started chat (send-message conversation, no orderStatus) with the stranger", async () => {
    soldListing(L, STRANGER);
    col("conversations").set(cid(L, STRANGER), {
      listingId: L,
      participants: [SELLER, STRANGER],
      buyerEmail: SELLER,
    });
    col("messages").set("m1", { listingId: L, type: "text", sender: SELLER, receiver: STRANGER });
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(0);
    expect(col("purchases").size).toBe(0);
  });

  it("skips an offer the seller authored or one never accepted", async () => {
    soldListing(L, STRANGER);
    col("messages").set("m1", { listingId: L, type: "offer", sender: SELLER, offerStatus: "accepted" });
    col("messages").set("m2", { listingId: L, type: "offer", sender: STRANGER, offerStatus: "pending" });
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(0);
  });

  it("skips a signal that belongs to a different buyer or listing", async () => {
    soldListing(L, STRANGER);
    col("conversations").set(cid(L, BUYER), {
      listingId: L,
      participants: [BUYER, SELLER],
      orderStatus: "arranged",
    });
    col("messages").set("m1", { listingId: "other", type: "offer", sender: STRANGER, offerStatus: "accepted" });
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(0);
  });

  it("backfills when the buyer requested Arrange Purchase (conversation orderStatus arranged)", async () => {
    soldListing(L, BUYER);
    col("conversations").set(cid(L, BUYER), {
      listingId: L,
      participants: [BUYER, SELLER],
      buyerEmail: BUYER,
      orderStatus: "arranged",
    });
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(1);
    const p = col("purchases").get(pid(L, BUYER))!;
    expect(p).toBeTruthy();
    expect(p.buyerEmail).toBe(BUYER);
    // Not a SALE_COUNT_STATUSES member (#119): the salesCount trigger ledgers it counted:false.
    expect(p.status).toBe("arrange_requested");
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("backfills from a conversation found by listingId (non-deterministic id)", async () => {
    soldListing(L, BUYER);
    col("conversations").set("legacy-id", {
      listingId: L,
      participants: [SELLER, BUYER],
      orderStatus: "offer_accepted",
    });
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(1);
  });

  it("backfills when the buyer's offer on that listing was accepted", async () => {
    soldListing(L, BUYER);
    col("messages").set("m1", { listingId: L, type: "offer", sender: BUYER, offerStatus: "accepted" });
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(1);
    expect(col("purchases").get(pid(L, BUYER))!.status).toBe("arrange_requested");
  });

  it("never overwrites: existing purchase untouched; concurrent create is swallowed", async () => {
    soldListing(L, BUYER);
    col("messages").set("m1", { listingId: L, type: "offer", sender: BUYER, offerStatus: "accepted" });
    col("purchases").set(pid(L, BUYER), { status: "completed", keep: true });
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(0);
    expect(col("purchases").get(pid(L, BUYER))).toEqual({ status: "completed", keep: true });
    expect(createSpy).not.toHaveBeenCalled();

    col("purchases").clear();
    raceOnCreate = true;
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(0);
    expect(col("purchases").get(pid(L, BUYER))).toEqual({ status: "pending", raced: true });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("idempotent: a second run creates nothing", async () => {
    soldListing(L, BUYER);
    col("messages").set("m1", { listingId: L, type: "offer", sender: BUYER, offerStatus: "accepted" });
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(1);
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(0);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores self-sold, non-contact and other sellers' listings", async () => {
    soldListing("self", SELLER);
    soldListing("stripe", BUYER, { paymentType: "stripe" });
    soldListing("theirs", BUYER, { sellerEmail: "other@example.com" });
    for (const l of ["self", "stripe", "theirs"]) {
      col("messages").set(`m-${l}`, { listingId: l, type: "offer", sender: BUYER, offerStatus: "accepted" });
    }
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(0);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("mixed batch: only the signalled listing is repaired", async () => {
    soldListing("a", BUYER);
    soldListing("b", STRANGER);
    col("messages").set("m1", { listingId: "a", type: "offer", sender: BUYER, offerStatus: "accepted" });
    expect(await repairMissingArrangePurchasesForSeller(SELLER)).toBe(1);
    expect([...col("purchases").keys()]).toEqual([pid("a", BUYER)]);
  });
});

describe("POST /api/repair-arrange-sales", () => {
  const req = (auth?: string) =>
    new NextRequest("http://localhost/api/repair-arrange-sales", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
      body: JSON.stringify({ sellerEmail: "spoof@example.com" }),
    });

  it("401 without bearer token, no writes", async () => {
    soldListing(L, STRANGER);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("seller cannot fabricate a purchase for a stranger via soldTo", async () => {
    soldListing(L, STRANGER);
    verifyIdToken.mockResolvedValue({ uid: "u1", email: SELLER });
    const res = await POST(req("Bearer tok"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, repaired: 0 });
    expect(col("purchases").size).toBe(0);
  });

  it("repairs a real arrange sale and scopes to the token email, not the body", async () => {
    soldListing(L, BUYER);
    col("conversations").set(cid(L, BUYER), {
      listingId: L,
      participants: [BUYER, SELLER],
      orderStatus: "arranged",
    });
    verifyIdToken.mockResolvedValue({ uid: "u1", email: SELLER });
    const res = await POST(req("Bearer tok"));
    expect(await res.json()).toEqual({ success: true, repaired: 1 });

    store.clear();
    soldListing(L, BUYER);
    col("messages").set("m1", { listingId: L, type: "offer", sender: BUYER, offerStatus: "accepted" });
    verifyIdToken.mockResolvedValue({ uid: "u2", email: "spoof@example.com" });
    expect(await (await POST(req("Bearer tok"))).json()).toEqual({ success: true, repaired: 0 });
  });
});
