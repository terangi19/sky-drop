/**
 * One-time scrub of email-derived names on public Firestore docs (Phase 1).
 *
 * DRY-RUN BY DEFAULT. Review the summary, then take a Firestore export
 * before writing (see DATABASE_BACKUP_STRATEGY.md). Pass --apply to write.
 *
 *   npx tsx scripts/scrub-email-derived-names.ts
 *   npx tsx scripts/scrub-email-derived-names.ts --limit 50 --collection tradeShouts
 *   npx tsx scripts/scrub-email-derived-names.ts --apply
 *
 * Admin init lives in scripts/lib/scrub-admin.ts (firebase-admin SDK only).
 * Do not import app/lib/firebase-admin.ts from this script: that module
 * imports `server-only`, which throws under plain `npx tsx`. The Next.js
 * server helper is unchanged and still rejects client imports.
 *
 * Dry-run unless --apply is present. Credentials come from the environment
 * only (FIREBASE_SERVICE_ACCOUNT or ADC). With neither set, the process
 * exits before any read or write and prints
 * "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT or ADC, then re-run."
 * Logs counts, document ids, and masked emails (j***@d***.com). Never logs
 * credentials or full email addresses.
 *
 * Names like "jsmith" cannot be detected without an email to compare. This
 * script has the address on the document or the matching profile, so it can.
 * It does NOT rewrite profiles.username, the usernames collection, or a stored
 * name that already equals that profile's own username. It does not change
 * tradeShouts.by or reply `by` (Firestore rules still key ownership on email).
 *
 * tradePosts.replies is rewritten inside a Firestore transaction (re-read,
 * transform, write) so a reply committed during --apply is not overwritten
 * by a stale copy of the array.
 */

import {
  SAFE_NAME_FALLBACK,
  isEmailDerivedName,
  resolvePublicAuthorName,
  resolvePublicProfileName,
} from "../app/lib/safe-display-name";

export const SCRUB_COLLECTIONS = [
  "tradeShouts",
  "tradePosts",
  "listingQuestions",
  "listings",
  "reviews",
] as const;

export type ScrubCollection = (typeof SCRUB_COLLECTIONS)[number];

export type ScrubProfile = {
  uid?: string;
  displayName?: unknown;
  username?: unknown;
  email?: string | null;
};

export type ScrubInput = {
  collection: string;
  data: Record<string, unknown>;
  profile?: ScrubProfile | null;
  /** Reply authors, keyed by the reply `by` email (any case). */
  profilesByEmail?: Record<string, ScrubProfile | null | undefined>;
};

export type ScrubPlan = {
  update: Record<string, unknown> | null;
  unresolved: boolean;
};

const VERIFIED_BUYER = "Verified Buyer";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function profileUsername(profile?: ScrubProfile | null): string {
  return asString(profile?.username).replace(/^@+/, "");
}

function equalsProfileUsername(name: unknown, profile?: ScrubProfile | null): boolean {
  const username = profileUsername(profile).toLowerCase();
  const candidate = asString(name).replace(/^@+/, "").toLowerCase();
  return !!username && !!candidate && username === candidate;
}

function lookupAuthor(
  email: string,
  profilesByEmail?: Record<string, ScrubProfile | null | undefined>
): ScrubProfile | null {
  if (!email || !profilesByEmail) return null;
  return profilesByEmail[email] ?? profilesByEmail[email.toLowerCase()] ?? null;
}

function authorLabel(profile: ScrubProfile | null | undefined, email: string): string {
  if (!profile) return SAFE_NAME_FALLBACK;
  return resolvePublicAuthorName({
    displayName: profile.displayName,
    username: profile.username,
    email: email || profile.email,
  });
}

function sellerLabel(profile: ScrubProfile | null | undefined, email: string): string {
  return resolvePublicProfileName(
    {
      displayName: profile?.displayName,
      username: profile?.username,
      email: email || profile?.email,
    },
    SAFE_NAME_FALLBACK
  );
}

