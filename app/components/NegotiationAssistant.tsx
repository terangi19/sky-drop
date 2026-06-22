"use client";

import { useEffect, useState } from "react";
import { auth } from "../lib/firebase";

interface NegotiationSuggestion {
  type: "price_suggestion" | "counter_offer" | "deal_insight";
  message: string;
  suggestedPrice?: number;
  reasoning: string;
  confidence: number;
}

interface NegotiationAssistantProps {
  currentPrice: number;
  originalPrice: number;
  listingTitle: string;
  listingId: string;
  conversationPartner: string;
}

export default function NegotiationAssistant({
  currentPrice,
  originalPrice,
  listingTitle,
  listingId,
  conversationPartner,
}: NegotiationAssistantProps) {
  const [suggestions, setSuggestions] = useState<NegotiationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  async function fetchSuggestions() {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/negotiation-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPrice,
          originalPrice,
          listingTitle,
          listingId,
          conversationPartner,
        }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (e) {
      console.error("Failed to fetch negotiation suggestions:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen && suggestions.length === 0) {
      fetchSuggestions();
    }
  }, [isOpen]);

  if (currentPrice === originalPrice) {
    return null; // Only show when there's an active negotiation
  }

  return (
    <div className="border-t border-sky-500/20 bg-gradient-to-br from-sky-500/[0.02] to-sky-500/[0.01] p-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-bold text-sky-400 hover:text-sky-300 transition"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span>Smart Negotiation Assistant</span>
        {isOpen ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <div className="h-4 w-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <span>Analyzing negotiation...</span>
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-xs text-zinc-400">No suggestions available at this time.</p>
          ) : (
            suggestions.map((suggestion, index) => (
              <div
                key={index}
                className="rounded-lg border border-sky-500/20 bg-black/40 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20">
                    {suggestion.type === "price_suggestion" && "💰"}
                    {suggestion.type === "counter_offer" && "🤝"}
                    {suggestion.type === "deal_insight" && "📊"}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-white mb-1">{suggestion.message}</p>
                    <p className="text-[10px] text-zinc-400 mb-2">{suggestion.reasoning}</p>
                    {suggestion.suggestedPrice && (
                      <button className="text-[10px] font-bold text-sky-400 hover:text-sky-300 transition">
                        Suggest ${suggestion.suggestedPrice.toFixed(2)}
                      </button>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 flex-1 rounded-full bg-white/10">
                        <div
                          className="h-1 rounded-full bg-gradient-to-r from-sky-500 to-sky-400"
                          style={{ width: `${suggestion.confidence}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-sky-400">{suggestion.confidence}% confidence</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
