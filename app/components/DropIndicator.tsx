"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { User } from "firebase/auth";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import confetti from "canvas-confetti";
import { playConfetti, playSuccess } from "../lib/sounds";
import { showToast } from "./Toast";

const PAGES = ["/", "/trade-feed", "/list-list", "/dashboard", "/messages", "/profile", "/faqs", "/terms", "/privacy", "/about", "/purchases", "/sales", "/watchlist"];

export default function DropIndicator() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [nextDropIn, setNextDropIn] = useState("");
  const [drop, setDrop] = useState<{ active: boolean; targetPage: string | null; claimedBy: string | null; nextDropAt: number | null; sponsoredId?: string | null; sponsoredTitle?: string | null; sponsoredPrice?: string | null; sponsoredImage?: string | null; sponsorSellerEmail?: string | null } | null>(null);
  const [dismissedDropId, setDismissedDropId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    try { const id = localStorage.getItem("dismissedDropId"); if (id) setDismissedDropId(id); } catch (e) { console.error("Failed to read dismissedDropId:", e); }
  }, []);

  async function refreshDrop() {
    try {
      // Check for pending sponsored drops — fire immediately if found
      const sponsorQ = query(collection(db, "sponsoredDrops"), where("status", "==", "pending"));
      const sponsorSnap = await getDocs(sponsorQ);
      if (!sponsorSnap.empty) {
        await generateDrop();
      }

      const snap = await getDoc(doc(db, "drops", "active"));
      if (!snap.exists()) {
        await generateDrop();
        return;
      }
      const data = snap.data();
      const now = Date.now();
      const expiresAt = data.expiresAt?.toMillis?.() || 0;
      const nextAt = data.nextDropAt?.toMillis?.() || 0;
      const active = data.active && expiresAt > now && !data.claimedBy;

      setDrop({ active, targetPage: data.targetPage || null, claimedBy: data.claimedBy || null, nextDropAt: nextAt, sponsoredId: data.sponsoredId || null, sponsoredTitle: data.sponsoredTitle || null, sponsoredPrice: data.sponsoredPrice || null, sponsoredImage: data.sponsoredImage || null, sponsorSellerEmail: data.sponsorSellerEmail || null });

      if ((!active && !data.claimedBy) || nextAt < now) {
        await generateDrop();
      }
    } catch (e) {
      console.error("Refresh drop error:", e);
    }
  }

  async function generateDrop(): Promise<boolean> {
    try {
      const now = Date.now();
      let targetPage = PAGES[Math.floor(Math.random() * PAGES.length)];
      let sponsoredId: string | null = null;

      const sponsorQ = query(collection(db, "sponsoredDrops"), where("status", "==", "pending"));
      const sponsorSnap = await getDocs(sponsorQ);
      let sponsoredTitle: string | null = null;
      let sponsoredPrice: string | null = null;
      let sponsoredImage: string | null = null;
      if (!sponsorSnap.empty) {
        const sponsor = sponsorSnap.docs[0].data();
        targetPage = sponsor.targetPage || targetPage;
        sponsoredId = sponsorSnap.docs[0].id;
        sponsoredTitle = sponsor.listingTitle || null;
        const listingSnap = await getDoc(doc(db, "listings", sponsor.listingId));
        if (listingSnap.exists()) {
          const listing = listingSnap.data();
          sponsoredPrice = listing.price || null;
          sponsoredImage = listing.images?.[0] || listing.imageUrl || listing.image || null;
        }
      }

      const expiresIn = sponsoredId ? 60 * 60 * 1000 : 5 * 60 * 1000;

      await setDoc(doc(db, "drops", "active"), {
        active: true,
        targetPage,
        claimedBy: null,
        claimedAt: null,
        expiresAt: Timestamp.fromMillis(now + expiresIn),
        nextDropAt: Timestamp.fromMillis(now + (360 + Math.random() * 120) * 60 * 1000),
        createdAt: Timestamp.fromMillis(now),
        sponsoredId,
        sponsoredTitle,
        sponsoredPrice,
        sponsoredImage,
        sponsorSellerEmail: sponsoredId ? sponsorSnap.docs[0]?.data()?.sellerEmail || null : null,
      });

      if (sponsoredId) {
        await updateDoc(doc(db, "sponsoredDrops", sponsoredId), { status: "active" });
      }
      return true;
    } catch (e) { console.error("Generate drop error:", e); return false; }
  }

  useEffect(() => {
    refreshDrop();
    return () => {};
  }, []);

  useEffect(() => {
    function tick() {
      if (!drop?.nextDropAt) { setNextDropIn(""); return; }
      const diff = drop.nextDropAt - Date.now();
      if (diff <= 0) { setNextDropIn("Any moment..."); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setNextDropIn(`${h}h ${m}m ${s}s`);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [drop?.nextDropAt]);

  async function handleClaim() {
    if (claiming || claimed || !user) return;
    setClaiming(true);
    try {
      const dropRef = doc(db, "drops", "active");
      const snap = await getDoc(dropRef);
      if (!snap.exists()) throw new Error("No active drop");
      const data = snap.data();
      if (!data.active) throw new Error("Drop is not active");
      if (data.claimedBy) throw new Error("Drop already claimed");
      if (data.expiresAt?.toMillis?.() < Date.now()) throw new Error("Drop expired");
      if (data.sponsorSellerEmail === user.email) throw new Error("You sponsored this drop — your listing is promoted with an orange glow for 3 days plus 2 tokens!");

      await updateDoc(dropRef, { claimedBy: user.uid, claimedAt: serverTimestamp(), active: false });

      for (let i = 0; i < 5; i++) {
        await addDoc(collection(db, "dropTokens"), {
          ownerId: user.uid,
          ownerEmail: user.email,
          originDropId: snap.id,
          status: "available",
          createdAt: serverTimestamp(),
        });
      }

      setClaimed(true);
      playSuccess();
      playConfetti();
      confetti({ particleCount: 80, spread: 80, origin: { y: 0.5 } });
      setShowModal(true);
      setDrop((prev) => prev ? { ...prev, claimedBy: user.uid, active: false } : null);
      await refreshDrop();
    } catch (e: any) {
      console.error("Claim error:", e);
      if ((e as any)?.message?.includes("expired")) {
        showToast("The drop expired. A new one will appear soon!", "info");
      } else {
        showToast(e?.message || "Claim failed", "error");
      }
    }
    setClaiming(false);
  }

  function handleDismissHint() {
    if (drop?.sponsoredId) {
      try { localStorage.setItem("dismissedDropId", drop.sponsoredId); } catch (e) { console.error("Failed to save dismissedDropId:", e); }
      setDismissedDropId(drop.sponsoredId);
    }
  }

  const showTargetPage = drop?.active && !drop?.claimedBy && drop?.targetPage === pathname && user;
  const showActiveHint = drop?.active && !drop?.claimedBy && drop?.targetPage !== pathname;
  const showCountdown = !drop?.active && drop?.nextDropAt;

  return (
    <>
      {showTargetPage && (
        <button onClick={handleClaim} disabled={claiming}
          className="fixed bottom-24 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-lg shadow-lg shadow-orange-500/30 animate-bounce cursor-pointer hover:scale-110 transition-all disabled:opacity-50"
          title="A drop has landed!">🎁</button>
      )}
      {showActiveHint && drop?.sponsoredTitle && drop?.sponsoredId !== dismissedDropId ? (
        <div className="fixed top-16 right-4 z-[10000] flex items-center gap-2 rounded-full border border-orange-500/30 bg-zinc-950/95 backdrop-blur-xl px-3 py-2 text-xs shadow-lg shadow-orange-500/20 animate-breathe-orange transition">
          {drop.sponsoredImage && <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-orange-500/40"><img src={drop.sponsoredImage} className="h-full w-full object-cover" /></div>}
          <button onClick={() => { if (drop.targetPage) router.push(drop.targetPage); }} className="text-left min-w-0 cursor-pointer">
            <p className="truncate font-bold text-orange-300">{drop.sponsoredTitle}</p>
            {drop.sponsoredPrice && <p className="text-[var(--muted)]">${drop.sponsoredPrice}</p>}
          </button>
          <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-400 animate-pulse">🎁</span>
          <button onClick={handleDismissHint} className="shrink-0 ml-0.5 rounded-full p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] transition cursor-pointer" title="Dismiss">✕</button>
        </div>
      ) : showActiveHint && (
        <div className="fixed top-16 right-4 z-[10000] rounded-full border border-amber-500/20 bg-zinc-950/95 backdrop-blur-xl px-4 py-2 text-xs text-amber-400 shadow-lg animate-fade-in-up">
          <span className="mr-1.5">🎁</span>
          {user ? "Drop live — find it!" : "Sign in to claim drop"}
        </div>
      )}
      {showCountdown && nextDropIn && (
        <div className="fixed top-16 right-4 z-[10000] rounded-full border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl px-4 py-2 text-xs text-[var(--muted)] shadow-lg animate-fade-in-up">
          <span className="mr-1.5">🎁</span>
          Next in <span className="font-bold text-amber-400">{nextDropIn}</span>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-center shadow-2xl animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-4">🎁</div>
            <h2 className="text-lg font-black text-[var(--foreground)]">Drop Claimed!</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">You found the drop! <strong className="text-amber-400">5 Drop Tokens</strong> have been added to your account.</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Use them on your dashboard to boost your listings for free.</p>
            <button onClick={() => setShowModal(false)} className="mt-6 w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-amber-400">Awesome!</button>
          </div>
        </div>
      )}
    </>
  );
}
