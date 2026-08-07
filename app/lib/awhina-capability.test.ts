/**
 * Vision + free-form capability regression tests (no live OpenAI).
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  sanitizeVisionExtraction,
  visionFieldsToListingFill,
  visionDegradedReply,
  isCorrectionMessage,
  type VisionStructuredExtraction,
} from "./awhina-vision-capability";
import {
  shouldUseLlmCapability,
  freeFormDegradedReply,
} from "./awhina-llm-capability";
import { runFreeformCapability, shouldUseFreeformCapability } from "./awhina-freeform-capability";
import {
  scoreToConfidenceLevel,
  normalizeConfidenceLevel,
  gateByConfidence,
  isDestructiveTool,
  keepConfidentFields,
  confidenceLevelToScore,
} from "./awhina-confidence-levels";
import {
  recordAwhinaObs,
  getAwhinaObsSummary,
  resetAwhinaObsForTests,
} from "./awhina-observability";
import { processCanonicalAwhina } from "./awhina-canonical";
import { validateToolCall } from "./awhina-tool-registry";

describe("confidence levels shared", () => {
  it("maps scores to HIGH/MEDIUM/LOW", () => {
    expect(scoreToConfidenceLevel(0.9)).toBe("HIGH");
    expect(scoreToConfidenceLevel(0.6)).toBe("MEDIUM");
    expect(scoreToConfidenceLevel(0.2)).toBe("LOW");
  });

  it("normalizes mixed casings", () => {
    expect(normalizeConfidenceLevel("high")).toBe("HIGH");
    expect(normalizeConfidenceLevel("MEDIUM")).toBe("MEDIUM");
    expect(normalizeConfidenceLevel("l")).toBe("LOW");
  });

  it("destructive tools always need confirmation", () => {
    const gate = gateByConfidence(
      { tool: "adminAction", args: { adminAction: { action: "ban" } } },
      "HIGH"
    );
    expect(gate.needsConfirmation).toBe(true);
    expect(gate.shouldExecute).toBe(false);
    expect(isDestructiveTool({ tool: "adminAction" })).toBe(true);
  });

  it("LOW state-changing asks clarification", () => {
    const gate = gateByConfidence(
      { tool: "createListing", args: { createListing: { listingType: "physical" } } },
      "LOW"
    );
    expect(gate.needsClarification).toBe(true);
    expect(gate.shouldExecute).toBe(false);
  });
});

describe("vision extraction sanitize", () => {
  const base: VisionStructuredExtraction = {
    title: { value: "Sony PlayStation console", confidence: "HIGH", visuallySupported: true },
    category: { value: "Gaming", confidence: "HIGH", visuallySupported: true },
    listingType: { value: "physical", confidence: "HIGH", visuallySupported: true },
    conditionClues: { value: "box open, light scuffs", confidence: "MEDIUM", visuallySupported: true },
    description: {
      value: "Looks like a console in opened box. Fully working. $450. Located in Auckland.",
      confidence: "MEDIUM",
      visuallySupported: true,
    },
    keywords: {
      value: ["playstation", "console", "authentic", "$400"],
      confidence: "MEDIUM",
      visuallySupported: true,
    },
    visibleModel: {
      value: "MadeUpModelX",
      confidence: "LOW",
      visuallySupported: false,
    },
    clarifyQuestions: [],
  };

  it("drops low-confidence / unsupported exact model", () => {
    const { fields, omitted } = sanitizeVisionExtraction(base);
    expect(fields.visibleModel).toBeUndefined();
    expect(omitted).toContain("visibleModel");
  });

  it("strips price authenticity location claims from description/keywords", () => {
    const { fields } = sanitizeVisionExtraction(base);
    const desc = String(fields.description?.value || "");
    expect(desc).not.toMatch(/\$\s*\d/);
    expect(desc.toLowerCase()).not.toMatch(/fully working/);
    expect(desc.toLowerCase()).not.toMatch(/auckland/);
    const kws = (fields.keywords?.value as string[]) || [];
    expect(kws.some((k) => /authentic|\$/i.test(k))).toBe(false);
  });

  it("maps vision fields to listingFill without inventing price/location", () => {
    const { fields } = sanitizeVisionExtraction(base);
    const fill = visionFieldsToListingFill(fields);
    expect(fill.title).toMatch(/sony|playstation/i);
    expect(fill.category).toBe("Gaming");
    expect(fill.price).toBeUndefined();
    expect(fill.location).toBeUndefined();
    expect(fill.condition).toBeTruthy();
  });

  it("correction-only preserves existing draft fields when merging", () => {
    const correction: VisionStructuredExtraction = {
      title: { value: "PS5 Digital Edition", confidence: "HIGH", visuallySupported: true },
      description: {
        value: "Digital edition — controller isn't included.",
        confidence: "HIGH",
        visuallySupported: true,
      },
    };
    const { fields } = sanitizeVisionExtraction(correction, {
      correctionOnly: true,
      existingDraft: { title: "PS5", listingType: "physical", category: "Gaming" },
    });
    const fill = visionFieldsToListingFill(fields, { title: "PS5", listingType: "physical" }, true);
    const merged = {
      title: "PS5",
      listingType: "physical",
      category: "Gaming",
      ...fill,
    };
    expect(merged.title).toMatch(/digital/i);
    expect(merged.listingType).toBe("physical");
    expect(merged.price).toBeUndefined();
  });

  it("detects correction phrases", () => {
    expect(isCorrectionMessage("digital edition")).toBe(true);
    expect(isCorrectionMessage("controller isn't included")).toBe(true);
    expect(isCorrectionMessage("find me BMWs in Auckland under 15k please")).toBe(false);
  });

  it("degraded reply stays useful without OpenAI", () => {
    expect(visionDegradedReply(false).toLowerCase()).toMatch(/unavailable|describe|manually/);
    expect(visionDegradedReply(true).toLowerCase()).toMatch(/draft/);
  });

  it("keepConfidentFields omits LOW", () => {
    const kept = keepConfidentFields({
      a: { confidence: "HIGH" as const },
      b: { confidence: "LOW" as const },
      c: { confidence: "MEDIUM" as const },
    });
    expect(kept.a).toBeTruthy();
    expect(kept.b).toBeUndefined();
    expect(kept.c).toBeTruthy();
  });
});

describe("free-form capability gates", () => {
  it("does not send simple nav to LLM", () => {
    expect(shouldUseLlmCapability("messages")).toBe(false);
    expect(shouldUseLlmCapability("sell")).toBe(false);
    expect(shouldUseFreeformCapability("home")).toBe(false);
  });

  it("allows ambiguous semantic questions", () => {
    expect(shouldUseLlmCapability("how does messaging-first buying work here?")).toBe(true);
  });

  it("degraded free-form reply avoids Buy Now / Stripe pitches", async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const r = await runFreeformCapability({
      message: "how do I buy something safely?",
      pathname: "/",
    });
    expect(r.degraded).toBe(true);
    expect(r.reply.toLowerCase()).not.toMatch(/stripe checkout|buy now button/);
    expect(r.routing).toBe("llm_capability");
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
  });

  it("freeFormDegradedReply handles general questions", () => {
    const reply = freeFormDegradedReply("what can you do?", "/");
    expect(reply.toLowerCase()).toMatch(/sell|message|find|sky drop/);
  });

  it("tool registry validates structured navigate — no regex actions", () => {
    const ok = validateToolCall({
      tool: "navigate",
      args: { navigate: { path: "/messages" } },
      confidence: 0.9,
    });
    expect(ok.ok).toBe(true);
    const bad = validateToolCall({
      tool: "navigate",
      args: { navigate: { path: "messages" } },
    });
    expect(bad.ok).toBe(false);
  });
});

describe("observability counters", () => {
  beforeEach(() => {
    resetAwhinaObsForTests();
  });

  it("tracks vision vs freeform vs local without message content", () => {
    recordAwhinaObs({
      intent: "navigation",
      localVsAi: "local",
      capability: "local",
      success: true,
      latencyMs: 2,
      clarification: false,
    });
    recordAwhinaObs({
      intent: "vision",
      localVsAi: "ai",
      capability: "vision",
      success: true,
      latencyMs: 800,
      clarification: false,
      promptTokens: 400,
      completionTokens: 120,
      imageCount: 2,
    });
    recordAwhinaObs({
      intent: "free_form",
      localVsAi: "ai",
      capability: "free_form",
      success: true,
      latencyMs: 600,
      clarification: true,
      promptTokens: 200,
      completionTokens: 80,
    });
    const s = getAwhinaObsSummary();
    expect(s.localOrRulesHits).toBe(1);
    expect(s.visionHits).toBe(1);
    expect(s.freeFormHits).toBe(1);
    expect(s.totalPromptTokens).toBe(600);
    expect(s.openaiHitRate).toBeGreaterThan(0);
    expect(JSON.stringify(s)).not.toMatch(/playstation|buy something/i);
  });
});

describe("canonical still avoids AI for local", () => {
  it("messages stays local after capability ship", () => {
    const r = processCanonicalAwhina("messages", { pathname: "/" });
    expect(r.handled).toBe(true);
    expect(r.avoidedAi).toBe(true);
    expect(r.navigateTo).toBe("/messages");
  });

  it("confidenceLevelToScore is consistent", () => {
    expect(confidenceLevelToScore("HIGH")).toBeGreaterThan(confidenceLevelToScore("MEDIUM"));
    expect(confidenceLevelToScore("MEDIUM")).toBeGreaterThan(confidenceLevelToScore("LOW"));
  });
});
