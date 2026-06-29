"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { useAwhinaVoice } from "../hooks/useAwhinaVoice";
import AwhinaFabStack from "./AwhinaFabStack";
import AwhinaVoiceBar from "./AwhinaVoiceBar";
import SkyAiChatPanel from "./SkyAiChatPanel";

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
  const voice = useAwhinaVoice();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) voice.cancel();
    });
    return () => unsub();
  }, [voice.cancel]);

  if (!user || isAuthPath(pathname) || pathname.startsWith(ADMIN_PREFIX)) {
    return null;
  }

  const showChatSheet = !hideChatSheet(pathname);

  return (
    <>
      {showChatSheet && (
        <SkyAiChatPanel
          mode="sheet"
          open={chatOpen}
          onOpenChange={setChatOpen}
          floatingFab={false}
        />
      )}

      <AwhinaVoiceBar
        phase={voice.phase}
        voiceMode={voice.voiceMode}
        paused={voice.paused}
        toggle={voice.toggle}
      />

      <AwhinaFabStack
        voice={voice}
        onOpenChat={() => setChatOpen(true)}
        chatHidden={!showChatSheet}
      />
    </>
  );
}
