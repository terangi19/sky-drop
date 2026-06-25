"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";

interface SellerInsight {
  type: "price" | "title" | "images" | "description" | "category";
  listingId: string;
  listingTitle: string;
  recommendation: string;
  impact: "high" | "medium" | "low";
  estimatedImprovement: string;
}

interface SellerStats {
  totalListings: number;
  totalViews: number;
  totalSaves: number;
  averageResponseTime: number;
  saveRate: number;
  topPerformingCategory: string;
}

export default function SellerInsightsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<SellerInsight[]>([]);
  const [stats, setStats] = useState<SellerStats | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadInsights(user.email || "");
      } else {
        router.push("/login");
      }
    });
    return () => unsub();
  }, [router]);

  async function loadInsights(userEmail: string) {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/seller-insights", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setInsights(data.insights || []);
      setStats(data.stats || null);
    } catch (e) {
      console.error("Failed to load seller insights:", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background />
        <Navbar />
        <ThemeToggle />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="h-8 w-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-zinc-400">Loading insights...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <ThemeToggle />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-white mb-2">Seller Insights</h1>
          <p className="text-sm text-zinc-400">AI-powered recommendations to help you sell faster</p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl border border-sky-500/20 bg-black/60 p-4">
              <p className="text-[10px] uppercase tracking-wider text-sky-400 mb-1">Total Listings</p>
              <p className="text-2xl font-bold text-white">{stats.totalListings}</p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-black/60 p-4">
              <p className="text-[10px] uppercase tracking-wider text-sky-400 mb-1">Total Views</p>
              <p className="text-2xl font-bold text-white">{stats.totalViews.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-black/60 p-4">
              <p className="text-[10px] uppercase tracking-wider text-sky-400 mb-1">Total Saves</p>
              <p className="text-2xl font-bold text-white">{stats.totalSaves.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-black/60 p-4">
              <p className="text-[10px] uppercase tracking-wider text-sky-400 mb-1">Save Rate</p>
              <p className="text-2xl font-bold text-white">{stats.saveRate}%</p>
            </div>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Recommendations</h2>
          
          {insights.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-black/40 p-8 text-center">
              <p className="text-sm text-zinc-400">No recommendations yet. Add more listings to get insights!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map((insight) => (
                <div
                  key={`${insight.listingId}-${insight.type}`}
                  onClick={() => router.push(`/post/listing/${insight.listingId}`)}
                  className="rounded-xl border border-white/[0.06] bg-black/40 p-4 cursor-pointer transition hover:border-sky-500/30 hover:bg-black/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          insight.impact === "high" ? "bg-red-500/20 text-red-400" :
                          insight.impact === "medium" ? "bg-amber-500/20 text-amber-400" :
                          "bg-sky-500/20 text-sky-400"
                        }`}>
                          {insight.impact.toUpperCase()} IMPACT
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                          {insight.type}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white mb-1">{insight.listingTitle}</p>
                      <p className="text-xs text-zinc-400">{insight.recommendation}</p>
                    </div>
                    <svg className="h-5 w-5 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.02] to-sky-500/[0.01] p-6">
          <h3 className="text-sm font-bold text-white mb-3">💡 General tips</h3>
          <ul className="space-y-2 text-xs text-zinc-400">
            <li>• More photos help buyers see exactly what they&apos;re getting</li>
            <li>• Responding to messages quickly keeps buyers engaged</li>
            <li>• Clear, specific descriptions reduce back-and-forth questions</li>
            <li>• Enabling shipping opens your listing to buyers outside your region</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
