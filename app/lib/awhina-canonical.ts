/**
 * Canonical Āwhina server pipeline.
 *
 * Live `/api/sky-ai` wraps this so UI keeps one HTTP contract while routing
 * through: local fast path → search memory → structured tools → (caller AI).
 */

import { tryLocalExecution } from "./awhina-local-execution";
import { normalizeAwhinaInput } from "./awhina-input-normalize";
import { scrubLegacyFormPollution } from "./listing-draft-confirmed";
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
  hydrateSearchSession,
  toClientSearchContext,
  clearSearchSession,
  type ClientSearchContext,
  type SearchSessionFilters,
} from "./awhina-search-memory";
import {
  listingDraftSessionKey,
  getListingDraftSession,
  clearListingDraftSession,
  processListingFillMessage,
  isListingFollowUp,
  rememberListingDraft,
  reconstructListingDraftBase,
  validateListingFillFields,
} from "./awhina-listing-fill-tools";
import {
  getActiveListingSlot,
  parseShortReplyForPendingSlot,
  extractCompoundListingFacts,
  buildListingSlotPending,
  mergeExtras,
  hydrateVehicleGeneration,
  composeVehicleIdentityTitle,
  SLOT_QUESTIONS,
  type ListingMissingSlot,
} from "./awhina-pending-slots";
import { buildReadinessFollowUpReply } from "./awhina-listing-readiness";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
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
import {
  hasListingSellIntent,
  hasExplicitSellSwitch,
  hasSearchIntentLanguage,
} from "./sky-ai-intent";
import {
  isListPublishActionMessage,
  detectActiveDraftCommands,
} from "./awhina-active-draft-commands";
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
  hydrateTaskScope,
  isToolAllowedForTask,
  toClientTaskScope,
  getPersistedPendingSlot,
  isClarificationOpen,
  buildOpenSearchSlotClarification,
  cancelOpenClarification,
  resolveOpenClarification,
  logClarificationLifecycle,
  type ClientTaskScopeContext,
} from "./awhina-task-scope";
import {
  isVagueShoppingNeed,
  buildProactiveShoppingClarify,
  isShoppingClarifyAnswer,
  mergeClarifyIntoSearchMessage,
  isSearchClarificationAffirmation,
  isExplicitPendingSearchExecute,
  hasEnoughSearchSlotInfo,
  buildPendingSearchSlotAsk,
  detectPendingClarificationOverride,
  sanitizeSearchQueryText,
  tryMarketplaceEducationReply,
  isCompareRequest,
  buildGroundedCompareReply,
  shouldAutoNavigate,
  isExplicitNavigationAction,
  isNoResultFollowUp,
  proposeSearchRelaxation,
  buildNoResultReply,
  polishAwhinaReplyStyle,
  maybeOneProactiveSuggestion,
  buildPremiumSearchSummary,
  buildPremiumListingTitle,
  buildListingDescriptionFromFacts,
  isVehicleListingFill,
  type ListingFacts,
} from "./awhina-product-ux";
import {
  buildAwhinaDecision,
  collectIgnoredStaleContext,
  isToolAllowedByDecision,
  selfCheckBeforeToolResponse,
  tryResolvePendingClarification,
  type AwhinaDecision,
} from "./awhina-decision";
import { runIntelligenceTurn } from "./awhina-intelligence-turn";
import { authorityToListingProvenance } from "./awhina-authority";
import {
  type AwhinaPendingAction,
  assistantAskedIdentityConfirmation,
  assistantAskedSearchConfirmation,
  assistantAskedSellConfirmation,
  buildConfirmIdentityPendingAction,
  buildSearchPendingAction,
  buildStartSellingPendingAction,
  classifyConfirmationReply,
  clearPendingAction,
  confirmPendingAction,
  getPendingAction,
  hydratePendingAction,
  mayExecuteAction,
  pendingActionKey,
  rejectPendingAction,
  resolvePendingActionTurn,
  setPendingAction,
  shouldInvalidateSearchOnEvidence,
  shouldSupersedePendingAction,
  visionObjectIdFromIdentity,
} from "./awhina-pending-action";

export type CanonicalContext = {
  pathname?: string;
  uid?: string | null;
  conversationId?: string;
  /** Stable browser anon id — isolates guest Map keys */
  anonSessionId?: string;
  isAdmin?: boolean;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Voice / medium confidence — clarify before state-changing */
  source?: "text" | "voice";
  voiceConfidence?: "high" | "medium" | "low";
  listingContext?: SkyAiListingContext | null;
  profileContext?: SkyAiProfileContext | null;
  /** Client-echoed durable task/search (Maps are cache) */
  clientTask?: ClientTaskScopeContext | null;
  clientSearch?: ClientSearchContext | null;
  /** Client-echoed active confirmation (Want to sell it? / search?) */
  clientPendingAction?: AwhinaPendingAction | null;
  /** Current turn includes product photo(s) */
  hasImages?: boolean;
  /** Visible search/listing cards for real compare — never invent */
  pageListings?: ListingFacts[];
  /** Real search result meta from client (counts only when known) */
  searchResultMeta?: {
    count?: number;
    cheapestPrice?: number;
    newestTitle?: string;
  };
};

