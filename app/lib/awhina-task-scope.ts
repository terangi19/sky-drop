/**
 * Task-scoped follow-up memory — selling vs shopping.
 * Prevents cross-contamination ("make it cheaper" → draft when selling, search when shopping).
 * Sticky SEARCH after want/looking/need/find until explicit sell/list language.
 */

import { hasExplicitSellSwitch, hasSearchIntentLanguage } from "./sky-ai-intent";

export type AwhinaActiveTask = "selling" | "shopping" | "help" | "none";

export type TaskScopeSession = {
  task: AwhinaActiveTask;
  /** Pending product when we asked a shopping clarification */
  pendingItem?: string;
  /** Last compare candidates (titles only — never invent details) */
  compareCandidates?: string[];
  updatedAt: number;
};

/** Client-echoed durable context (Maps are cache only). */
export type ClientTaskScopeContext = {
  task?: AwhinaActiveTask;
  pendingItem?: string;
  compareCandidates?: string[];
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
    updatedAt: client.updatedAt || Date.now(),
  };
  sessions.set(key, next);
  return next;
}

export function setActiveTask(
  key: string,
  task: AwhinaActiveTask,
  extras?: Partial<Pick<TaskScopeSession, "pendingItem" | "compareCandidates">>
): TaskScopeSession {
  prune();
  const prior = sessions.get(key);
  const next: TaskScopeSession = {
    task,
    pendingItem: extras?.pendingItem ?? (task === "shopping" ? prior?.pendingItem : undefined),
    compareCandidates:
      extras?.compareCandidates ?? (task === "shopping" ? prior?.compareCandidates : undefined),
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
  sessions.set(key, next);
  return next;
}

export function clearTaskScope(key: string): void {
  sessions.delete(key);
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
    updatedAt: session.updatedAt,
  };
}
