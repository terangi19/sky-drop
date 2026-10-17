import { describe, expect, it } from "vitest";
import { parseCliArgs, planFollowerScrub } from "../../scripts/lib/follower-scrub.cjs";

describe("planFollowerScrub", () => {
  it("removes emails and legacy keys, keeps uid fields", () => {
    expect(
      planFollowerScrub("s1_f1", {
        sellerId: "s1",
        followerId: "f1",
        createdAt: 1,
        followerEmail: "f@x.com",
        sellerEmail: "s@x.com",
        followingId: "s1",
      })
    ).toEqual({ docId: "s1_f1", deleteKeys: ["followerEmail", "followingId", "sellerEmail"], issues: [] });
  });
  it("clean doc: nothing to do", () => {
    expect(planFollowerScrub("s1_f1", { sellerId: "s1", followerId: "f1", createdAt: 1 }).deleteKeys).toEqual([]);
  });
  it("reports (never fixes) id mismatches, missing uids and self-follows", () => {
    expect(planFollowerScrub("other", { sellerId: "s1", followerId: "f1" }).issues).toEqual(["id_mismatch"]);
    expect(planFollowerScrub("x", { followerEmail: "a@b.c" }).issues).toEqual(["missing_sellerId", "missing_followerId"]);
    expect(planFollowerScrub("s_s", { sellerId: "s", followerId: "s" }).issues).toEqual(["self_follow"]);
    expect(planFollowerScrub("x", null).deleteKeys).toEqual([]);
  });
  it("plan output never contains email values", () => {
    const out = JSON.stringify(planFollowerScrub("s1_f1", { sellerId: "s1", followerId: "f1", followerEmail: "secret@x.com" }));
    expect(out).not.toContain("secret@x.com");
  });
});

describe("parseCliArgs", () => {
  it("dry-run by default; --apply opt-in; page size clamped", () => {
    expect(parseCliArgs([])).toEqual({ apply: false, pageSize: 300 });
    expect(parseCliArgs(["--apply"])).toEqual({ apply: true, pageSize: 300 });
    expect(parseCliArgs(["--page-size=9999"]).pageSize).toBe(450);
    expect(parseCliArgs(["--page-size=0"]).pageSize).toBe(300);
    expect(parseCliArgs(["--dry-run"]).apply).toBe(false);
  });
});
