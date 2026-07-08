import { describe, expect, it } from "vitest";
import { buildSkyAiSystemPrompt } from "./sky-ai-prompt";
import {
  AWHINA_DEAD_END_PHRASES,
  AWHINA_TASK_COMPLETION_RULES,
} from "./sky-ai-task-completion";
import {
  SKY_AI_EVAL_CATEGORIES,
  SKY_AI_EVAL_SCENARIOS,
  scoreSkyAiEvalReply,
} from "./sky-ai-evaluation-scenarios";
import {
  detectSkyAiIntent,
  hasListingSellIntent,
  isSkyAiAdviceQuestion,
} from "./sky-ai-intent";

describe("sky-ai evaluation suite", () => {
  it("has at least 100 scenarios", () => {
    expect(SKY_AI_EVAL_SCENARIOS.length).toBeGreaterThanOrEqual(100);
  });

  it("has unique scenario ids", () => {
    const ids = SKY_AI_EVAL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers major marketplace categories", () => {
    const required = [
      "vehicle",
      "physical",
      "service",
      "rental",
      "find_buy",
      "pricing",
      "safety",
      "recovery",
      "robustness",
    ];
    for (const cat of required) {
      expect(SKY_AI_EVAL_CATEGORIES).toContain(cat);
    }
  });

  it("every scenario forbids dead-end phrases", () => {
    for (const s of SKY_AI_EVAL_SCENARIOS) {
      expect(s.mustNotInclude.length).toBeGreaterThan(0);
    }
  });
});

describe("sky-ai intent detection", () => {
  it("detects sell intent from natural vehicle description", () => {
    expect(hasListingSellIntent("I want to sell my BMW 335i")).toBe(true);
    expect(detectSkyAiIntent("I want to sell my BMW 335i")).toBe("sell_list");
  });

  it("detects find intent without sell intent", () => {
    expect(detectSkyAiIntent("Find me a PS5 under $600")).toBe("find_buy");
    expect(hasListingSellIntent("Find me a PS5 under $600")).toBe(false);
  });

  it("detects pricing questions", () => {
    expect(detectSkyAiIntent("How much is my iPhone worth?")).toBe("price_value");
  });

  it("detects visibility troubleshooting", () => {
    expect(detectSkyAiIntent("Why isn't my listing showing?")).toBe("visibility_issue");
  });

  it("detects edit and delete listing", () => {
    expect(detectSkyAiIntent("Edit my listing title")).toBe("edit_listing");
    expect(detectSkyAiIntent("Delete my listing")).toBe("delete_listing");
  });

  it("detects cancel draft and buy trouble", () => {
    expect(detectSkyAiIntent("Never mind, delete the draft")).toBe("cancel_draft");
    expect(detectSkyAiIntent("Why can't I buy this?")).toBe("buy_trouble");
  });

  it("handles typos for sell intent", () => {
    expect(hasListingSellIntent("sel my mazda axela 2015 $11500")).toBe(true);
  });

  it("separates advice from navigation", () => {
    expect(isSkyAiAdviceQuestion("Should I use auction or buy now?")).toBe(true);
    expect(isSkyAiAdviceQuestion("Take me to messages")).toBe(false);
  });
});

describe("sky-ai system prompt", () => {
  it("includes task completion rules", () => {
    const prompt = buildSkyAiSystemPrompt("/");
    expect(prompt).toContain("TASK COMPLETION");
    expect(prompt).toContain("Never leave a dead end");
    expect(prompt).toContain(AWHINA_TASK_COMPLETION_RULES.slice(0, 40));
  });

  it("includes pricing response format on sell page", () => {
    const prompt = buildSkyAiSystemPrompt("/post/ai");
    expect(prompt).toContain("Quick sale");
    expect(prompt).toContain("LISTING_FILL");
  });
});

describe("scoreSkyAiEvalReply", () => {
  it("passes a good sell reply", () => {
    const scenario = SKY_AI_EVAL_SCENARIOS.find((s) => s.id === "sell-bmw-01")!;
    const reply = `Filled your BMW listing. [[LISTING_FILL]]{"title":"2007 BMW 335i"}[[/LISTING_FILL]] Want me to adjust the price?`;
    const result = scoreSkyAiEvalReply(scenario, reply);
    expect(result.pass).toBe(true);
  });

  it("fails dead-end replies", () => {
    const scenario = SKY_AI_EVAL_SCENARIOS.find((s) => s.id === "sell-bmw-01")!;
    const result = scoreSkyAiEvalReply(scenario, "I can't help with that.");
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.startsWith("dead_end"))).toBe(true);
  });

  it("flags missing listing_fill when required", () => {
    const scenario = SKY_AI_EVAL_SCENARIOS.find((s) => s.id === "sell-ps5")!;
    const result = scoreSkyAiEvalReply(scenario, "Sure, tell me more about your item.");
    expect(result.failures).toContain("missing_listing_fill");
  });
});

describe("dead-end phrase guardrails", () => {
  it("documents forbidden phrases for eval", () => {
    expect(AWHINA_DEAD_END_PHRASES.length).toBeGreaterThanOrEqual(5);
  });
});
