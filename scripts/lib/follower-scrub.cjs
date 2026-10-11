/**
 * Pure helpers for scripts/scrub-follower-emails.cjs (PROMPT-13). Unit-tested without Firebase.
 */
"use strict";

const ALLOWED_KEYS = ["sellerId", "followerId", "createdAt"];

/**
 * Plan for one followers doc:
 *  - deleteKeys: every key outside {sellerId, followerId, createdAt} (followerEmail, sellerEmail,
 *    legacy followingId, ...). Values are never printed.
 *  - issues: id/field mismatches to review by hand (never auto-fixed).
 */
function planFollowerScrub(docId, data) {
  const d = data && typeof data === "object" ? data : {};
  const deleteKeys = Object.keys(d).filter((k) => !ALLOWED_KEYS.includes(k)).sort();
  const issues = [];
  const sellerId = typeof d.sellerId === "string" ? d.sellerId : "";
  const followerId = typeof d.followerId === "string" ? d.followerId : "";
  if (!sellerId) issues.push("missing_sellerId");
  if (!followerId) issues.push("missing_followerId");
  if (sellerId && followerId && docId !== `${sellerId}_${followerId}`) issues.push("id_mismatch");
  if (sellerId && followerId && sellerId === followerId) issues.push("self_follow");
  return { docId, deleteKeys, issues };
}

function parseCliArgs(argv) {
  const args = new Set(argv);
  const pageArg = argv.find((a) => a.startsWith("--page-size="));
  const pageSize = pageArg ? Math.max(1, Math.min(450, Number(pageArg.split("=")[1]) || 300)) : 300;
  return { apply: args.has("--apply"), pageSize };
}

module.exports = { ALLOWED_KEYS, planFollowerScrub, parseCliArgs };
