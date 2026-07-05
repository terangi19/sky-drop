"use client";

import { Lightbulb } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTourGuide } from "../contexts/TourGuideContext";
import { FAB_DOCK_POSITION } from "../lib/floating-ui-layout";

/** Tips-only FAB for signed-out users on pages with a tour (logged-in users use FloatingActionDock). */
export default function GuestTourFab() {
  const { user, loading } = useAuth();
  const { hasTour, hasUnseenTour, startTour } = useTourGuide();

  if (loading || user || !hasTour) return null;

  return (
    <button
      type="button"
      onClick={startTour}
      className={`${FAB_DOCK_POSITION} pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full border border-sky-500/30 bg-gradient-to-br from-sky-500/20 to-sky-500/10 text-sky-300 shadow-lg shadow-sky-500/20 backdrop-blur-xl transition-all hover:scale-105 hover:border-sky-400/45 active:scale-95`}
      aria-label="Page tips"
      title="Take a tour"
    >
      <Lightbulb className="h-6 w-6" strokeWidth={1.75} />
      {hasUnseenTour && (
        <span className="absolute flex h-3 w-3 -right-0.5 -top-0.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-400" />
        </span>
      )}
    </button>
  );
}
