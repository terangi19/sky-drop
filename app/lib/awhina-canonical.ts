/**
 * Canonical Āwhina server pipeline.
 *
 * Live `/api/sky-ai` wraps this so UI keeps one HTTP contract while routing
 * through: local fast path → search memory → structured tools → (caller AI).
 */

import { tryLocalExecution } from "./awhina-local-execution";
import {
  validateToolCall,
  isStateChangingTool,
  type AwhinaToolCall,
} from "./awhina-tool-registry";
import {
  searchSessionKey,
  getSearchSession,
  isSearchFollowUp,
  extractSearchRefinement,
  updateSearchSession,
  buildSearchFollowUpReply,
  rememberPrimarySearch,
} from "./awhina-search-memory";
import { awhinaArrangePurchaseReply, awhinaCapabilitiesReply } from "./awhina-personality";
import { recordAwhinaObs } from "./awhina-observability";
import { isSkyAiGeneralQuestion } from "./sky-ai-prompts";
import { tryFindBrowseReply } from "./sky-ai-task-replies";
import { hasListingSellIntent } from "./sky-ai-intent";

export type CanonicalContext = {
  pathname?: string;
  uid?: string | null;
  conversationId?: string;
  isAdmin?: boolean;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Voice / medium confidence — clarify before state-changing */
  source?: "text" | "voice";
  voiceConfidence?: "high" | "medium" | "low";
};

export type CanonicalResult = {
  handled: boolean;
  reply?: string;
  navigateTo?: string;
  listingFill?: Record<string, unknown>;
  source: "local" | "rules" | "tool" | "clarify";
  intent: string;
  tool?: string;
  confidence: number;
  usedLocalExecution: boolean;
  avoidedAi: boolean;
  executionTimeMs: number;
  clarificationQuestion?: string;
  /** Structured tool for clients that execute tools */
  toolCall?: AwhinaToolCall;
};

const CATEGORY_LOCAL: Array<{ re: RegExp; path: string; label: string }> = [
  { re: /^(open |show |go to |take me to )?(vehicles?|cars?)( page)?$/i, path: "/vehicles", label: "Vehicles" },
  { re: /^(open |show |go to |take me to )?(services?)( page)?$/i, path: "/services", label: "Services" },
  { re: /^(open |show |go to |take me to )?(rentals?)( page)?$/i, path: "/rentals", label: "Rentals" },
  { re: /^(open |show |go to |take me to )?(digital)( page)?$/i, path: "/digital", label: "Digital" },
  { re: /^(open |show |go to |take me to )?messages?( page|inbox)?$/i, path: "/messages", label: "Messages" },
];

function navReply(title: string, path: string, already: boolean): CanonicalResult["reply"] {
  return already
    ? `You're already on **${title}**. What would you like help with?`
    : `Taking you to **${title}** now.`;
}

function toolFromLocal(local: ReturnType<typeof tryLocalExecution>): AwhinaToolCall | null {
  if (!local.handled || !local.toolCall) return null;
  const tc = local.toolCall;
  // Normalize nested args shape from local execution
  const tool = tc.tool;
  const nested = tc.args as Record<string, unknown>;
  if (tool === "navigate" && nested.navigate) {
    return { tool: "navigate", args: { navigate: nested.navigate as { path: string; reason?: string } }, confidence: 1 };
  }
  if (tool === "confirmAction" && nested.confirmAction) {
    return {
      tool: "confirmAction",
      args: { confirmAction: nested.confirmAction as { action: string; confirmed: boolean } },
      confidence: 1,
    };
  }
  return tc as AwhinaToolCall;
}

/**
 * Canonical pre-AI handler. Returns handled=true when AI should be skipped.
 */
