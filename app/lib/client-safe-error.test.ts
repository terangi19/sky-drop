import { describe, expect, it } from "vitest";
import { clientSafeError, httpStatusOr } from "./client-safe-error";

describe("clientSafeError (PROMPT-16)", () => {
  it("passes our own user-facing messages with the right status", () => {
    expect(clientSafeError(new Error("Listing not found"), "x")).toEqual({ error: "Listing not found", status: 404 });
    expect(clientSafeError(new Error("You are not the buyer for this purchase"), "x").status).toBe(403);
    expect(clientSafeError(new Error("This item is out of stock"), "x").status).toBe(400);
    expect(clientSafeError(new Error("Offer is already accepted"), "x")).toEqual({ error: "Offer is already accepted", status: 400 });
    expect(clientSafeError(new Error('Cannot pay for purchase with status "completed"'), "x").status).toBe(400);
  });

  it("hides internal text: Firestore REST bodies, Stripe, env, stacks, non-Errors", () => {
    const leaks = [
      'Firestore GET error: 403 {"error":{"message":"Missing or insufficient permissions.","status":"PERMISSION_DENIED"}}',
      "Commit transaction error: 409 ABORTED projects/sky-drop-de459/databases/(default)",
      "No such payment_intent: 'pi_123'; a similar object exists in live mode",
      "Server auth is not configured. Set FIREBASE_SERVICE_ACCOUNT in Vercel environment variables.",
      "Offer is already accepted; DROP TABLE",
      'Cannot pay for purchase with status "x" extra',
    ];
    for (const m of leaks) {
      expect(clientSafeError(new Error(m), "Generic failure")).toEqual({ error: "Generic failure", status: 500 });
    }
    expect(clientSafeError({ message: "Listing not found" }, "G")).toEqual({ error: "G", status: 500 });
    expect(clientSafeError(undefined, "G")).toEqual({ error: "G", status: 500 });
  });

  it("httpStatusOr only accepts real HTTP error statuses", () => {
    expect(httpStatusOr({ status: 403 })).toBe(403);
    expect(httpStatusOr({ status: 5, code: 5 })).toBe(500);
    expect(httpStatusOr({ code: "permission-denied" })).toBe(500);
    expect(httpStatusOr({ status: 200 })).toBe(500);
    expect(httpStatusOr(null)).toBe(500);
  });
});
