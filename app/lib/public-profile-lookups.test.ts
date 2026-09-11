import { describe, expect, it } from "vitest";
import { selectPublicProfileLookups } from "./public-profile-lookups";

describe("Public profile email lookups", () => {
  it("drops emails for unauthenticated callers (account-existence oracle)", () => {
    expect(
      selectPublicProfileLookups({
        uids: ["uid-a"],
        emails: ["seller@example.test"],
        authenticated: false,
      })
    ).toEqual({ uids: ["uid-a"], emails: [] });
  });

  it("keeps emails for authenticated callers", () => {
    expect(
      selectPublicProfileLookups({
        uids: ["uid-a"],
        emails: ["seller@example.test"],
        authenticated: true,
      })
    ).toEqual({ uids: ["uid-a"], emails: ["seller@example.test"] });
  });
});
