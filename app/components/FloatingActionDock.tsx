"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lightbulb, MessageSquare, Mic, X } from "lucide-react";
import { AWHINA_LAUNCHER_LABEL, AWHINA_NAME } from "../lib/awhina-brand";
import type { AwhinaVoiceState } from "../hooks/useAwhinaVoice";
import { useFeedback } from "../contexts/FeedbackContext";
import { useTourGuide } from "../contexts/TourGuideContext";
import { FAB_DOCK_POSITION } from "../lib/floating-ui-layout";
import { dismissAwhinaFabHint } from "../lib/awhina-fab-hint";
import { SKY_AI_COMPOSER_ACTIVE_EVENT, type SkyAiComposerActiveDetail } from "../lib/sky-ai-events";
import FeedbackModal from "./FeedbackModal";
import AwhinaMark from "./AwhinaMark";

type Props = {
  voice: AwhinaVoiceState;
  onOpenChat: () => void;
  onToggleVoice?: () => void;
  /** True when this route uses an inline Āwhina workspace (tap focuses it). */
  chatHidden?: boolean;
  /** Global chat sheet is open — hide dock so it never overlaps the composer. */
  chatOverlayOpen?: boolean;
  /** Subtle busy ring only while a real assistant task is in flight. */
  busyActivity?: boolean;
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
      className={`group flex items-center gap-2.5 rounded-full border pl-1.5 pr-3 py-1.5 backdrop-blur-xl transition-[opacity,transform,box-shadow,border-color,background-color] duration-180 ease-out motion-reduce:transition-none disabled:opacity-50 ${
        active
          ? "border-sky-400/35 bg-sky-500/10 shadow-[var(--shadow-md)] light:border-sky-500/30 light:bg-sky-50 light:shadow-[0_2px_10px_rgba(14,165,233,0.08)]"
          : "awhina-fab-surface border-white/[0.08] bg-[#12151c]/92 hover:border-white/[0.14] hover:bg-[#161a22] light:border-black/[0.08] light:bg-white light:shadow-[0_2px_12px_rgba(15,23,42,0.08)] light:hover:border-black/[0.12] light:hover:bg-white"
      }`}
    >
      <span
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          active
            ? "bg-sky-500/20 text-sky-200 light:bg-sky-100 light:text-sky-700"
            : "bg-white/[0.04] text-zinc-200 light:bg-slate-100 light:text-slate-700"
        }`}
      >
        {children}
      </span>
      <span className="text-[12px] font-medium text-zinc-100 whitespace-nowrap light:text-slate-800">
        {label}
      </span>
    </button>
  );
}

export default function FloatingActionDock({
  voice,
  onOpenChat,
  onToggleVoice,
  chatHidden,
  chatOverlayOpen = false,
  busyActivity = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [composerActive, setComposerActive] = useState(false);
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
    // Primary tap ALWAYS opens Āwhina (inline workspace or global sheet).
    // Speed dial is hold / context-menu only — never the sole tap target.
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

  const showAttentionDot = hasUnseenTour && !expanded && !dockHidden;

  const primaryHint = chatHidden
    ? `Focus ${AWHINA_NAME} · Hold for more`
    : `${AWHINA_LAUNCHER_LABEL} · Hold for more`;

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
            className="fixed inset-0 z-[-1] pointer-events-auto bg-black/15 md:bg-transparent light:bg-slate-900/[0.06]"
            aria-hidden
          />
        )}

        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          {expanded && (
            <div
              className="mb-1.5 flex flex-col items-end gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-180"
              role="menu"
              aria-label={`${AWHINA_NAME} shortcuts`}
            >
              {hasTour && (
                <SpeedDialAction label="Page tips" onClick={() => runAction(startTour)}>
                  <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.75} />
                </SpeedDialAction>
              )}
              <SpeedDialAction label="Send feedback" onClick={() => runAction(openFeedback)}>
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
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
                <Mic className="h-3.5 w-3.5" strokeWidth={1.75} />
              </SpeedDialAction>
              <SpeedDialAction
                label={chatHidden ? `Focus ${AWHINA_NAME}` : `Open ${AWHINA_NAME}`}
                onClick={() => runAction(onOpenChat)}
              >
                <AwhinaMark size={16} className="text-sky-400 light:text-sky-600" />
              </SpeedDialAction>
            </div>
          )}

          <div className="awhina-fab-trigger relative flex items-center justify-end">
            {!expanded && (
              <span className="awhina-fab-hover-label" aria-hidden>
                {AWHINA_LAUNCHER_LABEL}
              </span>
            )}

            {showAttentionDot && (
              <span className="awhina-fab-attention" aria-hidden />
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
              aria-haspopup="menu"
              title={expanded ? "Close menu" : primaryHint}
              aria-label={expanded ? "Close menu" : primaryHint}
              className={`awhina-fab-primary ${expanded ? "is-expanded" : ""} ${
                voiceActive ? "is-voice" : ""
              } ${busyActivity ? "is-busy" : ""}`}
            >
              {voiceActive && !expanded && (
                <span className="awhina-fab-voice-dot" aria-hidden />
              )}

              {expanded ? (
                <X className="awhina-fab-close-icon" strokeWidth={2} aria-hidden />
              ) : (
                <AwhinaMark size={22} className="awhina-fab-mark" />
              )}
            </button>
          </div>
        </div>
      </div>

      <FeedbackModal />
    </>
  );
}
