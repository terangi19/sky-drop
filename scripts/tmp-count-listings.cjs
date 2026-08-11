/**
 * Inventory count for search scaling verdict.
 * Usage: node scripts/tmp-count-listings.cjs
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const envPath = path.resolve(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  process.env[k] = process.env[k] || v;
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

(async () => {
  const snap = await db.collection("listings").select("status", "type").get();
  const byStatus = {};
  const byType = {};
  snap.forEach((d) => {
    const x = d.data();
    const s = x.status || "none";
    const t = x.type || "none";
    byStatus[s] = (byStatus[s] || 0) + 1;
    byType[t] = (byType[t] || 0) + 1;
  });
  const out = {
    at: new Date().toISOString(),
    total: snap.size,
    clientLimit: 400,
    safeForClientFilter: snap.size < 400,
    byStatus,
    byType,
  };
  const outPath = path.join(__dirname, "..", "tmp-search-scale-evidence.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
