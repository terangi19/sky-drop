import { FIREBASE_STORAGE_URL_PREFIXES } from "./firebase-storage-config";

const CDN_DOMAIN = "https://cdn.skydrop.nz";

export function cdnUrl(url: string | undefined | null): string {
  if (!url) return "";
  for (const prefix of FIREBASE_STORAGE_URL_PREFIXES) {
    if (url.startsWith(prefix)) {
      const path = url.replace(prefix, "");
      const decoded = decodeURIComponent(path.split("?")[0]);
      return `${CDN_DOMAIN}/${decoded}`;
    }
  }
  return url;
}

export function cdnUrls(urls: (string | undefined | null)[]): string[] {
  return urls.filter(Boolean).map((u) => cdnUrl(u));
}
