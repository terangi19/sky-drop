"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { useAwhinaVoice } from "../hooks/useAwhinaVoice";
import { isAdminEmail } from "../lib/admin-check";
import { dismissAwhinaIntro, shouldShowAwhinaIntro } from "../lib/awhina-intro";
import { dismissVoiceModeIntro, shouldShowVoiceModeIntro } from "../lib/voice-mode-intro";
import {
  SKY_AI_OPEN_EVENT,
  consumeVoiceSellNavigation,
  dispatchSkyAiOpen,
  isVoiceSellNavigationPending,
  type SkyAiOpenDetail,
} from "../lib/sky-ai-events";
import { FLOATING_LEFT_STACK } from "../lib/floating-ui-layout";
import { hasInlineAwhinaAssistant } from "../lib/awhina-ui-surface";
import FloatingActionDock from "./FloatingActionDock";
import AwhinaIntroModal from "./AwhinaIntroModal";
import AwhinaVoiceBar from "./AwhinaVoiceBar";
import AwhinaVoiceStatusCard from "./AwhinaVoiceStatusCard";
import VoiceModeIntroModal from "./VoiceModeIntroModal";
import FeedbackModal from "./FeedbackModal";

const SkyAiChatPanel = dynamic(() => import("./SkyAiChatPanel"), { ssr: false });

const AUTH_ONLY_PATHS = ["/login", "/forgot-password", "/create-account"];
const ADMIN_PREFIX = "/admin";

function isAuthPath(pathname: string) {
  return AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p));
}

export default function AwhinaGlobalAssistant() {
  const pathname = usePathname() || "/";
  const [user, setUser] = useState<User | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPanelMounted, setChatPanelMounted] = useState(false);
  const [voiceIntroOpen, setVoiceIntroOpen] = useState(false);
  const [awhinaIntroOpen, setAwhinaIntroOpen] = useState(false);
  const [pendingChatQuery, setPendingChatQuery] = useState<string | undefined>();
  const pendingChatQueryRef = useRef<string | undefined>();
  const awhinaIntroOnSellPageRef = useRef(false);
  const voice = useAwhinaVoice({
    userEmail: user?.email ?? null,
    isAdmin: isAdminEmail(user?.email),
  });

  const inlineAssistant = hasInlineAwhinaAssistant(pathname);
  const onSellWorkspace = pathname.startsWith("/post/ai");
  const showChatSheet = !pathname.startsWith(ADMIN_PREFIX) && !inlineAssistant;
  /** Sell page already has inline Chat|Listing — no floating second assistant. */
  const showFloatingDock = !onSellWorkspace;

  const openChat = useCallback(
    (query?: string) => {
      if (shouldShowAwhinaIntro() && !isVoiceSellNavigationPending()) {
        pendingChatQueryRef.current = query;
        setAwhinaIntroOpen(true);
        return;
      }
      // Routes with an existing inline workspace: focus that surface — never spawn a second sheet.
      if (hasInlineAwhinaAssistant(pathname)) {
        dispatchSkyAiOpen(query);
        return;
      }
      setChatPanelMounted(true);
      setChatOpen(true);
      if (query) setPendingChatQuery(query);
    },
    [pathname]
  );

  const closeAwhinaIntro = useCallback((neverAgain: boolean) => {
    dismissAwhinaIntro(neverAgain);
    setAwhinaIntroOpen(false);
    pendingChatQueryRef.current = undefined;
  }, []);

  const handleAwhinaIntroGetStarted = useCallback(
    (neverAgain: boolean) => {
      const query = pendingChatQueryRef.current;
      dismissAwhinaIntro(neverAgain);
      setAwhinaIntroOpen(false);
      pendingChatQueryRef.current = undefined;
      if (hasInlineAwhinaAssistant(pathname)) {
        dispatchSkyAiOpen(query);
        return;
      }
      setChatPanelMounted(true);
      setChatOpen(true);
      if (query) setPendingChatQuery(query);
    },
    [pathname]
  );

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
    const onOpen = (e: Event) => {
      const query = (e as CustomEvent<SkyAiOpenDetail>).detail?.query?.trim();
      // Inline routes handle SKY_AI_OPEN themselves (focus existing panel).
      if (hasInlineAwhinaAssistant(pathname)) return;
      openChat(query || undefined);
    };
    window.addEventListener(SKY_AI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SKY_AI_OPEN_EVENT, onOpen);
  }, [openChat, pathname]);

  useEffect(() => {
    if (!user || !pathname.startsWith("/post/ai")) return;
    if (consumeVoiceSellNavigation()) return;
    if (!shouldShowAwhinaIntro() || awhinaIntroOnSellPageRef.current) return;
    awhinaIntroOnSellPageRef.current = true;
    setAwhinaIntroOpen(true);
  }, [user, pathname]);

  // Close global chat when entering an inline-assistant route (prevents duplicates).
  // Conversation identity lives in awhina-conversation-store — remount must not reset it.
  useEffect(() => {
    if (inlineAssistant && chatOpen) setChatOpen(false);
  }, [inlineAssistant, chatOpen]);

  // On /post/ai, reclaim sticky CTA / composer space (no floating dock).
  useEffect(() => {
    const root = document.documentElement;
    if (onSellWorkspace) {
      root.setAttribute("data-fab-hidden", "true");
      root.style.setProperty("--fab-clearance", "0px");
    } else {
      root.removeAttribute("data-fab-hidden");
      root.style.removeProperty("--fab-clearance");
    }
    return () => {
      root.removeAttribute("data-fab-hidden");
      root.style.removeProperty("--fab-clearance");
    };
  }, [onSellWorkspace]);

  if (!user || isAuthPath(pathname) || pathname.startsWith(ADMIN_PREFIX)) {
    return null;
  }

  // Activity ring only during real work — not idle listening.
  const voiceBusy =
    voice.voiceMode &&
    !voice.paused &&
    (voice.phase === "processing" ||
      voice.phase === "speaking" ||
      voice.phase === "confirming");

  return (
    <>
      {showChatSheet && chatPanelMounted && (
        <div
          className={`fixed bottom-[calc(5.75rem+var(--mobile-nav-offset,0px))] right-4 z-[10001] h-[min(680px,calc(100dvh-7.5rem))] w-[min(420px,calc(100vw-2rem))] transition-all duration-200 md:bottom-6 md:right-6 ${
            chatOpen
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-3 scale-[0.98] opacity-0"
          }`}
          aria-hidden={!chatOpen}
        >
          <SkyAiChatPanel
            mode="inline"
            open={chatOpen}
            onOpenChange={setChatOpen}
            autoQuery={pendingChatQuery}
            onAutoQueryConsumed={() => setPendingChatQuery(undefined)}
            floatingFab={false}
            globalVoiceActive={voice.voiceMode}
            className="!mt-0 h-full min-h-0 shadow-2xl"
          />
        </div>
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

      <AwhinaIntroModal
        open={awhinaIntroOpen}
        onGetStarted={handleAwhinaIntroGetStarted}
        onDismiss={closeAwhinaIntro}
      />

      {/* Floating status card — bottom-left of viewport */}
      <div className={`${FLOATING_LEFT_STACK} bottom-[calc(1.25rem+var(--mobile-nav-offset,0px))] z-[10002]`}>
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

      {showFloatingDock ? (
        <FloatingActionDock
          voice={voice}
          onOpenChat={() => openChat()}
          onToggleVoice={handleVoiceToggle}
          chatHidden={inlineAssistant}
          chatOverlayOpen={chatOpen}
          busyActivity={!!voiceBusy}
        />
      ) : (
        <FeedbackModal />
      )}
    </>
  );
}
