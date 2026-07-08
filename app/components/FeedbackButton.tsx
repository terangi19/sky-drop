"use client";

import { MessageSquare } from "lucide-react";
import { useFeedback } from "../contexts/FeedbackContext";
import FeedbackModal from "./FeedbackModal";

export default function FeedbackButton({ className = "" }: { className?: string }) {
  const { openFeedback } = useFeedback();

  return (
    <>
      {/* Icon-only feedback button */}
      <button
        onClick={openFeedback}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-[#0c0e14]/80 backdrop-blur-xl shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-[0_0_20px_rgba(14,165,233,0.15)] hover:border-sky-400/30 hover:bg-[#0c0e14]/90 active:scale-95 light:border-gray-200/90 light:bg-white/95 light:shadow-[0_4px_16px_rgba(15,23,42,0.08)] light:hover:border-sky-400/40 light:hover:bg-white ${className}`}
        aria-label="Send feedback"
      >
        <MessageSquare className="h-5 w-5 text-sky-400" />
      </button>

      <FeedbackModal />
    </>
  );
}