/** Profile slug when it contains no "@", otherwise empty. */
function storedProfileHandle(profile?: ScrubProfile | null): string {
  const username = profileUsername(profile);
  if (!username || username.includes("@")) return "";
  return username;
}

function planGuardedReplacement(
  update: Record<string, unknown>,
  field: string,
  value: unknown,
  email: string,
  profile: ScrubProfile | null | undefined,
  next: string
) {
  if (typeof value !== "string" || !isEmailDerivedName(value, email)) return;
  if (equalsProfileUsername(value, profile)) return;
  if (next !== value) update[field] = next;
}

function planSellerFields(
  data: Record<string, unknown>,
  email: string,
  profile?: ScrubProfile | null
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const sellerUsername = data.sellerUsername;
  if (typeof sellerUsername === "string" && isEmailDerivedName(sellerUsername, email)) {
    if (!equalsProfileUsername(sellerUsername, profile)) {
      const next = storedProfileHandle(profile);
      if (next !== sellerUsername) update.sellerUsername = next;
    }
  }
  const sellerName = data.sellerName;
  if (typeof sellerName === "string" && sellerName.trim() && isEmailDerivedName(sellerName, email)) {
    if (!equalsProfileUsername(sellerName, profile)) {
      const next = sellerLabel(profile, email);
      if (next !== sellerName) update.sellerName = next;
    }
  }
  return update;
}

function planReplies(
  replies: unknown,
  profilesByEmail?: Record<string, ScrubProfile | null | undefined>
): unknown[] | undefined {
  if (!Array.isArray(replies)) return undefined;
  let changed = false;
  const next = replies.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const reply = entry as Record<string, unknown>;
    const by = asString(reply.by);
    const author = lookupAuthor(by, profilesByEmail);
    const email = by.includes("@") ? by : asString(author?.email);
    const byName = reply.byName;
    const missing = typeof byName !== "string" || !byName.trim();
    const derived = !missing && isEmailDerivedName(byName, email);
    const keep = !missing && equalsProfileUsername(byName, author);
    if ((!missing && !derived) || keep) return reply;
    const resolved = authorLabel(author, email);
    let rewritten = reply;
    if (reply.byName !== resolved) {
      rewritten = { ...rewritten, byName: resolved };
      changed = true;
    }
    if (author?.uid && rewritten.byId !== author.uid) {
      rewritten = { ...rewritten, byId: author.uid };
      changed = true;
    }
    return rewritten;
  });
  return changed ? next : undefined;
}

