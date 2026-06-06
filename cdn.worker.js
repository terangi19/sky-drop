// Sky Drop Image CDN Worker
// Requests: cdn.skydrop.nz/firebase-storage-path?alt=media
// Origin:   firebasestorage.googleapis.com/v0/b/sky-drop-de459.appspot.com/o/firebase-storage-path
//
// Deploy:
//   1. npm install -g wrangler
//   2. wrangler login
//   3. wrangler deploy cdn.worker.js --name sky-drop-cdn
//   4. Add DNS: cdn.skydrop.nz -> CNAME -> workers.dev
//   5. In Cloudflare dashboard: cdn.skydrop.nz -> orange cloud (proxied)

const STORAGE_BASE = "https://firebasestorage.googleapis.com/v0/b/sky-drop-de459.appspot.com/o";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\//, "");

    if (!path) {
      return new Response("Sky Drop CDN", { status: 200 });
    }

    // Translate: cdn.skydrop.nz/path/to/file.jpg?alt=media
    // To:        firebasestorage.googleapis.com/v0/b/.../o/path%2Fto%2Ffile.jpg?alt=media
    const storagePath = path.replace(/\//g, "%2F");
    const originUrl = `${STORAGE_BASE}/${storagePath}${url.search}`;

    const response = await fetch(originUrl, {
      cf: {
        // Cache at Cloudflare edge for 365 days
        cacheTtl: 31536000,
        cacheEverything: true,
      },
    });

    if (!response.ok) {
      return response;
    }

    // Return image with aggressive caching
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("CDN-Cache", "HIT");
    headers.set("Access-Control-Allow-Origin", "https://skydrop.co.nz");

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
};
