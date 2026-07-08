import { describe, expect, it } from "vitest";
import { resolveVoiceCommand } from "./awhina-voice-command";

describe("resolveVoiceCommand navigation coverage", () => {
  it("routes core marketplace destinations", () => {
    expect(resolveVoiceCommand("go home", "/messages")?.path).toBe("/");
    expect(resolveVoiceCommand("open my listings", "/")?.path).toBe("/list-list");
    expect(resolveVoiceCommand("take me to messages", "/")?.path).toBe("/messages");
    expect(resolveVoiceCommand("show my purchases", "/")?.path).toBe("/purchases");
    expect(resolveVoiceCommand("open watchlist", "/")?.path).toBe("/watchlist");
    expect(resolveVoiceCommand("show vehicles", "/")?.path).toBe("/vehicles");
    expect(resolveVoiceCommand("show services", "/")?.path).toBe("/services");
    expect(resolveVoiceCommand("go to my profile", "/")?.path).toBe("/profile");
  });

  it("keeps messy transcripts navigable", () => {
    expect(resolveVoiceCommand("um please show my purcheses", "/")?.path).toBe("/purchases");
  });

  it("blocks unauthorized admin navigation", () => {
    const cmd = resolveVoiceCommand("open admin", "/", { isAdmin: false });
    expect(cmd?.type).toBe("reply");
    expect(cmd?.message).toMatch(/authorized accounts/i);
  });

  it("allows authorized admin navigation", () => {
    const cmd = resolveVoiceCommand("open admin", "/", { isAdmin: true });
    expect(cmd?.type).toBe("navigate");
    expect(cmd?.path).toBe("/manage");
  });

  it("routes sell-by-voice listing creation to sell", () => {
    const cmd = resolveVoiceCommand("sell my BMW 335i for 14 grand", "/");
    expect(cmd?.type).toBe("listing");
    expect(cmd?.path).toBe("/post/ai");
  });

  it("handles another natural sell transcript", () => {
    const cmd = resolveVoiceCommand("post my couch for pickup in Auckland", "/");
    expect(cmd?.type).toBe("listing");
    expect(cmd?.path).toBe("/post/ai");
  });

  it("keeps page-level seller messaging local on listing pages", () => {
    const cmd = resolveVoiceCommand("message the seller", "/post/listing/abc123");
    expect(cmd?.type).toBe("page");
  });
});
