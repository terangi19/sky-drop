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
import {
  listingDraftSessionKey,
  getListingDraftSession,
  processListingFillMessage,
  isListingFollowUp,
} from "./awhina-listing-fill-tools";
import {
  profileDraftSessionKey,
  processProfileMessage,
} from "./awhina-profile-tools";
import {
  awhinaArrangePurchaseReply,
  awhinaCapabilitiesReply,
  awhinaSafetyEducationReply,
} from "./awhina-personality";
import { recordAwhinaObs, inferQualityFromCanonical } from "./awhina-observability";
import { isSkyAiGeneralQuestion } from "./sky-ai-prompts";
import { tryFindBrowseReply } from "./sky-ai-task-replies";
import { hasListingSellIntent } from "./sky-ai-intent";
import { hasActiveListingDraft } from "./sky-ai-draft-merge";
import type { SkyAiListingContext } from "./sky-ai-types";
import type { SkyAiProfileContext } from "./sky-ai-profile-context";
import type { SkyAiProfileFill } from "./sky-ai-profile-fill";
import {
  taskScopeKey,
  getTaskScope,
  setActiveTask,
  resolveTaskForMessage,
  isRelativePricePhrase,
} from "./awhina-task-scope";
import {
  isVagueShoppingNeed,
  buildProactiveShoppingClarify,
  isShoppingClarifyAnswer,
  mergeClarifyIntoSearchMessage,
  tryMarketplaceEducationReply,
  isCompareRequest,
  summarizeListingComparison,
  parseCompareTitlesFromMessage,
} from "./awhina-product-ux";

export type CanonicalContext = {
  pathname?: string;
  uid?: string | null;
  conversationId?: string;
  isAdmin?: boolean;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Voice / medium confidence — clarify before state-changing */
  source?: "text" | "voice";
  voiceConfidence?: "high" | "medium" | "low";
  listingContext?: SkyAiListingContext | null;
  profileContext?: SkyAiProfileContext | null;
};

