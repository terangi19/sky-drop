#!/usr/bin/env node
/**
 * PROMPT-13 migration: strip emails (followerEmail, sellerEmail) and any other non-uid fields from
 * existing `followers` docs, leaving { sellerId, followerId, createdAt }.
 *
 * Default = dry-run: counts docs/fields that WOULD change; prints doc ids and field NAMES only
 * (never values / emails). --apply performs the field deletes in batches (Sky only, after a reviewed
 * dry-run). Docs are never deleted; id mismatches / missing uids are reported, not changed.
 *
 * Run AFTER the PROMPT-13 code is deployed (so no new emails are written). Independent of the rules
 * publish (the rules don't depend on these fields).
 *
 * Auth (never commit credentials; never print the JSON):
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
 *   FIREBASE_SERVICE_ACCOUNT=/absolute/path/to/service-account.json   (or the JSON string)
 *
 *   node scripts/scrub-follower-emails.cjs                 # dry-run (default)
 *   node scripts/scrub-follower-emails.cjs --apply         # writes
 *   node scripts/scrub-follower-emails.cjs --page-size=200
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { planFollowerScrub, parseCliArgs } = require("./lib/follower-scrub.cjs");

const MAX_PRINT = 40;

function fail(message) {
  console.error(`[scrub-follower-emails] ${message}`);
  process.exit(1);
}

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_SERVICE_ACCOUNT.trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("{")) return JSON.parse(raw);
    const resolved = path.resolve(raw);
    if (!fs.existsSync(resolved)) fail(`FIREBASE_SERVICE_ACCOUNT path not found: ${resolved}`);
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch {
    fail("FIREBASE_SERVICE_ACCOUNT is not valid JSON. Do not paste secrets into chat/logs.");
  }
  return null;
}

function initAdmin() {
  const admin = require("firebase-admin");
  if (admin.apps.length > 0) return admin;
  const sa = loadServiceAccount();
  if (sa) admin.initializeApp({ credential: admin.credential.cert(sa) });
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } else fail("Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT.");
  return admin;
}

async function main() {
  const { apply, pageSize } = parseCliArgs(process.argv.slice(2));
  const admin = initAdmin();
  const db = admin.firestore();
  const del = admin.firestore.FieldValue.delete();
  const fieldCounts = {};
  const issues = [];
  let scanned = 0;
  let toChange = 0;
  let changed = 0;
  let last = null;

  console.log(`[scrub-follower-emails] mode=${apply ? "APPLY" : "dry-run"} pageSize=${pageSize}`);
  for (;;) {
    let q = db.collection("followers").orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let batchOps = 0;
    for (const doc of snap.docs) {
      scanned += 1;
      const plan = planFollowerScrub(doc.id, doc.data());
      if (plan.issues.length) issues.push(plan);
      if (!plan.deleteKeys.length) continue;
      toChange += 1;
      for (const k of plan.deleteKeys) fieldCounts[k] = (fieldCounts[k] || 0) + 1;
      if (toChange <= MAX_PRINT) console.log(`  ${doc.id}: remove [${plan.deleteKeys.join(", ")}]`);
      if (apply) {
        const update = {};
        for (const k of plan.deleteKeys) update[k] = del;
        batch.update(doc.ref, update);
        batchOps += 1;
      }
    }
    if (apply && batchOps) {
      await batch.commit();
      changed += batchOps;
    }
    last = snap.docs[snap.docs.length - 1];
  }

  console.log(
    `[scrub-follower-emails] scanned=${scanned} docsWithExtraFields=${toChange} ` +
      (apply ? `updated=${changed}` : "(dry-run, nothing written)")
  );
  console.log(`[scrub-follower-emails] fields: ${JSON.stringify(fieldCounts)}`);
  if (issues.length) {
    console.log(`[scrub-follower-emails] ${issues.length} doc(s) need manual review (not changed):`);
    for (const p of issues.slice(0, MAX_PRINT)) console.log(`  ${p.docId}: ${p.issues.join(", ")}`);
  }
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
