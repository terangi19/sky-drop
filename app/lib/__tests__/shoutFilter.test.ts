import { describe, it, expect } from "vitest";
import { checkShout } from "../shoutFilter";

describe("checkShout", () => {
  it("returns clean for normal text", () => {
    const result = checkShout("This is a perfectly fine message");
    expect(result.clean).toBe(true);
    expect(result.word).toBeUndefined();
  });

  it("detects banned words", () => {
    const result = checkShout("you are a bastard");
    expect(result.clean).toBe(false);
    expect(result.word).toBe("bastard");
  });

  it("is case-insensitive", () => {
    const result = checkShout("WHAT THE HELL Bastard");
    expect(result.clean).toBe(false);
  });

  it("uses word boundary matching", () => {
    // "class" contains "ass" but should not trigger
    const result = checkShout("I went to class today");
    expect(result.clean).toBe(true);
  });

  it("detects multiple banned words and returns the first", () => {
    const result = checkShout("fuck this shit");
    expect(result.clean).toBe(false);
    expect(result.word).toBe("fuck");
  });

  it("returns clean for empty string", () => {
    const result = checkShout("");
    expect(result.clean).toBe(true);
  });

  it("detects slurs", () => {
    const result = checkShout("you are a retard");
    expect(result.clean).toBe(false);
    expect(result.word).toBe("retard");
  });
});
