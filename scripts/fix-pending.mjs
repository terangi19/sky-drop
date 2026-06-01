const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const sa = require("C:/Users/rangi/AppData/Local/Temp/opencode/service-account.json");
initializeApp({ credential: cert(sa) });
const db = getFirestore();

(async () => {
  const snap = await db.collection("listings").where("status", "==", "pending_review").get();
  console.log("Found " + snap.size + " pending_review listings");
  if (snap.size === 0) { console.log("None to fix"); return; }
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { status: "live" }));
  await batch.commit();
  console.log("All flipped to live");
})().catch(console.error);
