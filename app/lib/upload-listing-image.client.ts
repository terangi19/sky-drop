import { getFreshIdToken } from "./api-auth";
import { withTimeout } from "./with-timeout";

export type ListingImageUploadResult = {
  fullUrl: string;
  thumbUrl: string;
};

export async function uploadListingImagesViaApi(
  full: Blob,
  thumb: Blob,
  index: number
): Promise<ListingImageUploadResult> {
  const token = await getFreshIdToken();
  if (!token) {
    throw new Error("Please sign in again to upload photos.");
  }

  const form = new FormData();
  form.append("full", full, `full-${index}.webp`);
  form.append("thumb", thumb, `thumb-${index}.webp`);
  form.append("index", String(index));

  const res = await withTimeout(
    fetch("/api/upload-listing-image", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }),
    90_000,
    "Photo upload"
  );

  const data = (await res.json().catch(() => ({}))) as {
    fullUrl?: string;
    thumbUrl?: string;
    error?: string;
  };

  if (!res.ok || !data.fullUrl) {
    throw new Error(data.error || "Photo upload failed");
  }

  return {
    fullUrl: data.fullUrl,
    thumbUrl: data.thumbUrl || data.fullUrl,
  };
}
