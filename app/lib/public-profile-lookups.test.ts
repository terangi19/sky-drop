import { describe, expect, it } from "vitest";
import { selectPublicProfileLookups } from "./public-profile-lookups";

describe("Public profile email lookups", () => {
  it("drops emails for unauthenticated callers (account-existence oracle)", () => {
    expect(
      selectPublicProfileLookups({
        uids: ["uid-a"],
        emails: ["seller@example.test"],
        authenticated: false,
        emailBudgetOk: true,
      })
    ).toEqual({ uids: ["uid-a"], emails: [] });
  });

  it("keeps emails for authenticated callers within budget", () => {
    expect(
      selectPublicProfileLookups({
        uids: ["uid-a"],
        emails: ["seller@example.test"],
        authenticated: true,
        emailBudgetOk: true,
      })
    ).toEqual({ uids: ["uid-a"], emails: ["seller@example.test"] });
  });

  it("drops emails when the per-uid budget is exhausted but keeps UID lookups", () => {
    expect(
      selectPublicProfileLookups({
        uids: ["uid-a"],
        emails: ["seller@example.test"],
        authenticated: true,
        emailBudgetOk: false,
      })
    ).toEqual({ uids: ["uid-a"], emails: [] });
  });
});
