const admin = require('firebase-admin');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const email = 'terangi3@gmail.com';
  const snap = await db.collection('profiles').where('email', '==', email).limit(1).get();
  if (snap.empty) { console.log('User not found'); return; }
  const uid = snap.docs[0].id;
  await db.collection('profiles').doc(uid).set({
    kycStatus: 'approved',
    kycReviewedAt: new Date(),
    kycReviewedBy: 'admin',
  }, { merge: true });
  console.log('KYC approved for', email, 'UID:', uid);
}
main().catch(console.error);