export function planScrub(input: ScrubInput): ScrubPlan {
  const data = input.data || {};
  const profile = input.profile ?? null;
  const update: Record<string, unknown> = {};
  let unresolved = false;

  if (input.collection === "tradeShouts") {
    const by = asString(data.by);
    const email = by.includes("@") ? by : asString(profile?.email);
    if (email && !profile) unresolved = true;
    const byName = data.byName;
    const missing = typeof byName !== "string" || !byName.trim();
    const derived = !missing && isEmailDerivedName(byName, email);
    const keep = !missing && equalsProfileUsername(byName, profile);
    if ((missing || derived) && !keep) {
      const resolved = authorLabel(profile, email);
      if (data.byName !== resolved) update.byName = resolved;
      if (profile?.uid && data.byId !== profile.uid) update.byId = profile.uid;
    }
  } else if (input.collection === "tradePosts") {
    const email = asString(data.sellerEmail);
    if (email && !profile) unresolved = true;
    Object.assign(update, planSellerFields(data, email, profile));
    const replies = planReplies(data.replies, input.profilesByEmail);
    if (replies) update.replies = replies;
  } else if (input.collection === "listingQuestions") {
    const email = asString(data.askerEmail);
    if (email && !profile) unresolved = true;
    const askerName = data.askerName;
    if (typeof askerName === "string" && isEmailDerivedName(askerName, email)) {
      if (!equalsProfileUsername(askerName, profile)) {
        const next = authorLabel(profile, email);
        if (next !== askerName) update.askerName = next;
      }
    }
  } else if (input.collection === "listings") {
    const email = asString(data.sellerEmail);
    if (email && !profile) unresolved = true;
    Object.assign(update, planSellerFields(data, email, profile));
  } else if (input.collection === "reviews") {
    const email = asString(data.reviewerEmail) || asString(data.buyerEmail);
    if (email && !profile) unresolved = true;
    const reviewer = data.reviewer;
    const derived =
      typeof reviewer === "string" && (reviewer.includes("@") || isEmailDerivedName(reviewer, email));
    if (derived) {
      const reviewerName = data.reviewerName;
      const nameMissing = typeof reviewerName !== "string" || !reviewerName.trim();
      const nameDerived = !nameMissing && isEmailDerivedName(reviewerName, email);
      if (nameMissing || nameDerived) update.reviewerName = VERIFIED_BUYER;
      if (typeof reviewer === "string" && reviewer.includes("@") && reviewer !== VERIFIED_BUYER) {
        update.reviewer = VERIFIED_BUYER;
      }
    }
    planGuardedReplacement(
      update,
      "reviewerUsername",
      data.reviewerUsername,
      email,
      profile,
      storedProfileHandle(profile)
    );
    planGuardedReplacement(
      update,
      "buyerName",
      data.buyerName,
      email,
      profile,
      sellerLabel(profile, email)
    );
  }

  return {
    update: Object.keys(update).length > 0 ? update : null,
    unresolved,
  };
}

/** Dry-run (apply = false) never produces a write payload. */
export function mutationForPlan(plan: ScrubPlan, apply: boolean): Record<string, unknown> | null {
  if (!apply || !plan.update || Object.keys(plan.update).length === 0) return null;
  return plan.update;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.indexOf(".");
  const host = dot >= 0 ? domain.slice(0, dot) : domain;
  const tld = dot >= 0 ? domain.slice(dot + 1) : "com";
  return `${local.slice(0, 1) || "*"}***@${host.slice(0, 1) || "*"}***.${tld || "com"}`;
}

type LooseQuery = {
  orderBy: (field: string) => LooseQuery;
  limit: (n: number) => LooseQuery;
  startAfter: (cursor: unknown) => LooseQuery;
  get: () => Promise<{ empty: boolean; size: number; docs: LooseDoc[] }>;
};

type LooseDoc = {
  id: string;
  ref: unknown;
  data: () => Record<string, unknown>;
};

type LooseTxn = {
  get: (ref: unknown) => Promise<{ data: () => Record<string, unknown> | undefined }>;
  update: (ref: unknown, data: Record<string, unknown>) => void;
};

type LooseDb = {
  collection: (name: string) => {
    orderBy: (field: string) => LooseQuery;
    doc: (id: string) => { get: () => Promise<{ exists: boolean; id: string; data: () => Record<string, unknown> | undefined }> };
    where: (
      field: string,
      op: string,
      value: string
    ) => { limit: (n: number) => { get: () => Promise<{ empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> }> } };
  };
  batch: () => {
    update: (ref: unknown, data: Record<string, unknown>) => void;
    commit: () => Promise<void>;
  };
  runTransaction?: <T>(fn: (tx: LooseTxn) => Promise<T>) => Promise<T>;
};

export type ScrubSummaryRow = {
  collection: string;
  scanned: number;
  wouldUpdate: number;
  updated: number;
  skipped: number;
  unresolved: number;
};

const PAGE = 200;
const BATCH_LIMIT = 400;

function toProfile(id: string, data: Record<string, unknown> | undefined): ScrubProfile | null {
  if (!data) return null;
  return {
    uid: id,
    displayName: data.displayName,
    username: data.username,
    email: typeof data.email === "string" ? data.email : null,
  };
}

