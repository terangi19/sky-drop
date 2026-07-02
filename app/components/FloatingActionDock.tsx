"use client";

import type { AwhinaVoiceState } from "../hooks/useAwhinaVoice";
import FeedbackButton from "./FeedbackButton";
import AwhinaFabStack from "./AwhinaFabStack";

type Props = {
  voice: AwhinaVoiceState;
  onOpenChat: () => void;
  onToggleVoice?: () => void;
  chatHidden?: boolean;
};

export default function FloatingActionDock({ voice, onOpenChat, onToggleVoice, chatHidden }: Props) {
  return (
    <div className="fixed z-[10003] flex flex-col items-end gap-3 bottom-6 right-6 max-md:bottom-24 max-md:right-4 pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-end gap-3">
        {/* Feedback button - secondary action */}
        <div className="group relative">
          <span className="absolute -top-10 right-0 px-3 py-1.5 rounded-lg bg-zinc-900/95 border border-white/[0.06] text-[11px] font-semibold text-always-white whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            Send Feedback
            <span className="absolute -bottom-1 right-3 w-2 h-2 rotate-45 bg-zinc-900/95 border-r border-b border-white/[0.06]" />
          </span>
          <FeedbackButton />
        </div>

        {/* AI button - primary action */}
        <AwhinaFabStack
          voice={voice}
          onOpenChat={onOpenChat}
          onToggle={onToggleVoice}
          chatHidden={chatHidden}
        />
      </div>
    </div>
  );
}
