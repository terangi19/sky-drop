"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lightbulb, MessageSquare, Mic, X } from "lucide-react";
import { AWHINA_ASK_LABEL, AWHINA_NAME } from "../lib/awhina-brand";
import type { AwhinaVoiceState } from "../hooks/useAwhinaVoice";
import { useFeedback } from "../contexts/FeedbackContext";
import { useTourGuide } from "../contexts/TourGuideContext";
import { FAB_DOCK_POSITION } from "../lib/floating-ui-layout";
import FeedbackModal from "./FeedbackModal";

type Props = {
  voice: AwhinaVoiceState;
  onOpenChat: () => void;
  onToggleVoice?: () => void;
  chatHidden?: boolean;
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
          ? "border-violet-400/45 bg-violet-500/15 shadow-[0_0_20px_rgba(139,92,246,0.25)]"
          : "border-white/[0.08] bg-[#0c0e14]/90 hover:border-sky-400/30 hover:bg-[#12151c]/95"
      }`}
    >
      <span
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          active ? "bg-violet-500/25 text-violet-200" : "bg-white/[0.05] text-sky-300"
        }`}
      >
        {children}
      </span>
      <span className="text-[12px] font-semibold text-white/90 whitespace-nowrap">{label}</span>
    </button>
  );
}

export default function FloatingActionDock({
  voice,
  onOpenChat,
  onToggleVoice,
  chatHidden,
}: Props) {
  const [expanded, setExpanded] = useState(false);
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

  const handlePrimaryClick = () => {
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

  const showUnseenBadge = hasUnseenTour && !expanded;

  return (
    <>
      <div ref={dockRef} className={`${FAB_DOCK_POSITION} pointer-events-none flex flex-col items-end`}>
        {expanded && (
          <div
            className="fixed inset-0 z-[-1] pointer-events-auto bg-black/20 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none"
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
                  <span className="text-sm">✦</span>
                </SpeedDialAction>
              )}
            </div>
          )}

          <div className="relative">
            {showUnseenBadge && (
              <span className="absolute -right-0.5 -top-0.5 z-10 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
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
              title={expanded ? undefined : "Tap to chat · hold for more"}
              aria-label={
                expanded
                  ? "Close menu"
                  : chatHidden
                    ? "Open assistant menu"
                    : `Open ${AWHINA_ASK_LABEL}`
              }
              className={`relative flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-[#0c0e14]/90 backdrop-blur-xl shadow-[0_0_24px_rgba(14,165,233,0.18)] transition-all duration-300 hover:scale-105 hover:border-sky-400/40 hover:shadow-[0_0_32px_rgba(14,165,233,0.28)] active:scale-95 ${
                voice.voiceMode ? "ring-2 ring-violet-400/30" : ""
              } ${expanded ? "bg-zinc-800/95" : ""}`}
            >
              {voiceActive && !expanded && (
                <span className="absolute inset-0 rounded-full border border-violet-400/35 animate-pulse" />
              )}

              {expanded ? (
                <X className="relative h-5 w-5 text-white" strokeWidth={2} />
              ) : (
                <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-500 text-base shadow-[0_0_14px_rgba(14,165,233,0.25)]">
                  ✦
                </span>
              )}
            </button>
          </div>

          {!expanded && !chatHidden && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-sky-300/70">
              {AWHINA_NAME}
            </span>
          )}
        </div>
      </div>

      <FeedbackModal />
    </>
  );
}
