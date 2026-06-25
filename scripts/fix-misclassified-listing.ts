import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../app/lib/firebase-admin";

async function fixMisclassifiedListing() {
  const db = getFirestore(getAdminApp());
  
  // Update "Wanted: BMW 335i" from type "physical" to "wanted"
  const listingId = "VrU6tTAxNRJVJvAPbZ42";
  
  try {
    const docRef = db.collection("listings").doc(listingId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      console.log("Listing not found:", listingId);
      return;
    }
    
    const currentData = docSnap.data();
    console.log("Current listing data:", currentData);
    
    await docRef.update({
      type: "wanted"
    });
    
    console.log("Updated listing type from 'physical' to 'wanted'");
  } catch (error) {
    console.error("Error updating listing:", error);
  }
}

fixMisclassifiedListing();
