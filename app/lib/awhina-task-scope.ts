/**
 * Task-scoped follow-up memory — selling vs shopping.
 * Prevents cross-contamination ("make it cheaper" → draft when selling, search when shopping).
 * Sticky SEARCH after want/looking/need/find until explicit sell/list language.
 *
 * Clarification is explicit state (status + originating task/tool/slots).
 * Closed/cancelled/resolved clarifications must not influence future turns.
 */

import { hasExplicitSellSwitch, hasSearchIntentLanguage } from "./sky-ai-intent";

export type AwhinaActiveTask = "selling" | "shopping" | "help" | "none";

/** Optional search refinements still needed after a proactive shopping clarify. */
export type SearchMissingSlot = "budget" | "location" | "edition" | "condition";

/** Lifecycle for pending clarification — never apply when not open. */
export type ClarificationStatus = "open" | "resolved" | "cancelled" | "closed";

/**
 * Pending clarification — buy/sell/type OR shopping search slots OR sell listing slots.
 * Affirmations (yes/sure) must continue this pending flow, not restart intent.
 * When status ≠ open, ignore completely.
 */
export type PendingClarification = {
  kind: "buy_vs_sell" | "listing_type" | "search_slots" | "listing_slots";
  /** Required for new clarifications; missing → treat as open (client back-compat). */
  status?: ClarificationStatus;
  priorMessage: string;
  askedAt: number;
  createdAt?: number;
  /** Opaque session id for this clarification instance */
  sessionId?: string;
  originatingTask?: AwhinaActiveTask;
  originatingIntent?: string;
  pendingTool?: string;
  /** Structured known facts (item, etc.) — never raw transcript concat */
  knownEntities?: Record<string, string>;
  /** search_slots: still-needed refinements */
  missingSlots?: SearchMissingSlot[];
  /** listing_slots: sell-domain missing fields */
  missingListingSlots?: string[];
  /** @deprecated prefer originatingIntent */
  intent?: string;
  /** @deprecated prefer pendingTool */
  tool?: string;
  /** search_slots: item to search for (also in knownEntities.item) */
  item?: string;
};

export type ClarificationLifecycleEvent =
  | "opened"
  | "resolved"
  | "cancelled"
  | "task_switch"
  | "discarded_entities"
  | "canonical_query";

export type TaskScopeSession = {
  task: AwhinaActiveTask;
  /** Pending product when we asked a shopping clarification */
  pendingItem?: string;
  /** Last compare candidates (titles only — never invent details) */
  compareCandidates?: string[];
  /** Ambiguous turn awaiting "it's a service" / "I'm selling it" style answer */
  pendingClarification?: PendingClarification;
  /** Locked listing identity key — only USER correction unlocks */
  entityLockKey?: string;
  entityLocked?: boolean;
  updatedAt: number;
};

/** Client-echoed durable context (Maps are cache only). */
export type ClientTaskScopeContext = {
  task?: AwhinaActiveTask;
  pendingItem?: string;
  compareCandidates?: string[];
  pendingClarification?: PendingClarification;
  entityLockKey?: string;
  entityLocked?: boolean;
  updatedAt?: number;
};

const TTL_MS = 30 * 60 * 1000;
const MAX = 500;
const sessions = new Map<string, TaskScopeSession>();

/** Sell/create tools blocked while SEARCH is sticky. */
export const SEARCH_BLOCKED_TOOLS = new Set([
  "updateListingDraft",
  "createListing",
  "editListing",
]);

function prune(): void {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now - v.updatedAt > TTL_MS) sessions.delete(k);
  }
  if (sessions.size > MAX) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (let i = 0; i < oldest.length - MAX; i++) {
      sessions.delete(oldest[i][0]);
    }
  }
}

export function taskScopeKey(opts: {
  conversationId?: string;
  uid?: string | null;
  pathname?: string;
  anonSessionId?: string;
}): string {
  if (opts.conversationId) return `task:c:${opts.conversationId}`;
  if (opts.uid) return `task:u:${opts.uid}`;
  if (opts.anonSessionId) return `task:anon:${opts.anonSessionId}`;
  return `task:anon:${opts.pathname || "/"}`;
}

