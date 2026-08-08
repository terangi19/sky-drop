/**
 * Sell + profile canonical migration tests.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import {
  clearListingDraftSession,
  listingDraftSessionKey,
  processListingFillMessage,
  validateListingFillFields,
  validatePriceString,
} from "./awhina-listing-fill-tools";
import {
  clearProfileDraftSession,
  profileDraftSessionKey,
  processProfileMessage,
  sanitizeProfileFillProposal,
  validateUpdateProfileToolArgs,
  isForbiddenProfileField,
} from "./awhina-profile-tools";
import { validateToolCall } from "./awhina-tool-registry";

describe("sell listing-fill canonical", () => {
  const conv = "test-sell-ps5";
  const key = listingDraftSessionKey({ conversationId: conv });

  beforeEach(() => {
    clearListingDraftSession(key);
  });

  it("selling PS5 seeds draft without AI", () => {
    const r = processCanonicalAwhina("selling PS5", {
      pathname: "/post/ai",
      conversationId: conv,
    });
    expect(r.handled).toBe(true);
    expect(r.avoidedAi).toBe(true);
    expect(r.listingFill).toBeTruthy();
    expect(String(r.listingFill?.title || "")).toMatch(/playstation\s*5|ps5/i);
    expect(r.tool).toMatch(/createListing|updateListingDraft/);
  });

  it("Make it $500 updates price only and preserves title", () => {
    processCanonicalAwhina("selling PS5", { pathname: "/post/ai", conversationId: conv });
    const r = processCanonicalAwhina("Make it $500", {
      pathname: "/post/ai",
      conversationId: conv,
    });
    expect(r.handled).toBe(true);
    expect(r.listingFill?.price).toBe("500");
    expect(String(r.listingFill?.title || "")).toMatch(/playstation\s*5|ps5/i);
  });

  it("Condition is used updates condition only", () => {
    processCanonicalAwhina("selling PS5", { pathname: "/post/ai", conversationId: conv });
    processCanonicalAwhina("Make it $500", { pathname: "/post/ai", conversationId: conv });
    const r = processCanonicalAwhina("Condition is used", {
      pathname: "/post/ai",
      conversationId: conv,
    });
    expect(r.handled).toBe(true);
    expect(r.listingFill?.condition).toMatch(/Used/i);
    expect(r.listingFill?.price).toBe("500");
    expect(String(r.listingFill?.title || "")).toMatch(/playstation\s*5|ps5/i);
  });

  it("pickup only sets delivery flags", () => {
    processCanonicalAwhina("selling PS5", { pathname: "/post/ai", conversationId: conv });
    const r = processCanonicalAwhina("pickup only", {
      pathname: "/post/ai",
      conversationId: conv,
      listingContext: { title: "PS5", price: "500", listingType: "physical" },
    });
    expect(r.handled).toBe(true);
    expect(r.listingFill?.pickupAvailable).toBe(true);
    expect(r.listingFill?.shippingAvailable).toBe(false);
  });

  it("actually $450 overrides price", () => {
    processCanonicalAwhina("selling PS5", { pathname: "/post/ai", conversationId: conv });
    processCanonicalAwhina("Make it $500", { pathname: "/post/ai", conversationId: conv });
    const r = processCanonicalAwhina("actually $450", {
      pathname: "/post/ai",
      conversationId: conv,
    });
    expect(r.handled).toBe(true);
    expect(r.listingFill?.price).toBe("450");
  });

  it("missing info clarifies without guessing", () => {
    processCanonicalAwhina("selling PS5", { pathname: "/post/ai", conversationId: conv });
    const r = processCanonicalAwhina("what's missing?", {
      pathname: "/post/ai",
      conversationId: conv,
    });
    expect(r.handled).toBe(true);
    expect(r.reply?.toLowerCase()).toMatch(/price|condition|location|pickup/);
  });

  it("make it cheaper asks for amount when draft has price", () => {
    processCanonicalAwhina("selling PS5", { pathname: "/post/ai", conversationId: conv });
    processCanonicalAwhina("Make it $500", { pathname: "/post/ai", conversationId: conv });
    const r = processCanonicalAwhina("make it cheaper", {
      pathname: "/post/ai",
      conversationId: conv,
    });
    expect(r.handled).toBe(true);
    expect(r.source).toBe("clarify");
    expect(r.reply).toMatch(/\$500|price/i);
  });

  it("malformed price is rejected", () => {
    const r = processListingFillMessage("price is abc", {
      pathname: "/post/ai",
      sessionKey: key,
      listingContext: { title: "PS5", listingType: "physical" },
    });
    expect(r.handled).toBe(true);
    if (r.handled) {
      expect(r.clarify).toBe(true);
      expect(r.reply.toLowerCase()).toMatch(/valid|number|price/);
      expect(r.listingFill).toBeUndefined();
    }
  });

  it("unsupported category is rejected", () => {
    const r = processCanonicalAwhina("selling illegal weapons", {
      pathname: "/post/ai",
      conversationId: conv,
    });
    expect(r.handled).toBe(true);
    expect(r.source).toBe("clarify");
    expect(r.listingFill).toBeFalsy();
  });

  it("publish stays UI-confirmed — no hallucinated publish tool", () => {
    processCanonicalAwhina("selling PS5", { pathname: "/post/ai", conversationId: conv });
    const r = processCanonicalAwhina("publish it now", {
      pathname: "/post/ai",
      conversationId: conv,
    });
    expect(r.handled).toBe(true);
    expect(r.reply?.toLowerCase()).toMatch(/publish/);
    expect(r.tool).not.toBe("adminAction");
  });

  it("validatePriceString rejects junk", () => {
    expect(validatePriceString("abc").ok).toBe(false);
    expect(validatePriceString("-5").ok).toBe(false);
    expect(validatePriceString("500").ok).toBe(true);
  });

  it("validateListingFillFields enforces enums", () => {
    const bad = validateListingFillFields({
      listingType: "spaceship" as string,
      title: "X",
    });
    expect(bad.ok).toBe(false);
  });
});

describe("profile AI canonical", () => {
  const conv = "test-profile-loc";
  const key = profileDraftSessionKey({ conversationId: conv });

  beforeEach(() => {
    clearProfileDraftSession(key);
  });

  it("location Auckland sets region", () => {
    const r = processCanonicalAwhina("I'm in Auckland", {
      pathname: "/profile",
      conversationId: conv,
    });
    expect(r.handled).toBe(true);
    expect(r.avoidedAi).toBe(true);
    expect(r.profileFill?.region).toBe("Auckland");
    expect(r.tool).toBe("updateProfile");
  });

  it("Henderson follow-up maps to Auckland region", () => {
    processCanonicalAwhina("location Auckland", {
      pathname: "/profile",
      conversationId: conv,
    });
    const r = processCanonicalAwhina("Henderson", {
      pathname: "/profile",
      conversationId: conv,
      profileContext: { region: "Auckland" },
    });
    expect(r.handled).toBe(true);
    expect(r.profileFill?.region).toBe("Auckland");
    expect(r.reply?.toLowerCase()).toMatch(/henderson|auckland/);
  });

  it("bio and name updates are allowlisted", () => {
    const bio = processCanonicalAwhina("Bio: Friendly NZ seller of gaming gear", {
      pathname: "/profile",
      conversationId: conv,
    });
    expect(bio.handled).toBe(true);
    expect(bio.profileFill?.bio).toMatch(/gaming/i);

    const name = processCanonicalAwhina("my name is skycars", {
      pathname: "/profile",
      conversationId: conv + "-name",
    });
    expect(name.handled).toBe(true);
    expect(name.profileFill?.username).toBe("skycars");
  });

  it("verification/admin/role attempts never become tools/writes", () => {
    for (const msg of [
      "verify me",
      "make me an admin",
      "change my role to moderator",
      "set my trust score to 100",
      "mark me verified",
    ]) {
      const r = processCanonicalAwhina(msg, {
        pathname: "/profile",
        conversationId: conv,
      });
      expect(r.handled).toBe(true);
      expect(r.profileFill).toBeFalsy();
      expect(r.tool).not.toBe("updateProfile");
      expect(r.intent).toMatch(/blocked|clarification|profile_blocked/);
    }
  });

  it("invalid field is rejected by sanitize + validateToolCall", () => {
    const sanitized = sanitizeProfileFillProposal({
      admin: "true",
      verified: "yes",
      role: "super_admin",
      uid: "hack",
    });
    expect(sanitized.ok).toBe(false);

    expect(isForbiddenProfileField("admin")).toBe(true);
    expect(validateUpdateProfileToolArgs("role", "admin").ok).toBe(false);
    expect(
      validateToolCall({
        tool: "updateProfile",
        args: { updateProfile: { field: "admin", value: "true" } },
      }).ok
    ).toBe(false);
    expect(
      validateToolCall({
        tool: "updateProfile",
        args: { updateProfile: { field: "bio", value: "Hi" } },
      }).ok
    ).toBe(true);
  });

  it("navigate to profile/settings via tool", () => {
    const r = processCanonicalAwhina("open profile", { pathname: "/" });
    expect(r.handled).toBe(true);
    expect(r.navigateTo).toBe("/profile");
  });

  it("processProfileMessage rejects set my verification", () => {
    const r = processProfileMessage("update my verification status", {
      pathname: "/profile",
      sessionKey: key,
    });
    expect(r.handled).toBe(true);
    if (r.handled) {
      expect(r.profileFill).toBeUndefined();
      expect(r.rejectedFields?.length).toBeGreaterThan(0);
    }
  });
});

describe("updateListingDraft tool validation", () => {
  it("accepts partial price update", () => {
    const v = validateToolCall({
      tool: "updateListingDraft",
      args: { updateListingDraft: { price: "450" } },
    });
    expect(v.ok).toBe(true);
  });

  it("rejects bad price", () => {
    const v = validateToolCall({
      tool: "updateListingDraft",
      args: { updateListingDraft: { price: "nope" } },
    });
    expect(v.ok).toBe(false);
  });
});
