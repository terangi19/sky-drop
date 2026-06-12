import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
  async redirects() {
    return [
      {
        source: "/post",
        destination: "/post/ai",
        permanent: true,
      },
      {
        source: "/create-account",
        destination: "/login?signup=1",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.stripe.com https://*.firebaseio.com https://apis.google.com https://www.google.com https://www.gstatic.com https://*.google.com https://www.recaptcha.net https://*.recaptcha.net; frame-src 'self' https://*.stripe.com https://www.google.com https://recaptcha.google.com https://www.recaptcha.net; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.stripe.com https://www.google.com https://*.google.com https://www.recaptcha.net https://*.recaptcha.net wss://*.firebaseio.com; img-src 'self' data: blob: https://*.firebasestorage.app https://*.googleapis.com https://*.stripe.com https://picsum.photos https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; font-src 'self'; child-src 'self' blob: https://www.google.com https://www.recaptcha.net https://recaptcha.google.com;",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "sky-drop",
  project: process.env.SENTRY_PROJECT || "sky-drop",
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
