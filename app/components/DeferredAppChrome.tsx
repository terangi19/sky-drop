"use client";

import dynamic from "next/dynamic";

const Spotlight = dynamic(() => import("./Spotlight"), { ssr: false });
const SkyAiChat = dynamic(() => import("./AwhinaGlobalAssistant"), { ssr: false });
const PlatformAnnouncement = dynamic(() => import("./PlatformAnnouncement"), { ssr: false });
const GuestTourFab = dynamic(() => import("./GuestTourFab"), { ssr: false });
const PWAProvider = dynamic(() => import("./PWAProvider"), { ssr: false });
const DevRequestInstrumentation = dynamic(() => import("./DevRequestInstrumentation"), {
  ssr: false,
});

/** Deferred global chrome — keeps heavy widgets off the root layout critical path. */
export default function DeferredAppChrome() {
  return (
    <>
      {process.env.NODE_ENV === "development" ? <DevRequestInstrumentation /> : null}
      <Spotlight />
      <SkyAiChat />
      <GuestTourFab />
      <PlatformAnnouncement />
      <PWAProvider />
    </>
  );
}
