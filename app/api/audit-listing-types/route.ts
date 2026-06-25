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
    const listingIds = [
      "VrU6tTAxNRJVJvAPbZ42", // "Wanted: BMW 335i"
      "Uq99yYW6QnK00WZcPtTM", // "Bmw chrome rims" 1
      "mkP7sEixMcXpQ4PnWqPG", // "Bmw chrome rims" 2
      "sL0VHPsUy78ywXEuQHcm", // "Bmw chrome rims" 3
    ];

    const firestoreResults: any[] = [];
    
    for (const listingId of listingIds) {
      const docRef = db.collection("listings").doc(listingId);
      const docSnap = await docRef.get();
      
      if (docSnap.exists) {
        const data = docSnap.data();
        firestoreResults.push({
          listingId,
          title: data?.title,
          type: data?.type,
          status: data?.status,
          updatedAt: data?.updatedAt?.toMillis?.() || data?.createdAt?.toMillis?.() || null,
          sellerEmail: data?.sellerEmail,
        });
      } else {
        firestoreResults.push({
          listingId,
          error: "Not found in Firestore"
        });
      }
    }

    // Also fetch all listings for the user to see the full picture
    const userListings = await db.collection("listings")
      .where("sellerEmail", "==", token.email)
      .get();
    
    const userListingSummary = userListings.docs.map(doc => {
      const data = doc.data();
      return {
        listingId: doc.id,
        title: data?.title,
        type: data?.type,
        status: data?.status,
      };
    });

    return NextResponse.json({
      firestoreResults,
      userListingSummary,
      totalUserListings: userListingSummary.length,
    });
  } catch (error: any) {
    console.error("[audit-listing-types] Error:", error);
    return NextResponse.json({ error: error.message || "Audit failed" }, { status: 500 });
  }
}
