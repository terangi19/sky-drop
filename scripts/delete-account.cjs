const admin = require('firebase-admin');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const auth = admin.auth();

async function main() {
  const email = 'test@example.com';
  // Find profile
  const snap = await db.collection('profiles').where('email', '==', email).limit(1).get();
  if (!snap.empty) {
    const uid = snap.docs[0].id;
    await db.collection('profiles').doc(uid).delete();
    console.log('Profile deleted for', email);
    try { await auth.deleteUser(uid); console.log('Auth user deleted'); }
    catch (e) { console.log('Auth delete skipped:', e.message); }
  } else {
    console.log('Profile not found, trying auth...');
    try {
      const user = await auth.getUserByEmail(email);
      await auth.deleteUser(user.uid);
      console.log('Auth user deleted');
    } catch (e) { console.log('Not found anywhere:', e.message); }
  }
}
main().catch(console.error);
