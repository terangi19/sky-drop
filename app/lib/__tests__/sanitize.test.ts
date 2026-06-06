import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeForFirestore, sanitizeListingContent } from "../sanitize";

describe("sanitizeHtml", () => {
  it("returns empty string for falsy input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("escapes HTML special characters", () => {
    expect(sanitizeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;"
    );
  });

  it("escapes ampersands", () => {
    expect(sanitizeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes double quotes", () => {
    expect(sanitizeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("leaves plain text unchanged", () => {
    expect(sanitizeHtml("hello world")).toBe("hello world");
  });
});

describe("sanitizeForFirestore", () => {
  it("returns empty string for falsy input", () => {
    expect(sanitizeForFirestore("")).toBe("");
  });

  it("strips control characters", () => {
    expect(sanitizeForFirestore("hello\x00world\x1F")).toBe("helloworld");
  });

  it("trims whitespace", () => {
    expect(sanitizeForFirestore("  hello  ")).toBe("hello");
  });

  it("truncates to 5000 characters", () => {
    const long = "a".repeat(6000);
    expect(sanitizeForFirestore(long).length).toBeLessThanOrEqual(5000);
  });
});

describe("sanitizeListingContent", () => {
  it("returns empty string for falsy input", () => {
    expect(sanitizeListingContent("")).toBe("");
  });

  it("strips script tags", () => {
    expect(sanitizeListingContent('<script>alert("xss")</script>hello')).toBe("hello");
  });

  it("strips inline event handlers", () => {
    expect(sanitizeListingContent('<div onmouseover="alert(1)">text</div>')).toBe("text");
  });

  it("strips javascript: protocol", () => {
    expect(sanitizeListingContent('javascript:alert(1)')).toBe("alert(1)");
  });

  it("strips all HTML tags", () => {
    expect(sanitizeListingContent("<b>bold</b> <i>italic</i>")).toBe("bold italic");
  });

  it("strips control characters", () => {
    expect(sanitizeListingContent("hello\x00world")).toBe("helloworld");
  });

  it("truncates to 5000 characters", () => {
    const long = "a".repeat(6000);
    expect(sanitizeListingContent(long).length).toBeLessThanOrEqual(5000);
  });

  it("trims result", () => {
    expect(sanitizeListingContent("  hello  ")).toBe("hello");
  });
});
