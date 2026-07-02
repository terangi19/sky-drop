"use client";

import { MessageSquare } from "lucide-react";
import { useFeedback } from "../contexts/FeedbackContext";
import FeedbackModal from "./FeedbackModal";

export default function FeedbackButton() {
  const { openFeedback } = useFeedback();

  return (
    <>
      {/* Floating feedback button - desktop only */}
      <button
        onClick={openFeedback}
        className="hidden md:flex fixed bottom-6 right-6 items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-3 rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 z-[60]"
        aria-label="Send feedback"
      >
        <MessageSquare className="h-5 w-5" />
        <span className="text-sm font-medium">Feedback</span>
      </button>

      {/* Mobile feedback is in the profile menu */}

      <FeedbackModal />
    </>
  );
}
