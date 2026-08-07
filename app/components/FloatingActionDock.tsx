"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lightbulb, MessageSquare, Mic, Sparkles, X } from "lucide-react";
import { AWHINA_ASK_LABEL, AWHINA_NAME } from "../lib/awhina-brand";
import type { AwhinaVoiceState } from "../hooks/useAwhinaVoice";
import { useFeedback } from "../contexts/FeedbackContext";
import { useTourGuide } from "../contexts/TourGuideContext";
import { FAB_DOCK_POSITION } from "../lib/floating-ui-layout";
import { dismissAwhinaFabHint, shouldShowAwhinaFabHint } from "../lib/awhina-fab-hint";
import { SKY_AI_COMPOSER_ACTIVE_EVENT, type SkyAiComposerActiveDetail } from "../lib/sky-ai-events";
import FeedbackModal from "./FeedbackModal";

type Props = {
  voice: AwhinaVoiceState;
  onOpenChat: () => void;
  onToggleVoice?: () => void;
  chatHidden?: boolean;
  /** Global chat sheet is open — hide dock so it never overlaps the composer. */
  chatOverlayOpen?: boolean;
};

function SpeedDialAction({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`group flex items-center gap-2.5 rounded-full border pl-1.5 pr-3 py-1.5 backdrop-blur-xl transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 disabled:opacity-50 ${
        active
          ? "border-sky-400/45 bg-sky-500/15 shadow-[var(--shadow-md)] light:border-sky-500/35 light:bg-sky-100 light:shadow-[0_4px_16px_rgba(14,165,233,0.12)]"
          : "awhina-fab-surface border-white/[0.08] bg-[#0c0e14]/90 hover:border-sky-400/30 hover:bg-[#12151c]/95 light:border-gray-200/90 light:bg-white/95 light:shadow-[0_4px_20px_rgba(15,23,42,0.08)] light:hover:border-sky-400/40 light:hover:bg-white"
      }`}
    >
      <span
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          active
            ? "bg-sky-500/25 text-sky-200 light:bg-sky-200 light:text-sky-700"
            : "bg-white/[0.05] text-sky-300 light:bg-sky-50 light:text-sky-600"
        }`}
      >
        {children}
      </span>
      <span className="text-[12px] font-semibold text-white/90 whitespace-nowrap light:text-gray-800">{label}</span>
    </button>
  );
}

export default function FloatingActionDock({
  voice,
  onOpenChat,
  onToggleVoice,
  chatHidden,
  chatOverlayOpen = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [composerActive, setComposerActive] = useState(false);
  const [showFabHint, setShowFabHint] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const { openFeedback } = useFeedback();
  const { hasTour, hasUnseenTour, startTour } = useTourGuide();

  const handleToggle = onToggleVoice ?? voice.toggle;
  const voiceActive = voice.voiceMode && !voice.paused;

  const collapse = useCallback(() => setExpanded(false), []);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearLongPress();
  }, [clearLongPress]);

  useEffect(() => {
    const onComposer = (e: Event) => {
      const active = (e as CustomEvent<SkyAiComposerActiveDetail>).detail?.active;
      setComposerActive(!!active);
    };
    window.addEventListener(SKY_AI_COMPOSER_ACTIVE_EVENT, onComposer);
    return () => window.removeEventListener(SKY_AI_COMPOSER_ACTIVE_EVENT, onComposer);
  }, []);

  const dockHidden = chatOverlayOpen || composerActive;

  useEffect(() => {
    if (dockHidden) setExpanded(false);
  }, [dockHidden]);

  useEffect(() => {
    if (dockHidden || expanded) return;
    setShowFabHint(shouldShowAwhinaFabHint());
  }, [dockHidden, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        collapse();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [collapse, expanded]);

  const runAction = (action: () => void) => {
    collapse();
    action();
  };

  const dismissFabHint = useCallback(() => {
    dismissAwhinaFabHint();
    setShowFabHint(false);
  }, []);

  const handlePrimaryClick = () => {
    dismissFabHint();
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (expanded) {
      collapse();
      return;
    }
    if (chatHidden) {
      setExpanded(true);
      return;
    }
    onOpenChat();
  };

  const handlePointerDown = () => {
    dismissFabHint();
    longPressTriggered.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setExpanded(true);
    }, 450);
  };

  const handlePointerUp = () => {
    clearLongPress();
  };

  const showUnseenBadge = hasUnseenTour && !expanded && !dockHidden;

  const primaryHint = chatHidden ? "Tap for menu" : "Tap chat · Hold for more";

  if (dockHidden) {
    return <FeedbackModal />;
  }

  return (
    <>
      <div
        ref={dockRef}
        className={`awhina-fab-dock ${FAB_DOCK_POSITION} pointer-events-none flex flex-col items-end`}
      >
        {expanded && (
          <div
            className="fixed inset-0 z-[-1] pointer-events-auto bg-black/20 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none light:bg-slate-900/10"
            aria-hidden
          />
        )}

        <div className="pointer-events-auto flex flex-col items-center gap-1.5">
          {expanded && (
            <div className="mb-2 flex flex-col items-end gap-2">
              {hasTour && (
                <SpeedDialAction label="Page tips" onClick={() => runAction(startTour)}>
                  <Lightbulb className="h-4 w-4" strokeWidth={1.75} />
                </SpeedDialAction>
              )}
              <SpeedDialAction label="Send feedback" onClick={() => runAction(openFeedback)}>
                <MessageSquare className="h-4 w-4 text-sky-400" strokeWidth={1.75} />
              </SpeedDialAction>
              <SpeedDialAction
                label={
                  voice.voiceMode
                    ? voice.paused
                      ? "Resume voice"
                      : "Voice on"
                    : voice.supported
                      ? "Voice commands"
                      : "Voice unavailable"
                }
                onClick={() => runAction(handleToggle)}
                disabled={!voice.supported && !voice.voiceMode}
                active={voiceActive}
              >
                <Mic className="h-4 w-4" strokeWidth={1.75} />
              </SpeedDialAction>
              {!chatHidden && (
                <SpeedDialAction label={`Open ${AWHINA_NAME}`} onClick={() => runAction(onOpenChat)}>
                  <Sparkles className="h-4 w-4 text-sky-400" strokeWidth={2} />
                </SpeedDialAction>
              )}
            </div>
          )}

          <div className="relative">
            {showFabHint && !expanded && (
              <div
                className="absolute bottom-[calc(100%+0.75rem)] right-0 w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-sky-500/25 bg-[#0c0e14]/95 px-3 py-2.5 text-right shadow-[0_0_30px_rgba(14,165,233,0.15)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 light:border-sky-500/30 light:bg-white/98 light:shadow-[0_8px_32px_rgba(14,165,233,0.12)]"
                role="status"
              >
                <p className="text-[11px] font-semibold leading-snug text-white light:text-gray-900">
                  {chatHidden ? "Tap for voice, tips & feedback" : "Tap to chat with Āwhina"}
                </p>
                <p className="mt-1 text-[10px] leading-snug text-sky-300/85 light:text-sky-700">
                  {chatHidden ? "Opens the assistant menu" : "Hold the button for voice, tips & feedback"}
                </p>
                <button
                  type="button"
                  onClick={dismissFabHint}
                  className="mt-2 text-[10px] font-bold text-sky-400 hover:text-sky-300 light:text-sky-600 light:hover:text-sky-700"
                >
                  Got it
                </button>
                <span className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-r border-b border-sky-500/25 bg-[#0c0e14]/95 light:border-sky-500/30 light:bg-white/98" />
              </div>
            )}

            {showUnseenBadge && (
              <span className="absolute -right-0.5 -top-0.5 z-10 flex h-3 w-3">
                <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-400" />
              </span>
            )}

            <button
              type="button"
              onClick={handlePrimaryClick}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!expanded) setExpanded(true);
              }}
              aria-expanded={expanded}
              title={expanded ? undefined : primaryHint}
              aria-label={
                expanded
                  ? "Close menu"
                  : chatHidden
                    ? `Open assistant menu — ${primaryHint}`
                    : `${AWHINA_ASK_LABEL} — ${primaryHint}`
              }
              className={`awhina-fab-primary ${expanded ? "is-expanded" : ""} ${voice.voiceMode ? "is-voice" : ""}`}
            >
              {!expanded && (
                <span className="awhina-fab-badge" aria-hidden title="Hold for menu">
                  <span className="awhina-fab-badge-dot" />
                  <span className="awhina-fab-badge-dot" />
                  <span className="awhina-fab-badge-dot" />
                </span>
              )}

              {voiceActive && !expanded && (
                <span className="awhina-fab-voice-pulse" aria-hidden />
              )}

              {expanded ? (
                <X className="awhina-fab-close-icon" strokeWidth={2} aria-hidden />
              ) : (
                <span className="awhina-fab-gem" aria-hidden>
                  <Sparkles className="h-[18px] w-[18px] text-always-white" strokeWidth={2.25} />
                </span>
              )}
            </button>

            {!expanded && (
              <p className="awhina-fab-caption" aria-hidden>
                {chatHidden ? (
                  <span className="awhina-fab-caption-primary">Tap for menu</span>
                ) : (
                  <>
                    <span className="awhina-fab-caption-primary">Tap chat</span>
                    <span className="awhina-fab-caption-sep">·</span>
                    <span className="awhina-fab-caption-secondary">Hold for more</span>
                  </>
                )}
              </p>
            )}
          </div>

        </div>
      </div>

      <FeedbackModal />
    </>
  );
}
