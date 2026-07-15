import { describe, expect, it } from "vitest";
import { endOfSpeechDelayMs, SILENCE_MS } from "./awhina-voice-end-of-speech";

describe("endOfSpeechDelayMs", () => {
  it("fires instantly for exact nav shortcuts", () => {
    expect(endOfSpeechDelayMs("sell")).toBe(0);
    expect(endOfSpeechDelayMs("home")).toBe(0);
  });

  it("fires instantly for high-confidence navigation", () => {
    expect(
      endOfSpeechDelayMs("go to messages", { pathname: "/", hadFinalChunk: true })
    ).toBe(0);
    expect(endOfSpeechDelayMs("open sales", { pathname: "/", quickCommand: true })).toBe(0);
  });

  it("does not use multi-second conversation silence anymore", () => {
    expect(SILENCE_MS.conversation).toBeLessThanOrEqual(800);
    const delay = endOfSpeechDelayMs("hey whats the weather like today", {
      pathname: "/",
    });
    expect(delay).toBeLessThanOrEqual(800);
  });

  it("stays patient for listing dictation", () => {
    const delay = endOfSpeechDelayMs(
      "selling my 2015 mazda axela blue 128000km auckland eleven thousand",
      { pathname: "/" }
    );
    expect(delay).toBeGreaterThanOrEqual(5000);
  });
});
