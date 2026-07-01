import { describe, expect, it } from "vitest";
import { resolveVoiceCommand } from "./awhina-voice-command";
import {
  isSalesNavigationPhrase,
  isSellNavigationPhrase,
  matchLocalCommand,
} from "./local-command-engine";
import { resolvePhonetic } from "./voice-phonetic";

describe("voice sell routing", () => {
  it('routes bare "sell" to /post/ai', () => {
    const cmd = resolveVoiceCommand("sell", "/");
    expect(cmd?.type).toBe("navigate");
    expect(cmd?.path).toBe("/post/ai");
  });

  it('routes "go to sell" to /post/ai', () => {
    const cmd = resolveVoiceCommand("go to sell", "/messages");
    expect(cmd?.type).toBe("navigate");
    expect(cmd?.path).toBe("/post/ai");
  });

  it('routes STT variants sells/cells to /post/ai', () => {
    for (const phrase of ["sells", "cells", "cell"]) {
      const cmd = resolveVoiceCommand(phrase, "/");
      expect(cmd?.path, phrase).toBe("/post/ai");
    }
  });

  it('routes "sales" to /sales not /post/ai', () => {
    expect(isSalesNavigationPhrase("sales")).toBe(true);
    expect(isSellNavigationPhrase("sales")).toBe(false);
    const cmd = resolveVoiceCommand("sales", "/");
    expect(cmd?.path).toBe("/sales");
  });

  it("does not phonetically rewrite sales to sell", () => {
    expect(resolvePhonetic("sales")).toBe("sales");
  });

  it("still navigates sell when already on /post/ai", () => {
    const cmd = matchLocalCommand("sell", "/post/ai");
    expect(cmd?.type).toBe("navigate");
    expect(cmd?.path).toBe("/post/ai");
  });
});
