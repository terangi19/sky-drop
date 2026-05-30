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
  experimental: {
    workerThreads: false,
    cpus: 2,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.stripe.com https://*.firebaseio.com https://apis.google.com https://www.google.com https://www.gstatic.com; frame-src 'self' https://*.stripe.com https://www.google.com https://recaptcha.google.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.stripe.com wss://*.firebaseio.com; img-src 'self' data: blob: https://*.firebasestorage.app https://*.googleapis.com https://*.stripe.com https://picsum.photos https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; font-src 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
