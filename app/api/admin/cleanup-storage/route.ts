import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";

interface CleanupResult {
  deletedImages: number;
  freedSpaceBytes: number;
  freedSpaceMB: number;
  errors: string[];
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Admin SDK not initialized" }, { status: 500 });
    }

    const db = getAdminDb();
    const storage = getStorage();
    const bucket = storage.bucket();

    const body = await req.json();
    const dryRun = body.dryRun !== false; // Default to dry run

    const result: CleanupResult = {
      deletedImages: 0,
      freedSpaceBytes: 0,
      freedSpaceMB: 0,
      errors: [],
    };

    // Get all listings to find active image URLs
    const listingsSnap = await db.collection("listings").get();
    const activeImageUrls = new Set<string>();

    listingsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.images && Array.isArray(data.images)) {
        data.images.forEach((url: string) => {
          if (url) activeImageUrls.add(url);
        });
      }
      if (data.imageUrl) {
        activeImageUrls.add(data.imageUrl);
      }
    });

    // Get all profiles for avatars and banners
    const profilesSnap = await db.collection("profiles").get();
    profilesSnap.forEach((doc) => {
      const data = doc.data();
      if (data.avatarUrl) activeImageUrls.add(data.avatarUrl);
      if (data.bannerUrl) activeImageUrls.add(data.bannerUrl);
    });

    // Get all files in listings bucket
    const [files] = await bucket.getFiles({ prefix: "listings/" });

    for (const file of files) {
      const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media`;
      
      // Check if file is referenced in any listing
      if (!activeImageUrls.has(fileUrl)) {
        try {
          const [metadata] = await file.getMetadata();
          const fileSize = Number(metadata.size) || 0;

          if (!dryRun) {
            await file.delete();
          }

          result.deletedImages++;
          result.freedSpaceBytes += fileSize;
        } catch (error) {
          result.errors.push(`Failed to delete ${file.name}: ${error}`);
        }
      }
    }

    // Also cleanup old thumbnails (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [thumbnailFiles] = await bucket.getFiles({ prefix: "listings/" });

    for (const file of thumbnailFiles) {
      if (file.name.includes("/thumbnails/")) {
        try {
          const [metadata] = await file.getMetadata();
          if (!metadata.timeCreated) continue;
          const createdDate = new Date(metadata.timeCreated);

          if (createdDate < thirtyDaysAgo) {
            const fileSize = Number(metadata.size) || 0;

            if (!dryRun) {
              await file.delete();
            }

            result.deletedImages++;
            result.freedSpaceBytes += fileSize;
          }
        } catch (error) {
          result.errors.push(`Failed to delete thumbnail ${file.name}: ${error}`);
        }
      }
    }

    result.freedSpaceMB = result.freedSpaceBytes / (1024 * 1024);

    return NextResponse.json({
      success: true,
      dryRun,
      ...result,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/cleanup-storage]", e);
    return NextResponse.json({ error: "Failed to cleanup storage" }, { status: 500 });
  }
}