export type CanonicalSessionState = {
  task?: ClientTaskScopeContext;
  search?: ClientSearchContext;
  /** Typed active listing slot echoed for client persistence (year/price/…) */
  pendingSlot?: string | null;
  /** Active confirmation — short yes/no resolves this first */
  pendingAction?: AwhinaPendingAction | null;
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
  /** Echo to client — durable source of truth across serverless instances */
  sessionState?: CanonicalSessionState;
  /** Internal only — never render to users */
  _decision?: AwhinaDecision;
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

function searchToolCall(merged: SearchSessionFilters, confidence = 0.9): AwhinaToolCall {
  return {
    tool: "searchListings",
    args: {
      searchListings: {
        query: merged.query || "",
        filters: {
          maxPrice: merged.maxPrice ? Number(merged.maxPrice) : undefined,
          minPrice: merged.minPrice ? Number(merged.minPrice) : undefined,
          location: merged.location,
          condition: merged.condition,
          make: merged.make,
          model: merged.model,
          year: merged.year ? Number(merged.year) : undefined,
          minYear: merged.minYear ? Number(merged.minYear) : undefined,
          maxYear: merged.maxYear ? Number(merged.maxYear) : undefined,
          transmission: merged.transmission,
        },
      },
    },
    confidence,
  };
}

/** Natural "Got it — …" ack for a filled pending slot (echo VALUES, never slot names). */
function naturalPendingSlotAck(
  slot: ListingMissingSlot,
  partial: Partial<SkyAiListingFill>,
  message: string
): string {
  if (slot === "generation") {
    const gen =
      partial.vehicleGeneration ||
      hydrateVehicleGeneration(partial).vehicleGeneration ||
      message.trim().toUpperCase().replace(/\s+/g, "");
    if (gen) return gen;
  }
  if (slot === "year" && partial.vehicleYear) return String(partial.vehicleYear);
  if (slot === "price" && partial.price) {
    const n = Number(String(partial.price).replace(/[^\d.]/g, ""));
    return Number.isFinite(n)
      ? `$${Math.round(n).toLocaleString("en-NZ")}`
      : `$${partial.price}`;
  }
  if (slot === "odometer" && partial.vehicleOdometer) {
    const n = Number(String(partial.vehicleOdometer).replace(/[^\d]/g, ""));
    const unit = /\b(miles?|mi)\b/i.test(message) ? "mi" : "km";
    return Number.isFinite(n) && n > 0
      ? `${n.toLocaleString("en-NZ")} ${unit}`
      : `${partial.vehicleOdometer} ${unit}`;
  }
  if (slot === "condition" && partial.condition) {
    if (/^new$/i.test(String(partial.condition).trim())) return "brand new";
    return partial.condition;
  }
  if (slot === "location" && partial.location) return partial.location;
  if (slot === "colour" && partial.vehicleColour) return partial.vehicleColour;
  if (slot === "transmission" && partial.vehicleTransmission) {
    return partial.vehicleTransmission;
  }
  if (slot === "fuel" && partial.vehicleFuelType) return partial.vehicleFuelType;
  if (slot === "variant") {
    const v = (partial.extras || []).find((e) => e.toLowerCase().startsWith("variant:"));
    if (v) return v.slice("variant:".length).trim();
  }
  if (slot === "rental_rate" || slot === "service_rate") {
    const p = partial.price || partial.rentalPriceDaily;
    if (p) {
      const n = Number(String(p).replace(/[^\d.]/g, ""));
      return Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-NZ")}` : `$${p}`;
    }
  }
  if (partial.extras?.length) {
    const e = partial.extras[partial.extras.length - 1];
    const colon = e.indexOf(":");
    if (colon > 0) return e.slice(colon + 1).trim();
  }
  // Last resort: echo the user message, never the bare slot name
  const echoed = message.trim();
  if (echoed && echoed.length <= 40) return echoed;
  return slot.replace(/_/g, " ");
}

/**
 * Apply a matched pending-slot partial onto the authoritative draft and advance
 * the listing_slots clarification. Shared by short-reply + compound paths.
 */
function applyPendingSlotFill(opts: {
  base: SkyAiListingFill;
  partial: SkyAiListingFill;
  filledSlots: ListingMissingSlot[];
  message: string;
  sessionKey: string;
  scopeKey: string;
  pathname: string;
}): {
  fill: SkyAiListingFill;
  reply: string;
  pendingClarification: ReturnType<typeof buildListingSlotPending>;
} | null {
  const { base, partial, filledSlots, message, sessionKey, scopeKey, pathname } = opts;
  const baseHydrated = hydrateVehicleGeneration(base) as SkyAiListingFill;
  let merged: SkyAiListingFill = { ...baseHydrated, ...partial };
  if (partial.extras || baseHydrated.extras) {
    merged.extras = mergeExtras(baseHydrated.extras, partial.extras);
  }
  // Sticky identity — never drop established make/model/generation/title facts
  if (baseHydrated.vehicleMake && !partial.vehicleMake) {
    merged.vehicleMake = baseHydrated.vehicleMake;
  }
  if (baseHydrated.vehicleModel && !partial.vehicleModel) {
    merged.vehicleModel = baseHydrated.vehicleModel;
  }
  if (baseHydrated.vehicleGeneration && !partial.vehicleGeneration) {
    merged.vehicleGeneration = baseHydrated.vehicleGeneration;
  }
  if (baseHydrated.title && !partial.title) merged.title = baseHydrated.title;
  if (baseHydrated.price && !partial.price) merged.price = baseHydrated.price;
  if (baseHydrated.vehicleYear && !partial.vehicleYear) {
    merged.vehicleYear = baseHydrated.vehicleYear;
  }
  if (baseHydrated.vehicleOdometer && !partial.vehicleOdometer) {
    merged.vehicleOdometer = baseHydrated.vehicleOdometer;
  }
  if (baseHydrated.condition && !partial.condition) {
    merged.condition = baseHydrated.condition;
  }
  if (baseHydrated.vehicleColour && !partial.vehicleColour) {
    merged.vehicleColour = baseHydrated.vehicleColour;
  }
  if (baseHydrated.vehicleTransmission && !partial.vehicleTransmission) {
    merged.vehicleTransmission = baseHydrated.vehicleTransmission;
  }
  if ((baseHydrated.location || baseHydrated.pickupArea) && !partial.location) {
    merged.location = baseHydrated.location || baseHydrated.pickupArea;
  }
  // Follow-up slot fills must never re-trigger replaceDraft wipe on the client
  delete merged.replaceDraft;

  merged = hydrateVehicleGeneration(merged) as SkyAiListingFill;

  if (baseHydrated.descriptionSource === "user" && baseHydrated.description) {
    merged.description = baseHydrated.description;
    merged.descriptionSource = "user";
  } else if (isVehicleListingFill(merged)) {
    const composed = composeVehicleIdentityTitle(merged);
    if (composed) {
      merged.title = buildPremiumListingTitle({
        item: composed,
        condition: merged.condition,
        listingType: "vehicle",
        vehicleYear: merged.vehicleYear,
      });
    }
    merged.description = buildListingDescriptionFromFacts(merged);
    merged.descriptionSource = "ai";
  }

  const validated = validateListingFillFields(merged);
  if (!validated.ok) return null;

  rememberListingDraft(sessionKey, validated.fill);
  const pending = buildListingSlotPending(validated.fill, message);
  setActiveTask(scopeKey, "selling", {
    pendingClarification: pending || undefined,
  });

  const ackBits = filledSlots
    .map((s) =>
      naturalPendingSlotAck(s, { ...partial, ...validated.fill, extras: merged.extras }, message)
    )
    .filter((bit) => Boolean(bit && String(bit).trim()));
  // De-dupe identical echo fragments
  const uniqueAck = [...new Set(ackBits)];
  const lead =
    uniqueAck.length === 1
      ? `Got it — ${uniqueAck[0]}.`
      : uniqueAck.length > 1
        ? `Got it — ${uniqueAck.join(", ")}.`
        : undefined;
  const reply = buildReadinessFollowUpReply(validated.fill, { lead });
  void pathname;
  return { fill: validated.fill, reply, pendingClarification: pending };
}

/** Avoid redundant Navigating when already on the same search destination. */
function refineNavigateTo(
  pathname: string,
  navigateTo: string | undefined
): string | undefined {
  if (!navigateTo) return undefined;
  if (pathname === navigateTo) return undefined;
  // Same /search path with identical query string → skip
  if (pathname.startsWith("/search") && navigateTo.startsWith("/search")) {
    try {
      const cur = new URL(pathname, "https://skydrop.co.nz");
      const next = new URL(navigateTo, "https://skydrop.co.nz");
      if (cur.search === next.search) return undefined;
    } catch {
      /* keep nav */
    }
  }
  return navigateTo;
}

function stripDuplicateLocationInReply(reply: string): string {
  // "location Auckland**, **Location: Auckland" → keep one
  return reply.replace(
    /\*\*location\s+([^,*]+)\*\*(?:,\s*)?\*\*Location:\s*\1\*\*/gi,
    "**location $1**"
  ).replace(
    /\*\*Location:\s*([^,*]+)\*\*(?:,\s*)?\*\*location\s+\1\*\*/gi,
    "**location $1**"
  );
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
  // Preserve raw for display/logging; interpret only normalized text
  const { raw: rawMessage, normalized } = normalizeAwhinaInput(message);
  const trimmed = normalized.trim();
  const listingContext = scrubLegacyFormPollution(context.listingContext) ?? undefined;
  // Re-bind context so all downstream paths see scrubbed draft (unknown stays unknown)
  context = { ...context, listingContext: listingContext ?? null };
  void rawMessage;
  const memKey = searchSessionKey({
    conversationId: context.conversationId,
    uid: context.uid,
    pathname,
    anonSessionId: context.anonSessionId,
  });
  const scopeKey = taskScopeKey({
    conversationId: context.conversationId,
    uid: context.uid,
    pathname,
    anonSessionId: context.anonSessionId,
  });
  const paKey = pendingActionKey({
    conversationId: context.conversationId,
    uid: context.uid,
    pathname,
    anonSessionId: context.anonSessionId,
  });

  // Durable client context hydrates cold Maps (serverless)
  hydrateTaskScope(scopeKey, context.clientTask);
  hydrateSearchSession(memKey, context.clientSearch);
  hydratePendingAction(paKey, context.clientPendingAction);

  // Photo / sell evidence supersedes stale SEARCH pending + open search_slots.
  // Keep search session filters briefly so decision can mark ignoredStaleContext;
  // safety gate + pendingAction prevent Yes from re-executing stale queries.
  if (
    shouldInvalidateSearchOnEvidence({
      hasImages: context.hasImages,
      hasExplicitSell: hasExplicitSellSwitch(trimmed) || hasListingSellIntent(trimmed),
      hasSellFacts: Boolean(
        context.hasImages &&
          (/\$?\d/.test(trimmed) ||
            /\b(psa|bgs|cgc|pickup|pick\s*up)\b/i.test(trimmed))
      ),
      message: trimmed,
    })
  ) {
    const stalePa = getPendingAction(paKey);
    if (stalePa?.type === "SEARCH") {
      clearPendingAction(paKey, "superseded");
    }
    const open = getTaskScope(scopeKey)?.pendingClarification;
    if (isClarificationOpen(open) && open?.kind === "search_slots") {
      cancelOpenClarification(scopeKey, {
        reason: "sell",
        toTask: "selling",
        clearPendingItem: true,
      });
    }
  }

  const finish = (
    partial: Omit<CanonicalResult, "executionTimeMs">,
    decisionOverride?: AwhinaDecision
  ): CanonicalResult => {
    const taskSnap = getTaskScope(scopeKey);
    const searchSnap = getSearchSession(memKey);

    // Response → state contract: confirmation questions must set pendingAction
    if (partial.reply && assistantAskedSellConfirmation(partial.reply)) {
      const fill = (partial.listingFill || {}) as import("./sky-ai-listing-fill").SkyAiListingFill;
      setPendingAction(
        paKey,
        buildStartSellingPendingAction({
          identity:
            (fill.title as string) ||
            getPendingAction(paKey)?.identity ||
            "this item",
          listingFill: fill,
          prompt: "Want to sell it?",
        })
      );
    } else if (partial.reply && assistantAskedIdentityConfirmation(partial.reply)) {
      // Safety net — primary write is vision bridge buildConfirmIdentityPendingAction
      const existing = getPendingAction(paKey);
      if (!existing || existing.type !== "CONFIRM_IDENTITY") {
        const fill = (partial.listingFill || {}) as import("./sky-ai-listing-fill").SkyAiListingFill;
        const identity =
          (fill.title as string) ||
          existing?.identity ||
          "this item";
        setPendingAction(
          paKey,
          buildConfirmIdentityPendingAction({
            identity,
            listingFill: fill,
          })
        );
      }
    } else if (partial.reply) {
      const q = assistantAskedSearchConfirmation(partial.reply);
      if (q) {
        setPendingAction(paKey, buildSearchPendingAction({ searchQuery: q }));
      }
    }
    let reply = partial.reply
      ? polishAwhinaReplyStyle(stripDuplicateLocationInReply(partial.reply))
      : partial.reply;
    let navigateTo = refineNavigateTo(pathname, partial.navigateTo);

    // ANSWER vs ACTION — strip nav for help/safety/Q unless explicit action
    if (
      navigateTo &&
      !shouldAutoNavigate({
        message: trimmed,
        intent: partial.intent,
        hasExplicitNavAction: isExplicitNavigationAction(trimmed),
      })
    ) {
      navigateTo = undefined;
      if (reply) {
        reply = reply.replace(/\s*\[\[NAV:[^\]]+\]\]/g, "").trim();
      }
    }

    // Education-only: never auto-navigate to /messages
    if (
      (partial.intent === "education" || decisionOverride?.intent === "education") &&
      navigateTo === "/messages" &&
      !isExplicitNavigationAction(trimmed)
    ) {
      navigateTo = undefined;
    }

    // Decision + task tool gates (search sticky + decision.blockedTools)
    let tool = partial.tool;
    let toolCall = partial.toolCall;
    let listingFill = partial.listingFill;
    const activeTask = taskSnap?.task || "none";
    const decision =
      decisionOverride ||
      partial._decision ||
      buildAwhinaDecision({
        message: trimmed,
        pathname,
        session: taskSnap,
        listingContext: context.listingContext,
        searchFilters: searchSnap?.filters,
        intentHint:
          partial.intent === "compare"
            ? "compare"
            : partial.intent === "education"
              ? "education"
              : partial.intent === "marketplace_search"
                ? "marketplace_search"
                : partial.intent === "listing_create" || partial.intent === "listing_update"
                  ? "listing_create"
                  : undefined,
      });

    if (tool && (!isToolAllowedForTask(tool, activeTask) || !isToolAllowedByDecision(tool, decision))) {
      tool = undefined;
      toolCall = undefined;
      listingFill = undefined;
      navigateTo = navigateTo === "/post/ai" ? undefined : navigateTo;
    }

    // Internal self-check — strip unsafe tool/fill before emit (never shown)
    const check = selfCheckBeforeToolResponse({
      decision,
      tool,
      listingFill: listingFill as Record<string, unknown> | null,
      navigateTo,
      reply,
      profileFill: partial.profileFill as Record<string, unknown> | null | undefined,
      toolArgs: toolCall?.args,
    });
    if (!check.ok) {
      if (check.reasons.some((r) => r.startsWith("stale_") || r.startsWith("blocked_"))) {
        if (check.reasons.some((r) => r.startsWith("blocked_") || r === "education_nav_messages")) {
          tool = undefined;
          toolCall = undefined;
          if (check.reasons.includes("education_nav_messages")) navigateTo = undefined;
        }
        if (check.reasons.some((r) => r.startsWith("stale_")) && listingFill) {
          // Drop prior-domain bleed fields; keep current-turn price/title when present
          const scrubbed = { ...listingFill } as Record<string, unknown>;
          for (const k of [
            "vehicleMake",
            "vehicleModel",
            "vehicleYear",
            "vehicleColour",
            "vehicleOdometer",
            "rentalSubType",
            "rentalPriceWeekly",
            "rentalPriceMonthly",
            "rentalDeposit",
            "serviceDuration",
            "servicePricingType",
          ]) {
            delete scrubbed[k];
          }
          if (
            decision.currentTurnEntities.price &&
            String(scrubbed.price) !== decision.currentTurnEntities.price
          ) {
            scrubbed.price = decision.currentTurnEntities.price;
          }
          if (
            decision.currentTurnEntities.listingType &&
            String(scrubbed.listingType || "") !== decision.currentTurnEntities.listingType
          ) {
            // Never downgrade a vehicle sell (make/model/year) to soft-physical
            const curMake = decision.currentTurnEntities.make;
            const curType = decision.currentTurnEntities.listingType;
            const scrubIsVehicle =
              scrubbed.listingType === "vehicle" ||
              Boolean(scrubbed.vehicleMake) ||
              Boolean(curMake);
            if (!(scrubIsVehicle && curType === "physical")) {
              scrubbed.listingType = curType;
            } else {
              scrubbed.listingType = "vehicle";
              if (curMake && !scrubbed.vehicleMake) scrubbed.vehicleMake = curMake;
            }
          }
          listingFill = scrubbed;
        }
        if (check.reasons.some((r) => r.includes("navigate") || r.includes("toolArgs"))) {
          // Drop search nav/filters that carried stale prior-sell entities
          const navLeak = check.reasons.some((r) => r.includes(":navigate:") || r.includes(":toolArgs:"));
          if (navLeak && decision.activeTask === "shopping") {
            // Keep navigation but strip is handled by rebuild upstream; flag only
          }
        }
      }
      if (check.reasons.includes("legacy_updated_prefix") && reply) {
        reply = reply.replace(/^Updated:\s*/i, "");
      }
    }

    // At most one contextual tip when strong evidence (not every turn)
    if (reply && listingFill && typeof listingFill === "object") {
      const fillRec = listingFill as Record<string, unknown>;
      // Final guard: sell fills with vehicle make/model must be listingType vehicle
      if (
        fillRec.listingType !== "service" &&
        fillRec.listingType !== "rental" &&
        (fillRec.vehicleMake ||
          fillRec.vehicleModel ||
          decision.currentTurnEntities.make ||
          decision.currentTurnEntities.listingType === "vehicle")
      ) {
        fillRec.listingType = "vehicle";
        if (decision.currentTurnEntities.listingType === "physical") {
          decision.currentTurnEntities.listingType = "vehicle";
        }
        if (!fillRec.category || fillRec.category === "Other") fillRec.category = "Cars";
      }
      const tip = maybeOneProactiveSuggestion({
        evidence: { kind: "listing_tip", fill: listingFill as import("./sky-ai-listing-fill").SkyAiListingFill },
      });
      if (tip && !reply.includes(tip.slice(0, 20))) {
        reply = `${reply} ${tip}`;
      }
    }

    // Stale-state safety gate: search only if current turn or active pending SEARCH
    let resultIntent = partial.intent;
    let resultSource = partial.source;
    if (tool === "searchListings" || toolCall?.tool === "searchListings") {
      // Affirm of pending SEARCH is validated upstream before confirm clears the action
      const affirmSearchConfirm =
        classifyConfirmationReply(trimmed) === "AFFIRM" &&
        partial.tool === "searchListings" &&
        partial.intent === "marketplace_search";
      const requestedByCurrentTurn =
        affirmSearchConfirm ||
        hasSearchIntentLanguage(trimmed) ||
        isVagueShoppingNeed(trimmed) ||
        isExplicitPendingSearchExecute(trimmed, taskSnap?.pendingItem) ||
        isNoResultFollowUp(trimmed) ||
        (Boolean(searchSnap) && isSearchFollowUp(trimmed, searchSnap));
      const gate = mayExecuteAction({
        tool: "searchListings",
        requestedByCurrentTurn,
        resolvingPendingAction: getPendingAction(paKey),
        objectStillCurrent: true,
      });
      if (!gate.ok) {
        tool = undefined;
        toolCall = undefined;
        navigateTo = undefined;
        reply =
          reply && !/Searching for/i.test(reply)
            ? reply
            : "What are you looking for right now?";
        resultIntent = "unknown";
        resultSource = "clarify";
      }
    }

    const result: CanonicalResult = {
      ...partial,
      intent: resultIntent,
      source: resultSource,
      reply,
      navigateTo,
      tool,
      toolCall,
      listingFill,
      executionTimeMs: Date.now() - start,
      sessionState: {
        task: toClientTaskScope(taskSnap),
        search: toClientSearchContext(searchSnap),
        pendingSlot: getPersistedPendingSlot(taskSnap),
        pendingAction: getPendingAction(paKey),
      },
      // Keep on result for tests/telemetry — UI must ignore
      _decision: decision,
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

  // ── 1. PENDING EXPLICIT CONFIRMATION (before search / sticky shopping) ──
  {
    const onSellPageEarly = pathname.startsWith("/post/ai");
    const listKeyPending = listingDraftSessionKey({
      conversationId: context.conversationId,
      uid: context.uid,
      pathname,
      anonSessionId: context.anonSessionId,
    });
    let activePa = getPendingAction(paKey);

    // Interruption / new intent supersedes open confirm (e.g. "actually find me a PS5")
    if (
      activePa &&
      shouldSupersedePendingAction({ message: trimmed, pending: activePa })
    ) {
      clearPendingAction(paKey, "superseded");
      activePa = null;
    }

    const draftSnap = getListingDraftSession(listKeyPending);
    // CONFIRM_IDENTITY is object-scoped: draft title must match pending.objectId
    const draftTitle =
      (draftSnap?.draft?.title && String(draftSnap.draft.title).trim()) ||
      (context.listingContext?.title && String(context.listingContext.title).trim()) ||
      "";
    const currentObjectId =
      activePa?.type === "CONFIRM_IDENTITY" && draftTitle
        ? visionObjectIdFromIdentity(draftTitle)
        : activePa?.objectId || null;

    const resolution = resolvePendingActionTurn({
      message: trimmed,
      pendingAction: activePa,
      currentObjectId,
    });

    if (resolution.kind === "CONFIRM" && resolution.action.type === "CONFIRM_IDENTITY") {
      confirmPendingAction(paKey);
      clearSearchSession(memKey);
      const fill = {
        ...(resolution.action.listingFill || {}),
      } as SkyAiListingFill;
      const identity =
        resolution.action.identity ||
        resolution.action.proposedFacts?.title ||
        (typeof fill.title === "string" ? fill.title : "") ||
        "your item";
      if (!fill.title) fill.title = identity;
      // Accept proposed facts into draft — never ask user to restate identity
      rememberListingDraft(listKeyPending, fill);
      const pendingClarification = buildListingSlotPending(fill, `confirm:${identity}`);
      setActiveTask(scopeKey, "selling", {
        pendingItem: identity,
        pendingClarification: pendingClarification || undefined,
      });
      const reply = buildReadinessFollowUpReply(fill, {
        lead: `Yep — **${identity}**.`,
      });
      return finish({
        handled: true,
        reply,
        listingFill: fill as Record<string, unknown>,
        navigateTo: onSellPageEarly ? undefined : "/post/ai",
        source: "tool",
        intent: "listing_create",
        tool: "updateListingDraft",
        confidence: 0.98,
        usedLocalExecution: true,
        avoidedAi: true,
        toolCall: {
          tool: "updateListingDraft",
          args: { updateListingDraft: fill },
          confidence: 0.98,
        },
      });
    }

    if (resolution.kind === "CONFIRM" && resolution.action.type === "START_SELLING") {
      confirmPendingAction(paKey);
      clearSearchSession(memKey);
      cancelOpenClarification(scopeKey, {
        reason: "sell",
        toTask: "selling",
        clearPendingItem: true,
      });
      const fill = resolution.action.listingFill || {};
      const identity =
        resolution.action.identity ||
        (typeof fill.title === "string" ? fill.title : "") ||
        "your item";
      setActiveTask(scopeKey, "selling", {
        pendingItem: identity,
        pendingClarification: undefined,
      });
      rememberListingDraft(listKeyPending, fill as SkyAiListingFill);
      return finish({
        handled: true,
        reply: `Great — let's list **${identity}**. I'll keep the details you already gave me.`,
        listingFill: fill as Record<string, unknown>,
        navigateTo: onSellPageEarly ? undefined : "/post/ai",
        source: "tool",
        intent: "listing_create",
        tool: "updateListingDraft",
        confidence: 0.98,
        usedLocalExecution: true,
        avoidedAi: true,
        toolCall: {
          tool: "updateListingDraft",
          args: { updateListingDraft: fill as SkyAiListingFill },
          confidence: 0.98,
        },
      });
    }

    if (resolution.kind === "CONFIRM" && resolution.action.type === "SEARCH") {
      const q = resolution.action.searchQuery || resolution.action.objectId || "";
      confirmPendingAction(paKey);
      if (!q) {
        return finish({
          handled: true,
          reply: "What should I search for?",
          source: "clarify",
          intent: "marketplace_search",
          confidence: 0.7,
          usedLocalExecution: true,
          avoidedAi: true,
        });
      }
      const gate = mayExecuteAction({
        tool: "searchListings",
        requestedByCurrentTurn: false,
        resolvingPendingAction: { ...resolution.action, status: "confirmed" },
        objectStillCurrent: true,
      });
      if (!gate.ok) {
        return finish({
          handled: true,
          reply: "That search is no longer current. What are you looking for?",
          source: "clarify",
          intent: "marketplace_search",
          confidence: 0.7,
          usedLocalExecution: true,
          avoidedAi: true,
        });
      }
      rememberPrimarySearch(memKey, `find ${q}`);
      const merged = updateSearchSession(memKey, { query: q });
      setActiveTask(scopeKey, "shopping", {
        pendingItem: q,
        pendingClarification: undefined,
      });
      const { text, navigateTo } = buildSearchFollowUpReply(merged);
      return finish({
        handled: true,
        reply: text,
        navigateTo,
        source: "tool",
        intent: "marketplace_search",
        tool: "searchListings",
        confidence: 0.95,
        usedLocalExecution: true,
        avoidedAi: true,
        toolCall: searchToolCall(merged, 0.95),
      });
    }

    if (resolution.kind === "CONFIRM" && resolution.action.type === "CONFIRM_LOCATION") {
      confirmPendingAction(paKey);
      const loc = resolution.action.objectId || resolution.action.label || "";
      const base = reconstructListingDraftBase({
        listingContext: context.listingContext,
        sessionKey: listKeyPending,
        freshStart: false,
      });
      const fill = { ...base, location: loc, pickupArea: loc };
      rememberListingDraft(listKeyPending, fill);
      setActiveTask(scopeKey, "selling");
      return finish({
        handled: true,
        reply: `Got it — **${loc}**.`,
        listingFill: fill as Record<string, unknown>,
        source: "tool",
        intent: "listing_update",
        tool: "updateListingDraft",
        confidence: 0.95,
        usedLocalExecution: true,
        avoidedAi: true,
      });
    }

    if (resolution.kind === "CONFIRM" && resolution.action.type === "PUBLISH") {
      confirmPendingAction(paKey);
      return finish({
        handled: true,
        reply:
          "Ready when you are — tap **Publish Listing** on the sell page to go live. (I won't publish without that explicit tap.)",
        navigateTo: onSellPageEarly ? undefined : "/post/ai",
        source: "clarify",
        intent: "listing_update",
        confidence: 0.9,
        usedLocalExecution: true,
        avoidedAi: true,
      });
    }

    if (resolution.kind === "REJECT" && resolution.action) {
      rejectPendingAction(paKey);
      const rejectReply =
        resolution.action.type === "CONFIRM_IDENTITY"
          ? "What is it?"
          : resolution.action.type === "START_SELLING"
            ? "No worries — I won't start a listing. What would you like to do instead?"
            : resolution.action.type === "SEARCH"
              ? "Okay, I won't search. What next?"
              : "Okay, cancelled.";
      return finish({
        handled: true,
        reply: rejectReply,
        source: "local",
        intent: resolution.action.type === "CONFIRM_IDENTITY" ? "listing_update" : "unknown",
        confidence: 0.9,
        usedLocalExecution: true,
        avoidedAi: true,
      });
    }

    if (resolution.kind === "CLARIFY" && classifyConfirmationReply(trimmed) !== "NOT_CONFIRMATION") {
      // Orphan yes/no with NO pendingAction — never guess stale search.
      // If an open clarification exists (search_slots / buy_vs_sell / listing), fall through.
      const openClarify = getTaskScope(scopeKey)?.pendingClarification;
      if (!isClarificationOpen(openClarify)) {
        return finish({
          handled: true,
          reply: resolution.reply,
          source: "clarify",
          intent: "unknown",
          confidence: 0.8,
          usedLocalExecution: true,
          avoidedAi: true,
        });
      }
    }
  }

  // Pending BUY vs SELL / type clarification — only while open (not search_slots).
  {
    const taskSnapEarly = getTaskScope(scopeKey);
    const pendingEarly = taskSnapEarly?.pendingClarification;
    const buySellPendingOpen =
      isClarificationOpen(pendingEarly) &&
      (pendingEarly.kind === "buy_vs_sell" || pendingEarly.kind === "listing_type");

    if (buySellPendingOpen) {
      const override = detectPendingClarificationOverride(trimmed, pendingEarly);
      if (override) {
        cancelOpenClarification(scopeKey, {
          reason: override.reason,
          toTask: override.toTask,
          clearPendingItem: true,
        });
        if (override.toTask === "selling") clearSearchSession(memKey);
      }
    }

    const pendingAfterOverride = getTaskScope(scopeKey)?.pendingClarification;
    const stillBuySellOpen =
      isClarificationOpen(pendingAfterOverride) &&
      (pendingAfterOverride.kind === "buy_vs_sell" ||
        pendingAfterOverride.kind === "listing_type");

    if (stillBuySellOpen) {
      const priorUserFromHistory = [...(context.history || [])]
        .reverse()
        .find((h) => h.role === "user" && h.content?.trim() && h.content.trim() !== trimmed)
        ?.content;
      const pendingResolved = tryResolvePendingClarification({
        message: trimmed,
        pending: pendingAfterOverride,
        priorUserMessage: priorUserFromHistory,
      });
      if (pendingResolved.resolved && pendingResolved.resolution?.mode === "buy") {
        const buyQ = sanitizeSearchQueryText(
          pendingResolved.priorMessage ||
            pendingResolved.combinedMessage ||
            trimmed
        );
        resolveOpenClarification(scopeKey, {
          toTask: "shopping",
          canonicalQuery: buyQ,
        });
        rememberPrimarySearch(memKey, buyQ);
        const delta = extractSearchRefinement(buyQ);
        if (!delta.query) delta.query = buyQ.slice(0, 120);
        const merged = updateSearchSession(memKey, delta);
        const { text, navigateTo } = buildSearchFollowUpReply(merged);
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
          toolCall: searchToolCall(merged, 0.9),
        });
      }
      if (
        pendingResolved.resolved &&
        pendingResolved.resolution?.mode === "sell" &&
        pendingResolved.combinedMessage
      ) {
        resolveOpenClarification(scopeKey, { toTask: "selling" });
        clearSearchSession(memKey);
        const sellMsg = pendingResolved.combinedMessage;
        const listKeyEarly = listingDraftSessionKey({
          conversationId: context.conversationId,
          uid: context.uid,
          pathname: "/post/ai",
          anonSessionId: context.anonSessionId,
        });
        clearListingDraftSession(listKeyEarly);
        const listing = processListingFillMessage(sellMsg, {
          pathname: "/post/ai",
          listingContext: null,
          sessionKey: listKeyEarly,
          freshStart: true,
        });
        if (listing.handled && listing.listingFill) {
          if (pendingResolved.resolution.listingType) {
            listing.listingFill.listingType = pendingResolved.resolution.listingType;
            if (
              pendingResolved.resolution.listingType === "service" &&
              !listing.listingFill.servicePricingType
            ) {
              listing.listingFill.servicePricingType = "fixed";
            }
          }
          const sellDecision = buildAwhinaDecision({
            message: sellMsg,
            pathname: "/post/ai",
            session: { task: "selling", updatedAt: Date.now() },
            intentHint: "listing_create",
            entities: pendingResolved.resolution.listingType
              ? { listingType: pendingResolved.resolution.listingType }
              : undefined,
          });
          return finish(
            {
              handled: true,
              reply: listing.reply,
              listingFill: listing.listingFill,
              navigateTo: pathname.startsWith("/post/ai") ? undefined : "/post/ai",
              source: "tool",
              intent: "listing_create",
              tool: listing.toolCall?.tool || "createListing",
              confidence: Math.max(0.9, sellDecision.confidence),
              usedLocalExecution: false,
              avoidedAi: true,
              toolCall: listing.toolCall,
              _decision: { ...sellDecision, requiresClarification: false },
            },
            { ...sellDecision, requiresClarification: false }
          );
        }
      }
    }
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

  // Arrange purchase — messaging-first (no Stripe / Buy Now pitch). Answer in place unless ACTION.
  if (/\b(arrange purchase|how do i pay|bank transfer|contact seller|message seller|how to buy)\b/i.test(trimmed)) {
    if (!hasListingSellIntent(trimmed)) {
      const wantsOpen = isExplicitNavigationAction(trimmed) || /\b(open|go to|take me to)\s+messages?\b/i.test(trimmed);
      return finish({
        handled: true,
        reply: awhinaArrangePurchaseReply(),
        navigateTo: wantsOpen ? "/messages" : undefined,
        source: "rules",
        intent: "purchase",
        tool: wantsOpen ? "openMessages" : undefined,
        confidence: 0.95,
        usedLocalExecution: false,
        avoidedAi: true,
        toolCall: wantsOpen
          ? {
              tool: "openMessages",
              args: { openMessages: {} },
              confidence: 0.95,
            }
          : undefined,
      });
    }
  }

  // Marketplace education — scam / safe pickup (messaging-first V1). Answer in place.
  const edu = tryMarketplaceEducationReply(trimmed);
  if (edu) {
    setActiveTask(scopeKey, "help");
    const eduDecision = buildAwhinaDecision({
      message: trimmed,
      pathname,
      session: getTaskScope(scopeKey),
      intentHint: "education",
    });
    return finish(
      {
        handled: true,
        reply: edu.includes("Stay on") ? edu : awhinaSafetyEducationReply(),
        navigateTo: undefined,
        source: "rules",
        intent: "education",
        confidence: 0.95,
        usedLocalExecution: false,
        avoidedAi: true,
        tool: undefined,
        toolCall: undefined,
        _decision: eduDecision,
      },
      eduDecision
    );
  }

  // Listing comparison — single grounded pathway (pageListings pre-enriched by route)
  if (isCompareRequest(trimmed)) {
    const priorCompare = getTaskScope(scopeKey)?.compareCandidates;
    const grounded = buildGroundedCompareReply({
      message: trimmed,
      pageListings: context.pageListings || [],
      compareCandidates: priorCompare,
    });
    setActiveTask(scopeKey, "shopping", {
      compareCandidates: grounded.titles.length
        ? grounded.titles
        : grounded.facts.map((f) => String(f.title || "")).filter(Boolean),
    });
    const compareDecision = buildAwhinaDecision({
      message: trimmed,
      pathname,
      session: getTaskScope(scopeKey),
      intentHint: "compare",
    });
    return finish(
      {
        handled: true,
        reply: grounded.reply,
        navigateTo: undefined,
        source: "rules",
        intent: "compare",
        confidence: grounded.grounded ? 0.9 : 0.85,
        usedLocalExecution: false,
        avoidedAi: true,
        clarificationQuestion: grounded.facts.length < 2 ? grounded.reply : undefined,
        _decision: compareDecision,
      },
      compareDecision
    );
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
  let taskSession = getTaskScope(scopeKey);
  const listKeyEarly = listingDraftSessionKey({
    conversationId: context.conversationId,
    uid: context.uid,
    pathname,
    anonSessionId: context.anonSessionId,
  });
  const listSessionEarly = getListingDraftSession(listKeyEarly);
  const hasListDraftEarly =
    hasActiveListingDraft(context.listingContext) || Boolean(listSessionEarly?.draft);

  const searchLang = hasSearchIntentLanguage(trimmed);
  const explicitSell =
    hasExplicitSellSwitch(trimmed) && !isListPublishActionMessage(trimmed);
  const stickyShopping = taskSession?.task === "shopping" && !explicitSell && !onSellPage;

  // Explicit NEW INTENT wins — cancel open clarification before applying it
  {
    const override = detectPendingClarificationOverride(
      trimmed,
      taskSession?.pendingClarification
    );
    if (override) {
      cancelOpenClarification(scopeKey, {
        reason: override.reason,
        toTask: override.toTask,
        clearPendingItem: true,
      });
      if (override.toTask === "selling" || override.reason === "new_shop_need") {
        clearSearchSession(memKey);
      }
      taskSession = getTaskScope(scopeKey);
    }
  }

  // ── Pending listing-slot resolution (BEFORE broader intent / free-form) ──
  // Intelligence turn: intent → extract ALL facts → corrections → merge →
  // pendingSlot as HINT (not trap) → response guard. Do not answer before merge.
  {
    const pendingListing = getTaskScope(scopeKey)?.pendingClarification;
    const activeSlot = getActiveListingSlot(pendingListing);
    const draftCmdsEarly = detectActiveDraftCommands(trimmed);
    if (
      activeSlot &&
      isClarificationOpen(pendingListing) &&
      pendingListing?.kind === "listing_slots" &&
      trimmed.length > 0 &&
      trimmed.length <= 160 &&
      !explicitSell &&
      !searchLang &&
      draftCmdsEarly.commands.length === 0
    ) {
      const sessionKey = listKeyEarly;
      const baseDraft = reconstructListingDraftBase({
        listingContext: context.listingContext,
        sessionKey,
        freshStart: false,
      });
      const priorAssistant = [...(context.history || [])]
        .reverse()
        .find((h) => h.role === "assistant")?.content;

      const intel = runIntelligenceTurn({
        message: trimmed,
        activeSlot,
        baseDraft,
        priorAssistant,
        pathname,
      });

      // Uncertainty / skip — advance without trapping
      if (intel.skipActiveSlot) {
        const nextSlot = intel.pendingSlotAfter;
        const pending =
          intel.pendingClarification ||
          (nextSlot
            ? {
                ...pendingListing!,
                pendingSlot: nextSlot,
                askedAt: Date.now(),
              }
            : pendingListing);
        setActiveTask(scopeKey, "selling", {
          pendingClarification: pending || undefined,
          entityLocked: intel.canonicalState.entityLocked,
          entityLockKey: intel.canonicalState.entityLockKey,
        });
        const q = nextSlot ? SLOT_QUESTIONS[nextSlot] : undefined;
        return finish({
          handled: true,
          reply: q
            ? `No worries — we can skip that. ${q}`
            : "No worries — we can keep going without that.",
          source: "clarify",
          intent: "listing_update",
          confidence: 0.8,
          usedLocalExecution: true,
          avoidedAi: true,
          clarificationQuestion: q,
        });
      }

      // Pure corruption with no salvageable facts — re-ask once (guarded)
      if (
        intel.validation?.satisfaction === "corruption" &&
        !intel.filledSlots.length
      ) {
        setActiveTask(scopeKey, "selling", {
          pendingClarification: pendingListing,
        });
        return finish({
          handled: true,
          reply: `${SLOT_QUESTIONS[activeSlot]} (that didn't look like a ${activeSlot.replace(/_/g, " ")} — try again?)`,
          source: "clarify",
          intent: "listing_update",
          confidence: 0.7,
          usedLocalExecution: true,
          avoidedAi: true,
          clarificationQuestion: SLOT_QUESTIONS[activeSlot],
        });
      }

      if (intel.handled && intel.filledSlots.length > 0) {
        let partial: SkyAiListingFill = { ...intel.validation?.appliedPartial };
        // Preserve odometer unit tagging from legacy path
        if (
          intel.filledSlots.includes("odometer") &&
          (partial.vehicleOdometer || intel.mergedDraft.vehicleOdometer)
        ) {
          const unit = /\b(miles?|mi)\b/i.test(trimmed) ? "mi" : "km";
          partial.extras = mergeExtras(partial.extras, [`odometerUnit:${unit}`]);
        }
        const applied = applyPendingSlotFill({
          base: baseDraft,
          partial: {
            ...partial,
            // Identity corrections must win on title
            ...(intel.mergedDraft.title && intel.userCorrectedKeys.length
              ? { title: intel.mergedDraft.title }
              : {}),
            ...(intel.mergedDraft.extras
              ? { extras: intel.mergedDraft.extras }
              : {}),
          },
          filledSlots: intel.filledSlots,
          message: trimmed,
          sessionKey,
          scopeKey,
          pathname,
        });
        if (applied) {
          // Re-bind pending from intelligence (domain-aware; no card_set trap)
          let pending = intel.pendingClarification || applied.pendingClarification;
          if (intel.pendingSlotAfter && pending) {
            pending = {
              ...pending,
              pendingSlot: intel.pendingSlotAfter,
            };
          } else if (!intel.pendingSlotAfter) {
            pending = null;
          }
          setActiveTask(scopeKey, "selling", {
            pendingClarification: pending || undefined,
            entityLocked: intel.canonicalState.entityLocked,
            entityLockKey: intel.canonicalState.entityLockKey,
          });

          let reply = applied.reply;
          if (intel.guard.safeReply && !intel.guard.ok) {
            reply = intel.guard.safeReply;
          }

          // Stamp USER_CONFIRMED / USER_CORRECTED so re-photo cannot resurrect vision
          const fieldAuthority: NonNullable<SkyAiListingFill["fieldAuthority"]> = {
            ...(applied.fill.fieldAuthority || {}),
          };
          for (const [k, auth] of Object.entries(intel.authorityStamps)) {
            if (!auth) continue;
            const prov = authorityToListingProvenance(auth);
            // DEFAULT_UNTOUCHED is not a stampable fieldAuthority — skip it
            if (prov === "DEFAULT_UNTOUCHED") continue;
            fieldAuthority[k] = prov;
          }
          const fillWithAuthority: SkyAiListingFill = {
            ...applied.fill,
            ...(Object.keys(fieldAuthority).length ? { fieldAuthority } : {}),
          };

          return finish({
            handled: true,
            reply,
            listingFill: fillWithAuthority,
            navigateTo: onSellPage ? undefined : "/post/ai",
            source: "tool",
            intent: "listing_update",
            tool: "updateListingDraft",
            confidence: 0.95,
            usedLocalExecution: true,
            avoidedAi: true,
            toolCall: {
              tool: "updateListingDraft",
              args: { updateListingDraft: fillWithAuthority },
              confidence: 0.95,
            },
          });
        }
      }

      // Fallback: legacy compound path when intelligence did not handle
      if (!intel.handled) {
        const slotResult = parseShortReplyForPendingSlot(trimmed, activeSlot);
        if (slotResult.matched && !slotResult.rejectedCorruption) {
          const fromCompound = extractCompoundListingFacts(trimmed, {
            activeSlot,
            baseDraft,
          });
          let partial: SkyAiListingFill = {
            ...fromCompound.partial,
            ...slotResult.partial,
          };
          if (
            fromCompound.partial.extras ||
            slotResult.partial.extras ||
            baseDraft.extras
          ) {
            partial.extras = mergeExtras(
              mergeExtras(baseDraft.extras, fromCompound.partial.extras),
              slotResult.partial.extras
            );
          }
          const filledSlots: ListingMissingSlot[] = [];
          for (const s of [
            ...(slotResult.filledSlot ? [slotResult.filledSlot] : [activeSlot]),
            ...fromCompound.filledSlots,
          ]) {
            if (!filledSlots.includes(s)) filledSlots.push(s);
          }
          const applied = applyPendingSlotFill({
            base: baseDraft,
            partial,
            filledSlots,
            message: trimmed,
            sessionKey,
            scopeKey,
            pathname,
          });
          if (applied) {
            return finish({
              handled: true,
              reply: applied.reply,
              listingFill: applied.fill,
              navigateTo: onSellPage ? undefined : "/post/ai",
              source: "tool",
              intent: "listing_update",
              tool: "updateListingDraft",
              confidence: 0.95,
              usedLocalExecution: true,
              avoidedAi: true,
              toolCall: {
                tool: "updateListingDraft",
                args: { updateListingDraft: applied.fill },
                confidence: 0.95,
              },
            });
          }
        } else {
          const extracted = extractCompoundListingFacts(trimmed, {
            activeSlot,
            baseDraft,
          });
          if (extracted.filledSlots.length > 0) {
            const applied = applyPendingSlotFill({
              base: baseDraft,
              partial: extracted.partial,
              filledSlots: extracted.filledSlots,
              message: trimmed,
              sessionKey,
              scopeKey,
              pathname,
            });
            if (applied) {
              return finish({
                handled: true,
                reply: applied.reply,
                listingFill: applied.fill,
                navigateTo: onSellPage ? undefined : "/post/ai",
                source: "tool",
                intent: "listing_update",
                tool: "updateListingDraft",
                confidence: 0.95,
                usedLocalExecution: true,
                avoidedAi: true,
                toolCall: {
                  tool: "updateListingDraft",
                  args: { updateListingDraft: applied.fill },
                  confidence: 0.95,
                },
              });
            }
          }
        }
      }
    }
  }

  // Task-scoped "make it cheaper": shopping → sort cheapest; selling → draft (later)
  const taskForRelative = resolveTaskForMessage(trimmed, {
    pathname,
    hasListingDraft: hasListDraftEarly,
    session: taskSession,
    hasSellIntent: hasListingSellIntent(trimmed) || explicitSell,
    hasSearchIntent: searchLang || stickyShopping,
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
      toolCall: searchToolCall(merged, 0.9),
    });
  }

  // Pending shopping search clarification — affirmations continue; slots or explicit find execute
  {
    const pendingSearch =
      isClarificationOpen(taskSession?.pendingClarification) &&
      taskSession?.pendingClarification?.kind === "search_slots"
        ? taskSession.pendingClarification
        : null;
    const pendingItem =
      pendingSearch?.item ||
      pendingSearch?.knownEntities?.item ||
      (pendingSearch ? taskSession?.pendingItem : undefined) ||
      undefined;

    if (!onSellPage && !onProfilePage && pendingItem && pendingSearch) {
      // Soft yes / sure → ask only for still-missing slots (do not restart intent / never search "yes")
      if (isSearchClarificationAffirmation(trimmed)) {
        const missing = pendingSearch.missingSlots || ["budget", "location"];
        const reply = buildPendingSearchSlotAsk(pendingItem, missing, {
          message: pendingSearch.priorMessage,
          searchType: pendingSearch.knownEntities?.searchType,
        });
        setActiveTask(scopeKey, "shopping", {
          pendingItem,
          pendingClarification: {
            ...pendingSearch,
            status: "open",
            missingSlots: missing,
            item: pendingItem,
            knownEntities: { ...(pendingSearch.knownEntities || {}), item: pendingItem },
          },
        });
        return finish({
          handled: true,
          reply,
          source: "clarify",
          intent: "marketplace_search",
          confidence: 0.85,
          usedLocalExecution: false,
          avoidedAi: true,
          clarificationQuestion: reply,
        });
      }

      // "find mower listings" / explicit search → execute immediately with pending item only
      if (isExplicitPendingSearchExecute(trimmed, pendingItem)) {
        const combined = mergeClarifyIntoSearchMessage(pendingItem, trimmed);
        const canonicalQuery = sanitizeSearchQueryText(pendingItem) || pendingItem;
        rememberPrimarySearch(memKey, combined);
        const delta = extractSearchRefinement(combined);
        if (!delta.query) delta.query = canonicalQuery;
        else delta.query = sanitizeSearchQueryText(delta.query) || canonicalQuery;
        const merged = updateSearchSession(memKey, delta);
        resolveOpenClarification(scopeKey, {
          toTask: "shopping",
          canonicalQuery: merged.query || canonicalQuery,
        });
        const { text, navigateTo } = buildSearchFollowUpReply(merged);
        return finish({
          handled: true,
          reply: text,
          navigateTo,
          source: "tool",
          intent: "marketplace_search",
          tool: "searchListings",
          confidence: 0.92,
          usedLocalExecution: false,
          avoidedAi: true,
          toolCall: searchToolCall(merged, 0.92),
        });
      }

      // Real slot answer (budget / city / edition / condition)
      if (
        isShoppingClarifyAnswer(trimmed, pendingItem) &&
        hasEnoughSearchSlotInfo(pendingSearch.missingSlots, trimmed)
      ) {
        const combined = mergeClarifyIntoSearchMessage(pendingItem, trimmed);
        const canonicalQuery = sanitizeSearchQueryText(pendingItem) || pendingItem;
        rememberPrimarySearch(memKey, combined);
        const delta = extractSearchRefinement(combined);
        delta.query = canonicalQuery;
        const merged = updateSearchSession(memKey, delta);
        resolveOpenClarification(scopeKey, {
          toTask: "shopping",
          canonicalQuery: merged.query || canonicalQuery,
        });
        const { text, navigateTo } = buildSearchFollowUpReply(merged);
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
          toolCall: searchToolCall(merged, 0.9),
        });
      }

      // Partial / short answer that didn't fill a tracked slot — keep asking once
      if (isShoppingClarifyAnswer(trimmed, pendingItem)) {
        const missing = pendingSearch.missingSlots || ["budget", "location"];
        const reply = buildPendingSearchSlotAsk(pendingItem, missing, {
          message: pendingSearch.priorMessage,
          searchType: pendingSearch.knownEntities?.searchType,
        });
        return finish({
          handled: true,
          reply,
          source: "clarify",
          intent: "marketplace_search",
          confidence: 0.8,
          usedLocalExecution: false,
          avoidedAi: true,
          clarificationQuestion: reply,
        });
      }
    }
  }

  // Proactive clarify for vague shopping needs ("I need a PS5" / "need a mower")
  if (
    !onSellPage &&
    !onProfilePage &&
    !hasListingSellIntent(trimmed) &&
    !explicitSell &&
    isVagueShoppingNeed(trimmed)
  ) {
    // Leaving sell/help for a new shop need — clear stale draft/search bleed
    if (taskSession?.task === "selling" || taskSession?.task === "help") {
      clearSearchSession(memKey);
      clearListingDraftSession(listKeyEarly);
      cancelOpenClarification(scopeKey, {
        reason: "new_shop_need",
        toTask: "shopping",
        clearPendingItem: true,
      });
    }
    const { reply, item, missingSlots, searchType } = buildProactiveShoppingClarify(trimmed);
    const clarification = buildOpenSearchSlotClarification({
      priorMessage: trimmed,
      item,
      missingSlots,
      originatingTask: "shopping",
      searchType,
    });
    setActiveTask(scopeKey, "shopping", {
      pendingItem: item,
      pendingClarification: clarification,
    });
    logClarificationLifecycle("opened", {
      kind: clarification.kind,
      status: "open",
      sessionId: clarification.sessionId,
      originatingTask: "shopping",
      originatingIntent: "marketplace_search",
      pendingTool: "searchListings",
      missingSlots,
      knownEntityKeys: ["item"],
    });
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
  // Sticky SEARCH follow-ups (vehicle refinements, budget, location) stay search
  const allowSearchFollowUp =
    !onSellPage &&
    !onProfilePage &&
    !explicitSell &&
    !(
      isRelativePricePhrase(trimmed) &&
      taskForRelative === "selling" &&
      hasListDraftEarly
    );

  // No-result intelligence — relax filters via a real follow-up search; tell user what changed
  if (
    allowSearchFollowUp &&
    session?.filters &&
    (session.filters.query || session.filters.make) &&
    (isNoResultFollowUp(trimmed) || context.searchResultMeta?.count === 0)
  ) {
    const prior = session.filters;
    const relax = proposeSearchRelaxation({
      query: prior.query,
      maxPrice: prior.maxPrice,
      location: prior.location,
      year: prior.year,
      minYear: prior.minYear,
      maxYear: prior.maxYear,
      condition: prior.condition,
    });
    if (relax) {
      const merged = updateSearchSession(memKey, {
        ...prior,
        ...relax.filters,
        query: relax.filters.query ?? prior.query,
      });
      setActiveTask(scopeKey, "shopping");
      const { navigateTo } = buildSearchFollowUpReply(merged);
      const metaCount = context.searchResultMeta?.count;
      const reply = buildNoResultReply({
        query: merged.query || prior.query || "listings",
        whatChanged: relax.whatChanged,
        followUpCount:
          typeof metaCount === "number" && metaCount > 0 ? metaCount : undefined,
      });
      return finish({
        handled: true,
        reply,
        navigateTo,
        source: "tool",
        intent: "marketplace_search",
        tool: "searchListings",
        confidence: 0.88,
        usedLocalExecution: false,
        avoidedAi: true,
        toolCall: searchToolCall(merged, 0.88),
      });
    }
  }

  if (
    allowSearchFollowUp &&
    (stickyShopping || Boolean(session?.filters?.query || session?.filters?.make)) &&
    (isSearchFollowUp(trimmed, session) ||
      searchLang ||
      Boolean(
        extractSearchRefinement(trimmed).make ||
          extractSearchRefinement(trimmed).model ||
          extractSearchRefinement(trimmed).year ||
          extractSearchRefinement(trimmed).maxPrice ||
          extractSearchRefinement(trimmed).location ||
          extractSearchRefinement(trimmed).transmission
      ))
  ) {
    const delta = extractSearchRefinement(trimmed);
    // Ignore empty chatter while sticky shopping
    const hasDelta = Boolean(
      delta.query ||
        delta.make ||
        delta.model ||
        delta.year ||
        delta.maxPrice ||
        delta.location ||
        delta.transmission ||
        delta.condition ||
        delta.sortBy ||
        delta.hideSold
    );
    if (!hasDelta && !isSearchFollowUp(trimmed, session) && !searchLang) {
      // fall through
    } else {
    const merged = updateSearchSession(memKey, delta);
    setActiveTask(scopeKey, "shopping");
    if (
      merged.query ||
      merged.location ||
      merged.maxPrice ||
      merged.sortBy ||
      merged.make ||
      merged.year
    ) {
      const { text, navigateTo } = buildSearchFollowUpReply(merged);
      const meta = context.searchResultMeta;
      const premium =
        typeof meta?.count === "number"
          ? buildPremiumSearchSummary({
              query: merged.query || "listings",
              location: merged.location,
              sortBy: merged.sortBy,
              hideSold: merged.hideSold,
              condition: merged.condition,
              count: meta.count,
              cheapestPrice: meta.cheapestPrice,
              newestTitle: meta.newestTitle,
            })
          : null;
      return finish({
        handled: true,
        reply: premium || text,
        navigateTo,
        source: "tool",
        intent: "marketplace_search",
        tool: "searchListings",
        confidence: 0.9,
        usedLocalExecution: false,
        avoidedAi: true,
        toolCall: searchToolCall(merged, 0.9),
      });
    }
    }
  }

  // Primary find — structured search tool + remember session (decision-gated)
  if (
    !explicitSell &&
    (!hasListingSellIntent(trimmed) || searchLang || stickyShopping) &&
    pathname !== "/post/ai"
  ) {
    const searchDecision = buildAwhinaDecision({
      message: trimmed,
      pathname,
      session: taskSession,
      listingContext: context.listingContext,
      searchFilters: getSearchSession(memKey)?.filters,
      intentHint: "marketplace_search",
    });
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
    if (find || searchLang) {
      if (!isToolAllowedByDecision("searchListings", searchDecision)) {
        // Decision blocked search — fall through
      } else {
      rememberPrimarySearch(memKey, trimmed);
      setActiveTask(scopeKey, "shopping");
      const delta = extractSearchRefinement(trimmed);
      const merged = updateSearchSession(memKey, delta);
      const built = buildSearchFollowUpReply(merged);
      const useBuilt =
        Boolean(
          merged.transmission ||
            merged.condition ||
            merged.sortBy ||
            merged.hideSold ||
            merged.year ||
            merged.make ||
            merged.maxPrice ||
            merged.location
        ) || !find;
      const path = useBuilt ? built.navigateTo : find!.navigateTo;
      const text = useBuilt ? built.text : find!.text;
      const toolCall = searchToolCall(merged, searchDecision.confidence);
      const validated = validateToolCall(toolCall);
      return finish(
        {
          handled: true,
          reply: text,
          navigateTo: path,
          source: "tool",
          intent: "marketplace_search",
          tool: validated.ok ? "searchListings" : undefined,
          confidence: searchDecision.confidence,
          usedLocalExecution: false,
          avoidedAi: true,
          toolCall: validated.ok ? toolCall : undefined,
          _decision: searchDecision,
        },
        searchDecision
      );
      }
    }
  }

  // ── Sell listing-fill (partial draft updates + validation) ──
  // Hard gate: sticky SEARCH blocks sell tools unless explicit sell switch or sell page
  const onSell = pathname.startsWith("/post/ai");
  const listKey = listKeyEarly;
  const listSession = listSessionEarly;
  const hasListDraft = hasListDraftEarly;
  const sellDecisionEarly = buildAwhinaDecision({
    message: trimmed,
    pathname,
    session: taskSession,
    listingContext: context.listingContext || (listSession?.draft as SkyAiListingContext) || null,
    searchFilters: getSearchSession(memKey)?.filters,
  });
  const resolvedTask = sellDecisionEarly.activeTask;

  const sellCandidate =
    onSell ||
    (resolvedTask === "selling" &&
      (explicitSell ||
        hasListingSellIntent(trimmed) ||
        (isListingFollowUp(trimmed, hasListDraft) && !stickyShopping)));

  if (sellCandidate && !stickyShopping && !sellDecisionEarly.stickyShopping) {
    // Hard task RESET only when leaving SEARCH/help — not sell→sell domain shifts
    const priorWasShopping =
      taskSession?.task === "shopping" || taskSession?.task === "help";
    const domainShiftSell = Boolean(sellDecisionEarly.freshSellStart && !priorWasShopping);
    const switchingFromSearch =
      priorWasShopping &&
      (sellDecisionEarly.freshSellStart ||
        explicitSell ||
        hasListingSellIntent(trimmed));
    // Capture prior search filters BEFORE clear — for ignoredStaleContext
    const priorSearchFilters = getSearchSession(memKey)?.filters || null;
    const priorListingForStale =
      context.listingContext || (listSession?.draft as SkyAiListingContext) || null;
    if (switchingFromSearch || domainShiftSell) {
      if (switchingFromSearch) clearSearchSession(memKey);
      clearListingDraftSession(listKey);
      if (isClarificationOpen(getTaskScope(scopeKey)?.pendingClarification)) {
        cancelOpenClarification(scopeKey, {
          reason: switchingFromSearch ? "task_switch_sell" : "domain_shift_sell",
          toTask: "selling",
          clearPendingItem: true,
        });
      } else {
        setActiveTask(scopeKey, "selling", {
          pendingItem: undefined,
          compareCandidates: undefined,
          pendingClarification: undefined,
        });
      }
    }

    const sellDecision = buildAwhinaDecision({
      message: trimmed,
      pathname: onSell ? pathname : "/post/ai",
      session: switchingFromSearch
        ? { task: "shopping", updatedAt: Date.now() }
        : domainShiftSell
          ? { task: "selling", updatedAt: Date.now() }
          : getTaskScope(scopeKey),
      // Keep prior draft visible to stale-check even when we hard-reset the fill
      listingContext:
        switchingFromSearch || domainShiftSell
          ? priorListingForStale
          : priorListingForStale,
      searchFilters: priorSearchFilters,
      intentHint:
        switchingFromSearch || domainShiftSell || sellDecisionEarly.freshSellStart
          ? "listing_create"
          : undefined,
    });
    // After decision, active task is selling — keep ignoredStale from prior shop/draft
    const sellDecisionFinal = {
      ...sellDecision,
      activeTask: "selling" as const,
      freshSellStart:
        switchingFromSearch || domainShiftSell || sellDecision.freshSellStart,
      ignoredStaleContext: collectIgnoredStaleContext({
        activeTask: "selling",
        priorTask: switchingFromSearch
          ? "shopping"
          : domainShiftSell
            ? "selling"
            : taskSession?.task || "none",
        freshSellStart:
          switchingFromSearch || domainShiftSell || sellDecision.freshSellStart,
        searchFilters: priorSearchFilters,
        listingContext: priorListingForStale,
        currentEntities: sellDecision.currentTurnEntities,
      }),
    };

    if (sellDecisionFinal.requiresClarification && sellDecisionFinal.clarificationQuestion && !onSell) {
      const now = Date.now();
      setActiveTask(scopeKey, "selling", {
        pendingClarification: {
          kind: "buy_vs_sell",
          status: "open",
          priorMessage: trimmed,
          askedAt: now,
          createdAt: now,
          sessionId: `clr_${now.toString(36)}`,
          originatingTask: "selling",
          originatingIntent: "listing_create",
        },
      });
      logClarificationLifecycle("opened", {
        kind: "buy_vs_sell",
        status: "open",
        originatingTask: "selling",
        originatingIntent: "listing_create",
      });
      return finish(
        {
          handled: true,
          reply: sellDecisionFinal.clarificationQuestion,
          source: "clarify",
          intent: "listing_create",
          confidence: sellDecisionFinal.confidence,
          usedLocalExecution: false,
          avoidedAi: true,
          clarificationQuestion: sellDecisionFinal.clarificationQuestion,
          _decision: sellDecisionFinal,
        },
        sellDecisionFinal
      );
    }

    const listing = processListingFillMessage(trimmed, {
      pathname: onSell ? pathname : "/post/ai",
      // Fresh SELL / domain shift: ignore client listingContext bleed into the new draft
      listingContext:
        switchingFromSearch || domainShiftSell
          ? null
          : priorListingForStale,
      sessionKey: listKey,
      freshStart: switchingFromSearch || domainShiftSell,
      pendingClarification:
        switchingFromSearch || domainShiftSell
          ? null
          : getTaskScope(scopeKey)?.pendingClarification,
    });
    if (listing.handled) {
      const sellTool = listing.toolCall?.tool || (listing.listingFill ? "createListing" : undefined);
      if (
        sellTool &&
        (!isToolAllowedForTask(sellTool, "selling") ||
          !isToolAllowedByDecision(sellTool, { ...sellDecisionFinal, activeTask: "selling" }))
      ) {
        // Fall through — should not sell while shopping / decision blocked
      } else {
        setActiveTask(scopeKey, "selling", {
          pendingClarification: listing.pendingClarification,
        });
        const navigateTo =
          !onSell && listing.listingFill
            ? "/post/ai"
            : undefined;
        return finish(
          {
            handled: true,
            reply: listing.reply,
            listingFill: listing.listingFill,
            navigateTo,
            source: listing.clarify ? "clarify" : "tool",
            intent: listing.intent,
            tool: sellTool,
            confidence: listing.clarify ? 0.55 : sellDecisionFinal.confidence,
            usedLocalExecution: false,
            avoidedAi: true,
            clarificationQuestion: listing.clarify ? listing.reply : undefined,
            toolCall: listing.toolCall,
            _decision: sellDecisionFinal,
          },
          sellDecisionFinal
        );
      }
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
