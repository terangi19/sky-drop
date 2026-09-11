import { describe, expect, it } from "vitest";
import {
  containsDangerousHtml,
  resolveNotificationEmailBody,
  wrapPlainTextAsEmailHtml,
} from "./notification-email-body";

describe("notification email body policy", () => {
  it("rejects script and javascript URLs in admin HTML", () => {
    expect(containsDangerousHtml('<p onclick="alert(1)">x</p>')).toBe(true);
    expect(
      resolveNotificationEmailBody({
        isAdmin: true,
        html: '<a href="javascript:alert(1)">reset</a>',
      }).ok
    ).toBe(false);
    expect(
      resolveNotificationEmailBody({
        isAdmin: true,
        html: "<script>document.cookie</script>",
      }).ok
    ).toBe(false);
  });

  it("allows admin HTML that has no script hooks", () => {
    const result = resolveNotificationEmailBody({
      isAdmin: true,
      html: "<p>Your listing sold.</p>",
    });
    expect(result).toEqual({ ok: true, html: "<p>Your listing sold.</p>" });
  });

  it("rejects raw HTML from non-admin callers", () => {
    const result = resolveNotificationEmailBody({
      isAdmin: false,
      html: "<p>Please verify at http://evil.test</p>",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/HTML/i);
  });

  it("wraps non-admin plaintext so markup cannot survive", () => {
    const result = resolveNotificationEmailBody({
      isAdmin: false,
      text: 'Hello <script>alert(1)</script> & "friend"',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&amp;");
  });

  it("server wrap escapes tags", () => {
    expect(wrapPlainTextAsEmailHtml("<img src=x onerror=alert(1)>")).not.toContain("<img");
  });
});
