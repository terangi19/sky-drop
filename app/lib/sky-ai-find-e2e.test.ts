/**
 * UX-focused regression tests for the find/search flow.
 * Validates navigation payloads, query parsing, and conversation state — not just reply text.
 */

import { describe, expect, it } from "vitest";
import { stripSkyAiMachineTags } from "./sky-ai-listing-fill";
import { detectSkyAiConversationIntent } from "./sky-ai-intent";
import { isSkyAiGeneralQuestion, skyAiCapabilitiesReply } from "./sky-ai-prompts";
import {
  parseFindBudget,
  parseFindSearchPath,
  resolveFindBrowseRoute,
} from "./sky-ai-find-routing";
import { tryFindBrowseReply, trySkyAiTaskReply } from "./sky-ai-task-replies";

function displayText(raw: string): string {
  return stripSkyAiMachineTags(raw).replace(/\s+/g, " ").trim();
}

function expectSingleFindConfirmation(text: string) {
  const shown = displayText(text);
  const openingCount = (shown.match(/opening\b/gi) || []).length;
  const searchResultsCount = (shown.match(/search results for/gi) || []).length;
  expect(openingCount + searchResultsCount).toBeLessThanOrEqual(1);
}

describe("find/search UX e2e", () => {
  describe("Bug 1 — search query parsing", () => {
    it('parses "find me a iphone under 400" as q=iPhone maxPrice=400', () => {
      const reply = tryFindBrowseReply("find me a iphone under 400");
      expect(reply).toBeTruthy();
      const params = parseFindSearchPath(reply!.navigateTo!);
      expect(params.q).toBe("iPhone");
      expect(params.maxPrice).toBe("400");
      expect(params.q).not.toMatch(/400/);
    });

    it('parses "find me a PS5 under 600" as q=PS5 maxPrice=600', () => {
      const reply = tryFindBrowseReply("find me a PS5 under 600");
      const params = parseFindSearchPath(reply!.navigateTo!);
      expect(params.q).toBe("PS5");
      expect(params.maxPrice).toBe("600");
    });

    it('parses "find me a BMW spoiler under 200" as q=BMW spoiler maxPrice=200', () => {
      const reply = tryFindBrowseReply("find me a BMW spoiler under 200");
      const params = parseFindSearchPath(reply!.navigateTo!);
      expect(params.q).toBe("BMW spoiler");
      expect(params.maxPrice).toBe("200");
    });

    it("parses under 10k budget multiplier", () => {
      expect(parseFindBudget("show me cars under 10k")).toBe("10000");
      expect(parseFindBudget("ISO Toyota Hilux under 25k")).toBe("25000");
    });

    it("includes location filter when specified", () => {
      const reply = tryFindBrowseReply("Find me a PS5 under $600 in Auckland");
      const params = parseFindSearchPath(reply!.navigateTo!);
      expect(params.q).toBe("PS5");
      expect(params.maxPrice).toBe("600");
      expect(params.location).toBe("Auckland");
    });
  });

  describe("Bug 2 — single concise confirmation", () => {
    it("shows one opening line, not duplicate search result blocks", () => {
      const cases = [
        "find me a iphone under 400",
        "Find me a BMW spoiler",
        "Find me a PS5 under $600 in Auckland",
      ];
      for (const message of cases) {
        const reply = tryFindBrowseReply(message);
        expect(reply, message).toBeTruthy();
        expectSingleFindConfirmation(reply!.text);
        expect(displayText(reply!.text)).toMatch(/opening/i);
      }
    });

    it("stripped display text has no duplicate arrows", () => {
      const reply = tryFindBrowseReply("Find me a BMW spoiler");
      const shown = displayText(reply!.text);
      expect(shown).not.toMatch(/search results for.*search results for/i);
      expect((shown.match(/→/g) || []).length).toBe(0);
    });
  });

  describe("Bug 3 — capabilities question", () => {
    it('"What can you do?" returns capabilities, not listing fill success', () => {
      const reply = trySkyAiTaskReply("What can you do?", "/");
      expect(reply).toBeTruthy();
      expect(reply!.text).toContain("Here's what I do");
      expect(reply!.text).not.toContain("Done! I've filled your listing");
      expect(reply!.text).toContain("Sell");
      expect(reply!.text).toContain("Buy & find");
    });

    it("capabilities reply is not flagged as welcome bleed", () => {
      expect(skyAiCapabilitiesReply()).toContain("safety tips");
    });
  });

  describe("Bug 4 & 5 — intent switching", () => {
    it("find intent after sell context does not require listing fill", () => {
      expect(
        detectSkyAiConversationIntent("Find me an iPhone", {
          priorAssistant: "[[LISTING_FILL]] BMW draft",
        })
      ).toBe("find_buy");
    });

    it("capabilities after find flow returns fresh capabilities answer", () => {
      const afterFind = trySkyAiTaskReply("What can you do?", "/", {
        priorUserMessage: "find me a iphone under 400",
        priorAssistantMessage: "Opening iPhone listings under $400...",
      });
      expect(afterFind?.text).toContain("Here's what I do");
      expect(afterFind?.text).not.toContain("filled your listing");
    });

    it("multi-turn find refinement keeps search term and adds filters", () => {
      const reply = tryFindBrowseReply("Under $600 in Auckland", {
        priorUserMessage: "Looking for a PS5",
      });
      expect(reply).toBeTruthy();
      const params = parseFindSearchPath(reply!.navigateTo!);
      expect(params.q).toBe("PS5");
      expect(params.maxPrice).toBe("600");
      expect(params.location).toBe("Auckland");
    });

    it("sell → find → capabilities each resolve independently", () => {
      expect(trySkyAiTaskReply("Sell my BMW", "/post/ai")).toBeNull();

      const find = trySkyAiTaskReply("Find me an iPhone", "/");
      expect(find?.navigateTo).toMatch(/^\/search\?/);

      const caps = trySkyAiTaskReply("What can you do?", "/");
      expect(isSkyAiGeneralQuestion("What can you do?")).toBe(true);
      expect(caps?.text).toContain("Here's what I do");
    });
  });

  describe("navigation payload contract", () => {
    it("car parts never route to /vehicles", () => {
      const reply = tryFindBrowseReply("Find me a BMW spoiler under 200");
      expect(reply!.navigateTo).toMatch(/^\/search\?/);
      expect(reply!.navigateTo).not.toContain("/vehicles");
    });

    it("whole vehicles use search with query params", () => {
      const route = resolveFindBrowseRoute("Find a BMW 335i");
      expect(route.path).toMatch(/^\/search\?q=/);
    });
  });
});
