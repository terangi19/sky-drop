import { describe, expect, it } from "vitest";
import { resolveVoiceFormCommand } from "./awhina-voice-form-command";

describe("resolveVoiceFormCommand", () => {
  it("updates price by voice", () => {
    const cmd = resolveVoiceFormCommand("make the price 1300");
    expect(cmd?.type).toBe("apply_fill");
    if (cmd?.type === "apply_fill") {
      expect(cmd.fill.price).toBe("1300");
      expect(cmd.status).toBe("Price updated");
    }
  });

  it("handles correction prefixes", () => {
    const cmd = resolveVoiceFormCommand("actually make the price 14 grand");
    expect(cmd?.type).toBe("apply_fill");
    if (cmd?.type === "apply_fill") {
      expect(cmd.fill.price).toBe("14000");
    }
  });

  it("updates condition by voice", () => {
    const cmd = resolveVoiceFormCommand("change condition to excellent");
    expect(cmd?.type).toBe("apply_fill");
    if (cmd?.type === "apply_fill") {
      expect(cmd.fill.condition).toBe("Excellent");
    }
  });

  it("supports pickup-only edits", () => {
    const cmd = resolveVoiceFormCommand("add pickup only");
    expect(cmd?.type).toBe("apply_fill");
    if (cmd?.type === "apply_fill") {
      expect(cmd.fill.pickupAvailable).toBe(true);
      expect(cmd.fill.shippingAvailable).toBe(false);
    }
  });

  it("appends description notes", () => {
    const cmd = resolveVoiceFormCommand("add that it has no scratches");
    expect(cmd?.type).toBe("append_description");
    if (cmd?.type === "append_description") {
      expect(cmd.text).toBe("it has no scratches");
    }
  });

  it("requires confirmation before publish", () => {
    const cmd = resolveVoiceFormCommand("publish it");
    expect(cmd?.type).toBe("publish");
    if (cmd?.type === "publish") {
      expect(cmd.requiresConfirmation).toBe(true);
      expect(cmd.confirmationHint).toMatch(/say "Yes" to confirm/i);
    }
  });

  it("recognizes cancel commands", () => {
    const cmd = resolveVoiceFormCommand("never mind");
    expect(cmd?.type).toBe("cancel");
  });
});
