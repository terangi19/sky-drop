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
      className={`${FAB_DOCK_POSITION} pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full border border-sky-500/30 bg-[var(--card)] text-sky-400 shadow-[var(--shadow-md)] backdrop-blur-xl transition hover:border-sky-400/45 hover:bg-[var(--card-hover)] active:scale-95 light:border-sky-500/35 light:bg-white light:text-sky-700`}
      aria-label="Page tips"
      title="Take a tour"
    >
      <Lightbulb className="h-6 w-6" strokeWidth={1.75} />
      {hasUnseenTour && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
          <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-400" />
        </span>
      )}
    </button>
  );
}
