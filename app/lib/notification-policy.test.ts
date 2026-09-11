import { describe, expect, it, vi } from "vitest";
import {
  BLOCKED_NOTIFICATION_TYPES,
  LISTING_CONTACT_TYPES,
  assertNotificationAllowed,
  isSystemLikeFromEmail,
} from "./notification-policy";

vi.mock("./admin-check", () => ({
  isAdminEmail: (email?: string | null) =>
    String(email || "").toLowerCase() === "admin@skydrop.test",
}));

function listingDb(sellerEmail: string) {
  return {
    collection: (name: string) => ({
      doc: () => ({
        get: async () => ({
          exists: name === "listings",
          data: () => (name === "listings" ? { sellerEmail } : undefined),
        }),
      }),
      where: () => {
        const q: {
          where: () => typeof q;
          limit: () => { get: () => Promise<{ empty: boolean; docs: unknown[] }> };
          get: () => Promise<{ empty: boolean; docs: unknown[] }>;
        } = {
          where: () => q,
          limit: () => ({ get: async () => ({ empty: true, docs: [] }) }),
          get: async () => ({ empty: true, docs: [] }),
        };
        return q;
      },
    }),
  };
}

describe("notification policy", () => {
  it("blocks system / admin impersonation types", () => {
    expect(BLOCKED_NOTIFICATION_TYPES.has("system")).toBe(true);
    expect(BLOCKED_NOTIFICATION_TYPES.has("admin_broadcast")).toBe(true);
    expect(BLOCKED_NOTIFICATION_TYPES.has("announcement")).toBe(true);
    expect(isSystemLikeFromEmail("system@skydrop.nz")).toBe(true);
    expect(isSystemLikeFromEmail("noreply@skydrop.app")).toBe(true);
    expect(isSystemLikeFromEmail("buyer@example.test")).toBe(false);
  });

  it("rejects system type from a normal user", async () => {
    const result = await assertNotificationAllowed(listingDb("seller@example.test") as never, {
      senderEmail: "buyer@example.test",
      targetEmail: "seller@example.test",
      fromEmail: "buyer@example.test",
      type: "system",
      listingId: "listing-1",
    });
    expect(result).toEqual({ ok: false, reason: "Notification type not allowed" });
  });

  it("rejects fromEmail impersonation", async () => {
    const result = await assertNotificationAllowed(listingDb("seller@example.test") as never, {
      senderEmail: "buyer@example.test",
      targetEmail: "seller@example.test",
      fromEmail: "seller@example.test",
      type: "message",
      listingId: "listing-1",
    });
    expect(result).toEqual({ ok: false, reason: "Forbidden" });
  });

  it("allows stranger → seller only for listing-contact types", async () => {
    expect(LISTING_CONTACT_TYPES.has("message")).toBe(true);
    const allowed = await assertNotificationAllowed(listingDb("seller@example.test") as never, {
      senderEmail: "buyer@example.test",
      targetEmail: "seller@example.test",
      fromEmail: "buyer@example.test",
      type: "message",
      listingId: "listing-1",
    });
    expect(allowed).toEqual({ ok: true });

    const denied = await assertNotificationAllowed(listingDb("seller@example.test") as never, {
      senderEmail: "buyer@example.test",
      targetEmail: "seller@example.test",
      fromEmail: "buyer@example.test",
      type: "purchase_confirmation",
      listingId: "listing-1",
    });
    expect(denied.ok).toBe(false);
  });

  it("rejects notifying an arbitrary email with only a listingId when caller is not the seller", async () => {
    const result = await assertNotificationAllowed(listingDb("seller@example.test") as never, {
      senderEmail: "buyer@example.test",
      targetEmail: "stranger@example.test",
      fromEmail: "buyer@example.test",
      type: "message",
      listingId: "listing-1",
    });
    expect(result.ok).toBe(false);
  });
});
