import { describe, expect, it } from "vitest";
import {
  SKY_AI_WELCOME,
  isSkyAiWelcomeBleed,
  skyAiCapabilitiesReply,
} from "./sky-ai-prompts";

describe("isSkyAiWelcomeBleed", () => {
  it("detects the global welcome opener", () => {
    expect(isSkyAiWelcomeBleed(SKY_AI_WELCOME)).toBe(true);
  });

  it("does not treat capabilities reply as welcome bleed", () => {
    expect(isSkyAiWelcomeBleed(skyAiCapabilitiesReply())).toBe(false);
  });

  it("does not treat safety-focused answers as welcome bleed", () => {
    expect(
      isSkyAiWelcomeBleed(
        "Here are safety tips for buying on Sky Drop: meet in public, use Stripe checkout when you can."
      )
    ).toBe(false);
  });

  it("detects legacy welcome blocks", () => {
    expect(
      isSkyAiWelcomeBleed(
        "Tell me what you need — create a listing, price help, or safety tips. Tap a quick button below."
      )
    ).toBe(true);
  });
});
