import { describe, expect, it } from "vitest";
import {
  SAFE_NAME_FALLBACK,
  isAutoAssignedUsername,
  isEmailDerivedName,
  resolvePublicAuthorName,
  resolvePublicProfileName,
  safeDisplayName,
  sanitizeAuthorNameForWrite,
} from "./safe-display-name";

describe("isEmailDerivedName", () => {
  it("treats empty and non-strings as not email-derived", () => {
    expect(isEmailDerivedName("")).toBe(false);
    expect(isEmailDerivedName("   ")).toBe(false);
    expect(isEmailDerivedName(undefined)).toBe(false);
    expect(isEmailDerivedName(null)).toBe(false);
    expect(isEmailDerivedName(42)).toBe(false);
  });

  it("flags @-handles, full emails, and embedded @", () => {
    expect(isEmailDerivedName("@jsmith", "jsmith@example.com")).toBe(true);
    expect(isEmailDerivedName("john@example.com")).toBe(true);
    expect(isEmailDerivedName("john@")).toBe(true);
    expect(isEmailDerivedName("jo@hn")).toBe(true);
    expect(isEmailDerivedName("see john@example.com please")).toBe(true);
  });

  it("matches the email local part, including case and surrounding spaces", () => {
    expect(isEmailDerivedName("  John  ", "john@example.com")).toBe(true);
    expect(isEmailDerivedName("JOHN", "john@example.com")).toBe(true);
  });

  it("matches dotted locals, the sanitised slug, and case variants", () => {
    const email = "john.smith@x.com";
    expect(isEmailDerivedName("john.smith", email)).toBe(true);
    expect(isEmailDerivedName("johnsmith", email)).toBe(true);
    expect(isEmailDerivedName("JohnSmith", email)).toBe(true);
  });

  it("matches plus-tags, the tag-stripped local, and the sanitised slug", () => {
    const email = "jane+shop@x.com";
    expect(isEmailDerivedName("jane", email)).toBe(true);
    expect(isEmailDerivedName("jane+shop", email)).toBe(true);
    expect(isEmailDerivedName("janeshop", email)).toBe(true);
  });

  it("matches digit-leading locals via the user prefix", () => {
    expect(isEmailDerivedName("user123abc", "123abc@x.com")).toBe(true);
    expect(isEmailDerivedName("123abc", "123abc@x.com")).toBe(true);
  });

  it("matches collision suffixes 2..20 and not unrelated suffixes", () => {
    expect(isEmailDerivedName("jsmith2", "jsmith@example.com")).toBe(true);
    expect(isEmailDerivedName("jsmith20", "jsmith@example.com")).toBe(true);
    expect(isEmailDerivedName("jsmith21", "jsmith@example.com")).toBe(false);
    expect(isEmailDerivedName("jsmith1", "jsmith@example.com")).toBe(false);
  });

  it("keeps Māori and other unicode names unless they equal the email local part", () => {
    for (const name of ["Aroha Tāne", "Hēmi", "Wiremu Māori-Tāne", "Ngāti"]) {
      expect(isEmailDerivedName(name)).toBe(false);
      expect(isEmailDerivedName(name, "someone@example.com")).toBe(false);
    }
    expect(isEmailDerivedName("Hēmi", "Hēmi@example.com")).toBe(true);
  });

  it("keeps a plain handle when no email is available to compare (documented limitation)", () => {
    expect(isEmailDerivedName("jsmith")).toBe(false);
    expect(isEmailDerivedName("@jsmith")).toBe(false);
  });
});

describe("isAutoAssignedUsername", () => {
  it("matches the reserved slug, not a raw dotted local", () => {
    expect(isAutoAssignedUsername("johnsmith", "john.smith@x.com")).toBe(true);
    expect(isAutoAssignedUsername("john.smith", "john.smith@x.com")).toBe(false);
    expect(isAutoAssignedUsername("jsmith2", "jsmith@example.com")).toBe(true);
    expect(isAutoAssignedUsername("KiwiTrader", "kiwi@example.com")).toBe(false);
  });
});

