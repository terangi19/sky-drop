import { getAdminStorage, isAdminInitialized } from "./firebase-admin";
import { getFirebaseStorageBucket } from "./firebase-storage-config";

const KYC_PREFIX = "kyc/";
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/** True when a stored value is a KYC object path (not a public download URL). */
export function isKycObjectPath(value: string): boolean {
  return value.startsWith(KYC_PREFIX) && !value.includes("://");
}

/**
 * Extract a Storage object path from a KYC path or legacy download URL.
 * Returns null for non-KYC locations so callers cannot sign arbitrary objects.
 */
export function parseKycStoragePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (isKycObjectPath(trimmed)) {
    return trimmed.split("?")[0];
  }

  const marker = "/o/";
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;
  const encoded = trimmed.slice(idx + marker.length).split("?")[0];
  try {
    const path = decodeURIComponent(encoded);
    return path.startsWith(KYC_PREFIX) ? path : null;
  } catch {
    return null;
  }
}

export async function signKycReadUrl(
  objectPath: string,
  expiresMs = SIGNED_URL_TTL_MS
): Promise<string | null> {
  if (!isAdminInitialized()) return null;
  const path = parseKycStoragePath(objectPath);
  if (!path) return null;
  try {
    const bucket = getAdminStorage().bucket(getFirebaseStorageBucket());
    const [url] = await bucket.file(path).getSignedUrl({
      action: "read",
      expires: Date.now() + expiresMs,
    });
    return url;
  } catch (e) {
    console.warn("[kyc-storage] signed URL failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function deleteKycObject(objectPath: string): Promise<void> {
  const path = parseKycStoragePath(objectPath);
  if (!path || !isAdminInitialized()) return;
  try {
    await getAdminStorage().bucket(getFirebaseStorageBucket()).file(path).delete({ ignoreNotFound: true });
  } catch (e) {
    console.warn("[kyc-storage] delete failed:", e instanceof Error ? e.message : e);
  }
}
