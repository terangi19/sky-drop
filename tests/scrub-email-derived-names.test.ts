import { describe, expect, it } from "vitest";
import {
  mutationForPlan,
  planScrub,
  type ScrubProfile,
} from "../scripts/scrub-email-derived-names";

const john: ScrubProfile = {
  uid: "uid-john",
  username: "johnsmith",
  displayName: "",
  email: "john.smith@example.com",
};

describe("planScrub", () => {
  it("plans a byName for a shout that only has an email in by, and does not change by", () => {
    const plan = planScrub({
      collection: "tradeShouts",
      data: { by: "john.smith@example.com", text: "hi" },
      profile: john,
    });
    expect(plan.update).toEqual({ byName: "Sky Drop member", byId: "uid-john" });
    expect(plan.update).not.toHaveProperty("by");
  });

  it("leaves an already-clean shout unchanged", () => {
    const plan = planScrub({
      collection: "tradeShouts",
      data: { by: "seller@example.com", byName: "Wiremu", byId: "uid-aroha" },
      profile: { uid: "uid-aroha", displayName: "Wiremu", username: "wiremu_nz", email: "seller@example.com" },
    });
    expect(plan.update).toBeNull();
  });

  it("adds byName and byId on reply elements without changing by", () => {
    const plan = planScrub({
      collection: "tradePosts",
      data: {
        sellerEmail: "seller@example.com",
        sellerUsername: "KiwiTrader",
        replies: [{ text: "hi", by: "jane@example.com", at: "t1" }],
      },
      profile: { uid: "seller", username: "KiwiTrader", email: "seller@example.com" },
      profilesByEmail: {
        "jane@example.com": { uid: "uid-jane", username: "jane", displayName: "", email: "jane@example.com" },
      },
    });
    expect(plan.update?.sellerUsername).toBeUndefined();
    expect(plan.update?.replies).toEqual([
      {
        text: "hi",
        by: "jane@example.com",
        at: "t1",
        byName: "Sky Drop member",
        byId: "uid-jane",
      },
    ]);
  });

  it("does not rewrite a stored name that equals the profile username", () => {
    const plan = planScrub({
      collection: "listings",
      data: {
        sellerEmail: "john.smith@example.com",
        sellerUsername: "johnsmith",
        sellerId: "uid-john",
      },
      profile: john,
    });
    expect(plan.update).toBeNull();
  });

  it("replaces a dotted email-local sellerUsername with the profile slug", () => {
    const plan = planScrub({
      collection: "listings",
      data: {
        sellerEmail: "john.smith@example.com",
        sellerUsername: "john.smith",
        sellerName: "john.smith@example.com",
      },
      profile: john,
    });
    expect(plan.update).toEqual({
      sellerUsername: "johnsmith",
      sellerName: "johnsmith",
    });
  });

  it("sets a neutral reviewerName and only rewrites reviewer when it contains @", () => {
    const kept = planScrub({
      collection: "reviews",
      data: { reviewer: "johnsmith", reviewerEmail: "johnsmith@example.com" },
      profile: { uid: "u", username: "johnsmith", email: "johnsmith@example.com" },
    });
    expect(kept.update).toEqual({ reviewerName: "Verified Buyer" });

    const emailReviewer = planScrub({
      collection: "reviews",
      data: { reviewer: "john@example.com", reviewerEmail: "john@example.com" },
      profile: null,
    });
    expect(emailReviewer.update).toEqual({
      reviewer: "Verified Buyer",
      reviewerName: "Verified Buyer",
    });
  });

  it("dry-run produces zero writes", () => {
    const plan = planScrub({
      collection: "tradeShouts",
      data: { by: "john.smith@example.com" },
      profile: john,
    });
    expect(plan.update).not.toBeNull();
    expect(mutationForPlan(plan, false)).toBeNull();
    expect(mutationForPlan(plan, true)).toEqual(plan.update);
  });
});
