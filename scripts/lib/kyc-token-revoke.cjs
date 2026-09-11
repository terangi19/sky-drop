/**
 * Pure helpers for KYC / proof-of-address download-token revocation.
 * Safe to unit-test without Firebase credentials.
 */

"use strict";

const KYC_OBJECT_PREFIXES = ["kyc/", "proof_of_address/"];

const DEFAULT_BUCKET = "sky-drop-de459.firebasestorage.app";
const LEGACY_BUCKET = "sky-drop-de459.appspot.com";

const KNOWN_BUCKETS = [DEFAULT_BUCKET, LEGACY_BUCKET];

const DOWNLOAD_URL_FIELDS = [
  "idImageUrl",
  "selfieImageUrl",
  "photoUrl",
  "kycDocumentUrl",
  "documentUrl",
  "imageUrl",
  "idPhotoUrl",
  "selfieUrl",
  "proofOfAddressUrl",
  "proofUrl",
];

const TOKEN_QUERY_RE = /(?:^|[?&])token=/i;

function isSensitiveObjectPath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const path = value.trim().split("?")[0];
  if (path.includes("://")) return false;
  return KYC_OBJECT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isKnownFirebaseStorageHost(hostname) {
  return hostname === "firebasestorage.googleapis.com" || hostname === "storage.googleapis.com";
}

function isKnownBucket(bucket) {
  return KNOWN_BUCKETS.includes(bucket);
}

/**
 * Extract a Storage object path from a KYC/PoA path or Firebase download URL.
 * Returns null for non-sensitive locations so callers cannot target listing images.
 */
function parseSensitiveStoragePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (isSensitiveObjectPath(trimmed)) {
    return trimmed.split("?")[0];
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (!isKnownFirebaseStorageHost(parsed.hostname)) return null;

  let bucket = "";
  let encodedPath = "";

  // https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>
  const firebaseMatch = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (firebaseMatch) {
    bucket = decodeURIComponent(firebaseMatch[1]);
    encodedPath = firebaseMatch[2];
  } else {
    // https://storage.googleapis.com/<bucket>/<path>
    const gcsMatch = parsed.pathname.match(/^\/([^/]+)\/(.+)$/);
    if (!gcsMatch) return null;
    bucket = decodeURIComponent(gcsMatch[1]);
    encodedPath = gcsMatch[2];
  }

  if (!isKnownBucket(bucket)) return null;

  let objectPath;
  try {
    objectPath = decodeURIComponent(encodedPath.split("?")[0]);
  } catch {
    return null;
  }

  return isSensitiveObjectPath(objectPath) ? objectPath : null;
}

function isFirebaseDownloadUrlWithToken(value) {
  if (typeof value !== "string" || !TOKEN_QUERY_RE.test(value)) return false;
  return parseSensitiveStoragePath(value) !== null;
}

function objectHasDownloadToken(metadata) {
  const custom = metadata && metadata.metadata;
  if (!custom || typeof custom !== "object") return false;
  const token = custom.firebaseStorageDownloadTokens;
  return typeof token === "string" && token.trim().length > 0;
}

/** Payload that clears the Firebase download-token custom metadata key without deleting the object. */
function downloadTokenClearMetadata() {
  return {
    metadata: {
      firebaseStorageDownloadTokens: null,
    },
  };
}

/**
 * Build a Firestore merge patch for a KYC/profile document.
 * Converts tokenized download URLs to storagePath and deletes the URL fields.
 * Does not invent new public URLs.
 *
 * @returns {{ changed: boolean, storagePath: string|null, deleteFields: string[], setFields: Record<string, string> }}
 */
function planFirestoreScrub(data) {
  const doc = data && typeof data === "object" ? data : {};
  const deleteFields = [];
  const setFields = {};

  let storagePath = isSensitiveObjectPath(doc.storagePath)
    ? String(doc.storagePath).split("?")[0]
    : parseSensitiveStoragePath(doc.storagePath);

  for (const field of DOWNLOAD_URL_FIELDS) {
    const raw = doc[field];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const objectPath = parseSensitiveStoragePath(raw);
    if (!objectPath) continue;
    if (!storagePath) storagePath = objectPath;
    if (raw.includes("://") || TOKEN_QUERY_RE.test(raw)) {
      deleteFields.push(field);
    }
  }

  const currentPath = isSensitiveObjectPath(doc.storagePath)
    ? String(doc.storagePath).split("?")[0]
    : null;
  if (storagePath && currentPath !== storagePath) {
    setFields.storagePath = storagePath;
  }

  const uniqueDeletes = [...new Set(deleteFields)];
  return {
    changed: uniqueDeletes.length > 0 || Object.keys(setFields).length > 0,
    storagePath: storagePath || null,
    deleteFields: uniqueDeletes,
    setFields,
  };
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  return {
    apply: args.includes("--apply"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

module.exports = {
  KYC_OBJECT_PREFIXES,
  DEFAULT_BUCKET,
  LEGACY_BUCKET,
  KNOWN_BUCKETS,
  DOWNLOAD_URL_FIELDS,
  isSensitiveObjectPath,
  parseSensitiveStoragePath,
  isFirebaseDownloadUrlWithToken,
  objectHasDownloadToken,
  downloadTokenClearMetadata,
  planFirestoreScrub,
  parseCliArgs,
};