describe("safeDisplayName", () => {
  it("falls back for empty values and honours the fallback argument", () => {
    expect(safeDisplayName("")).toBe(SAFE_NAME_FALLBACK);
    expect(safeDisplayName("   ")).toBe(SAFE_NAME_FALLBACK);
    expect(safeDisplayName(undefined)).toBe(SAFE_NAME_FALLBACK);
    expect(safeDisplayName(null)).toBe(SAFE_NAME_FALLBACK);
    expect(safeDisplayName(7)).toBe(SAFE_NAME_FALLBACK);
    expect(safeDisplayName("", null, "Someone")).toBe("Someone");
    expect(safeDisplayName(null, null, "Buyer")).toBe("Buyer");
  });

  it("strips one leading @ and truncates to 60 characters", () => {
    expect(safeDisplayName("@KiwiTrader")).toBe("KiwiTrader");
    const long = "A".repeat(70);
    expect(safeDisplayName(long)).toBe("A".repeat(60));
    expect(safeDisplayName("A".repeat(40))).toBe("A".repeat(40));
  });

  it("keeps unicode names and plain handles, and drops email-derived names", () => {
    expect(safeDisplayName("Aroha Tāne")).toBe("Aroha Tāne");
    expect(safeDisplayName("Hēmi")).toBe("Hēmi");
    expect(safeDisplayName("Wiremu Māori-Tāne")).toBe("Wiremu Māori-Tāne");
    expect(safeDisplayName("Ngāti")).toBe("Ngāti");
    expect(safeDisplayName("jsmith")).toBe("jsmith");
    expect(safeDisplayName("johnsmith", "john.smith@x.com")).toBe(SAFE_NAME_FALLBACK);
    expect(safeDisplayName("john@example.com")).toBe(SAFE_NAME_FALLBACK);
  });
});

describe("resolvePublicAuthorName", () => {
  it("prefers a safe display name, then a user-chosen username, then the fallback", () => {
    expect(
      resolvePublicAuthorName({
        displayName: "Aroha",
        username: "johnsmith",
        email: "john.smith@x.com",
      })
    ).toBe("Aroha");
    expect(
      resolvePublicAuthorName({
        displayName: "",
        username: "johnsmith",
        email: "john.smith@x.com",
      })
    ).toBe(SAFE_NAME_FALLBACK);
    expect(
      resolvePublicAuthorName({
        displayName: "bad@x.com",
        username: "KiwiTrader",
        email: "kiwi@example.com",
      })
    ).toBe("KiwiTrader");
    expect(resolvePublicAuthorName({ username: "", email: "a@b.com" }, "Someone")).toBe("Someone");
  });
});

describe("resolvePublicProfileName", () => {
  it("keeps an auto-assigned username after display name, and still drops @", () => {
    expect(
      resolvePublicProfileName({
        displayName: "",
        username: "johnsmith",
        email: "john.smith@x.com",
      })
    ).toBe("johnsmith");
    expect(
      resolvePublicProfileName({
        displayName: "Aroha",
        username: "johnsmith",
        email: "john.smith@x.com",
      })
    ).toBe("Aroha");
    expect(
      resolvePublicProfileName({
        displayName: "bad@x.com",
        username: "johnsmith",
        email: "john.smith@x.com",
      })
    ).toBe("johnsmith");
    expect(
      resolvePublicProfileName({
        displayName: "",
        username: "seller@example.com",
        email: "seller@example.com",
      })
    ).toBe(SAFE_NAME_FALLBACK);
    expect(resolvePublicProfileName({}, "Seller")).toBe("Seller");
  });
});

describe("sanitizeAuthorNameForWrite", () => {
  it("returns empty for blank or email-derived candidates and keeps safe names", () => {
    expect(sanitizeAuthorNameForWrite("", "a@b.com")).toBe("");
    expect(sanitizeAuthorNameForWrite("  john  ", "john@example.com")).toBe("");
    expect(sanitizeAuthorNameForWrite("Aroha Tāne", "a@b.com")).toBe("Aroha Tāne");
    expect(sanitizeAuthorNameForWrite(`@${"B".repeat(80)}`, null)).toBe("B".repeat(60));
  });
});
