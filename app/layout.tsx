import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { AwhinaPageInsightProvider } from "./contexts/AwhinaPageInsightContext";
import { RouteGuard } from "./components/RouteGuard";
import { ProfileProvider } from "./contexts/ProfileContext";
import VerificationBanner from "./components/VerificationBanner";
import ToastContainer from "./components/Toast";
import Footer from "./components/Footer";
import ScrollToTop from "./components/ScrollToTop";
import PageEnter from "./components/PageEnter";
import PWAProvider from "./components/PWAProvider";
import { validateEnv } from "./lib/env-validation";

// Validate environment variables on startup
const envValidation = validateEnv();
if (!envValidation.valid) {
  console.error("Environment validation failed:", envValidation.errors);
}
if (envValidation.warnings.length > 0) {
  console.warn("Environment warnings:", envValidation.warnings);
}

const Spotlight = dynamic(() => import("./components/Spotlight"));
const LegendaryClaimNotification = dynamic(() => import("./components/LegendaryClaimNotification"));
const SkyAiChat = dynamic(() => import("./components/SkyAiChat"));
const WantedLiveFeed = dynamic(() => import("./components/WantedLiveFeed"));
const PlatformAnnouncement = dynamic(() => import("./components/PlatformAnnouncement"));
const MarketplaceRadar = dynamic(() => import("./components/MarketplaceRadar"));
const MatchmakingActivity = dynamic(() => import("./components/MatchmakingActivity"));

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export const links = () => [
  {
    rel: "preconnect",
    href: "https://fonts.googleapis.com",
  },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous" as const,
  },
];

export const metadata: Metadata = {
  title: {
    default: "Sky Drop — NZ Marketplace",
    template: "%s — Sky Drop",
  },
  description: "New Zealand's community marketplace. Buy and sell cars, tech, gaming, fashion and more. Free to list, secure payments, built for Kiwis.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz"),
  openGraph: {
    type: "website",
    siteName: "Sky Drop",
    title: "Sky Drop — NZ Marketplace",
    description: "New Zealand's community marketplace. Buy and sell cars, tech, gaming, fashion and more.",
    images: [{
      url: "/og-image.svg",
      width: 1200,
      height: 630,
      alt: "Sky Drop — NZ Marketplace",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sky Drop — NZ Marketplace",
    description: "New Zealand's community marketplace.",
    images: ["/og-image.svg"],
  },
  icons: [
    {
      rel: "icon",
      type: "image/svg+xml",
      url: "/favicon.svg"
    },
    {
      rel: "icon",
      type: "image/x-icon",
      url: "/favicon.ico"
    },
    {
      rel: "apple-touch-icon",
      url: "/icon-192.png"
    }
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Sky Drop",
    statusBarStyle: "black-translucent",
  },
  other: {
    "theme-color": "#111118",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light")document.documentElement.classList.add("light");}catch(e){}})();`,
          }}
        />
        <script defer data-domain="skydrop.co.nz" src="https://plausible.io/js/script.js"></script>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function(){
              window.addEventListener('pagehide', function() {
                fetch('/', {keepalive: true, method: 'HEAD'}).catch(function(){});
              });
            })();
          `,
        }} />
        <script dangerouslySetInnerHTML={{
          __html: `
            (function(){
              try {
                var enabled = /(?:\\?|&)debugTabs=1(?:&|$)/.test(location.search) ||
                  localStorage.getItem('skydrop:debugTabs') === '1';
                if (!enabled) return;

                function stack() {
                  try { return new Error().stack; } catch (e) { return ''; }
                }

                var origOpen = window.open;
                window.open = function(url, target, features) {
                  console.warn('[skydrop:debugTabs] window.open', {
                    url: url,
                    target: target,
                    features: features,
                    stack: stack()
                  });
                  return origOpen.apply(window, arguments);
                };

                var origPush = history.pushState;
                history.pushState = function(state, title, url) {
                  console.warn('[skydrop:debugTabs] history.pushState', { url: url, stack: stack() });
                  return origPush.apply(history, arguments);
                };

                var origReplace = history.replaceState;
                history.replaceState = function(state, title, url) {
                  console.warn('[skydrop:debugTabs] history.replaceState', { url: url, stack: stack() });
                  return origReplace.apply(history, arguments);
                };

                document.addEventListener('click', function(e) {
                  var el = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
                  if (el) {
                    console.warn('[skydrop:debugTabs] target=_blank click', {
                      href: el.href,
                      stack: stack()
                    });
                  }
                }, true);

                console.info('[skydrop:debugTabs] Tab debugging enabled. See DEBUGGING_NOTES.md');
              } catch (e) {}
            })();
          `,
        }} />
        <AuthProvider><ProfileProvider><AwhinaPageInsightProvider><VerificationBanner /><RouteGuard><PageEnter>{children}</PageEnter><Footer /><Spotlight /><ScrollToTop /><MarketplaceRadar /><MatchmakingActivity /></RouteGuard><SkyAiChat /><ToastContainer /><LegendaryClaimNotification /><WantedLiveFeed /><PlatformAnnouncement /><PWAProvider /></AwhinaPageInsightProvider></ProfileProvider></AuthProvider>
      </body>
    </html>
  );
}