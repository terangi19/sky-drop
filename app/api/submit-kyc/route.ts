import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminDb,
  getAdminStorage,
  isAdminInitialized,
  verifyIdToken,
} from "../../lib/firebase-admin";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function storageDownloadUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured", code: "server_unconfigured" }, { status: 503 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid or expired session. Sign out and sign in again." }, { status: 401 });
    }

    if (!decoded.email) {
      return NextResponse.json(
        { error: "Sign in with an email account to submit verification." },
        { status: 400 }
      );
    }

    if (!decoded.email_verified) {
      return NextResponse.json(
        {
          error:
            "Verify your email before submitting ID verification. Check your inbox and spam folder, then tap Refresh status on Profile.",
          code: "email_not_verified",
        },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const photo = formData.get("photo");
    if (!(photo instanceof Blob) || photo.size === 0) {
      return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
    }
    if (photo.size > MAX_BYTES) {
      return NextResponse.json({ error: "Photo must be under 10 MB." }, { status: 400 });
    }

    const contentType = photo.type || "image/jpeg";
    if (!ALLOWED_TYPES.has(contentType) && !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Upload a JPEG, PNG, or WebP image." }, { status: 400 });
    }

    const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const objectPath = `kyc/${decoded.uid}/${Date.now()}_photo.${ext}`;
    const buffer = Buffer.from(await photo.arrayBuffer());
    const downloadToken = randomUUID();

    const bucket = getAdminStorage().bucket();
    await bucket.file(objectPath).save(buffer, {
      resumable: false,
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const photoUrl = storageDownloadUrl(bucket.name, objectPath, downloadToken);
    const now = FieldValue.serverTimestamp();
    const db = getAdminDb();

    await db.collection("kycSubmissions").doc(decoded.uid).set(
      {
        uid: decoded.uid,
        email: decoded.email,
        idImageUrl: photoUrl,
        selfieImageUrl: photoUrl,
        status: "pending",
        submittedAt: now,
      },
      { merge: true }
    );

    const profileRef = db.collection("profiles").doc(decoded.uid);
    const profileSnap = await profileRef.get();
    const profilePatch: Record<string, unknown> = {
      kycStatus: "pending",
      kycSubmittedAt: now,
    };
    if (!profileSnap.exists) {
      profilePatch.email = decoded.email;
    }
    await profileRef.set(profilePatch, { merge: true });

    return NextResponse.json({ success: true, photoUrl });
  } catch (e) {
    console.error("[submit-kyc]", e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
