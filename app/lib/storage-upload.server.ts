import { randomUUID } from "crypto";
import { getAdminStorage } from "./firebase-admin";
import { buildStorageDownloadUrl } from "./firebase-storage-config";

export async function uploadBufferToStorage(
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
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

  return buildStorageDownloadUrl(bucket.name, objectPath, downloadToken);
}
