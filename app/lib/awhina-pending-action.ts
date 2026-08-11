/**
 * Structured pending confirmation actions for Āwhina.
 *
 * When the assistant asks a confirmation question, it MUST set a machine-readable
 * pendingAction (e.g. CONFIRM_IDENTITY / START_SELLING / SEARCH). Displayed prose
 * is presentation only — never the sole representation of what "Yes" means.
 *
 * Turn order (shared mobile + desktop):
 * 1. UI event
 * 2. resolvable pendingAction
 * 3. active listing field / pending slot
 * 4. local commands
 * 5. intent router
 * 6. general AI
 * 7. ambiguity fallback
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";

export type PendingActionType =
  | "START_SELLING"
  | "SEARCH"
  | "CONFIRM_LOCATION"
  | "PUBLISH"
  | "CONFIRM_IDENTITY"
  | "GENERIC_CONFIRM";

export type PendingActionStatus = "active" | "confirmed" | "rejected" | "superseded" | "expired";

/** Machine-readable proposed facts for vision / identity confirmation. */
export type PendingProposedFacts = {
  brand?: string;
  productType?: string;
  title?: string;
  category?: string;
  listingType?: string;
};

export type AwhinaPendingAction = {
  id: string;
  type: PendingActionType;
  status: PendingActionStatus;
  /** What the user is confirming (query, location, identity label, etc.) */
  objectId?: string;
  /** Human label for debugging / clarification */
  label?: string;
  /** SEARCH: the query that would run if confirmed */
  searchQuery?: string;
  /** START_SELLING / CONFIRM_IDENTITY: identity label */
  identity?: string;
  /** START_SELLING / CONFIRM_IDENTITY: listing facts preserved across confirm */
  listingFill?: SkyAiListingFill;
  /** CONFIRM_IDENTITY: structured proposed perception (not prose) */
  proposedFacts?: PendingProposedFacts;
  needsIdentityConfirm?: boolean;
  /** Prior assistant question that established this action */
  prompt?: string;
  createdAt: number;
  /** Supersedes older actions with this id chain */
  supersedesId?: string;
};

export type ConfirmationClass =
  | "AFFIRM"
  | "REJECT"
  | "UNCLEAR"
  | "NOT_CONFIRMATION";

const AFFIRM_RE =
  /^(yes|yeah|yep|yup|ya|sure|ok|okay|alright|all\s*right|do\s+it|go\s+ahead|sounds\s+good|please|cool|keen|sweet|correct|right|that'?s\s+right|thats\s+right|that\s+is\s+right|y|k)([.!?,]*)?(\s+please)?$/i;

const REJECT_RE =
  /^(no|nah|nope|don't|dont|cancel|stop|never\s*mind|no\s+thanks|not\s+now|wrong|not\s+right|nope\s+wrong)([.!?,]*)?$/i;

const TTL_MS = 30 * 60 * 1000;
const MAX = 400;
const store = new Map<string, AwhinaPendingAction>();

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.createdAt > TTL_MS || v.status !== "active") {
      if (now - v.createdAt > TTL_MS) store.delete(k);
    }
  }
  if (store.size > MAX) {
    const oldest = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < oldest.length - MAX; i++) store.delete(oldest[i][0]);
  }
}

export function pendingActionKey(opts: {
  conversationId?: string;
  uid?: string | null;
  anonSessionId?: string;
  pathname?: string;
}): string {
  if (opts.conversationId) return `pa:c:${opts.conversationId}`;
  if (opts.uid) return `pa:u:${opts.uid}`;
  if (opts.anonSessionId) return `pa:anon:${opts.anonSessionId}`;
  return `pa:anon:${opts.pathname || "/"}`;
}

export function classifyConfirmationReply(message: string): ConfirmationClass {
  const m = (message || "").trim();
  if (!m || m.length > 64) return "NOT_CONFIRMATION";
  if (AFFIRM_RE.test(m)) return "AFFIRM";
  if (REJECT_RE.test(m)) return "REJECT";
  // Short vague acknowledgements without clear polarity
  if (/^(maybe|idk|not\s+sure|dunno)\b/i.test(m)) return "UNCLEAR";
  return "NOT_CONFIRMATION";
}

