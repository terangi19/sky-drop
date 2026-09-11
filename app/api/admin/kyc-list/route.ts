import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { rateLimit } from "../../../lib/rate-limit";
import { parseKycStoragePath, signKycReadUrl } from "../../../lib/kyc-storage.server";

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`kyc-list:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await requireAdminFromRequest(req);

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();

    const snap = await db
      .collection("kycSubmissions")
      .where("status", "==", "pending")
      .orderBy("submittedAt", "desc")
      .get();

    const submissions = await Promise.all(
      snap.docs.map(async (doc) => {
        const data = doc.data() || {};
        const objectPath =
          parseKycStoragePath(data.storagePath) ||
          parseKycStoragePath(data.idImageUrl) ||
          parseKycStoragePath(data.selfieImageUrl);
        const signedUrl = objectPath ? await signKycReadUrl(objectPath) : null;
        return {
          id: doc.id,
          uid: data.uid || doc.id,
          email: data.email || "",
          status: data.status || "pending",
          submittedAt: data.submittedAt || null,
          storagePath: objectPath,
          idImageUrl: signedUrl,
          selfieImageUrl: signedUrl,
        };
      })
    );

    return NextResponse.json({ submissions });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[kyc-list] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to fetch KYC submissions" }, { status: 500 });
  }
}
