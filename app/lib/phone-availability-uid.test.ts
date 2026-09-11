import { describe, expect, it } from "vitest";
import { resolvePhoneAvailabilityExcludeUid } from "./phone-availability-uid";

describe("Phone availability UID", () => {
  it("ignores a client-supplied body uid", () => {
    expect(
      resolvePhoneAvailabilityExcludeUid({
        tokenUid: "",
        bodyUid: "victim-uid",
      })
    ).toBe("");
  });

  it("uses only the verified token uid", () => {
    expect(
      resolvePhoneAvailabilityExcludeUid({
        tokenUid: "caller-uid",
        bodyUid: "victim-uid",
      })
    ).toBe("caller-uid");
  });

  it("trims the token uid", () => {
    expect(
      resolvePhoneAvailabilityExcludeUid({
        tokenUid: "  caller-uid  ",
        bodyUid: "other",
      })
    ).toBe("caller-uid");
  });
});
