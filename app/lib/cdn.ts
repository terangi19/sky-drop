const CDN_DOMAIN = "https://cdn.skydrop.nz";
const STORAGE_PREFIX = "https://firebasestorage.googleapis.com/v0/b/sky-drop-de459.appspot.com/o/";

export function cdnUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith(STORAGE_PREFIX)) {
    const path = url.replace(STORAGE_PREFIX, "");
    const decoded = decodeURIComponent(path.split("?")[0]);
    return `${CDN_DOMAIN}/${decoded}`;
  }
  return url;
}

export function cdnUrls(urls: (string | undefined | null)[]): string[] {
  return urls.filter(Boolean).map((u) => cdnUrl(u));
}
