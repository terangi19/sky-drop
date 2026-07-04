import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunk-load-recovery";

describe("isChunkLoadError", () => {
  it("detects ChunkLoadError by name", () => {
    const err = new Error("Failed to load chunk /_next/static/chunks/foo.js");
    err.name = "ChunkLoadError";
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("detects failed chunk messages", () => {
    expect(
      isChunkLoadError(
        new Error("Failed to load chunk /_next/static/chunks/0f4rz_f6sd62p.js from module 653346")
      )
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
  });
});