export function processCanonicalAwhina(
  message: string,
  context: CanonicalContext = {}
): CanonicalResult {
  const start = Date.now();
  const pathname = context.pathname || "/";
  const trimmed = message.trim();
  const memKey = searchSessionKey({
    conversationId: context.conversationId,
    uid: context.uid,
    pathname,
  });

  const finish = (partial: Omit<CanonicalResult, "executionTimeMs">): CanonicalResult => {
    const result: CanonicalResult = {
      ...partial,
      executionTimeMs: Date.now() - start,
    };
    recordAwhinaObs({
      intent: result.intent,
      localVsAi: result.avoidedAi ? "local" : result.source === "rules" || result.source === "tool" ? "rules" : "ai",
      tool: result.tool,
      success: result.handled,
      latencyMs: result.executionTimeMs,
      clarification: Boolean(result.clarificationQuestion),
      pathname,
      source: context.source || "text",
    });
    return result;
  };

  if (!trimmed) {
    return finish({
      handled: false,
      source: "local",
      intent: "unknown",
      confidence: 0,
      usedLocalExecution: false,
      avoidedAi: false,
    });
  }

  // Voice: low confidence on state-changing → clarify, never silent-guess
  if (
    context.source === "voice" &&
    context.voiceConfidence === "low" &&
    !/^(home|messages|sell|profile|back|go back)$/i.test(trimmed)
  ) {
    return finish({
      handled: true,
      reply: `I heard something like that — did you mean **${trimmed}**? Say yes to continue, or rephrase.`,
      source: "clarify",
      intent: "clarification",
      confidence: 0.35,
      usedLocalExecution: false,
      avoidedAi: true,
      clarificationQuestion: `Confirm: ${trimmed}?`,
    });
  }

  // Capabilities — messaging-first personality
  if (isSkyAiGeneralQuestion(trimmed)) {
    return finish({
      handled: true,
      reply: awhinaCapabilitiesReply(),
      source: "rules",
      intent: "general_question",
      confidence: 1,
      usedLocalExecution: false,
      avoidedAi: true,
    });
  }

  // Arrange purchase — messaging-first (no Stripe / Buy Now pitch)
  if (/\b(arrange purchase|how do i pay|bank transfer|contact seller|message seller|how to buy)\b/i.test(trimmed)) {
    if (!hasListingSellIntent(trimmed)) {
      return finish({
        handled: true,
        reply: awhinaArrangePurchaseReply(),
        navigateTo: "/messages",
        source: "rules",
        intent: "purchase",
        tool: "openMessages",
        confidence: 0.95,
        usedLocalExecution: false,
        avoidedAi: true,
        toolCall: {
          tool: "openMessages",
          args: { openMessages: {} },
          confidence: 0.95,
        },
      });
    }
  }

  // Category / short nav locals beyond awhina-local-execution
  for (const cat of CATEGORY_LOCAL) {
    if (cat.re.test(trimmed)) {
      const already = pathname === cat.path || pathname.startsWith(cat.path + "/");
      const toolCall: AwhinaToolCall = {
        tool: cat.path === "/messages" ? "openMessages" : cat.path.startsWith("/") && !cat.path.includes("?") ? "openCategory" : "navigate",
        args:
          cat.path === "/messages"
            ? { openMessages: {} }
            : cat.path === "/vehicles" || cat.path === "/services" || cat.path === "/rentals" || cat.path === "/digital"
              ? { openCategory: { category: cat.label.toLowerCase() } }
              : { navigate: { path: cat.path, reason: "local category" } },
        confidence: 1,
      };
      // Prefer navigate for consistent client handling
      const navTool: AwhinaToolCall = {
        tool: "navigate",
        args: { navigate: { path: cat.path, reason: `Open ${cat.label}` } },
        confidence: 1,
      };
      const validated = validateToolCall(navTool);
      if (!validated.ok) continue;
      return finish({
        handled: true,
        reply: navReply(cat.label, cat.path, already),
        navigateTo: already ? undefined : cat.path,
        source: "local",
        intent: "navigation",
        tool: "navigate",
        confidence: 1,
        usedLocalExecution: true,
        avoidedAi: true,
        toolCall: navTool,
      });
    }
  }

  // Local fast path (home, sell, messages, profile, go back, …)
  const local = tryLocalExecution(trimmed, pathname);
  if (local.handled) {
    const toolCall = toolFromLocal(local);
    if (toolCall) {
      const validated = validateToolCall(toolCall);
      if (validated.ok && toolCall.tool === "navigate") {
        const path = toolCall.args.navigate?.path || "";
        if (path === "BACK") {
          return finish({
            handled: true,
            reply: "Going back.",
            navigateTo: "BACK",
            source: "local",
            intent: "navigation",
            tool: "navigate",
            confidence: 1,
            usedLocalExecution: true,
            avoidedAi: true,
            toolCall,
          });
        }
        const titles: Record<string, string> = {
          "/": "Home",
          "/post/ai": "Sell",
          "/sales": "Sales",
          "/messages": "Messages",
          "/search": "Search",
          "/watchlist": "Watchlist",
          "/profile": "Profile",
          "/admin": "Admin",
        };
        const title = titles[path] || path;
        const already = pathname === path;
        return finish({
          handled: true,
          reply: navReply(title, path, already),
          navigateTo: already ? undefined : path,
          source: "local",
          intent: "navigation",
          tool: "navigate",
          confidence: 1,
          usedLocalExecution: true,
          avoidedAi: true,
          toolCall,
        });
      }
      if (validated.ok && toolCall.tool === "confirmAction") {
        const action = toolCall.args.confirmAction?.action || "";
        return finish({
          handled: true,
          reply:
            action === "stopVoice"
              ? "Voice off."
              : action === "resumeVoice"
                ? "Listening again."
                : action.startsWith("scroll")
                  ? "Scrolling."
                  : "Done.",
          source: "local",
          intent: "navigation",
          tool: "confirmAction",
          confidence: 1,
          usedLocalExecution: true,
          avoidedAi: true,
          toolCall,
        });
      }
    }
    // Handled locally with reason only (already on page)
    if (local.reason) {
      return finish({
        handled: true,
        reply: local.reason.replace(/^Already on (\w+) page$/i, "You're already on **$1**."),
        source: "local",
        intent: "navigation",
        confidence: 1,
        usedLocalExecution: true,
        avoidedAi: true,
      });
    }
  }

  // Search follow-up memory (multi-turn refinements)
  const session = getSearchSession(memKey);
  if (isSearchFollowUp(trimmed, session) && session) {
    const delta = extractSearchRefinement(trimmed);
    const merged = updateSearchSession(memKey, delta);
    if (merged.query || merged.location || merged.maxPrice) {
      const { text, navigateTo } = buildSearchFollowUpReply(merged);
      const toolCall: AwhinaToolCall = {
        tool: "searchListings",
        args: {
          searchListings: {
            query: merged.query || "",
            filters: {
              maxPrice: merged.maxPrice ? Number(merged.maxPrice) : undefined,
              location: merged.location,
              condition: merged.condition,
            },
          },
        },
        confidence: 0.9,
      };
      return finish({
        handled: true,
        reply: text,
        navigateTo,
        source: "tool",
        intent: "marketplace_search",
        tool: "searchListings",
        confidence: 0.9,
        usedLocalExecution: false,
        avoidedAi: true,
        toolCall,
      });
    }
  }

  // Primary find — structured search tool + remember session
  if (!hasListingSellIntent(trimmed) && pathname !== "/post/ai") {
    const find = tryFindBrowseReply(trimmed, {
      priorUserMessage: context.history
        ?.slice()
        .reverse()
        .find((h) => h.role === "user")?.content,
      priorAssistantMessage: context.history
        ?.slice()
        .reverse()
        .find((h) => h.role === "assistant")?.content,
    });
    if (find) {
      rememberPrimarySearch(memKey, trimmed);
      // Also merge any transmission from this message into session path
      const delta = extractSearchRefinement(trimmed);
      const merged = updateSearchSession(memKey, delta);
      const path =
        merged.transmission || merged.condition
          ? buildSearchFollowUpReply(merged).navigateTo
          : find.navigateTo;
      const text =
        merged.transmission || merged.condition
          ? buildSearchFollowUpReply(merged).text
          : find.text;
      const toolCall: AwhinaToolCall = {
        tool: "searchListings",
        args: {
          searchListings: {
            query: merged.query || "",
            filters: {
              maxPrice: merged.maxPrice ? Number(merged.maxPrice) : undefined,
              location: merged.location,
              condition: merged.condition,
            },
          },
        },
        confidence: 0.92,
      };
      const validated = validateToolCall(toolCall);
      return finish({
        handled: true,
        reply: text,
        navigateTo: path,
        source: "tool",
        intent: "marketplace_search",
        tool: validated.ok ? "searchListings" : undefined,
        confidence: 0.92,
        usedLocalExecution: false,
        avoidedAi: true,
        toolCall: validated.ok ? toolCall : undefined,
      });
    }
  }

  // Medium voice confidence on ambiguous state-changing → clarify
  if (
    context.source === "voice" &&
    context.voiceConfidence === "medium" &&
    isStateChangingTool({ tool: "createListing", args: {} } as AwhinaToolCall) &&
    hasListingSellIntent(trimmed) &&
    trimmed.split(/\s+/).length < 4
  ) {
    return finish({
      handled: true,
      reply: "Did you want me to **start a listing** with that? Say yes, or add more details.",
      source: "clarify",
      intent: "listing_create",
      confidence: 0.5,
      usedLocalExecution: false,
      avoidedAi: true,
      clarificationQuestion: "Start a listing?",
    });
  }

  return finish({
    handled: false,
    source: "local",
    intent: "unknown",
    confidence: 0,
    usedLocalExecution: false,
    avoidedAi: false,
  });
}
