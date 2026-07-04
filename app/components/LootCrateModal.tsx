"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { playConfetti, playSuccess, playLegendary } from "../lib/sounds";
import { showToast } from "./Toast";
import { awardXP } from "../lib/xp";
import { trackChallenge } from "../lib/challenges";
import confetti from "canvas-confetti";

type Rarity = "common" | "rare" | "epic" | "legendary";

interface RewardDef {
  rarity: Rarity;
  label: string;
  emoji: string;
  description: string;
}

const RARITY_COLORS: Record<Rarity, string> = {
  common: "border-2 border-white/[0.08]",
  rare: "border-2 border-sky-400/70",
  epic: "border-2 border-sky-400/70",
  legendary: "border-[3px] border-sky-400/70",
};

const RARITY_STARS: Record<Rarity, string> = {
  common: "",
  rare: "★ ★",
  epic: "★ ★ ★",
  legendary: "★ ★ ★ ★ ★",
};

const RARITY_BG: Record<Rarity, string> = {
  common: "from-white/[0.03] to-white/[0.05]",
  rare: "from-sky-950 to-zinc-950",
  epic: "from-sky-950 to-zinc-950",
  legendary: "from-sky-950 to-zinc-950",
};

const PARTICLE_COLORS: Record<Rarity, string[]> = {
  common: ["#a1a1aa"],
  rare: ["#38bdf8", "#0ea5e9", "#7dd3fc"],
  epic: ["#a78bfa", "#8b5cf6", "#c4b5fd", "#7c3aed"],
  legendary: ["#fbbf24", "#f59e0b", "#f97316", "#fcd34d", "#fff"],
};

const MAX_LEGENDARY_BADGES = 5;

function makeParticles(count: number, colors: string[]): { x: number; y: number; delay: number; size: number; color: string; drift: number }[] {
  return Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 200,
    y: (Math.random() - 0.5) * 200,
    delay: Math.random() * 0.6,
    size: 3 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    drift: (Math.random() - 0.5) * 40,
  }));
}

