import { describe, expect, it } from "vitest";
import {
  PRICING_STRESS_ITEMS,
  REAL_USER_CONVERSATIONS,
} from "./sky-ai-conversation-scenarios";
import {
  detectSkyAiConversationIntent,
  hasListingSellIntent,
} from "./sky-ai-intent";
import {
  hasOverQuestioning,
  hasPricingStructure,
  scoreConversationReply,
} from "./sky-ai-reply-quality";

describe("realistic multi-turn conversations — intent routing", () => {
  for (const scenario of REAL_USER_CONVERSATIONS) {
    it(`routes ${scenario.id} (${scenario.title})`, () => {
      let priorAssistant: string | undefined;

      for (const turn of scenario.turns) {
        const intent = detectSkyAiConversationIntent(turn.user, {
          priorAssistant: turn.priorAssistant ?? priorAssistant,
          pathname: turn.pathname,
        });

        expect(intent, `${scenario.id}: "${turn.user}"`).toBe(turn.expectedIntent);

        if (turn.expectListingFill && !turn.priorAssistant) {
          expect(hasListingSellIntent(turn.user), turn.user).toBe(true);
        }
        if (turn.expectNoListingFill) {
          expect(hasListingSellIntent(turn.user), turn.user).toBe(false);
        }

        priorAssistant = turn.priorAssistant ?? `Handled: ${turn.user}`;
      }
    });
  }
});

describe("reply quality — good examples from scenarios", () => {
  for (const scenario of REAL_USER_CONVERSATIONS) {
    if (!scenario.goodReplyExample) continue;

    it(`passes quality bar for ${scenario.id}`, () => {
      const requirePricing =
        scenario.goal.toLowerCase().includes("pricing") ||
        scenario.id.includes("price");

      const result = scoreConversationReply(scenario.goodReplyExample!, {
        requireNextStep: true,
        requirePricing,
        maxQuestions: 2,
      });

      expect(result.failures, scenario.id).toEqual([]);
      expect(result.pass).toBe(true);
    });
  }
});

describe("reply quality — anti-patterns", () => {
  const badReplies = [
    {
      label: "dead end",
      text: "I can't help with that. Please contact support.",
    },
    {
      label: "form interrogation",
      text: "What is the title? What is the price? What is the condition? What is the location?",
    },
    {
      label: "robotic opener",
      text: "Certainly! I'd be happy to help. Please provide more information about your item.",
    },
    {
      label: "pricing without structure",
      text: "Maybe around $800 or so, depends on the market I guess.",
    },
  ];

  for (const bad of badReplies) {
    it(`flags ${bad.label}`, () => {
      const result = scoreConversationReply(bad.text, {
        requirePricing: bad.label === "pricing without structure",
      });
      expect(result.pass).toBe(false);
    });
  }
});

describe("over-questioning guard", () => {
  it("allows one clarifying question", () => {
    expect(hasOverQuestioning("Which listing is it — the couch or the mower?")).toBe(false);
  });

  it("blocks multi-question forms", () => {
    expect(
      hasOverQuestioning("What year is it? What colour? What's the mileage? What's your price?")
    ).toBe(true);
  });
});

describe("pricing stress items — structure targets", () => {
  const templateReply = (item: string) =>
    `**Quick sale:** $100 · **Fair market:** $150 · **Optimistic:** $200 · **Confidence:** Medium — typical NZ range for ${item}. Want me to set $150 in your listing?`;

  for (const row of PRICING_STRESS_ITEMS) {
    it(`pricing format holds for ${row.item}`, () => {
      expect(hasPricingStructure(templateReply(row.item))).toBe(true);
    });
  }
});

describe("conversation completion metrics", () => {
  it("covers all required user stress flows", () => {
    const ids = new Set(REAL_USER_CONVERSATIONS.map((s) => s.id));
    const required = [
      "sell-bmw-multiturn",
      "find-ps5",
      "listing-not-showing",
      "why-cant-buy",
      "price-laptop",
      "one-photo",
      "category-unknown",
      "find-mower",
      "switch-to-rent",
      "cancel-draft",
      "recovery-nonsense",
      "voice-transcript-sell",
    ];
    for (const id of required) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("reports turn counts for completion tracking", () => {
    const totalTurns = REAL_USER_CONVERSATIONS.reduce((n, s) => n + s.turns.length, 0);
    expect(totalTurns).toBeGreaterThanOrEqual(18);
    expect(REAL_USER_CONVERSATIONS.length).toBeGreaterThanOrEqual(12);
  });
});
