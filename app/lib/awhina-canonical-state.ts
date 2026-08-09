/**
 * Structured conversational task state — not only chat transcript prose.
 * ONE authoritative understanding of the current sell/search task.
 */

import type { FieldAuthority } from "./awhina-authority";
import { isLockedUserAuthority, mayOverwriteAuthority } from "./awhina-authority";
import type { ListingMissingSlot } from "./awhina-pending-slots";

export type FactLifecycle =
  | "said"
  | "inferred"
  | "corrected"
  | "locked"
  | "unknown"
  | "asked"
  | "skipped";

export type CanonicalFact = {
  key: string;
  value: string;
  authority: FieldAuthority;
  lifecycle: FactLifecycle;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  updatedAt: number;
  /** Source turn index / label for debug (no image bytes). */
  sourceTurn?: string;
};

export type ConflictingEvidence = {
  key: string;
  canonicalValue: string;
  canonicalAuthority: FieldAuthority;
  conflictingValue: string;
  conflictingAuthority: FieldAuthority;
  kept: "canonical" | "incoming";
  at: number;
};

export type CanonicalTaskState = {
  facts: Record<string, CanonicalFact>;
  conflictingEvidence: ConflictingEvidence[];
  /** Slots asked recently — prevent endless repeats */
  recentlyAsked: Array<{ slot: string; askedAt: number; question?: string }>;
  skippedSlots: string[];
  pendingSlot: ListingMissingSlot | null;
  entityLocked: boolean;
  entityLockKey?: string;
  domain?: string;
  /** User-owned description — never overwrite */
  userDescriptionLocked: boolean;
  updatedAt: number;
};

export function emptyCanonicalTaskState(): CanonicalTaskState {
  return {
    facts: {},
    conflictingEvidence: [],
    recentlyAsked: [],
    skippedSlots: [],
    pendingSlot: null,
    entityLocked: false,
    userDescriptionLocked: false,
    updatedAt: Date.now(),
  };
}

export function getCanonicalValue(
  state: CanonicalTaskState,
  key: string
): string | undefined {
  const v = state.facts[key]?.value?.trim();
  return v || undefined;
}

export function isFactSatisfied(
  state: CanonicalTaskState,
  key: string
): boolean {
  return Boolean(getCanonicalValue(state, key));
}

export function isUserLockedFact(
  state: CanonicalTaskState,
  key: string
): boolean {
  return isLockedUserAuthority(state.facts[key]?.authority);
}

/**
 * Merge one fact with authority hierarchy.
 * USER* never silently overwritten by AI/vision.
 */
export function mergeCanonicalFact(
  state: CanonicalTaskState,
  incoming: Omit<CanonicalFact, "updatedAt"> & { updatedAt?: number }
): CanonicalTaskState {
  const now = incoming.updatedAt ?? Date.now();
  const key = incoming.key;
  const prev = state.facts[key];
  const nextFacts = { ...state.facts };
  const conflicts = [...state.conflictingEvidence];

  if (
    prev &&
    prev.value.trim().toLowerCase() !== incoming.value.trim().toLowerCase()
  ) {
    const may = mayOverwriteAuthority(prev.authority, incoming.authority);
    if (!may) {
      conflicts.push({
        key,
        canonicalValue: prev.value,
        canonicalAuthority: prev.authority,
        conflictingValue: incoming.value,
        conflictingAuthority: incoming.authority,
        kept: "canonical",
        at: now,
      });
      return {
        ...state,
        conflictingEvidence: conflicts.slice(-40),
        updatedAt: now,
      };
    }
    conflicts.push({
      key,
      canonicalValue: prev.value,
      canonicalAuthority: prev.authority,
      conflictingValue: incoming.value,
      conflictingAuthority: incoming.authority,
      kept: "incoming",
      at: now,
    });
  } else if (prev && !mayOverwriteAuthority(prev.authority, incoming.authority)) {
    // Same value or weaker authority — keep stronger lifecycle/authority
    return state;
  }

  const lifecycle: FactLifecycle =
    incoming.lifecycle === "corrected" ||
    incoming.authority === "USER_CORRECTED"
      ? "corrected"
      : isLockedUserAuthority(incoming.authority)
        ? "locked"
        : incoming.lifecycle;

  nextFacts[key] = {
    ...incoming,
    lifecycle,
    updatedAt: now,
  };

  let entityLocked = state.entityLocked;
  let entityLockKey = state.entityLockKey;
  if (
    (key === "itemIdentity" ||
      key === "cardSubject" ||
      key === "title" ||
      key === "vehicleMake" ||
      key === "vehicleModel") &&
    isLockedUserAuthority(incoming.authority)
  ) {
    entityLocked = true;
    entityLockKey = incoming.value.trim().toLowerCase();
  }

  let userDescriptionLocked = state.userDescriptionLocked;
  if (key === "description" && isLockedUserAuthority(incoming.authority)) {
    userDescriptionLocked = true;
  }

  return {
    ...state,
    facts: nextFacts,
    conflictingEvidence: conflicts.slice(-40),
    entityLocked,
    entityLockKey,
    userDescriptionLocked,
    updatedAt: now,
  };
}

export function recordAskedSlot(
  state: CanonicalTaskState,
  slot: string,
  question?: string
): CanonicalTaskState {
  const askedAt = Date.now();
  const recentlyAsked = [
    ...state.recentlyAsked.filter((r) => r.slot !== slot),
    { slot, askedAt, question },
  ].slice(-12);
  return { ...state, recentlyAsked, updatedAt: askedAt };
}

export function markSlotSkipped(
  state: CanonicalTaskState,
  slot: string
): CanonicalTaskState {
  if (state.skippedSlots.includes(slot)) return state;
  return {
    ...state,
    skippedSlots: [...state.skippedSlots, slot].slice(-20),
    updatedAt: Date.now(),
  };
}

/** True when we asked this slot recently and it is still satisfied or user skipped. */
export function wasRecentlyAsked(
  state: CanonicalTaskState,
  slot: string,
  withinMs = 10 * 60 * 1000
): boolean {
  const hit = state.recentlyAsked.find((r) => r.slot === slot);
  if (!hit) return false;
  return Date.now() - hit.askedAt < withinMs;
}

/** Uncertainty / skip language — allow continue without endless repeat. */
export function isUncertaintyOrSkipMessage(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (!t) return false;
  return /^(not\s+sure|dunno|don'?t\s+know|idk|no\s+idea|skip|n\/a|na|unsure|whatever|any|doesn'?t\s+matter)\b/.test(
    t
  );
}
