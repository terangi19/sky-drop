/**
 * Account Graph — lightweight bot farm detection.
 *
 * Tracks:
 *   IP → multiple accounts
 *   Rapid account creation from same IP
 *   Content similarity across accounts
 *   Device fingerprint clustering
 */

interface AccountNode {
  uid: string;
  ips: Set<string>;
  created: number;
  contentHashes: string[];
  deviceHashes: Set<string>;
}

interface IpNode {
  ip: string;
  uids: Set<string>;
  accountCount: number;
  firstSeen: number;
}

const accounts = new Map<string, AccountNode>();
const ipIndex = new Map<string, IpNode>();
const GRAPH_LOG = "[account-graph]";

const SUSPICIOUS_ACCOUNTS_PER_IP = 3;
const SUSPICIOUS_CREATION_WINDOW_MS = 3600_000;
const MAX_CONTENT_HASHES = 20;

function pruneOld() {
  const cutoff = Date.now() - 86400_000;
  for (const [uid, node] of accounts) {
    if (node.created < cutoff && node.contentHashes.length === 0) {
      accounts.delete(uid);
    }
  }
}
setInterval(pruneOld, 600_000);

/**
 * Register an account creation event.
 */
export function registerAccount(uid: string, ip: string, deviceHash?: string) {
  let node = accounts.get(uid);
  if (!node) {
    node = { uid, ips: new Set(), created: Date.now(), contentHashes: [], deviceHashes: new Set() };
    accounts.set(uid, node);
  }
  node.ips.add(ip);

  let ipNode = ipIndex.get(ip);
  if (!ipNode) {
    ipNode = { ip, uids: new Set(), accountCount: 0, firstSeen: Date.now() };
    ipIndex.set(ip, ipNode);
  }
  if (!ipNode.uids.has(uid)) {
    ipNode.uids.add(uid);
    ipNode.accountCount++;
  }

  if (deviceHash) node.deviceHashes.add(deviceHash);

  if (ipNode.accountCount >= SUSPICIOUS_ACCOUNTS_PER_IP) {
    console.log(`${GRAPH_LOG} suspicious IP cluster: ${ip} → ${ipNode.accountCount} accounts`);
  }
}

/**
 * Register an action for behavioral clustering.
 */
export function registerAction(uid: string, ip: string, contentHash?: string) {
  let node = accounts.get(uid);
  if (!node) {
    node = { uid, ips: new Set(), created: Date.now(), contentHashes: [], deviceHashes: new Set() };
    accounts.set(uid, node);
  }
  node.ips.add(ip);

  if (contentHash) {
    node.contentHashes.push(contentHash);
    if (node.contentHashes.length > MAX_CONTENT_HASHES) {
      node.contentHashes.shift();
    }
  }
}

/**
 * Compute a graph-based risk score (0–30) for a user.
 */
export function getScore(uid: string, ip: string): number {
  let score = 0;

  // IP cluster score
  const ipNode = ipIndex.get(ip);
  if (ipNode) {
    if (ipNode.accountCount >= 5) score += 20;
    else if (ipNode.accountCount >= 3) score += 10;
    else if (ipNode.accountCount >= 2) score += 3;

    // Rapid creation from same IP
    const age = Date.now() - ipNode.firstSeen;
    if (ipNode.accountCount >= 2 && age < SUSPICIOUS_CREATION_WINDOW_MS) {
      score += 10;
    }
  }

  // Account sharing IP with flagged accounts
  const node = accounts.get(uid);
  if (node && node.ips.size > 1) {
    // Check if any shared IP has other flagged accounts
    for (const sharedIp of node.ips) {
      const shared = ipIndex.get(sharedIp);
      if (shared && shared.uids.size > 2) {
        score += 5;
        break;
      }
    }
  }

  // Content similarity across accounts on same IP
  if (node && ipNode && ipNode.uids.size > 1) {
    const myHashes = new Set(node.contentHashes);
    for (const otherUid of ipNode.uids) {
      if (otherUid === uid) continue;
      const other = accounts.get(otherUid);
      if (!other) continue;
      let overlap = 0;
      for (const h of other.contentHashes) {
        if (myHashes.has(h)) overlap++;
      }
      if (overlap >= 3) score += 8;
      if (overlap >= 6) score += 10;
    }
  }

  return Math.min(score, 30);
}
