"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

interface LegendaryClaim {
  claimedAt: Timestamp;
  username: string;
  count: number;
  allClaimed: boolean;
}

export default function LegendaryClaimNotification() {
  const [claim, setClaim] = useState<LegendaryClaim | null>(null);
  const [visible, setVisible] = useState(false);
  const [animState, setAnimState] = useState<"idle" | "entering" | "showing" | "exiting">("idle");
  const prevRef = useRef<string>("");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "platform"), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const lastClaim = data.lastLegendaryClaim as LegendaryClaim | undefined;
      if (!lastClaim) return;

      const key = JSON.stringify(lastClaim);
      if (key === prevRef.current) return;
      prevRef.current = key;

      setClaim(lastClaim);
      setAnimState("entering");
      setTimeout(() => setAnimState("showing"), 800);
      setTimeout(() => setAnimState("exiting"), 7000);
      setTimeout(() => setAnimState("idle"), 7800);
    });
    return () => unsub();
  }, []);

  if (animState === "idle" || !claim) return null;

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-none">
          {/* Overlay glow */}
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-500 ${
            animState === "entering" ? "opacity-0" : "opacity-100"
          }`} />

          {/* Content */}
          <div className="relative z-10 flex items-center justify-center h-full px-4">
            <div className={`
              max-w-lg w-full rounded-2xl border border-amber-500/20 bg-zinc-950/95 backdrop-blur-2xl p-8 text-center shadow-2xl
              transition-all duration-500
              ${animState === "entering" ? "scale-75 opacity-0 translate-y-8" : "scale-100 opacity-100 translate-y-0"}
              ${animState === "exiting" ? "scale-95 opacity-0 translate-y-4" : ""}
            `}
              style={{
                boxShadow: "0 0 60px rgba(251,191,36,0.1), 0 0 120px rgba(14,165,233,0.05)",
              }}
            >
              {claim.allClaimed ? (
                <>
                  <div className="text-3xl mb-3 select-none" style={{ animation: "legendary-glow 1.5s ease-in-out infinite" }}>👑</div>
                  <h2 className="text-lg font-black text-amber-300 tracking-wide">
                    👑 THE FIVE
                  </h2>
                  <h2 className="text-lg font-black text-amber-300 tracking-wide">
                    HAVE BEEN CLAIMED
                  </h2>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    {[1,2,3,4,5].map((i) => (
                      <span key={i} className="text-lg text-amber-400/60">👑</span>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-[var(--muted)] leading-relaxed">
                    👑 The Five are gone forever.<br />
                    Those who hold one are now part of Sky Drop history.
                  </p>
                  <div className="mt-4 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
                </>
              ) : (
                <>
                  <div className="text-2xl mb-2 select-none">⚡</div>
                  <h2 className="text-sm font-black text-amber-300 tracking-widest uppercase">
                    👑 The Five Has Been Obtained
                  </h2>
                  <p className="mt-4 text-xl font-black text-[var(--foreground)]">
                    @{claim.username}
                  </p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    claimed 👑 The Five
                  </p>
                  <div className="mt-5 flex items-center justify-center gap-3">
                    {[1,2,3,4,5].map((i) => (
                      <span key={i} className={`text-base transition-all duration-300 ${
                        i <= claim.count ? "text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" : "text-zinc-700"
                      }`}>
                        👑
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-sm font-bold text-amber-400/80">
                    {claim.count} / 5 Claimed
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{5 - claim.count} remaining</p>
                  <div className="mt-4 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
                </>
              )}
            </div>
          </div>
        </div>
  );
}
