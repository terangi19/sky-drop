/**
 * Script to delete all demo listings from Sky Drop
 * Run with: npx ts-node --compiler-options {\"module\":\"commonjs\"} scripts/delete-demo-listings.ts
 */

import { getAdminDb } from "../app/lib/firebase-admin";

async function deleteDemoListings() {
  const db = getAdminDb();
  
  console.log("Fetching all demo listings...");
  
  const snapshot = await db.collection("listings").where("isDemo", "==", true).get();
  
  if (snapshot.empty) {
    console.log("No demo listings found.");
    return;
  }
  
  console.log(`Found ${snapshot.docs.length} demo listings.`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const doc of snapshot.docs) {
    try {
      await doc.ref.delete();
      successCount++;
      console.log(`✓ Deleted: ${doc.data().title}`);
    } catch (error: any) {
      errorCount++;
      console.error(`✗ Failed to delete: ${doc.data().title}`, error.message);
    }
  }
  
  console.log(`\nDemo listing deletion complete:`);
  console.log(`- Success: ${successCount}`);
  console.log(`- Failed: ${errorCount}`);
}

// Run the script
deleteDemoListings()
  .then(() => {
    console.log("\n✓ Demo listings deleted successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Error deleting demo listings:", error);
    process.exit(1);
  });
