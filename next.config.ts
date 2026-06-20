import type { NextConfig } from "next";

import { withSentryConfig } from "@sentry/nextjs";



const isDev = process.env.NODE_ENV === "development";

const scriptSrcUnsafeEval = isDev ? "'unsafe-eval' " : "";



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

          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },

          { key: "X-Content-Type-Options", value: "nosniff" },

          { key: "X-Frame-Options", value: "SAMEORIGIN" },

          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          { key: "X-DNS-Prefetch-Control", value: "on" },

          {

            key: "Permissions-Policy",

            value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://*.stripe.com\")",

          },

          {

            key: "Content-Security-Policy",

            value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${scriptSrcUnsafeEval}https://*.stripe.com https://js.stripe.com https://*.firebaseio.com https://apis.google.com https://www.google.com https://www.gstatic.com https://*.google.com https://accounts.google.com https://www.recaptcha.net https://*.recaptcha.net https://www.gstatic.com/recaptcha https://www.google.com/recaptcha https://challenges.cloudflare.com https://plausible.io https://cdn.jsdelivr.net; frame-src 'self' https://*.stripe.com https://js.stripe.com https://www.google.com https://recaptcha.google.com https://www.recaptcha.net https://challenges.cloudflare.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.stripe.com https://api.stripe.com https://www.google.com https://*.google.com https://www.recaptcha.net https://*.recaptcha.net https://challenges.cloudflare.com https://plausible.io https://cdn.jsdelivr.net wss://*.firebaseio.com; img-src 'self' data: blob: https://*.firebasestorage.app https://*.googleapis.com https://*.stripe.com https://picsum.photos https://www.google.com https://www.gstatic.com https://plausible.io; style-src 'self' 'unsafe-inline'; font-src 'self'; child-src 'self' blob: https://www.google.com https://www.recaptcha.net https://recaptcha.google.com https://challenges.cloudflare.com;`,

          },

        ],

      },

      {

        source: "/((?!api|_next/static|_next/image|favicon|manifest).*)",

        headers: [

          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },

        ],

      },

      {

        source: "/icon-192.png",

        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],

      },

      {

        source: "/icon-512.png",

        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],

      },

      {

        source: "/favicon.svg",

        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],

      },

      {

        source: "/favicon.ico",

        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],

      },

      {

        source: "/manifest.json",

        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=31536000" }],

      },

      {

        source: "/og-image.png",

        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=31536000" }],

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

