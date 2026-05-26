"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { doc, updateDoc, increment } from "firebase/firestore";
import { getDailyRef, getOrCreateDaily, type DailyChallengesData, STREAK_REWARDS, pickDailyChallenges } from "../lib/challenges";
import { awardXP } from "../lib/xp";
import { showToast } from "./Toast";

export default function DailyChallenges({ userId }: { userId: string }) {
  const [data, setData] = useState<DailyChallengesData | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    getOrCreateDaily(userId, today).then((result) => {
      if (result && Array.isArray(result.challenges)) setData(result);
    }).catch(() => {});

    const unsub = onSnapshot(getDailyRef(userId), (snap) => {
      if (!snap.exists()) return;
      const snapshotData = snap.data() as DailyChallengesData;
      const challenges = Array.isArray(snapshotData.challenges) ? snapshotData.challenges : [];
      setData({ ...snapshotData, challenges });
    }, (err) => {
      console.error("DailyChallenges listener error:", err);
    });
    return () => unsub();
  }, [userId]);

  async function handleClaim(challengeId: string) {
    if (!data || !Array.isArray(data.challenges) || claiming) return;
    setClaiming(challengeId);
    try {
      const idx = data.challenges.findIndex((c) => c.id === challengeId);
      if (idx === -1) return;

      await updateDoc(doc(db, "users", userId, "challenges", "daily"), {
        [`challenges.${idx}.claimed`]: true,
      });

      await awardXP(userId, data.challenges[idx].reward, { capped: true });
      showToast(`+${data.challenges[idx].reward} XP!`, "success");

      const allClaimed = data.challenges.every((c, i) => i === idx ? true : c.claimed);
      if (allClaimed) {
        const streakKey = Object.keys(STREAK_REWARDS).map(Number).find((s) => s === (data.streak + 1));
        if (streakKey) {
          showToast(`${STREAK_REWARDS[streakKey].icon} ${data.streak + 1}-day streak! ${STREAK_REWARDS[streakKey].label}`, "success");
        } else if ((data.streak + 1) % 7 === 0) {
          showToast(`🔥 ${data.streak + 1}-day streak!`, "success");
        }
      }
    } catch (e) {
      console.error("Claim error:", e);
    }
    setClaiming(null);
  }

  const challenges = data && Array.isArray(data.challenges) ? data.challenges : [];
  if (!data || challenges.length === 0) return null;

  const allDone = challenges.every((c) => c.claimed);
  const streakReward = Object.entries(STREAK_REWARDS)
    .map(([days, r]) => ({ days: Number(days), ...r }))
    .filter((r) => data.streak >= r.days)
    .pop();

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-[var(--foreground)]">📋 Daily Challenges</h2>
        <div className="flex items-center gap-2">
          {data.streak > 0 && (
            <span className="text-[10px] text-orange-400 font-bold">🔥 {data.streak}-day streak</span>
          )}
          <span className="text-[10px] text-[var(--muted)]">{data.challenges.filter((c) => c.claimed).length}/{data.challenges.length}</span>
        </div>
      </div>

      {allDone ? (
        <p className="text-xs text-emerald-400 font-bold text-center py-3">✅ All challenges complete for today!</p>
      ) : (
        <div className="space-y-2.5">
          {challenges.map((c) => {
            const pct = Math.min((c.progress / c.target) * 100, 100);
            return (
              <div key={c.id} className={`rounded-lg border ${c.claimed ? "border-zinc-800/30 opacity-50" : "border-zinc-800/50 bg-zinc-800/10"} px-3.5 py-2.5`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm shrink-0">{c.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-bold truncate ${c.completed ? "text-emerald-400" : "text-[var(--foreground)]"}`}>
                        {c.label}
                        {c.completed && !c.claimed && <span className="ml-1 text-emerald-400">✓</span>}
                        {c.claimed && <span className="ml-1 text-zinc-600">✓</span>}
                      </p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${c.claimed ? "bg-zinc-700" : c.completed ? "bg-emerald-500" : "bg-sky-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-[9px] text-[var(--muted)]">
                        {c.claimed ? "Done" : `${c.progress}/${c.target}`}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 ml-2">
                    {c.claimed ? (
                      <span className="text-[10px] text-zinc-600">+{c.reward} XP</span>
                    ) : c.completed ? (
                      <button
                        onClick={() => handleClaim(c.id)}
                        disabled={claiming === c.id}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {claiming === c.id ? "..." : `Claim +${c.reward}`}
                      </button>
                    ) : (
                      <span className="text-[10px] text-zinc-600">+{c.reward} XP</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {streakReward && (
        <div className="mt-3 rounded-lg bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20 px-3 py-2 text-center">
          <p className="text-[10px] text-orange-400 font-bold">
            {streakReward.icon} {data.streak}-day streak — {streakReward.label}
          </p>
        </div>
      )}
    </div>
  );
}
