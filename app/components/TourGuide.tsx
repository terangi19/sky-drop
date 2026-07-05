"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for the target element
  position?: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: Record<string, TourStep[]> = {
  "/": [
    {
      id: "hero",
      title: "Search Marketplace",
      description: "Use the search bar to find items you're looking for, or browse by category below.",
      position: "bottom",
    },
    {
      id: "categories",
      title: "Browse Categories",
      description: "Explore different categories like Cars, Tech, Gaming, and more to find what you need.",
      position: "bottom",
    },
    {
      id: "sell-button",
      title: "Sell Items",
      description: "Click here to create a new listing. You can use Āwhina AI to help you fill in the details.",
      position: "bottom",
    },
  ],
  "/post": [
    {
      id: "method-selection",
      title: "Choose Your Method",
      description: "Select Āwhina AI for quick listing creation, or Manual for full control over every field.",
      position: "bottom",
    },
  ],
  "/post/ai": [
    {
      id: "progress",
      title: "Track Your Progress",
      description: "This bar shows how complete your listing is. Fill in more fields to reach 100%.",
      position: "bottom",
    },
    {
      id: "photo-upload",
      title: "Add Photos",
      description: "Upload clear photos of your item. Good photos help your listing sell faster.",
      position: "bottom",
    },
    {
      id: "ai-chat",
      title: "Āwhina Assistant",
      description: "Describe your item here and Āwhina will fill in the title, description, and other details for you.",
      position: "top",
    },
  ],
  "/messages": [
    {
      id: "conversations",
      title: "Your Messages",
      description: "All your conversations with buyers and sellers appear here. Click to view and reply.",
      position: "right",
    },
  ],
  "/watchlist": [
    {
      id: "saved-items",
      title: "Your Watchlist",
      description: "Items you've saved appear here. Track price drops and quickly access favorites.",
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
      id": "listings",
      title: "Your Listings",
      description: "Manage all your listings from here. Edit, delete, or view performance.",
      position: "bottom",
    },
  ],
};

export default function TourGuide() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenTour, setHasSeenTour] = useState(false);

  const steps = TOUR_STEPS[pathname] || [];

  useEffect(() => {
    // Check if user has seen this page's tour
    const seenTours = localStorage.getItem("seenTours") || "{}";
    const parsed = JSON.parse(seenTours);
    setHasSeenTour(!!parsed[pathname]);
  }, [pathname]);

  const handleStartTour = () => {
    setIsOpen(true);
    setCurrentStep(0);
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsOpen(false);
    setCurrentStep(0);
    
    // Mark this tour as seen
    const seenTours = localStorage.getItem("seenTours") || "{}";
    const parsed = JSON.parse(seenTours);
    parsed[pathname] = true;
    localStorage.setItem("seenTours", JSON.stringify(parsed));
    setHasSeenTour(true);
  };

  const handleSkip = () => {
    handleComplete();
  };

  // Don't show tip button if no tour is available for this page
  if (steps.length === 0) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        onClick={handleStartTour}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-sky-500/30 bg-gradient-to-r from-sky-500 to-sky-400 text-white shadow-lg shadow-sky-500/30 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-sky-500/40 active:scale-95"
        title="Take a tour"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        {!hasSeenTour && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-sky-400"></span>
          </span>
        )}
      </button>
    );
  }

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="max-w-md w-full rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-sky-500/5 p-6 shadow-[0_0_50px_rgba(14,165,233,0.2)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/20 text-sm font-bold text-sky-300">
              💡
            </span>
            <h3 className="text-lg font-bold text-white">{step.title}</h3>
          </div>
          <button
            onClick={handleSkip}
            className="text-xs text-zinc-400 hover:text-zinc-300 transition"
          >
            Skip tour
          </button>
        </div>

        <p className="text-sm leading-relaxed text-zinc-300 mb-6">{step.description}</p>

        <div className="mb-4 flex items-center gap-2">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? "bg-sky-400"
                  : index < currentStep
                  ? "bg-sky-500/50"
                  : "bg-zinc-700"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-xs font-bold text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            Step {currentStep + 1} of {steps.length}
          </span>
          <button
            onClick={handleNext}
            className="rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:brightness-110 active:scale-[0.97]"
          >
            {currentStep === steps.length - 1 ? "Complete" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
