"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export type TourStep = {
  id: string;
  title: string;
  description: string;
  target?: string;
  position?: "top" | "bottom" | "left" | "right";
};

const TOUR_STEPS: Record<string, TourStep[]> = {
  "/": [
    {
      id: "hero",
      title: "Search Marketplace",
      description:
        "Use the search bar to find items you're looking for, or browse by category below.",
      position: "bottom",
    },
    {
      id: "categories",
      title: "Browse Categories",
      description:
        "Explore different categories like Cars, Tech, Gaming, and more to find what you need.",
      position: "bottom",
    },
    {
      id: "sell-button",
      title: "Sell Items",
      description:
        "Click here to create a new listing. You can use Āwhina AI to help you fill in the details.",
      position: "bottom",
    },
  ],
  "/post": [
    {
      id: "method-selection",
      title: "Choose Your Method",
      description:
        "Select Āwhina AI for quick listing creation, or Manual for full control over every field.",
      position: "bottom",
    },
  ],
  "/post/ai": [
    {
      id: "progress",
      title: "Track Your Progress",
      description:
        "This bar shows how complete your listing is. Fill in more fields to reach 100%.",
      position: "bottom",
    },
    {
      id: "photo-upload",
      title: "Add Photos",
      description:
        "Upload clear photos of your item. Good photos help your listing sell faster.",
      position: "bottom",
    },
    {
      id: "ai-chat",
      title: "Āwhina Assistant",
      description:
        "Describe your item here and Āwhina will fill in the title, description, and other details for you.",
      position: "top",
    },
  ],
  "/messages": [
    {
      id: "conversations",
      title: "Your Messages",
      description:
        "All your conversations with buyers and sellers appear here. Click to view and reply.",
      position: "right",
    },
  ],
  "/watchlist": [
    {
      id: "saved-items",
      title: "Your Watchlist",
      description:
        "Items you've saved appear here. Track price drops and quickly access favorites.",
      position: "bottom",
    },
  ],
  "/dashboard": [
    {
      id: "stats",
      title: "Your Stats",
      description: "View your sales, active listings, and seller rating at a glance.",
      position: "bottom",
    },
    {
      id: "listings",
      title: "Your Listings",
      description: "Manage all your listings from here. Edit, delete, or view performance.",
      position: "bottom",
    },
  ],
};

type TourGuideContextValue = {
  hasTour: boolean;
  hasUnseenTour: boolean;
  startTour: () => void;
};

const TourGuideContext = createContext<TourGuideContextValue | undefined>(undefined);

export function TourGuideProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const steps = TOUR_STEPS[pathname] || [];
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenTour, setHasSeenTour] = useState(true);

  useEffect(() => {
    try {
      const seenTours = localStorage.getItem("seenTours") || "{}";
      const parsed = JSON.parse(seenTours) as Record<string, boolean>;
      setHasSeenTour(!!parsed[pathname]);
    } catch {
      setHasSeenTour(false);
    }
  }, [pathname]);

  const completeTour = useCallback(() => {
    setIsOpen(false);
    setCurrentStep(0);
    try {
      const seenTours = localStorage.getItem("seenTours") || "{}";
      const parsed = JSON.parse(seenTours) as Record<string, boolean>;
      parsed[pathname] = true;
      localStorage.setItem("seenTours", JSON.stringify(parsed));
      setHasSeenTour(true);
    } catch {
      /* ignore */
    }
  }, [pathname]);

  const startTour = useCallback(() => {
    if (steps.length === 0) return;
    setCurrentStep(0);
    setIsOpen(true);
  }, [steps.length]);

  const value = useMemo(
    () => ({
      hasTour: steps.length > 0,
      hasUnseenTour: steps.length > 0 && !hasSeenTour,
      startTour,
    }),
    [hasSeenTour, startTour, steps.length]
  );

  const step = steps[currentStep];

  return (
    <TourGuideContext.Provider value={value}>
      {children}
      {isOpen && step && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-sky-500/5 p-6 shadow-[0_0_50px_rgba(14,165,233,0.2)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/20 text-sm font-bold text-sky-300">
                  💡
                </span>
                <h3 className="text-lg font-bold text-white">{step.title}</h3>
              </div>
              <button
                type="button"
                onClick={completeTour}
                className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Close tour"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm leading-relaxed text-zinc-300">{step.description}</p>
            <div className="mt-6 flex items-center justify-between">
              <div className="flex gap-1">
                {steps.map((s, i) => (
                  <div
                    key={s.id}
                    className={`h-1.5 rounded-full transition-all ${
                      i === currentStep ? "w-6 bg-sky-400" : "w-1.5 bg-zinc-600"
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((s) => s - 1)}
                    className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/5"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (currentStep < steps.length - 1) {
                      setCurrentStep((s) => s + 1);
                    } else {
                      completeTour();
                    }
                  }}
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-400"
                >
                  {currentStep < steps.length - 1 ? "Next" : "Got it"}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={completeTour}
              className="mt-3 w-full text-center text-xs text-zinc-500 transition hover:text-zinc-400"
            >
              Skip tour
            </button>
          </div>
        </div>
      )}
    </TourGuideContext.Provider>
  );
}

export function useTourGuide() {
  const ctx = useContext(TourGuideContext);
  if (!ctx) {
    return { hasTour: false, hasUnseenTour: false, startTour: () => {} };
  }
  return ctx;
}
