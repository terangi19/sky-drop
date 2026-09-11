#!/usr/bin/env node
/**
 * Revoke Firebase Storage download tokens on KYC / proof-of-address objects
 * and scrub leftover tokenized download URLs from Firestore.
 *
 * Default is dry-run (lists what WOULD change; no writes).
 * Pass --apply to mutate Storage metadata and Firestore documents.
 *
 * Auth (never commit credentials; never print the JSON):
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
 *   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'   # JSON string
 *   FIREBASE_SERVICE_ACCOUNT=/absolute/path/to/service-account.json
 *
 * Target buckets:
 *   sky-drop-de459.firebasestorage.app
 *   sky-drop-de459.appspot.com  (legacy; skipped if the bucket does not exist)
 *
 * Prefixes ONLY: kyc/ and proof_of_address/
 * Objects are NOT deleted — only metadata key firebaseStorageDownloadTokens is cleared.
 *
 * Run (from repo root):
 *
 *   # Dry-run (default)
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/prod-sa.json node scripts/revoke-kyc-download-tokens.cjs
 *
 *   FIREBASE_SERVICE_ACCOUNT=/path/to/prod-sa.json node scripts/revoke-kyc-download-tokens.cjs
 *
 *   # Apply (required to mutate)
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/prod-sa.json node scripts/revoke-kyc-download-tokens.cjs --apply
 *
 * This does NOT replace deploying firestore.rules or setting Upstash.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const {
  KYC_OBJECT_PREFIXES,
  KNOWN_BUCKETS,
  objectHasDownloadToken,
  downloadTokenClearMetadata,
  parseSensitiveStoragePath,
  planFirestoreScrub,
  parseCliArgs,
} = require("./lib/kyc-token-revoke.cjs");

const MAX_PRINT = 40;

function fail(message) {
  console.error(`[revoke-kyc-tokens] ${message}`);
  process.exit(1);
}

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      fail("FIREBASE_SERVICE_ACCOUNT is not valid JSON. Do not paste secrets into chat/logs.");
    }
    fail("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved)) {
    fail(`FIREBASE_SERVICE_ACCOUNT path not found: ${resolved}`);
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    fail("FIREBASE_SERVICE_ACCOUNT file is not valid JSON.");
  }
  fail("FIREBASE_SERVICE_ACCOUNT file is not valid JSON.");
  return null;
}

function initAdmin() {
  const admin = require("firebase-admin");
  if (admin.apps.length > 0) return admin;

  const sa = loadServiceAccount();
  const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim() || KNOWN_BUCKETS[0];

  if (sa) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: bucket,
    });
    return admin;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: bucket,
    });
    return admin;
  }

  fail(
    "Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, " +
      "or FIREBASE_SERVICE_ACCOUNT to a JSON string or file path. Never commit the key."
  );
  return admin;
}

async function bucketExists(storage, bucketName) {
  try {
    const [exists] = await storage.bucket(bucketName).exists();
    return exists;
  } catch (e) {
    console.warn(`[revoke-kyc-tokens] bucket check failed for ${bucketName}:`, e instanceof Error ? e.message : e);
    return false;
  }
}

async function scanBucket(storage, bucketName, apply, counts) {
  const bucket = storage.bucket(bucketName);
  for (const prefix of KYC_OBJECT_PREFIXES) {
    console.log(`[revoke-kyc-tokens] scanning gs://${bucketName}/${prefix}`);
    let pageQuery = { prefix, autoPaginate: false, maxResults: 200 };
    let printed = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const [files, nextQuery] = await bucket.getFiles(pageQuery);
      for (const file of files) {
        counts.scanned += 1;
        try {
          const [metadata] = await file.getMetadata();
          if (!objectHasDownloadToken(metadata)) continue;
          const objectPath = file.name;
          if (printed < MAX_PRINT) {
            console.log(
              `  ${apply ? "CLEAR" : "WOULD CLEAR"} token  gs://${bucketName}/${objectPath}`
            );
            printed += 1;
          }
          if (apply) {
            await file.setMetadata(downloadTokenClearMetadata());
          }
          counts.tokensCleared += 1;
        } catch (e) {
          counts.errors += 1;
          console.error(
            `  ERROR ${file.name}:`,
            e instanceof Error ? e.message : e
          );
        }
      }
      if (!nextQuery) break;
      pageQuery = nextQuery;
    }
  }
}

function buildFirestorePatch(admin, plan) {
  const patch = { ...plan.setFields };
  for (const field of plan.deleteFields) {
    patch[field] = admin.firestore.FieldValue.delete();
  }
  return patch;
}

async function scrubCollection(admin, db, collectionName, apply, counts) {
  console.log(`[revoke-kyc-tokens] scanning Firestore ${collectionName}/`);
  let last = null;
  let printed = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = db.collection(collectionName).orderBy("__name__").limit(200);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      counts.scanned += 1;
      try {
        const plan = planFirestoreScrub(doc.data() || {});
        if (!plan.changed) continue;
        if (printed < MAX_PRINT) {
          const deletes = plan.deleteFields.join(", ") || "(none)";
          const path = plan.storagePath || parseSensitiveStoragePath(doc.data()?.storagePath) || "";
          console.log(
            `  ${apply ? "SCRUB" : "WOULD SCRUB"} ${collectionName}/${doc.id}` +
              ` delete=[${deletes}] storagePath=${path}`
          );
          printed += 1;
        }
        if (apply) {
          await doc.ref.set(buildFirestorePatch(admin, plan), { merge: true });
        }
        counts.firestoreScrubbed += 1;
      } catch (e) {
        counts.errors += 1;
        console.error(
          `  ERROR ${collectionName}/${doc.id}:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }
}

async function main() {
  const { apply, help } = parseCliArgs(process.argv.slice(2));
  if (help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace("/**", "").trim());
    process.exit(0);
  }

  const mode = apply ? "APPLY" : "DRY-RUN";
  console.log(`[revoke-kyc-tokens] mode=${mode}`);
  console.log("[revoke-kyc-tokens] prefixes=", KYC_OBJECT_PREFIXES.join(", "));
  console.log("[revoke-kyc-tokens] buckets=", KNOWN_BUCKETS.join(", "));

  const admin = initAdmin();
  const storage = admin.storage();
  const db = admin.firestore();

  const counts = {
    scanned: 0,
    tokensCleared: 0,
    firestoreScrubbed: 0,
    errors: 0,
  };

  for (const bucketName of KNOWN_BUCKETS) {
    const exists = await bucketExists(storage, bucketName);
    if (!exists) {
      console.log(`[revoke-kyc-tokens] skip missing bucket ${bucketName}`);
      continue;
    }
    await scanBucket(storage, bucketName, apply, counts);
  }

  await scrubCollection(admin, db, "kycSubmissions", apply, counts);
  await scrubCollection(admin, db, "profiles", apply, counts);

  console.log("[revoke-kyc-tokens] done");
  console.log(
    JSON.stringify(
      {
        mode,
        scanned: counts.scanned,
        tokensCleared: counts.tokensCleared,
        firestoreDocsScrubbed: counts.firestoreScrubbed,
        errors: counts.errors,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("[revoke-kyc-tokens] no writes performed. Re-run with --apply to mutate.");
  }
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
