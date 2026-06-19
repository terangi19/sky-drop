import { NextRequest, NextResponse } from "next/server";

/** Default max JSON body for marketplace API routes (proxy also enforces Content-Length). */
export const DEFAULT_MAX_JSON_BYTES = 256 * 1024;

export function isContentLengthOverLimit(req: NextRequest, maxBytes: number): boolean {
  const raw = req.headers.get("content-length");
  if (!raw) return false;
  const length = Number.parseInt(raw, 10);
  return Number.isFinite(length) && length > maxBytes;
}

export function payloadTooLargeResponse() {
  return NextResponse.json({ error: "Payload too large" }, { status: 413 });
}
