import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminInitialized } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { uploadBufferToStorage } from "../../lib/storage-upload.server";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

function isAllowedImage(blob: Blob): boolean {
  const type = blob.type || "image/jpeg";
  return ALLOWED_TYPES.has(type) || type.startsWith("image/");
}

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`upload-listing-image:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many uploads — wait a minute." }, { status: 429 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Upload service unavailable" }, { status: 503 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const formData = await req.formData();
    const full = formData.get("full");
    const thumb = formData.get("thumb");
    const indexRaw = formData.get("index");
    const index =
      typeof indexRaw === "string" && indexRaw.trim() ? Number(indexRaw) : Date.now();

    if (!(full instanceof Blob) || full.size === 0) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    }
    if (full.size > MAX_BYTES) {
      return NextResponse.json({ error: "Photo must be under 12 MB" }, { status: 400 });
    }
    if (!isAllowedImage(full)) {
      return NextResponse.json({ error: "Upload a JPEG, PNG, or WebP image" }, { status: 400 });
    }

    const thumbBlob = thumb instanceof Blob && thumb.size > 0 ? thumb : full;
    if (thumbBlob.size > MAX_BYTES) {
      return NextResponse.json({ error: "Thumbnail must be under 12 MB" }, { status: 400 });
    }

    const timestamp = Date.now();
    const fullExt = (full.type || "image/webp").includes("jpeg") ? "jpg" : "webp";
    const thumbExt = (thumbBlob.type || "image/webp").includes("jpeg") ? "jpg" : "webp";

    const fullPath = `listings/${decoded.uid}/${timestamp}_${index}_full.${fullExt}`;
    const thumbPath = `listings/${decoded.uid}/${timestamp}_${index}_thumb.${thumbExt}`;

    const fullBuffer = Buffer.from(await full.arrayBuffer());
    const thumbBuffer = Buffer.from(await thumbBlob.arrayBuffer());

    const [fullUrl, thumbUrl] = await Promise.all([
      uploadBufferToStorage(fullPath, fullBuffer, full.type || "image/webp"),
      uploadBufferToStorage(thumbPath, thumbBuffer, thumbBlob.type || "image/webp"),
    ]);

    return NextResponse.json({ success: true, fullUrl, thumbUrl });
  } catch (e: unknown) {
    console.error("[upload-listing-image]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
