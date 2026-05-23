const password = process.argv[2];
if (!password) { console.log("Usage: node delete_listings.js YOUR_PASSWORD"); process.exit(1); }

const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, deleteDoc, doc, query, limit } = require("firebase/firestore");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");

const firebaseConfig = {
  apiKey: "AIzaSyDwIex86XMiqO5FIxl_Uhck1pbCX8O32yI",
  authDomain: "sky-drop-de459.firebaseapp.com",
  projectId: "sky-drop-de459",
};

async function run() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  await signInWithEmailAndPassword(auth, "rangitr16@gmail.com", password);
  console.log("Signed in");

  let total = 0;
  while (true) {
    const snap = await getDocs(query(collection(db, "listings"), limit(500)));
    if (snap.empty) break;
    for (const d of snap.docs) {
      await deleteDoc(doc(db, "listings", d.id));
      total++;
    }
    console.log("Deleted", total, "listings so far...");
  }
  console.log("Done! Deleted", total, "listings total.");
}
run().catch(e => { console.error(e.message); process.exit(1); });