export function getTaskScope(key: string): TaskScopeSession | null {
  prune();
  const s = sessions.get(key);
  if (!s) return null;
  if (Date.now() - s.updatedAt > TTL_MS) {
    sessions.delete(key);
    return null;
  }
  return s;
}

/** Hydrate Map from client-sent context when process memory is cold. */
export function hydrateTaskScope(
  key: string,
  client?: ClientTaskScopeContext | null
): TaskScopeSession | null {
  if (!client?.task) return getTaskScope(key);
  const existing = getTaskScope(key);
  if (existing && existing.updatedAt >= (client.updatedAt || 0)) return existing;
  const next: TaskScopeSession = {
    task: client.task,
    pendingItem: client.pendingItem,
    compareCandidates: client.compareCandidates,
    pendingClarification: client.pendingClarification,
    entityLockKey: client.entityLockKey,
    entityLocked: client.entityLocked,
    updatedAt: client.updatedAt || Date.now(),
  };
  sessions.set(key, next);
  return next;
}

export function setActiveTask(
  key: string,
  task: AwhinaActiveTask,
  extras?: Partial<
    Pick<
      TaskScopeSession,
      | "pendingItem"
      | "compareCandidates"
      | "pendingClarification"
      | "entityLockKey"
      | "entityLocked"
    >
  >
): TaskScopeSession {
  prune();
  const prior = sessions.get(key);
  const next: TaskScopeSession = {
    task,
    pendingItem: extras?.pendingItem ?? (task === "shopping" ? prior?.pendingItem : undefined),
    compareCandidates:
      extras?.compareCandidates ?? (task === "shopping" ? prior?.compareCandidates : undefined),
    pendingClarification:
      extras && "pendingClarification" in extras
        ? extras.pendingClarification
        : prior?.pendingClarification,
    entityLockKey:
      extras && "entityLockKey" in extras ? extras.entityLockKey : prior?.entityLockKey,
    entityLocked:
      extras && "entityLocked" in extras ? extras.entityLocked : prior?.entityLocked,
    updatedAt: Date.now(),
  };
  if (task !== "shopping") {
    next.pendingItem = extras?.pendingItem;
    next.compareCandidates = extras?.compareCandidates;
  }
  // Explicit clear of pending when undefined passed for shopping after answer
  if (task === "shopping" && extras && "pendingItem" in extras && extras.pendingItem === undefined) {
    next.pendingItem = undefined;
  }
  if (extras && "pendingClarification" in extras && extras.pendingClarification === undefined) {
    next.pendingClarification = undefined;
  }
  // Task switch away from selling clears entity lock + listing slots
  if (prior && prior.task === "selling" && task !== "selling") {
    next.entityLockKey = undefined;
    next.entityLocked = false;
    if (isClarificationOpen(prior.pendingClarification) && prior.pendingClarification?.kind === "listing_slots") {
      next.pendingClarification = undefined;
    }
  }
  sessions.set(key, next);
  return next;
}

export function clearTaskScope(key: string): void {
  sessions.delete(key);
}

/** True only while clarification is open (missing status → open for back-compat). */
export function isClarificationOpen(
  pending?: PendingClarification | null
): pending is PendingClarification {
  if (!pending) return false;
  const status = pending.status || "open";
  return status === "open";
}

