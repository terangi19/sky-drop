import { randomUUID } from "crypto";
import { getAdminStorage } from "./firebase-admin";
import { buildStorageDownloadUrl, getFirebaseStorageBucket } from "./firebase-storage-config";

export async function uploadBufferToStorage(
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const downloadToken = randomUUID();
  const bucketName = getFirebaseStorageBucket();
  const bucket = getAdminStorage().bucket(bucketName);

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
