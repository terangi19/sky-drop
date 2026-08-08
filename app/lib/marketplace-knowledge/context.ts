/**
 * Conversational domain context across turns
 * (e.g. Topps Chrome → Messi → PSA 10).
 */

import type { DomainConversationContext, MarketplaceDomainId } from "./types";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 200;

const contexts = new Map<string, DomainConversationContext>();

function prune(): void {
  const now = Date.now();
  for (const [k, v] of contexts) {
    if (now - v.updatedAt > SESSION_TTL_MS) contexts.delete(k);
  }
  if (contexts.size <= MAX_SESSIONS) return;
  const sorted = [...contexts.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  for (let i = 0; i < sorted.length - MAX_SESSIONS; i++) {
    contexts.delete(sorted[i][0]);
  }
}

export function domainContextKey(opts: {
  conversationId?: string | null;
  uid?: string | null;
  anonSessionId?: string | null;
}): string {
  return (
    opts.conversationId ||
    opts.uid ||
    opts.anonSessionId ||
    "anon"
  ).slice(0, 120);
}

export function getDomainContext(key: string): DomainConversationContext | null {
  prune();
  const ctx = contexts.get(key);
  if (!ctx) return null;
  if (Date.now() - ctx.updatedAt > SESSION_TTL_MS) {
    contexts.delete(key);
    return null;
  }
  return ctx;
}

export function setDomainContext(
  key: string,
  patch: {
    domain: MarketplaceDomainId;
    sticky?: Record<string, string>;
    displayName?: string;
  }
): DomainConversationContext {
  prune();
  const prev = contexts.get(key);
  const next: DomainConversationContext = {
    domain: patch.domain,
    sticky: { ...(prev?.domain === patch.domain ? prev.sticky : {}), ...(patch.sticky || {}) },
    displayName: patch.displayName || prev?.displayName,
    updatedAt: Date.now(),
  };
  contexts.set(key, next);
  return next;
}

export function clearDomainContext(key: string): void {
  contexts.delete(key);
}

/** Test helper */
export function clearAllDomainContextsForTests(): void {
  contexts.clear();
}

/** Merge sticky labels into a follow-up message for resolution. */
export function expandWithDomainContext(
  text: string,
  ctx: DomainConversationContext | null | undefined
): string {
  if (!ctx || !ctx.sticky || Object.keys(ctx.sticky).length === 0) return text;
  const t = text.trim();
  // Short follow-ups: "PSA 10", "Messi", "128gb"
  if (t.split(/\s+/).length > 8 && t.length > 40) return text;
  const bits = Object.values(ctx.sticky).filter(Boolean);
  if (!bits.length) return text;
  const missing = bits.filter((b) => !new RegExp(escapeRe(b), "i").test(t));
  if (!missing.length) return text;
  return `${missing.join(" ")} ${t}`.trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
