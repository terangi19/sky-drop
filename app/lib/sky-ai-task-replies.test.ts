import { describe, expect, it } from "vitest";
import { LIVE_EVAL_SCENARIOS } from "./sky-ai-live-scenarios";
import { scoreConversationReply } from "./sky-ai-reply-quality";
import { trySkyAiTaskReply } from "./sky-ai-task-replies";

const RULES_SCENARIOS = [
  "find-ps5-auckland",
  "find-mower",
  "listing-visibility",
  "why-cant-buy",
  "cancel-draft",
  "arrange-purchase",
  "price-iphone",
  "price-laptop",
];

describe("sky-ai task replies (deterministic layer)", () => {
  for (const id of RULES_SCENARIOS) {
    it(`handles ${id} without stalling`, () => {
      const scenario = LIVE_EVAL_SCENARIOS.find((s) => s.id === id)!;
      const result = trySkyAiTaskReply(scenario.userMessage, scenario.pathname);
      expect(result, id).toBeTruthy();
      const quality = scoreConversationReply(result!.text, {
        requireNextStep: true,
        requirePricing: scenario.requirePricing,
        requireNavigate: scenario.requireNavigate,
        maxQuestions: scenario.maxQuestions ?? 1,
      });
      expect(quality.failures, result!.text).toEqual([]);
    });
  }

  it("does not intercept sell intent on /post/ai", () => {
    expect(
      trySkyAiTaskReply("Sell my BMW 335i 2007 Auckland $18500", "/post/ai")
    ).toBeNull();
  });
});
