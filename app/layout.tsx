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

const Spotlight = dynamic(() => import("./components/Spotlight"));
const LegendaryClaimNotification = dynamic(() => import("./components/LegendaryClaimNotification"));
const SkyAiChat = dynamic(() => import("./components/SkyAiChat"));
const AwhinaPageGuideLayer = dynamic(() => import("./components/AwhinaPageGuideLayer"));

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
  },
  twitter: {
    card: "summary_large_image",
    title: "Sky Drop — NZ Marketplace",
    description: "New Zealand's community marketplace.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
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
        <AuthProvider><ProfileProvider><AwhinaPageInsightProvider><VerificationBanner /><RouteGuard><PageEnter>{children}</PageEnter><AwhinaPageGuideLayer /><Footer /><Spotlight /><ScrollToTop /><SkyAiChat /></RouteGuard><ToastContainer /><LegendaryClaimNotification /><PWAProvider /></AwhinaPageInsightProvider></ProfileProvider></AuthProvider>
      </body>
    </html>
  );
}