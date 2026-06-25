import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    const token = await verifyIdToken(idToken);

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Firebase Admin not initialized" }, { status: 500 });
    }

    const db = getAdminDb();
    const listingId = "VrU6tTAxNRJVJvAPbZ42"; // "Wanted: BMW 335i"

    const docRef = db.collection("listings").doc(listingId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    
    const currentData = docSnap.data();
    console.log("[fix-misclassified-listing] Current listing data:", currentData);
    
    await docRef.update({
      type: "wanted"
    });
    
    console.log("[fix-misclassified-listing] Updated listing type from 'physical' to 'wanted'");
    
    return NextResponse.json({ 
      success: true,
      message: "Updated listing type from 'physical' to 'wanted'",
      listingId,
      oldType: currentData?.type,
      newType: "wanted"
    });
  } catch (error: any) {
    console.error("[fix-misclassified-listing] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to update listing" }, { status: 500 });
  }
}
