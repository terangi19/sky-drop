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
  const isBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    (process.env.VERCEL === "1" && process.env.NODE_ENV === "production");
  const log = isBuild ? console.warn : console.error;
  log("Environment validation failed:", envValidation.errors);
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
  colorScheme: "dark light",
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
    default: "Sky Drop – New Zealand Marketplace | Buy, Sell, Rent & Hire",
    template: "%s — Sky Drop",
  },
  description: "New Zealand's community marketplace. Buy and sell cars, tech, furniture, fashion and more. Free to list, secure payments, rentals, services and jobs. Built for Kiwis.",
  keywords: "New Zealand marketplace, NZ marketplace, buy and sell NZ, NZ classifieds, online marketplace NZ, sell cars NZ, buy tech NZ, local marketplace, free listings NZ, Sky Drop, NZ buy and sell",
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Sky Drop",
    title: "Sky Drop – New Zealand Marketplace | Buy, Sell, Rent & Hire",
    description: "New Zealand's community marketplace. Buy, sell, rent and hire cars, tech, furniture, fashion, services and more. Free to list, secure payments.",
    images: [{
      url: "/og-image.svg",
      width: 1200,
      height: 630,
      alt: "Sky Drop – New Zealand Marketplace",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sky Drop – New Zealand Marketplace | Buy, Sell, Rent & Hire",
    description: "New Zealand's community marketplace. Free to list, secure payments, rentals, services and jobs. Built for Kiwis.",
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
      url: "/favicon.svg"
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
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Sky Drop",
    alternateName: "Sky Drop NZ",
    url: baseUrl,
    description: "New Zealand's community marketplace. Buy and sell cars, tech, gaming, fashion and more.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}/browse?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Sky Drop",
    alternateName: "Sky Drop NZ",
    url: baseUrl,
    logo: `${baseUrl}/favicon.svg`,
    description: "New Zealand's community marketplace. Buy and sell cars, tech, gaming, fashion and more with secure payments.",
    address: {
      "@type": "PostalAddress",
      addressCountry: "NZ",
      addressRegion: "New Zealand"
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@skydrop.co.nz",
      availableLanguage: ["English"]
    },
    sameAs: []
  };
  const localBusinessLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Sky Drop",
    alternateName: "Sky Drop NZ",
    description: "New Zealand's community marketplace. Buy, sell, rent and hire cars, tech, furniture, fashion, services and more.",
    url: baseUrl,
    address: {
      "@type": "PostalAddress",
      addressCountry: "NZ",
      addressRegion: "New Zealand"
    },
    areaServed: "New Zealand",
    priceRange: "$$",
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "00:00",
      closes: "23:59"
    }
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: baseUrl
      }
    ]
  };
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
        />
      </head>
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