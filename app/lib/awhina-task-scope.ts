/**
 * Task-scoped follow-up memory — selling vs shopping.
 * Prevents cross-contamination ("make it cheaper" → draft when selling, search when shopping).
 */

export type AwhinaActiveTask = "selling" | "shopping" | "help" | "none";

export type TaskScopeSession = {
  task: AwhinaActiveTask;
  /** Pending product when we asked a shopping clarification */
  pendingItem?: string;
  /** Last compare candidates (titles only — never invent details) */
  compareCandidates?: string[];
  updatedAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const MAX = 500;
const sessions = new Map<string, TaskScopeSession>();

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
}): string {
  if (opts.conversationId) return `task:c:${opts.conversationId}`;
  if (opts.uid) return `task:u:${opts.uid}`;
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
 * Sell page always wins for selling. Explicit sell intent wins.
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
  if (opts.hasSellIntent) return "selling";
  if (opts.hasSearchIntent) return "shopping";

  const active = opts.session?.task || "none";
  if (isRelativePricePhrase(message)) {
    if (active === "selling" && opts.hasListingDraft) return "selling";
    if (active === "shopping") return "shopping";
    // Ambiguous: prefer draft if present
    if (opts.hasListingDraft) return "selling";
  }

  return active;
}
