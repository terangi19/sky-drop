"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { AuthProvider } from "./AuthProvider";
import { AwhinaPageInsightProvider } from "../contexts/AwhinaPageInsightContext";
import { RouteGuard } from "./RouteGuard";
import { ProfileProvider } from "../contexts/ProfileContext";
import ToastContainer from "./Toast";
import Footer from "./Footer";
import ScrollToTop from "./ScrollToTop";
import PageEnter from "./PageEnter";

const Spotlight = dynamic(() => import("./Spotlight"), { ssr: false });
const SkyAiChat = dynamic(() => import("./SkyAiChat"), { ssr: false });
const AwhinaPageGuideLayer = dynamic(() => import("./AwhinaPageGuideLayer"), { ssr: false });
const VerificationBanner = dynamic(() => import("./VerificationBanner"), { ssr: false });
const PWAProvider = dynamic(() => import("./PWAProvider"), { ssr: false });

export default function ClientAppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ProfileProvider>
        <AwhinaPageInsightProvider>
          <VerificationBanner />
          <RouteGuard>
            <PageEnter>
              <Suspense fallback={null}>{children}</Suspense>
            </PageEnter>
            <AwhinaPageGuideLayer />
            <Footer />
            <Spotlight />
            <ScrollToTop />
            <SkyAiChat />
          </RouteGuard>
          <ToastContainer />
          <PWAProvider />
        </AwhinaPageInsightProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}