export type CanonicalResult = {
  handled: boolean;
  reply?: string;
  navigateTo?: string;
  listingFill?: Record<string, unknown>;
  profileFill?: SkyAiProfileFill;
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
  const scopeKey = taskScopeKey({
    conversationId: context.conversationId,
    uid: context.uid,
    pathname,
  });

  const finish = (partial: Omit<CanonicalResult, "executionTimeMs">): CanonicalResult => {
    const result: CanonicalResult = {
      ...partial,
      executionTimeMs: Date.now() - start,
    };
    const clarification = Boolean(result.clarificationQuestion);
    recordAwhinaObs({
      intent: result.intent,
      localVsAi: result.avoidedAi ? "local" : result.source === "rules" || result.source === "tool" ? "rules" : "ai",
      tool: result.tool,
      success: result.handled,
      latencyMs: result.executionTimeMs,
      clarification,
      pathname,
      source: context.source || "text",
      quality: inferQualityFromCanonical({
        intent: result.intent,
        tool: result.tool,
        clarification,
        handled: result.handled,
      }),
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

  // Marketplace education — scam / safe pickup (messaging-first V1)
  const edu = tryMarketplaceEducationReply(trimmed);
  if (edu) {
    setActiveTask(scopeKey, "help");
    return finish({
      handled: true,
      reply: edu.includes("Stay on") ? edu : awhinaSafetyEducationReply(),
      navigateTo: "/messages",
      source: "rules",
      intent: "education",
      confidence: 0.95,
      usedLocalExecution: false,
      avoidedAi: true,
    });
  }

  // Listing comparison — facts only, never invent
  if (isCompareRequest(trimmed)) {
    const titles = parseCompareTitlesFromMessage(trimmed);
    const facts = titles.map((title) => ({ title }));
    const reply = summarizeListingComparison(facts);
    setActiveTask(scopeKey, "shopping", {
      compareCandidates: titles.length ? titles : undefined,
    });
    return finish({
      handled: true,
      reply,
      source: "rules",
      intent: "compare",
      confidence: 0.85,
      usedLocalExecution: false,
      avoidedAi: true,
      clarificationQuestion: titles.length < 2 ? reply : undefined,
    });
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

  // Search follow-up memory (multi-turn refinements) — skip on sell/profile pages
  const onSellPage = pathname.startsWith("/post/ai");
  const onProfilePage = pathname === "/profile" || pathname.startsWith("/profile/");
  const taskSession = getTaskScope(scopeKey);
  const listKeyEarly = listingDraftSessionKey({
    conversationId: context.conversationId,
    uid: context.uid,
    pathname,
  });
  const listSessionEarly = getListingDraftSession(listKeyEarly);
  const hasListDraftEarly =
    hasActiveListingDraft(context.listingContext) || Boolean(listSessionEarly?.draft);

  // Task-scoped "make it cheaper": shopping → sort cheapest; selling → draft (later)
  const taskForRelative = resolveTaskForMessage(trimmed, {
    pathname,
    hasListingDraft: hasListDraftEarly,
    session: taskSession,
    hasSellIntent: hasListingSellIntent(trimmed),
    hasSearchIntent: false,
  });
  if (
    !onSellPage &&
    !onProfilePage &&
    isRelativePricePhrase(trimmed) &&
    taskForRelative === "shopping" &&
    getSearchSession(memKey)?.filters?.query
  ) {
    const merged = updateSearchSession(memKey, { sortBy: "price-low" });
    const { text, navigateTo } = buildSearchFollowUpReply(merged);
    setActiveTask(scopeKey, "shopping");
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

  // Answer to proactive shopping clarification → search
  if (
    !onSellPage &&
    !onProfilePage &&
    taskSession?.task === "shopping" &&
    taskSession.pendingItem &&
    isShoppingClarifyAnswer(trimmed, taskSession.pendingItem)
  ) {
    const combined = mergeClarifyIntoSearchMessage(taskSession.pendingItem, trimmed);
    rememberPrimarySearch(memKey, combined);
    const delta = extractSearchRefinement(combined);
    // Ensure query stays the pending item
    if (!delta.query) delta.query = taskSession.pendingItem;
    const merged = updateSearchSession(memKey, delta);
    setActiveTask(scopeKey, "shopping", { pendingItem: undefined });
    const { text, navigateTo } = buildSearchFollowUpReply(merged);
    const toolCall: AwhinaToolCall = {
      tool: "searchListings",
      args: {
        searchListings: {
          query: merged.query || taskSession.pendingItem,
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

  // Proactive clarify for vague shopping needs ("I need a PS5")
  if (
    !onSellPage &&
    !onProfilePage &&
    !hasListingSellIntent(trimmed) &&
    isVagueShoppingNeed(trimmed)
  ) {
    const { reply, item } = buildProactiveShoppingClarify(trimmed);
    setActiveTask(scopeKey, "shopping", { pendingItem: item });
    return finish({
      handled: true,
      reply,
      source: "clarify",
      intent: "marketplace_search",
      confidence: 0.7,
      usedLocalExecution: false,
      avoidedAi: true,
      clarificationQuestion: reply,
    });
  }

  const session = getSearchSession(memKey);
  // Don't let search follow-ups steal selling relative-price when task is selling
  const allowSearchFollowUp =
    !onSellPage &&
    !onProfilePage &&
    !(
      isRelativePricePhrase(trimmed) &&
      taskForRelative === "selling" &&
      hasListDraftEarly
    );

  if (allowSearchFollowUp && isSearchFollowUp(trimmed, session) && session) {
    const delta = extractSearchRefinement(trimmed);
    const merged = updateSearchSession(memKey, delta);
    setActiveTask(scopeKey, "shopping");
    if (merged.query || merged.location || merged.maxPrice || merged.sortBy) {
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
      setActiveTask(scopeKey, "shopping");
      // Also merge any transmission from this message into session path
      const delta = extractSearchRefinement(trimmed);
      const merged = updateSearchSession(memKey, delta);
      const path =
        merged.transmission || merged.condition || merged.sortBy || merged.hideSold
          ? buildSearchFollowUpReply(merged).navigateTo
          : find.navigateTo;
      const text =
        merged.transmission || merged.condition || merged.sortBy || merged.hideSold
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

  // ── Sell listing-fill (partial draft updates + validation) ──
  const onSell = pathname.startsWith("/post/ai");
  const listKey = listKeyEarly;
  const listSession = listSessionEarly;
  const hasListDraft = hasListDraftEarly;
  const sellCandidate =
    onSell ||
    hasListingSellIntent(trimmed) ||
    (isListingFollowUp(trimmed, hasListDraft) &&
      resolveTaskForMessage(trimmed, {
        pathname,
        hasListingDraft: hasListDraft,
        session: taskSession,
        hasSellIntent: hasListingSellIntent(trimmed),
      }) === "selling");

  if (sellCandidate) {
    const listing = processListingFillMessage(trimmed, {
      pathname: onSell ? pathname : "/post/ai",
      listingContext: context.listingContext || (listSession?.draft as SkyAiListingContext) || null,
      sessionKey: listKey,
    });
    if (listing.handled) {
      setActiveTask(scopeKey, "selling");
      const navigateTo =
        !onSell && listing.listingFill
          ? "/post/ai"
          : undefined;
      return finish({
        handled: true,
        reply: listing.reply,
        listingFill: listing.listingFill,
        navigateTo,
        source: listing.clarify ? "clarify" : "tool",
        intent: listing.intent,
        tool: listing.toolCall?.tool || (listing.listingFill ? "createListing" : undefined),
        confidence: listing.clarify ? 0.55 : 0.9,
        usedLocalExecution: false,
        avoidedAi: true,
        clarificationQuestion: listing.clarify ? listing.reply : undefined,
        toolCall: listing.toolCall,
      });
    }
  }

  // ── Profile AI (allowlisted fields only) ──
  const onProfile = pathname === "/profile" || pathname.startsWith("/profile");
  const profKey = profileDraftSessionKey({
    conversationId: context.conversationId,
    uid: context.uid,
    pathname,
  });
  if (
    onProfile ||
    /\b(bio|username|instagram|my profile|update (my )?profile)\b/i.test(trimmed)
  ) {
    const profile = processProfileMessage(trimmed, {
      pathname,
      profileContext: context.profileContext || null,
      sessionKey: profKey,
    });
    if (profile.handled) {
      return finish({
        handled: true,
        reply: profile.reply,
        profileFill: profile.profileFill,
        navigateTo: profile.navigateTo,
        source: profile.clarify ? "clarify" : "tool",
        intent: profile.intent,
        tool: profile.toolCall?.tool || (profile.profileFill ? "updateProfile" : undefined),
        confidence: profile.clarify ? 0.55 : 0.9,
        usedLocalExecution: false,
        avoidedAi: true,
        clarificationQuestion: profile.clarify ? profile.reply : undefined,
        toolCall: profile.toolCall,
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
