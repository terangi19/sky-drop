import { describe, expect, it } from "vitest";
import { emailDomain, isDisposableEmail } from "../app/lib/temp-email";

describe("disposable domain matching", () => {
  it("T2 matches parent domains and trailing dots without blocking unrelated hosts", () => {
    expect(isDisposableEmail("x@Sub.Mailinator.com.")).toBe(true);
    expect(emailDomain("x@Sub.Mailinator.com.")).toBe("sub.mailinator.com");
    expect(isDisposableEmail("x@gmail.com")).toBe(false);
    expect(isDisposableEmail("x@foo.blogspot.com")).toBe(false);
  });

  it("still exact-matches listed hosts and does not treat a public suffix as disposable", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@regspaces.blogspot.com")).toBe(true);
    expect(isDisposableEmail("x@shitaway.usa.cc")).toBe(true);
    expect(isDisposableEmail("x@usa.cc")).toBe(false);
    expect(isDisposableEmail("x@blogspot.com")).toBe(false);
  });
});
