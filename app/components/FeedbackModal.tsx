"use client";

import { useState } from "react";
import { X, Bug, Lightbulb, Frown, Heart } from "lucide-react";
import { funnel } from "../lib/funnel-events";
import { useAuth } from "../contexts/AuthContext";
import { useFeedback } from "../contexts/FeedbackContext";

export default function FeedbackModal() {
  const { isOpen, closeFeedback } = useFeedback();
  const [type, setType] = useState<"bug" | "suggestion" | "confusing" | "liked">("bug");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { user } = useAuth();

  const feedbackTypes = [
    { id: "bug" as const, label: "Bug", icon: Bug, color: "text-red-400" },
    { id: "suggestion" as const, label: "Suggestion", icon: Lightbulb, color: "text-yellow-400" },
    { id: "confusing" as const, label: "Something was confusing", icon: Frown, color: "text-orange-400" },
    { id: "liked" as const, label: "Something I liked", icon: Heart, color: "text-pink-400" },
  ];

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshot(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;

    setIsSubmitting(true);

    // Auto-capture context
    const context = {
      page: window.location.pathname,
      listingId: extractListingId(),
      browser: navigator.userAgent,
      device: detectDevice(),
      screen: `${window.screen.width}x${window.screen.height}`,
      appVersion: "1.0.0", // Could be from package.json
    };

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          message,
          screenshot,
          ...context,
        }),
      });

      if (response.ok) {
        // Track analytics
        if (user?.uid) {
          funnel.feedbackSubmitted(user.uid, type, context.page);
        }

        setSubmitted(true);
        setTimeout(() => {
          closeFeedback();
          setSubmitted(false);
          setMessage("");
          setScreenshot(null);
          setType("bug");
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const extractListingId = (): string | null => {
    const match = window.location.pathname.match(/\/post\/listing\/([^\/]+)/);
    return match ? match[1] : null;
  };

  const detectDevice = (): string => {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return "mobile";
    if (/tablet/i.test(ua)) return "tablet";
    return "desktop";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md border border-[var(--border)]">
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Help improve Sky Drop</h2>
          <button
            onClick={closeFeedback}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {submitted ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-sky-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="h-8 w-8 text-sky-400" />
              </div>
              <p className="text-[var(--foreground)] font-medium mb-2">Thanks!</p>
              <p className="text-[var(--muted)] text-sm">Your feedback helps make Sky Drop better.</p>
            </div>
          ) : (
            <>
              <p className="text-[var(--foreground)] mb-6">What's on your mind?</p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {feedbackTypes.map((ft) => {
                  const Icon = ft.icon;
                  const isSelected = type === ft.id;
                  return (
                    <button
                      key={ft.id}
                      onClick={() => setType(ft.id)}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "border-sky-500/50 bg-sky-500/10 text-sky-400"
                          : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${isSelected ? ft.color : ""}`} />
                      <span className="text-sm font-medium">{ft.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mb-6">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us more..."
                  className="w-full h-32 px-4 py-3 bg-[var(--card-hover)] border border-[var(--border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10 resize-none"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm text-[var(--muted)] mb-2">
                  Screenshot (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotUpload}
                  className="w-full text-sm text-[var(--muted)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sky-500/10 file:text-sky-400 hover:file:bg-sky-500/20"
                />
                {screenshot && (
                  <div className="mt-2 relative">
                    <img
                      src={screenshot}
                      alt="Screenshot"
                      className="w-full h-32 object-cover rounded-lg border border-[var(--border)]"
                    />
                    <button
                      onClick={() => setScreenshot(null)}
                      className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-md hover:bg-black/70"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={!message.trim() || isSubmitting}
                className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-500/30 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 active:scale-95"
              >
                {isSubmitting ? "Sending..." : "Send Feedback"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