export function newClarificationSessionId(): string {
  return `clr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Open a shopping search-slot clarification (structured — no transcript concat). */
export function buildOpenSearchSlotClarification(opts: {
  priorMessage: string;
  item: string;
  missingSlots: SearchMissingSlot[];
  originatingTask?: AwhinaActiveTask;
  /** Clarification copy flavour — stored for type-aware follow-ups */
  searchType?: string;
}): PendingClarification {
  const now = Date.now();
  const knownEntities: Record<string, string> = { item: opts.item };
  if (opts.searchType) knownEntities.searchType = opts.searchType;
  return {
    kind: "search_slots",
    status: "open",
    priorMessage: opts.priorMessage.slice(0, 160),
    askedAt: now,
    createdAt: now,
    sessionId: newClarificationSessionId(),
    originatingTask: opts.originatingTask || "shopping",
    originatingIntent: "marketplace_search",
    pendingTool: "searchListings",
    knownEntities,
    missingSlots: opts.missingSlots,
    intent: "marketplace_search",
    tool: "searchListings",
    item: opts.item,
  };
}

/** Open a sell listing-slot clarification (price/year/storage/etc.). */
export function buildOpenListingSlotClarification(opts: {
  priorMessage: string;
  missingSlots: string[];
  activeSlot: string;
  item?: string;
  domain?: string;
  originatingTask?: AwhinaActiveTask;
}): PendingClarification {
  const now = Date.now();
  const knownEntities: Record<string, string> = {
    activeSlot: opts.activeSlot,
  };
  if (opts.item) knownEntities.item = opts.item;
  if (opts.domain) knownEntities.domain = opts.domain;
  return {
    kind: "listing_slots",
    status: "open",
    priorMessage: opts.priorMessage.slice(0, 160),
    askedAt: now,
    createdAt: now,
    sessionId: newClarificationSessionId(),
    originatingTask: opts.originatingTask || "selling",
    originatingIntent: "listing_update",
    pendingTool: "updateListingDraft",
    knownEntities,
    missingListingSlots: opts.missingSlots,
    intent: "listing_update",
    tool: "updateListingDraft",
    item: opts.item,
  };
}

/**
 * Structured clarification lifecycle log — no raw user transcripts / PII.
 */
export function logClarificationLifecycle(
  event: ClarificationLifecycleEvent,
  meta: {
    kind?: string;
    status?: ClarificationStatus;
    sessionId?: string;
    originatingTask?: string;
    originatingIntent?: string;
    pendingTool?: string;
    missingSlots?: string[];
    knownEntityKeys?: string[];
    discardedEntityKeys?: string[];
    canonicalQuery?: string;
    reason?: string;
    toTask?: string;
  }
): void {
  try {
    console.info(
      "[awhina:clarification]",
      JSON.stringify({
        event,
        kind: meta.kind,
        status: meta.status,
        sessionId: meta.sessionId,
        originatingTask: meta.originatingTask,
        originatingIntent: meta.originatingIntent,
        pendingTool: meta.pendingTool,
        missingSlots: meta.missingSlots,
        knownEntityKeys: meta.knownEntityKeys,
        discardedEntityKeys: meta.discardedEntityKeys,
        canonicalQuery: meta.canonicalQuery
          ? meta.canonicalQuery.slice(0, 80)
          : undefined,
        reason: meta.reason,
        toTask: meta.toTask,
        ts: Date.now(),
      })
    );
  } catch {
    // never throw from observability
  }
}

/** Cancel open clarification and log discarded entities. */
export function cancelOpenClarification(
  key: string,
  opts?: {
    reason?: string;
    toTask?: AwhinaActiveTask;
    clearPendingItem?: boolean;
  }
): TaskScopeSession | null {
  const prior = getTaskScope(key);
  if (!prior) return null;
  const pending = prior.pendingClarification;
  if (isClarificationOpen(pending)) {
    const discarded = Object.keys(pending.knownEntities || {}).concat(
      pending.item ? ["item"] : []
    );
    logClarificationLifecycle(opts?.toTask ? "task_switch" : "cancelled", {
      kind: pending.kind,
      status: "cancelled",
      sessionId: pending.sessionId,
      originatingTask: pending.originatingTask,
      originatingIntent: pending.originatingIntent || pending.intent,
      pendingTool: pending.pendingTool || pending.tool,
      missingSlots: pending.missingSlots,
      knownEntityKeys: discarded,
      discardedEntityKeys: [...new Set(discarded)],
      reason: opts?.reason || "explicit_intent",
      toTask: opts?.toTask,
    });
    logClarificationLifecycle("discarded_entities", {
      kind: pending.kind,
      status: "cancelled",
      sessionId: pending.sessionId,
      discardedEntityKeys: [...new Set(discarded)],
      reason: opts?.reason || "explicit_intent",
    });
  }
  return setActiveTask(key, opts?.toTask || prior.task, {
    pendingClarification: undefined,
    pendingItem: opts?.clearPendingItem ? undefined : prior.pendingItem,
    compareCandidates: prior.compareCandidates,
  });
}

/** Mark clarification resolved and clear from session. */
export function resolveOpenClarification(
  key: string,
  opts?: { canonicalQuery?: string; toTask?: AwhinaActiveTask }
): TaskScopeSession | null {
  const prior = getTaskScope(key);
  if (!prior) return null;
  const pending = prior.pendingClarification;
  if (isClarificationOpen(pending)) {
    logClarificationLifecycle("resolved", {
      kind: pending.kind,
      status: "resolved",
      sessionId: pending.sessionId,
      originatingTask: pending.originatingTask,
      originatingIntent: pending.originatingIntent || pending.intent,
      pendingTool: pending.pendingTool || pending.tool,
      missingSlots: pending.missingSlots,
      knownEntityKeys: Object.keys(pending.knownEntities || {}),
      canonicalQuery: opts?.canonicalQuery,
    });
    if (opts?.canonicalQuery) {
      logClarificationLifecycle("canonical_query", {
        kind: pending.kind,
        sessionId: pending.sessionId,
        canonicalQuery: opts.canonicalQuery,
      });
    }
  }
  return setActiveTask(key, opts?.toTask || prior.task, {
    pendingClarification: undefined,
    pendingItem: undefined,
    compareCandidates: prior.compareCandidates,
  });
}

/** Relative price phrases that mean different things by task. */
export function isRelativePricePhrase(message: string): boolean {
  return /\b(make it cheaper|cheapest|cheaper|lower the price|reduce (the )?price|drop the price|a bit less|less expensive|lowest price)\b/i.test(
    message.trim()
  );
}

/**
 * Resolve whether a follow-up should apply to selling draft vs shopping search.
 * Sell page always wins for selling. Explicit sell intent wins over sticky SEARCH.
 * Sticky SEARCH stays shopping unless explicit sell/list language.
 */
export function resolveTaskForMessage(
  message: string,
  opts: {
    pathname?: string;
    hasListingDraft?: boolean;
    session: TaskScopeSession | null;
    hasSellIntent?: boolean;
    hasSearchIntent?: boolean;
  }
): AwhinaActiveTask {
  const pathname = opts.pathname || "/";
  if (pathname.startsWith("/post/ai")) return "selling";

  const searchLang =
    opts.hasSearchIntent === true || hasSearchIntentLanguage(message);
  const explicitSell = hasExplicitSellSwitch(message);
  const sellIntent = opts.hasSellIntent === true || explicitSell;

  if (searchLang && !explicitSell) return "shopping";
  if (explicitSell || (sellIntent && !searchLang)) return "selling";

  const active = opts.session?.task || "none";

  // Sticky SEARCH: stay shopping until explicit sell switch
  if (active === "shopping" && !explicitSell) return "shopping";

  if (isRelativePricePhrase(message)) {
    if (active === "selling" && opts.hasListingDraft) return "selling";
    if (active === "shopping") return "shopping";
    if (opts.hasListingDraft) return "selling";
  }

  return active;
}

/** Hard tool gating by active task. */
export function isToolAllowedForTask(
  tool: string | undefined,
  task: AwhinaActiveTask
): boolean {
  if (!tool) return true;
  if (task === "shopping" && SEARCH_BLOCKED_TOOLS.has(tool)) return false;
  return true;
}

export function toClientTaskScope(session: TaskScopeSession | null): ClientTaskScopeContext | undefined {
  if (!session || session.task === "none") return undefined;
  return {
    task: session.task,
    pendingItem: session.pendingItem,
    compareCandidates: session.compareCandidates,
    pendingClarification: session.pendingClarification,
    entityLockKey: session.entityLockKey,
    entityLocked: session.entityLocked,
    updatedAt: session.updatedAt,
  };
}
