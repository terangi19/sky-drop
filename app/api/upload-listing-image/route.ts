import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminInitialized } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { uploadBufferToStorage } from "../../lib/storage-upload.server";
import { validateImageUpload } from "../../lib/file-validation";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isAllowedImage(blob: Blob): boolean {
  return ALLOWED_TYPES.has(blob.type.toLowerCase());
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
      return NextResponse.json({ error: "Photo must be under 10 MB" }, { status: 400 });
    }
    if (!isAllowedImage(full)) {
      return NextResponse.json({ error: "Upload a JPEG, PNG, WebP, or GIF image" }, { status: 400 });
    }

    const thumbBlob = thumb instanceof Blob && thumb.size > 0 ? thumb : full;
    if (thumbBlob.size > MAX_BYTES) {
      return NextResponse.json({ error: "Thumbnail must be under 10 MB" }, { status: 400 });
    }
    if (!isAllowedImage(thumbBlob)) {
      return NextResponse.json({ error: "Thumbnail must be a valid image" }, { status: 400 });
    }

    if (
      !(await validateImageUpload(full, full.type)) ||
      !(await validateImageUpload(thumbBlob, thumbBlob.type))
    ) {
      return NextResponse.json(
        { error: "Photo contents do not match the declared image type" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const extensionForType = (type: string) =>
      type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : type === "image/gif" ? "gif" : "webp";
    const safeIndex = Number.isInteger(index) && index >= 0 && index < 100 ? index : 0;
    const fullExt = extensionForType(full.type);
    const thumbExt = extensionForType(thumbBlob.type);

    const fullPath = `listings/${decoded.uid}/${timestamp}_${safeIndex}_full.${fullExt}`;
    const thumbPath = `listings/${decoded.uid}/${timestamp}_${safeIndex}_thumb.${thumbExt}`;

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
