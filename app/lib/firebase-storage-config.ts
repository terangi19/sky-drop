/** Default Firebase Storage bucket (must match Firebase Console). */
export const DEFAULT_FIREBASE_STORAGE_BUCKET = "sky-drop-de459.firebasestorage.app";

export function getFirebaseStorageBucket(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || DEFAULT_FIREBASE_STORAGE_BUCKET
  );
}

export function buildStorageDownloadUrl(
  bucketName: string,
  objectPath: string,
  token: string
): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

/** Known storage URL prefixes for CDN rewriting (legacy + current bucket). */
export const FIREBASE_STORAGE_URL_PREFIXES = [
  `https://firebasestorage.googleapis.com/v0/b/${DEFAULT_FIREBASE_STORAGE_BUCKET}/o/`,
  "https://firebasestorage.googleapis.com/v0/b/sky-drop-de459.appspot.com/o/",
];