export function isActivePendingAction(
  action: AwhinaPendingAction | null | undefined
): boolean {
  if (!action || action.status !== "active") return false;
  if (Date.now() - action.createdAt > TTL_MS) return false;
  return true;
}

export function getPendingAction(key: string): AwhinaPendingAction | null {
  prune();
  const a = store.get(key) || null;
  if (!a) return null;
  if (a.status === "active" && Date.now() - a.createdAt > TTL_MS) {
    store.set(key, { ...a, status: "expired" });
    return null;
  }
  if (a.status !== "active") return null;
  return a;
}

export function hydratePendingAction(
  key: string,
  client?: AwhinaPendingAction | null
): AwhinaPendingAction | null {
  if (!client) return getPendingAction(key);
  const existing = getPendingAction(key);
  if (existing && existing.createdAt >= (client.createdAt || 0)) return existing;
  if (!isActivePendingAction(client)) return existing;
  store.set(key, { ...client, status: "active" });
  return client;
}

/** Set a new active pending action — supersedes any prior active action. */
export function setPendingAction(
  key: string,
  action: Omit<AwhinaPendingAction, "id" | "status" | "createdAt"> & {
    id?: string;
    createdAt?: number;
  }
): AwhinaPendingAction {
  prune();
  const prior = store.get(key);
  if (prior && prior.status === "active") {
    store.set(key, { ...prior, status: "superseded" });
  }
  const next: AwhinaPendingAction = {
    ...action,
    id: action.id || `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    status: "active",
    createdAt: action.createdAt || Date.now(),
    supersedesId: prior?.id,
  };
  store.set(key, next);
  return next;
}

export function clearPendingAction(key: string, status: PendingActionStatus = "superseded"): void {
  const prior = store.get(key);
  if (prior && prior.status === "active") {
    store.set(key, { ...prior, status });
  } else {
    store.delete(key);
  }
}

export function confirmPendingAction(key: string): AwhinaPendingAction | null {
  const a = getPendingAction(key);
  if (!a) return null;
  const done = { ...a, status: "confirmed" as const };
  store.set(key, done);
  return done;
}

export function rejectPendingAction(key: string): AwhinaPendingAction | null {
  const a = getPendingAction(key);
  if (!a) return null;
  const done = { ...a, status: "rejected" as const };
  store.set(key, done);
  return done;
}

export type PendingActionResolution =
  | {
      kind: "CONFIRM";
      action: AwhinaPendingAction;
      confirmation: "AFFIRM";
    }
  | {
      kind: "REJECT";
      action: AwhinaPendingAction;
      confirmation: "REJECT";
    }
  | {
      kind: "CLARIFY";
      action: AwhinaPendingAction | null;
      confirmation: "UNCLEAR";
      reply: string;
    }
  | { kind: "NONE" };

/**
 * Resolve short contextual replies against the ACTIVE pending action only.
 * Never invent an action from historical search queries or assistant prose.
 *
 * objectId scoping: if currentObjectId is provided and does not match the
 * pending action's objectId, the pending is treated as stale (unavailable).
 */
export function resolvePendingActionTurn(opts: {
  message: string;
  pendingAction?: AwhinaPendingAction | null;
  /** Active listing / vision object — pending only mutates this object */
  currentObjectId?: string | null;
}): PendingActionResolution {
  let action =
    opts.pendingAction && isActivePendingAction(opts.pendingAction)
      ? opts.pendingAction
      : null;

  if (action && !pendingActionMatchesObject(action, opts.currentObjectId)) {
    action = null;
  }

  const conf = classifyConfirmationReply(opts.message);

  if (!action) {
    if (conf === "AFFIRM" || conf === "REJECT" || conf === "UNCLEAR") {
      return {
        kind: "CLARIFY",
        action: null,
        confirmation: "UNCLEAR",
        reply:
          "What are you confirming? Tell me what you want to sell, find, or change.",
      };
    }
    return { kind: "NONE" };
  }

  if (conf === "AFFIRM") {
    return { kind: "CONFIRM", action, confirmation: "AFFIRM" };
  }
  if (conf === "REJECT") {
    return { kind: "REJECT", action, confirmation: "REJECT" };
  }
  if (conf === "UNCLEAR") {
    return {
      kind: "CLARIFY",
      action,
      confirmation: "UNCLEAR",
      reply: action.prompt
        ? `Just to confirm — ${action.prompt.replace(/\?$/, "")}?`
        : "Just to confirm — should I go ahead?",
    };
  }
  return { kind: "NONE" };
}

/** Stable object id from identity label (scoped pending confirmations). */
export function visionObjectIdFromIdentity(identity: string): string {
  const norm = String(identity || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
  return `obj_${norm || "item"}`;
}

/** Pending confirmation only mutates its objectId; mismatch ⇒ stale. */
export function pendingActionMatchesObject(
  action: AwhinaPendingAction | null | undefined,
  currentObjectId?: string | null
): boolean {
  if (!action || !isActivePendingAction(action)) return false;
  if (!action.objectId || !currentObjectId) return true;
  return action.objectId === currentObjectId;
}

/**
 * New explicit intent / interruption while a pending confirm is open —
 * supersede so Yes later cannot resolve the stale confirm.
 */
export function shouldSupersedePendingAction(opts: {
  message: string;
  pending: AwhinaPendingAction;
}): boolean {
  const conf = classifyConfirmationReply(opts.message);
  if (conf !== "NOT_CONFIRMATION") return false;
  const m = (opts.message || "").trim();
  if (m.length < 2) return false;
  if (/\b(actually|instead|wait)\b/i.test(m)) return true;
  if (
    /\b(find|search\s+for|looking\s+for|show\s+me|buy\s+me|i\s+want\s+to\s+(find|buy|get))\b/i.test(
      m
    )
  ) {
    return true;
  }
  // Identity correction / replacement while confirming vision identity
  if (
    opts.pending.type === "CONFIRM_IDENTITY" &&
    m.length >= 5 &&
    !/^(hmm+|uh+|um+|huh|idk|maybe)\.?$/i.test(m)
  ) {
    return true;
  }
  return false;
}

/**
 * Safety gate: may this tool/navigation/search execute for the current turn?
 */
export function mayExecuteAction(opts: {
  tool: string;
  /** Requested by CURRENT turn explicit intent */
  requestedByCurrentTurn: boolean;
  /** Resolving an ACTIVE pending action of matching type */
  resolvingPendingAction?: AwhinaPendingAction | null;
  /** Newer intent superseded the pending/stale action */
  supersededByNewerIntent?: boolean;
  /** Object/query still current (matches pending or current turn) */
  objectStillCurrent?: boolean;
}): { ok: boolean; reason: string } {
  if (opts.supersededByNewerIntent) {
    return { ok: false, reason: "superseded_by_newer_intent" };
  }
  if (opts.requestedByCurrentTurn) {
    return { ok: true, reason: "current_turn_request" };
  }
  const pending = opts.resolvingPendingAction;
  if (pending && (isActivePendingAction(pending) || pending.status === "confirmed")) {
    if (opts.objectStillCurrent === false) {
      return { ok: false, reason: "object_stale" };
    }
    // SEARCH tool only if pending is SEARCH
    if (opts.tool === "searchListings" && pending.type !== "SEARCH") {
      return { ok: false, reason: "pending_not_search" };
    }
    return { ok: true, reason: "active_pending_action" };
  }
  // No current-turn request and no matching pending → block state-changing search/nav
  if (opts.tool === "searchListings" || opts.tool === "navigate") {
    return { ok: false, reason: "no_current_or_pending_authority" };
  }
  return { ok: true, reason: "non_gated_tool" };
}

/** Build START_SELLING pending action from vision sell offer. */
export function buildStartSellingPendingAction(opts: {
  identity: string;
  listingFill: SkyAiListingFill;
  needsIdentityConfirm?: boolean;
  prompt?: string;
  objectId?: string;
}): Omit<AwhinaPendingAction, "id" | "status" | "createdAt"> {
  return {
    type: "START_SELLING",
    objectId: opts.objectId || visionObjectIdFromIdentity(opts.identity),
    label: opts.identity,
    identity: opts.identity,
    listingFill: opts.listingFill,
    needsIdentityConfirm: opts.needsIdentityConfirm,
    prompt: opts.prompt || "Want to sell it?",
  };
}

/**
 * Vision identity confirmation — "Looks like X. Is that right?"
 * MUST be written whenever that question is emitted. Yes/No resolve this
 * structured action; never infer from assistant prose alone.
 */
export function buildConfirmIdentityPendingAction(opts: {
  identity: string;
  listingFill: SkyAiListingFill;
  proposedFacts?: PendingProposedFacts;
  prompt?: string;
  objectId?: string;
}): Omit<AwhinaPendingAction, "id" | "status" | "createdAt"> {
  const identity = (opts.identity || opts.listingFill.title || "your item").trim();
  const fill = opts.listingFill || {};
  const proposedFacts: PendingProposedFacts = {
    title: fill.title || identity,
    brand: opts.proposedFacts?.brand,
    productType: opts.proposedFacts?.productType || fill.category,
    category: fill.category,
    listingType: fill.listingType,
    ...opts.proposedFacts,
  };
  // Derive brand from title when not provided (e.g. "Razer Gaming Mouse")
  if (!proposedFacts.brand && identity) {
    const first = identity.split(/\s+/)[0];
    if (first && first.length >= 2) proposedFacts.brand = first;
  }
  return {
    type: "CONFIRM_IDENTITY",
    objectId: opts.objectId || visionObjectIdFromIdentity(identity),
    label: identity,
    identity,
    listingFill: fill,
    proposedFacts,
    needsIdentityConfirm: true,
    prompt: opts.prompt || `Looks like a ${identity}. Is that right?`,
  };
}

/** Build SEARCH pending action when assistant asks "Want me to search for X?" */
export function buildSearchPendingAction(opts: {
  searchQuery: string;
  prompt?: string;
}): Omit<AwhinaPendingAction, "id" | "status" | "createdAt"> {
  return {
    type: "SEARCH",
    objectId: opts.searchQuery,
    label: opts.searchQuery,
    searchQuery: opts.searchQuery,
    prompt: opts.prompt || `Want me to search for ${opts.searchQuery}?`,
  };
}

/**
 * Detect when assistant prose asked a sell confirmation — contract for response→state.
 */
export function assistantAskedSellConfirmation(reply: string): boolean {
  return /want to sell (it|this)\?/i.test(reply) || /reply\s+\*?\*?sell this\*?\*?/i.test(reply);
}

/** Safety-net detector — primary write path is buildConfirmIdentityPendingAction. */
export function assistantAskedIdentityConfirmation(reply: string): boolean {
  return /\bis that right\?/i.test(reply || "");
}

export function assistantAskedSearchConfirmation(reply: string): string | null {
  const m = reply.match(/want me to search for\s+\*?\*?(.+?)\*?\*?\?/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\*+/g, "").trim();
}

/** New image + item facts supersede old search context. */
export function shouldInvalidateSearchOnEvidence(opts: {
  hasImages?: boolean;
  hasSellFacts?: boolean;
  hasExplicitSell?: boolean;
  message?: string;
}): boolean {
  if (opts.hasExplicitSell) return true;
  if (opts.hasSellFacts) return true;
  // Photo alone or photo+marketplace shorthand always supersedes prior SEARCH
  if (opts.hasImages) return true;
  const m = opts.message || "";
  // Text-only sell cues — require explicit sell language (not mere PSA/price in a find)
  if (
    /\b(sell|selling|for\s+sale|list\s+this|i'?m\s+selling|want\s+to\s+sell)\b/i.test(m)
  ) {
    return true;
  }
  return false;
}

export function clearPendingActionStoreForTests(): void {
  store.clear();
}
