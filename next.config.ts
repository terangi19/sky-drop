import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "*.firebasestorage.app",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.stripe.com https://*.firebaseio.com https://apis.google.com; frame-src 'self' https://*.stripe.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.stripe.com wss://*.firebaseio.com; img-src 'self' data: blob: https://*.firebasestorage.app https://*.googleapis.com https://*.stripe.com; style-src 'self' 'unsafe-inline'; font-src 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
