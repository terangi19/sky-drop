const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'sky-drop-de459'
});

const auth = admin.auth();
const db = admin.firestore();

async function deleteUser(email) {
  console.log(`Deleting user: ${email}`);
  
  // Find user by email in profiles
  const profilesSnap = await db.collection('profiles').where('email', '==', email).get();
  
  if (profilesSnap.empty) {
    console.log('User not found in profiles');
    return;
  }
  
  const profile = profilesSnap.docs[0];
  const uid = profile.id;
  console.log(`Found user with UID: ${uid}`);
  
  // Delete from Firebase Auth
  try {
    await auth.deleteUser(uid);
    console.log('Deleted from Firebase Auth');
  } catch (err) {
    console.error('Failed to delete from auth:', err.message);
  }
  
  // Delete profile
  await profile.ref.delete();
  console.log('Deleted profile');
  
  // Delete associated data
  const batch = db.batch();
  
  const listingsSnap = await db.collection('listings').where('sellerEmail', '==', email).get();
  listingsSnap.docs.forEach(doc => batch.delete(doc.ref));
  console.log(`Deleting ${listingsSnap.size} listings`);
  
  const purchasesSnap = await db.collection('purchases').where('buyerEmail', '==', email).get();
  purchasesSnap.docs.forEach(doc => batch.delete(doc.ref));
  console.log(`Deleting ${purchasesSnap.size} purchases`);
  
  const messagesSnap = await db.collection('messages').where('sender', '==', email).get();
  messagesSnap.docs.forEach(doc => batch.delete(doc.ref));
  console.log(`Deleting ${messagesSnap.size} sent messages`);
  
  const messagesRecvSnap = await db.collection('messages').where('receiver', '==', email).get();
  messagesRecvSnap.docs.forEach(doc => batch.delete(doc.ref));
  console.log(`Deleting ${messagesRecvSnap.size} received messages`);
  
  const convSnap = await db.collection('conversations').where('participants', 'array-contains', email).get();
  convSnap.docs.forEach(doc => batch.delete(doc.ref));
  console.log(`Deleting ${convSnap.size} conversations`);
  
  await batch.commit();
  console.log('All data deleted');
}

deleteUser('terangi3@gmail.com').then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
