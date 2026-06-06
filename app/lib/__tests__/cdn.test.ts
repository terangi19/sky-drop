import { describe, it, expect } from "vitest";
import { cdnUrl, cdnUrls } from "../cdn";

const STORAGE_PREFIX =
  "https://firebasestorage.googleapis.com/v0/b/sky-drop-de459.appspot.com/o/";

describe("cdnUrl", () => {
  it("returns empty string for falsy input", () => {
    expect(cdnUrl("")).toBe("");
    expect(cdnUrl(undefined)).toBe("");
    expect(cdnUrl(null)).toBe("");
  });

  it("rewrites Firebase Storage URLs to CDN", () => {
    const storageUrl = `${STORAGE_PREFIX}images%2Fphoto.jpg?alt=media&token=abc`;
    const result = cdnUrl(storageUrl);
    expect(result).toBe("https://cdn.skydrop.nz/images/photo.jpg");
  });

  it("passes through non-Firebase URLs unchanged", () => {
    const url = "https://example.com/image.jpg";
    expect(cdnUrl(url)).toBe(url);
  });

  it("handles encoded paths correctly", () => {
    const storageUrl = `${STORAGE_PREFIX}uploads%2Fuser%2Fimage%20file.png?alt=media`;
    const result = cdnUrl(storageUrl);
    expect(result).toBe("https://cdn.skydrop.nz/uploads/user/image file.png");
  });
});

describe("cdnUrls", () => {
  it("filters out falsy values and maps remaining", () => {
    const urls = [
      `${STORAGE_PREFIX}a.jpg?alt=media`,
      undefined,
      "https://example.com/b.jpg",
      null,
    ];
    const result = cdnUrls(urls);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("https://cdn.skydrop.nz/a.jpg");
    expect(result[1]).toBe("https://example.com/b.jpg");
  });

  it("returns empty array for all-falsy input", () => {
    expect(cdnUrls([undefined, null, ""])).toHaveLength(0);
  });
});
