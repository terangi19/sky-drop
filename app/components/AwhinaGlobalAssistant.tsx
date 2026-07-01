"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { useAwhinaVoice } from "../hooks/useAwhinaVoice";
import { SKY_AI_OPEN_EVENT } from "../lib/sky-ai-events";
import { dismissVoiceModeIntro, shouldShowVoiceModeIntro } from "../lib/voice-mode-intro";
import AwhinaFabStack from "./AwhinaFabStack";
import AwhinaVoiceBar from "./AwhinaVoiceBar";
import AwhinaVoiceStatusCard from "./AwhinaVoiceStatusCard";
import SkyAiChatPanel from "./SkyAiChatPanel";
import VoiceModeIntroModal from "./VoiceModeIntroModal";

const AUTH_ONLY_PATHS = ["/login", "/forgot-password", "/create-account"];
const ADMIN_PREFIX = "/admin";
const HIDE_CHAT_SHEET_PATHS = [
  "/post/ai",
  "/post/listing",
  "/profile",
];

function isAuthPath(pathname: string) {
  return AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p));
}

function hideChatSheet(pathname: string) {
  return (
    pathname.startsWith(ADMIN_PREFIX) ||
    HIDE_CHAT_SHEET_PATHS.some((p) => pathname.startsWith(p))
  );
}

export default function AwhinaGlobalAssistant() {
  const pathname = usePathname() || "/";
  const [user, setUser] = useState<User | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceIntroOpen, setVoiceIntroOpen] = useState(false);
  const voice = useAwhinaVoice();

  const handleVoiceToggle = useCallback(() => {
    if (!voice.voiceMode && !voice.paused && shouldShowVoiceModeIntro()) {
      setVoiceIntroOpen(true);
      return;
    }
    voice.toggle();
  }, [voice]);

  const closeVoiceIntro = useCallback((neverAgain: boolean) => {
    dismissVoiceModeIntro(neverAgain);
    setVoiceIntroOpen(false);
  }, []);

  const handleVoiceIntroGetStarted = useCallback(
    (neverAgain: boolean) => {
      closeVoiceIntro(neverAgain);
      voice.toggle();
    },
    [closeVoiceIntro, voice]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) voice.cancel();
    });
    return () => unsub();
  }, [voice.cancel]);

  useEffect(() => {
    const onOpen = () => setChatOpen(true);
    window.addEventListener(SKY_AI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SKY_AI_OPEN_EVENT, onOpen);
  }, []);

  if (!user || isAuthPath(pathname) || pathname.startsWith(ADMIN_PREFIX)) {
    return null;
  }

  const showChatSheet = !hideChatSheet(pathname);

  return (
    <>
      {(showChatSheet || chatOpen) && (
        <SkyAiChatPanel
          mode="sheet"
          open={chatOpen}
          onOpenChange={setChatOpen}
          floatingFab={false}
          globalVoiceActive={voice.voiceMode}
        />
      )}

      <AwhinaVoiceBar
        phase={voice.phase}
        voiceMode={voice.voiceMode}
        paused={voice.paused}
        toggle={handleVoiceToggle}
      />

      <VoiceModeIntroModal
        open={voiceIntroOpen}
        onGetStarted={handleVoiceIntroGetStarted}
        onDismiss={closeVoiceIntro}
      />

      {/* Floating status card — bottom-left of viewport */}
      <div className="fixed bottom-6 left-6 z-[10002] max-md:bottom-28 max-md:left-4">
        <AwhinaVoiceStatusCard
          phase={voice.phase}
          voiceMode={voice.voiceMode}
          paused={voice.paused}
          headline={voice.headline}
          transcript={voice.transcript}
          hint={voice.hint}
          heardText={voice.heardText}
          actionText={voice.actionText}
          onDismiss={voice.cancel}
          onResume={voice.resume}
          intro={voice.intro}
        />
      </div>

      <AwhinaFabStack
        voice={voice}
        onToggle={handleVoiceToggle}
        onOpenChat={() => setChatOpen(true)}
        chatHidden={!showChatSheet}
      />
    </>
  );
}
