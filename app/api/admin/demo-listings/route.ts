import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { requireAdminFromRequest, AdminAuthError } from "../../../lib/admin-request";

/**
 * Admin API for demo listing management
 * POST /api/admin/demo-listings - Generate demo listings
 * DELETE /api/admin/demo-listings - Delete all demo listings
 * GET /api/admin/demo-listings - Get demo listing count
 */

export async function GET(req: NextRequest) {
  try {
    // Verify admin authorization
    await requireAdminFromRequest(req);

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Admin not initialized" }, { status: 503 });
    }

    const db = getAdminDb();
    const snapshot = await db.collection("listings").where("isDemo", "==", true).count().get();
    const count = snapshot.data().count;

    return NextResponse.json({
      success: true,
      count,
      message: `Found ${count} demo listings`
    });
  } catch (error: any) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin/demo-listings] GET error:", error);
    return NextResponse.json({ error: "Failed to get demo listings" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Verify admin authorization
    await requireAdminFromRequest(req);

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Admin not initialized" }, { status: 503 });
    }

    const db = getAdminDb();
    const snapshot = await db.collection("listings").where("isDemo", "==", true).get();
    
    let deletedCount = 0;
    for (const doc of snapshot.docs) {
      await doc.ref.delete();
      deletedCount++;
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} demo listings`
    });
  } catch (error: any) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin/demo-listings] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete demo listings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin authorization
    await requireAdminFromRequest(req);

    const body = await req.json();
    const { action } = body;

    if (action === "generate") {
      // Trigger the demo listing generation script
      // This would typically be run as a separate script, but we can trigger it here
      return NextResponse.json({
        success: true,
        message: "Demo listing generation should be run via the script: npx ts-node scripts/generate-demo-listings.ts"
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin/demo-listings] POST error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