async function profileByEmail(
  db: LooseDb,
  cache: Map<string, ScrubProfile | null>,
  email: string
): Promise<ScrubProfile | null> {
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return null;
  const key = trimmed.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;
  const load = async (value: string) => {
    const snap = await db.collection("profiles").where("email", "==", value).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return toProfile(doc.id, doc.data());
  };
  let profile = await load(trimmed);
  if (!profile && trimmed !== key) profile = await load(key);
  cache.set(key, profile);
  return profile;
}

async function profileForDoc(
  db: LooseDb,
  cache: Map<string, ScrubProfile | null>,
  collection: string,
  data: Record<string, unknown>
): Promise<ScrubProfile | null> {
  const uid =
    collection === "listings" || collection === "tradePosts"
      ? asString(data.sellerId) || asString(data.sellerUid)
      : collection === "reviews"
        ? asString(data.buyerId) || asString(data.reviewerId)
        : "";
  if (uid && !uid.includes("@")) {
    const cacheKey = `uid:${uid}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
    const snap = await db.collection("profiles").doc(uid).get();
    const profile = snap.exists ? toProfile(snap.id, snap.data()) : null;
    cache.set(cacheKey, profile);
    if (profile) return profile;
  }
  const email =
    collection === "tradeShouts"
      ? asString(data.by)
      : collection === "listingQuestions"
        ? asString(data.askerEmail)
        : collection === "reviews"
          ? asString(data.reviewerEmail) || asString(data.buyerEmail)
          : asString(data.sellerEmail);
  if (!email.includes("@")) return null;
  return profileByEmail(db, cache, email);
}

async function replyProfiles(
  db: LooseDb,
  cache: Map<string, ScrubProfile | null>,
  data: Record<string, unknown>
): Promise<Record<string, ScrubProfile | null>> {
  const out: Record<string, ScrubProfile | null> = {};
  if (!Array.isArray(data.replies)) return out;
  for (const entry of data.replies) {
    if (!entry || typeof entry !== "object") continue;
    const by = asString((entry as Record<string, unknown>).by);
    if (!by.includes("@") || out[by.toLowerCase()]) continue;
    const profile = await profileByEmail(db, cache, by);
    out[by] = profile;
    out[by.toLowerCase()] = profile;
  }
  return out;
}

/**
 * Re-read the post inside a transaction, then write the scrubbed replies from
 * that snapshot. A batch update of the array read earlier would drop any reply
 * committed in between. The Admin SDK retries this callback on contention.
 */
export async function commitTradePostReplies(
  db: LooseDb,
  ref: unknown,
  args: { profile?: ScrubProfile | null; cache: Map<string, ScrubProfile | null> }
): Promise<{ plan: ScrubPlan; wrote: boolean }> {
  if (typeof db.runTransaction !== "function") {
    throw new Error("tradePosts replies rewrite requires a Firestore transaction");
  }
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const profilesByEmail = await replyProfiles(db, args.cache, data);
    const plan = planScrub({
      collection: "tradePosts",
      data,
      profile: args.profile ?? null,
      profilesByEmail,
    });
    const mutation = mutationForPlan(plan, true);
    if (mutation) tx.update(ref, mutation);
    return { plan, wrote: mutation != null };
  });
}

export async function scrubCollection(
  db: LooseDb,
  collection: string,
  options: { apply: boolean; limit?: number }
): Promise<ScrubSummaryRow> {
  const cache = new Map<string, ScrubProfile | null>();
  const row: ScrubSummaryRow = {
    collection,
    scanned: 0,
    wouldUpdate: 0,
    updated: 0,
    skipped: 0,
    unresolved: 0,
  };
  let cursor: LooseDoc | undefined;
  let batch = db.batch();
  let pending = 0;

  const flush = async () => {
    if (pending === 0) return;
    await batch.commit();
    batch = db.batch();
    pending = 0;
  };

  while (true) {
    if (options.limit && row.scanned >= options.limit) break;
    const pageSize = options.limit ? Math.min(PAGE, options.limit - row.scanned) : PAGE;
    let query = db.collection(collection).orderBy("__name__").limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      row.scanned += 1;
      cursor = doc;
      const data = doc.data() || {};
      const profile = await profileForDoc(db, cache, collection, data);
      const profilesByEmail =
        collection === "tradePosts" ? await replyProfiles(db, cache, data) : undefined;
      const plan = planScrub({ collection, data, profile, profilesByEmail });
      if (plan.unresolved) row.unresolved += 1;
      if (!plan.update) {
        row.skipped += 1;
        continue;
      }
      row.wouldUpdate += 1;
      const mutation = mutationForPlan(plan, options.apply);
      if (!mutation) continue;
      let wrote = false;
      if (collection === "tradePosts" && Object.prototype.hasOwnProperty.call(mutation, "replies")) {
        await flush();
        wrote = (await commitTradePostReplies(db, doc.ref, { profile, cache })).wrote;
      } else {
        batch.update(doc.ref, mutation);
        pending += 1;
        wrote = true;
      }
      if (wrote) row.updated += 1;
      if (wrote && plan.unresolved) {
        const email =
          asString(data.by) ||
          asString(data.sellerEmail) ||
          asString(data.askerEmail) ||
          asString(data.reviewerEmail) ||
          asString(data.buyerEmail);
        console.log(`${collection} ${doc.id} unresolved ${email ? maskEmail(email) : ""}`.trim());
      }
      if (pending >= BATCH_LIMIT) await flush();
    }
    if (snap.size < pageSize) break;
  }
  await flush();
  return row;
}

export function formatSummary(rows: ScrubSummaryRow[], apply: boolean): string {
  const header = ["collection", "scanned", apply ? "updated" : "would-update", "skipped", "unresolved"];
  const body = rows.map((row) => [
    row.collection,
    String(row.scanned),
    String(apply ? row.updated : row.wouldUpdate),
    String(row.skipped),
    String(row.unresolved),
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...body.map((line) => line[index].length))
  );
  const render = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");
  return [render(header), ...body.map(render)].join("\n");
}

function parseArgs(argv: string[]): { apply: boolean; limit?: number; collections: string[] } {
  const apply = argv.includes("--apply");
  const limitAt = argv.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(argv[limitAt + 1]) : undefined;
  const collectionAt = argv.indexOf("--collection");
  const collections =
    collectionAt >= 0 && argv[collectionAt + 1]
      ? argv[collectionAt + 1].split(",").map((name) => name.trim()).filter(Boolean)
      : [...SCRUB_COLLECTIONS];
  return {
    apply,
    limit: Number.isFinite(limit) && (limit as number) > 0 ? limit : undefined,
    collections,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { openScrubDb, scrubAdminConfigured, SCRUB_ADMIN_MISSING } = await import("./lib/scrub-admin");
  if (!scrubAdminConfigured()) {
    console.error(SCRUB_ADMIN_MISSING);
    process.exit(1);
  }
  console.log(args.apply ? "APPLY — writing scrub updates" : "DRY-RUN — no writes");
  const db = openScrubDb() as unknown as LooseDb;
  const rows: ScrubSummaryRow[] = [];
  for (const collection of args.collections) {
    rows.push(await scrubCollection(db, collection, { apply: args.apply, limit: args.limit }));
  }
  console.log(formatSummary(rows, args.apply));
}

const entry = (process.argv[1] || "").replace(/\\/g, "/");
const invokedDirectly =
  entry.endsWith("scripts/scrub-email-derived-names.ts") ||
  entry.endsWith("scripts/scrub-email-derived-names.js");
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : "scrub failed");
    process.exit(1);
  });
}