export default function LootCrateModal({ userId, userEmail, onClose, inline }: { userId: string; userEmail: string; onClose: () => void; inline?: boolean }) {
  const [phase, setPhase] = useState<"idle" | "rumbling" | "explosion" | "reveal">("idle");
  const [reward, setReward] = useState<RewardDef | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [shake, setShake] = useState(false);
  const [badgesAwarded, setBadgesAwarded] = useState(0);
  const [testing, setTesting] = useState(false);
  const flashRef = useRef<HTMLDivElement>(null);
  const cardAnim = useMemo(() => {
    if (!reward) return "none";
    const base = "reward-drop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards";
    const glow = reward.rarity === "legendary" ? ", breathe-orange 2.5s ease-in-out infinite" :
                 reward.rarity === "epic" ? ", epic-neon 2.5s ease-in-out infinite" :
                 reward.rarity === "rare" ? ", rare-neon 2s ease-in-out infinite" : "";
    return base + glow;
  }, [reward]);
  const particles = useRef<{ x: number; y: number; delay: number; size: number; color: string; drift: number }[]>([]);
  const rarityRef = useRef<Rarity>("common");
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const q = query(collection(db, "dropTokens"), where("ownerId", "==", userId), where("status", "==", "available"));
    const unsub = onSnapshot(q, (snap) => setTokenCount(snap.docs.length));
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "platform"), (snap) => {
      if (snap.exists()) setBadgesAwarded(snap.data().legendaryBadgesAwarded || 0);
    });
    return () => unsub();
  }, []);

  async function spendOneToken(): Promise<boolean> {
    const q = query(collection(db, "dropTokens"), where("ownerId", "==", userId), where("status", "==", "available"));
    const snap = await getDocs(q);
    const available = snap.docs.filter((d) => d.data().status === "available");
    if (available.length === 0) return false;
    await updateDoc(doc(db, "dropTokens", available[0].id), { status: "used" });
    return true;
  }

  function roll(): Rarity {
    const r = Math.random();
    if (r < 0.50) return "common";
    if (r < 0.80) return "rare";
    if (r < 0.9995) return "epic";
    return "legendary";
  }

  function buildReward(rarity: Rarity): RewardDef {
    switch (rarity) {
      case "common":
        return { rarity, label: "+15 XP", emoji: "", description: "15 XP added to your account." };
      case "rare":
        return { rarity, label: "+40 XP", emoji: "", description: "40 XP added to your account!" };
      case "epic":
        return { rarity, label: "+100 XP", emoji: "", description: "100 XP added to your account!" };
      case "legendary":
        return { rarity, label: "The Five", emoji: "", description: "You earned The Five! Only 5 exist on Sky Drop." };
    }
  }

  async function tryAwardLegendary(): Promise<boolean> {
    try {
      let newCount = 0;
      await runTransaction(db, async (transaction) => {
        const configRef = doc(db, "config", "platform");
        const configSnap = await transaction.get(configRef);
        const awarded = configSnap.data()?.legendaryBadgesAwarded || 0;
        if (awarded >= MAX_LEGENDARY_BADGES) throw new Error("sold_out");
        newCount = awarded + 1;
        transaction.set(configRef, { legendaryBadgesAwarded: newCount }, { merge: true });
        transaction.update(doc(db, "profiles", userId), {
          profileBadge: "legendary",
          badges: arrayUnion("legendary"),
        });
      });

      const profileSnap = await getDoc(doc(db, "profiles", userId));
      const profileData = profileSnap.data();
      const username = profileData?.username || userEmail.split("@")[0];
      await updateDoc(doc(db, "config", "platform"), {
        lastLegendaryClaim: {
          claimedAt: serverTimestamp(),
          username,
          count: newCount,
          allClaimed: newCount >= MAX_LEGENDARY_BADGES,
        },
      });

      return true;
    } catch (e: any) {
      if (e.message === "sold_out") return false;
      throw e;
    }
  }

  function resetCrate() {
    setPhase("idle");
    setReward(null);
  }

  async function handleOpen() {
    if (claiming || (tokenCount === 0 && !testing)) return;
    setClaiming(true);

    if (!testing) {
      const spent = await spendOneToken();
      if (!spent) {
        showToast("No tokens available!", "error");
        setClaiming(false);
        return;
      }
    }

    let rarity: Rarity;
    if (testing) {
      rarity = "legendary";
    } else {
      rarity = roll();
    }

    if (rarity === "legendary" && badgesAwarded >= MAX_LEGENDARY_BADGES) {
      rarityRef.current = "epic";
      setReward(buildReward("epic"));
    } else {
      rarityRef.current = rarity;
      setReward(buildReward(rarity));
    }
    particles.current = makeParticles(18, PARTICLE_COLORS[rarityRef.current]);

    setPhase("rumbling");
    setShake(true);

    if (rarityRef.current === "legendary") {
      await new Promise((r) => setTimeout(r, 2800));
    } else {
      await new Promise((r) => setTimeout(r, 1200));
    }

    setPhase("explosion");
    setShake(false);
    if (!mountedRef.current) return;

    if (flashRef.current) {
      flashRef.current.style.opacity = rarityRef.current === "legendary" ? "0.9" : "0.8";
      setTimeout(() => { if (flashRef.current) flashRef.current.style.opacity = "0"; }, rarityRef.current === "legendary" ? 500 : 300);
    }

    if (!inline) {
      const defaults = { spread: 120, origin: { y: 0.45 } } as const;
      confetti({ ...defaults, particleCount: 50, colors: PARTICLE_COLORS[rarityRef.current] });
      setTimeout(() => confetti({ ...defaults, particleCount: 40, colors: PARTICLE_COLORS[rarityRef.current], angle: 60 }), 80);
      setTimeout(() => confetti({ ...defaults, particleCount: 40, colors: PARTICLE_COLORS[rarityRef.current], angle: 120 }), 160);

      if (rarityRef.current === "legendary") {
        playLegendary();
        setTimeout(() => {
          confetti({ ...defaults, particleCount: 250, spread: 180, colors: ["#fbbf24", "#fff", "#f59e0b", "#fcd34d"], origin: { y: 0.5 } });
        }, 200);
        setTimeout(() => {
          confetti({ ...defaults, particleCount: 120, spread: 160, colors: ["#fbbf24", "#fff"], angle: 90, origin: { y: 0.3 } });
        }, 500);
      } else if (rarityRef.current === "epic") {
        playConfetti();
        setTimeout(() => {
          confetti({ ...defaults, particleCount: 80, spread: 160, colors: ["#fbbf24", "#fff", PARTICLE_COLORS[rarityRef.current][0]] });
        }, 250);
      } else {
        playSuccess();
      }
    }

    if (rarityRef.current === "legendary") {
      await new Promise((r) => setTimeout(r, 1200));
    } else {
      await new Promise((r) => setTimeout(r, 900));
    }

    setPhase("reveal");
    if (!mountedRef.current) return;

    try {
      if (rarity === "legendary") {
        const awarded = await tryAwardLegendary();
        if (awarded) {
          await awardXP(userId, 150);
        } else {
          rarityRef.current = "epic";
          setReward(buildReward("epic"));
          await awardXP(userId, 100);
        }
      } else if (rarity === "epic") {
        await awardXP(userId, 100);
      } else if (rarity === "rare") {
        await awardXP(userId, 40);
      } else {
        await awardXP(userId, 15);
      }
    } catch (e) {
      console.error("Apply reward error:", e);
    }

    await new Promise((r) => setTimeout(r, 300));
    setClaiming(false);
    if (!testing) trackChallenge(userId, "open_crate");
  }

  const badgesRemaining = MAX_LEGENDARY_BADGES - badgesAwarded;

  // ─── INLINE MODE ──────────────────────────────────────────────
  if (inline) {
    return (
      <div className={`${shake ? "animate-[crate-shake_0.12s_ease-in-out_infinite]" : ""}`}>
        <div ref={flashRef} className="pointer-events-none fixed inset-0 z-[10000] bg-white opacity-0 transition-opacity duration-[120ms]" />

        {phase === "idle" && (
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-5">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[var(--foreground)]">🎰 Sky Crate</h2>
                  <button onClick={() => setTesting(!testing)}
                    className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider transition ${testing ? "bg-sky-500/20 text-sky-400" : "bg-zinc-800/50 text-zinc-600 hover:text-zinc-500"}`}
                    title={testing ? "Test mode active — next pull forces legendary without spending tokens" : "Enable test mode"}>
                    {testing ? "TESTING" : "DEV"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">Only {MAX_LEGENDARY_BADGES} copies of 👑 The Five exist. Will you unlock one?</p>
                {badgesRemaining > 0 ? (
                  <p className="mt-1 text-[10px] text-sky-400/80 font-semibold tracking-wide">
                    {badgesAwarded} awarded — {badgesRemaining} remaining
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-[var(--muted)] font-semibold">All copies of 👑 The Five have been claimed.</p>
                )}
                <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--muted)]">
                  <span>⚡ 50% +15 XP</span>
                  <span>🔥 30% +40 XP</span>
                  <span>💥 19.95% +100 XP</span>
                  <span>👑 0.05% The Five</span>
                </div>
                {badgesRemaining > 0 ? (
                  <p className="mt-2 text-[10px] text-[var(--muted)] leading-snug">
                    <span className="text-sky-300 font-semibold drop-shadow-[0_0_6px_rgba(251,191,36,0.5)] animate-[crown-shimmer_4s_ease-in-out_infinite]" title="The rarest collectible on Sky Drop">👑 The Five</span> holders unlock permanent 0% selling fees. Only 5 will ever exist.
                  </p>
                ) : (
                  <p className="mt-2 text-[10px] text-sky-300/60 font-semibold leading-snug">👑 All copies of The Five have been claimed</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <button onClick={handleOpen} disabled={tokenCount === 0 || claiming}
                  className="shrink-0 rounded-lg bg-gradient-to-br from-sky-500 to-sky-500 px-4 py-2.5 text-xs font-bold text-[var(--foreground)] hover:from-sky-400 hover:to-sky-400 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                  🎰 Open — 1 🎁
                </button>
                <span className="text-xs text-[var(--muted)]">🎁 {tokenCount} available</span>
              </div>
            </div>
          </div>
        )}

        {phase === "rumbling" && (
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-5">
            <div className="flex flex-col items-center py-8">
              <div className="absolute w-40 h-40 rounded-full bg-sky-500/20 blur-3xl animate-[glow-pulse_0.6s_ease-in-out_infinite_alternate]" />
              {rarityRef.current === "legendary" && (
                <div className="absolute w-60 h-60 rounded-full bg-sky-500/10 blur-3xl animate-[legendary-suspense_2.8s_ease-in-out_infinite]" />
              )}
              {particles.current.map((p, i) => (
                <div key={i} className="absolute w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: p.color, width: p.size, height: p.size,
                    animation: `particle-orbit-${i % 3} 1.2s ease-in-out ${p.delay}s infinite alternate`,
                    boxShadow: `0 0 6px ${p.color}`,
                  }}
                />
              ))}
              <div className={`text-6xl select-none drop-shadow-[0_0_30px_rgba(251,191,36,0.5)] ${rarityRef.current === "legendary" ? "animate-legendary-suspense-icon" : "animate-[crate-rumble_0.5s_ease-in-out_infinite]"}`}>📦</div>
              <div className="mt-2 flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-1.5 rounded-full bg-sky-400 animate-[crack-grow_0.3s_ease-out_infinite_alternate]"
                    style={{ width: 20 + i * 12, animationDelay: `${i * 0.1}s`, opacity: 0.7 - i * 0.15 }}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-sky-400 font-bold tracking-widest uppercase animate-pulse">Charging...</p>
            </div>
          </div>
        )}

        {phase === "explosion" && (
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-5">
            <div className="relative flex flex-col items-center py-8">
              {rarityRef.current === "legendary" && (
                <>
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 left-1/4 w-0.5 h-full bg-gradient-to-b from-transparent via-sky-300/60 to-transparent animate-[gold-lightning_1.2s_ease-out_forwards]" />
                    <div className="absolute top-0 right-1/3 w-0.5 h-full bg-gradient-to-b from-transparent via-sky-200/40 to-transparent animate-[gold-lightning_1.2s_ease-out_0.2s_forwards]" />
                    <div className="absolute bottom-0 left-1/2 w-0.5 h-full bg-gradient-to-t from-transparent via-sky-300/50 to-transparent animate-[gold-lightning_1.2s_ease-out_0.4s_forwards]" />
                  </div>
                  <div className="absolute w-40 h-40 rounded-full bg-sky-400/10 blur-3xl animate-ping" />
                </>
              )}
              <div className="animate-[blast-wave_0.7s_ease-out_forwards] absolute w-20 h-20 rounded-full border-4 border-sky-300/60" />
              <div className="text-6xl animate-[crate-boom_0.5s_ease-out_forwards] select-none">💥</div>
              <p className="mt-3 text-xs text-sky-200 font-bold tracking-widest uppercase">It's happening!</p>
            </div>
          </div>
        )}

        {phase === "reveal" && reward && (
          <div className={`rounded-xl ${RARITY_COLORS[reward.rarity]} bg-gradient-to-b ${RARITY_BG[reward.rarity]} p-5`}
            style={{ animation: cardAnim }}
          >
            {reward.rarity === "legendary" ? (
              <div className="flex flex-col items-center py-2 text-center">
                <p className="text-[10px] text-sky-400/80 uppercase tracking-[0.25em] font-bold animate-pulse">⚡ Sky Legend ⚡</p>
                <p className="mt-1 text-3xl select-none animate-[legendary-glow_1.5s_ease-in-out_infinite]">👑</p>
                <p className="mt-1 text-xl font-black text-sky-300 animate-legendary-shine" style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, #fff 25%, transparent 50%, #fbbf24 75%, transparent 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>The Five</p>
                <p className="mt-1 text-[10px] text-sky-400/60 font-bold">{badgesAwarded} / {MAX_LEGENDARY_BADGES} Claimed</p>
                <p className="mt-1 text-[9px] text-sky-400/40">Only {badgesRemaining} remain on Sky Drop</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={resetCrate} className="rounded-lg border border-zinc-700 px-4 py-2 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition cursor-pointer">Done</button>
                  {tokenCount > 0 && (
                    <button onClick={handleOpen} disabled={claiming} className="rounded-lg bg-sky-500 px-4 py-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-sky-400 transition cursor-pointer disabled:opacity-40">Open Another</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  {reward.rarity !== "common" && (
                    <p className={`text-xs tracking-widest mb-0.5 ${
                      reward.rarity === "rare" ? "text-sky-400" :
                      reward.rarity === "epic" ? "text-sky-400" : ""
                    }`}>{RARITY_STARS[reward.rarity]}</p>
                  )}
                  <div className="text-2xl mb-1 select-none">
                    {reward.emoji}
                  </div>
                  <h3 className={`text-sm font-black ${
                    reward.rarity === "common" ? "text-[var(--foreground)]" :
                    reward.rarity === "rare" ? "text-sky-300" :
                    reward.rarity === "epic" ? "text-sky-300" : ""
                  }`}>{reward.label}</h3>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">{reward.description}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={resetCrate} className="rounded-lg border border-zinc-700 px-4 py-2 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition cursor-pointer">Done</button>
                  {tokenCount > 0 && (
                    <button onClick={handleOpen} disabled={claiming} className="rounded-lg bg-sky-500 px-4 py-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-sky-400 transition cursor-pointer disabled:opacity-40">Open Another</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── MODAL MODE ──────────────────────────────────────────────
  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center ${rarityRef.current === "legendary" && (phase === "rumbling" || phase === "explosion") ? "bg-black/85 backdrop-blur-xl animate-[screen-shake-legendary_0.08s_ease-in-out_infinite]" : "bg-black/70 backdrop-blur-md"} ${shake ? "animate-[crate-shake_0.12s_ease-in-out_infinite]" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget && phase === "idle") onClose(); }}
    >
      <div ref={flashRef} className="pointer-events-none fixed inset-0 z-[10000] bg-white opacity-0 transition-opacity duration-[120ms]" />

      {phase === "idle" && (
        <button onClick={onClose} className="fixed top-4 right-4 z-[10001] rounded-full bg-zinc-800/80 p-2 text-[var(--muted)] hover:text-[var(--foreground)] transition cursor-pointer">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}

      {phase === "idle" && (
        <div className="relative z-10 mx-auto w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center shadow-2xl animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
          <div className="text-7xl mb-4 select-none">📦</div>
          <h2 className="text-xl font-black text-[var(--foreground)]">🎰 Sky Crate</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Spend 1 Drop Token for a chance to win!</p>
          {badgesRemaining > 0 && (
            <p className="mt-2 text-xs text-sky-400 font-bold">👑 The Five — Only {MAX_LEGENDARY_BADGES} exist. [{badgesAwarded} awarded, {badgesRemaining} remaining]</p>
          )}
          {badgesRemaining <= 0 && (
            <p className="mt-2 text-xs text-[var(--muted)] font-bold">👑 All copies of The Five have been claimed.</p>
          )}
          <div className="mt-6 flex items-center justify-center gap-2">
            <span className="text-sm">🎁</span>
            <span className="text-sm font-bold text-[var(--foreground)]">{tokenCount} available</span>
          </div>
          <button onClick={handleOpen} disabled={tokenCount === 0 || claiming}
            className="mt-4 w-full rounded-xl bg-gradient-to-br from-sky-500 to-sky-500 py-3.5 text-sm font-bold text-[var(--foreground)] transition hover:from-sky-400 hover:to-sky-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            {tokenCount === 0 ? "No Tokens Available" : "🎰 Open Crate — 1 🎁"}
          </button>
          <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-[var(--muted)]">
            <span>50% ⚡ +15 XP</span>
            <span>30% 🔥 +40 XP</span>
            <span>19.95% 💥 +100 XP</span>
            <span>0.05% 👑 The Five</span>
          </div>
          {badgesRemaining > 0 ? (
            <p className="mt-3 text-[10px] text-[var(--muted)] leading-snug text-center">
              <span className="text-sky-300 font-semibold drop-shadow-[0_0_6px_rgba(251,191,36,0.5)] animate-[crown-shimmer_4s_ease-in-out_infinite]" title="The rarest collectible on Sky Drop">👑 The Five</span> holders unlock permanent 0% selling fees. Only 5 will ever exist.
            </p>
          ) : (
            <p className="mt-3 text-[10px] text-sky-300/60 font-semibold leading-snug text-center">👑 All copies of The Five have been claimed</p>
          )}
        </div>
      )}

      {phase === "rumbling" && (
        <div className="relative z-10 mx-auto flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
          <div className="absolute w-40 h-40 rounded-full bg-sky-500/20 blur-3xl animate-[glow-pulse_0.6s_ease-in-out_infinite_alternate]" />
          {rarityRef.current === "legendary" && (
            <div className="absolute w-80 h-80 rounded-full bg-sky-500/10 blur-3xl animate-[legendary-suspense_2.8s_ease-in-out_infinite]" />
          )}
          {particles.current.map((p, i) => (
            <div key={i} className="absolute w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: p.color, width: p.size, height: p.size,
                animation: `particle-orbit-${i % 3} 1.2s ease-in-out ${p.delay}s infinite alternate`,
                boxShadow: `0 0 6px ${p.color}`,
              }}
            />
          ))}
          <div className={`text-8xl select-none drop-shadow-[0_0_30px_rgba(251,191,36,0.5)] ${rarityRef.current === "legendary" ? "animate-legendary-suspense-icon" : "animate-[crate-rumble_0.5s_ease-in-out_infinite]"}`}>📦</div>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 rounded-full bg-sky-400 animate-[crack-grow_0.3s_ease-out_infinite_alternate]"
                style={{ width: 20 + i * 12, animationDelay: `${i * 0.1}s`, opacity: 0.7 - i * 0.15 }}
              />
            ))}
          </div>
          <p className="mt-4 text-sm text-sky-400 font-bold tracking-widest uppercase animate-pulse">Charging...</p>
        </div>
      )}

      {phase === "explosion" && (
        <div className="relative z-10 mx-auto flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
          {rarityRef.current === "legendary" && (
            <>
              <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
                <div className="absolute top-0 left-1/4 w-0.5 h-full bg-gradient-to-b from-transparent via-sky-300/60 to-transparent animate-[gold-lightning_1.4s_ease-out_forwards]" />
                <div className="absolute top-0 right-1/3 w-0.5 h-full bg-gradient-to-b from-transparent via-sky-200/40 to-transparent animate-[gold-lightning_1.4s_ease-out_0.25s_forwards]" />
                <div className="absolute bottom-0 left-1/2 w-0.5 h-full bg-gradient-to-t from-transparent via-sky-300/50 to-transparent animate-[gold-lightning_1.4s_ease-out_0.5s_forwards]" />
                <div className="absolute top-1/3 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-sky-300/40 to-transparent animate-[gold-lightning_1.4s_ease-out_0.15s_forwards]" />
              </div>
              <div className="absolute w-60 h-60 rounded-full bg-sky-400/10 blur-3xl animate-ping" />
            </>
          )}
          <div className="animate-[blast-wave_0.7s_ease-out_forwards] absolute w-20 h-20 rounded-full border-4 border-sky-300/60" />
          {Array.from({ length: rarityRef.current === "legendary" ? 40 : 24 }).map((_, i) => {
            const angle = (i / (rarityRef.current === "legendary" ? 40 : 24)) * 360;
            const dist = rarityRef.current === "legendary" ? 80 + Math.random() * 160 : 60 + Math.random() * 120;
            const color = rarityRef.current === "legendary" ? ["#fbbf24", "#fff", "#f59e0b"][i % 3] :
                          rarityRef.current === "epic" ? ["#a78bfa", "#fff", "#8b5cf6"][i % 3] :
                          rarityRef.current === "rare" ? ["#38bdf8", "#fff", "#0ea5e9"][i % 3] : "#a1a1aa";
            return (
              <div key={i} className="absolute w-2 h-2 rounded-full"
                style={{
                  backgroundColor: color, boxShadow: `0 0 4px ${color}`,
                  animation: `debris-flyout_0.8s_ease-out_forwards`,
                  ['--dx' as string]: `${Math.cos(angle * Math.PI / 180) * dist}px`,
                  ['--dy' as string]: `${Math.sin(angle * Math.PI / 180) * dist}px`,
                  animationDelay: `${Math.random() * 0.15}s`,
                }}
              />
            );
          })}
          <div className="text-8xl animate-[crate-boom_0.5s_ease-out_forwards] select-none">💥</div>
          <p className="mt-4 text-sm text-sky-200 font-bold tracking-widest uppercase">It's happening!</p>
        </div>
      )}

      {phase === "reveal" && reward && (
        <div className="relative z-10 mx-auto w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
          {(reward.rarity === "epic" || reward.rarity === "legendary") && Array.from({ length: reward.rarity === "legendary" ? 20 : 8 }).map((_, i) => (
            <div key={i} className="absolute text-xs select-none animate-[sparkle-float_2.5s_ease-in-out_infinite]"
              style={{
                left: `${5 + Math.random() * 90}%`, top: `${-15 + Math.random() * 30}%`,
                animationDelay: `${i * 0.3}s`,
                color: reward.rarity === "legendary" ? "#fbbf24" : "#a78bfa",
              }}
            >✦</div>
          ))}

          <div className={`rounded-2xl ${RARITY_COLORS[reward.rarity]} bg-gradient-to-b ${RARITY_BG[reward.rarity]} p-8 text-center`}
            style={{ animation: cardAnim }}
          >
            {reward.rarity === "legendary" ? (
              <div className="flex flex-col items-center">
                <p className="text-xs text-sky-400/80 uppercase tracking-[0.3em] font-bold animate-pulse">⚡ Sky Legend ⚡</p>
                <div className="mt-2 text-7xl select-none animate-[legendary-glow_1.5s_ease-in-out_infinite]">👑</div>
                <p className="mt-2 text-3xl font-black text-sky-300 animate-legendary-shine" style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, #fff 25%, transparent 50%, #fbbf24 75%, transparent 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>The Five</p>
                <p className="mt-2 text-sm text-sky-400/60 font-bold">{badgesAwarded} / {MAX_LEGENDARY_BADGES} Claimed</p>
                <p className="mt-1 text-xs text-sky-400/40">Only {badgesRemaining} remain on Sky Drop</p>
                <div className="mt-6 flex gap-3">
                  <button onClick={onClose} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition cursor-pointer">Done</button>
                  <button onClick={() => { setPhase("idle"); setReward(null); }} className="flex-1 rounded-xl bg-sky-500 py-2.5 text-xs font-bold text-[var(--foreground)] hover:bg-sky-400 transition cursor-pointer">Open Another</button>
                </div>
              </div>
            ) : (
              <>
                {reward.rarity !== "common" && (
                  <p className={`text-sm tracking-widest mb-1 ${
                    reward.rarity === "rare" ? "text-sky-400" :
                    reward.rarity === "epic" ? "text-sky-400" : ""
                  }`}>{RARITY_STARS[reward.rarity]}</p>
                )}
                <div className="text-6xl mb-3 select-none">
                  {reward.emoji}
                </div>
                <h3 className={`text-lg font-black ${
                  reward.rarity === "common" ? "text-[var(--foreground)]" :
                  reward.rarity === "rare" ? "text-sky-300" :
                  reward.rarity === "epic" ? "text-sky-300" : ""
                }`}>{reward.label}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{reward.description}</p>
                <div className="mt-6 flex gap-3">
                  <button onClick={onClose} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition cursor-pointer">Done</button>
                  <button onClick={() => { setPhase("idle"); setReward(null); }} className="flex-1 rounded-xl bg-sky-500 py-2.5 text-xs font-bold text-[var(--foreground)] hover:bg-sky-400 transition cursor-pointer">Open Another</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
