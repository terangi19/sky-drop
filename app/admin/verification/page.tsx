"use client";

import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import { AwhinaUnderHeader } from "../../components/AwhinaOnlineBadge";
import ThemeToggle from "../../components/ThemeToggle";
import { showToast } from "../../components/Toast";
import { adminFetch } from "../../lib/admin-fetch.client";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  User,
} from "firebase/auth";
import {
  auth,
  db,
  onAuthStateChanged,
} from "../../lib/firebase";
import { isAdminEmail } from "../../lib/admin-check";

type Tab = "listings" | "digital";

export default function AdminVerificationPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("listings");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [digitalListings, setDigitalListings] = useState<any[]>([]);
  const [pendingListings, setPendingListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectInputs, setRejectInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (tab === "digital") {
      setLoading(true);
      const q = query(collection(db, "tradePosts"), where("type", "==", "digital"));
      const unsub = onSnapshot(q, (snap) => {
        setDigitalListings(snap.docs.filter((d) => d.data().status === "pending_review").map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => {
        console.error("Failed to load digital listings:", err);
        setLoading(false);
      });
      return () => unsub();
    } else if (tab === "listings") {
      setLoading(true);
      const q = query(collection(db, "listings"), where("status", "==", "pending_review"), orderBy("createdAt", "desc"));
      const unsub = onSnapshot(q, (snap) => {
        setPendingListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => {
        console.error("Failed to load pending listings:", err);
        setLoading(false);
      });
      return () => unsub();
    }
  }, [tab]);

  const isAdmin = isAdminEmail(user?.email);

  async function handleApprove(profileId: string) {
    if (!confirm("Approve this user's KYC verification?")) return;
    try {
      await adminFetch("/api/admin/kyc-review", {
        method: "POST",
        body: JSON.stringify({ uid: profileId, action: "approve" }),
      });
      showToast("KYC approved.", "success");
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Approve failed", "error");
    }
  }

  async function handleReject(profileId: string) {
    const reason = rejectInputs[profileId]?.trim();
    if (!reason) { showToast("Enter a rejection reason.", "error"); return; }
    try {
      await adminFetch("/api/admin/kyc-review", {
        method: "POST",
        body: JSON.stringify({ uid: profileId, action: "reject", reason }),
      });
      setRejectInputs((prev) => { const next = { ...prev }; delete next[profileId]; return next; });
      showToast("KYC rejected.", "success");
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Reject failed", "error");
    }
  }

  async function handleApproveDigital(listingId: string) {
    if (!confirm("Approve this digital listing?")) return;
    try {
      await adminFetch("/api/admin/verify-listing", {
        method: "POST",
        body: JSON.stringify({ listingId, action: "approve", type: "digital" }),
      });
      showToast("Digital listing approved.", "success");
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Approve failed", "error");
    }
  }

  async function handleRejectDigital(listingId: string) {
    const reason = rejectInputs[`dig_${listingId}`]?.trim();
    if (!reason) { showToast("Enter a rejection reason.", "error"); return; }
    try {
      await adminFetch("/api/admin/verify-listing", {
        method: "POST",
        body: JSON.stringify({ listingId, action: "reject", type: "digital", reason }),
      });
      setRejectInputs((prev) => { const next = { ...prev }; delete next[`dig_${listingId}`]; return next; });
      showToast("Digital listing rejected.", "success");
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Reject failed", "error");
    }
  }

  async function handleApproveListing(listingId: string) {
    if (!confirm("Approve this listing? It will go live immediately.")) return;
    try {
      await adminFetch("/api/admin/verify-listing", {
        method: "POST",
        body: JSON.stringify({ listingId, action: "approve", type: "listing" }),
      });
      showToast("Listing approved.", "success");
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Approve failed", "error");
    }
  }

  async function handleRejectListing(listingId: string) {
    const reason = rejectInputs[`lst_${listingId}`]?.trim();
    if (!reason) { showToast("Enter a rejection reason.", "error"); return; }
    try {
      await adminFetch("/api/admin/verify-listing", {
        method: "POST",
        body: JSON.stringify({ listingId, action: "reject", type: "listing", reason }),
      });
      setRejectInputs((prev) => { const next = { ...prev }; delete next[`lst_${listingId}`]; return next; });
      showToast("Listing rejected.", "success");
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Reject failed", "error");
    }
  }

  if (!isAdmin) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar /><ThemeToggle />
        <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="max-w-xl rounded-[40px] border border-red-500/20 bg-[var(--card)] p-12 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-6 text-7xl">🔒</div>
            <h1 className="text-5xl font-black text-red-500">Access Denied</h1>
            <AwhinaUnderHeader centered className="mt-4" />
            <p className="mt-6 text-lg leading-8 text-[var(--muted)]">You do not have permission to access this page.</p>
          </div>
        </section>
      </main>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "listings", label: `Listings (${pendingListings.length || "—"})` },
    { key: "digital", label: "Digital Listings" },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background /><Navbar /><ThemeToggle />

      <section className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-sky-500">Verification Review</h1>
          <AwhinaUnderHeader className="mt-2" />
          <p className="mt-2 text-[var(--muted)]">Review submissions and pending listings.</p>
        </div>

        {/* Tabs */}
        <div className="mb-8 flex gap-2">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-xl px-5 py-2.5 text-xs font-bold transition ${tab === t.key ? "bg-sky-500 text-[var(--foreground)]" : "border border-zinc-700 text-[var(--muted)] hover:border-zinc-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "listings" ? (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-sky-500/20 bg-[var(--card)] p-5 shadow-xl">
                <p className="text-sm text-[var(--muted)]">Pending Listings</p>
                <p className="mt-1 text-3xl font-black text-sky-400">{pendingListings.length}</p>
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">Loading...</div>
            ) : pendingListings.length === 0 ? (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center">
                <p className="text-3xl mb-3">✅</p>
                <p className="text-lg font-bold">All caught up</p>
                <p className="text-sm text-[var(--muted)] mt-1">No pending listings.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {pendingListings.map((listing) => (
                  <div key={listing.id} className="rounded-2xl border border-sky-500/20 bg-[var(--card)] p-6 shadow-xl">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-[var(--foreground)]">{listing.title}</span>
                          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400">Pending</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                          <span>Seller: {listing.sellerEmail || "—"}</span>
                          <span>Price: ${listing.price || "—"}</span>
                          <span>Category: {listing.category || "—"}</span>
                          <span>Type: {listing.type || "—"}</span>
                          {listing.createdAt?.toDate && <span>Created: {listing.createdAt.toDate().toLocaleDateString()}</span>}
                        </div>
                        {(listing.description || "").length > 0 && (
                          <p className="mt-2 text-xs text-[var(--muted)] line-clamp-3">{listing.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button onClick={() => handleApproveListing(listing.id)}
                        className="rounded-xl bg-sky-500/15 px-5 py-2.5 text-xs font-bold text-sky-400 transition hover:bg-sky-500/25">
                        ✅ Approve
                      </button>
                      <input type="text" value={rejectInputs[`lst_${listing.id}`] || ""} onChange={(e) => setRejectInputs((prev) => ({ ...prev, [`lst_${listing.id}`]: e.target.value }))}
                        placeholder="Rejection reason..."
                        className="flex-1 min-w-[180px] rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-red-500/40 placeholder:text-zinc-600" />
                      <button onClick={() => handleRejectListing(listing.id)} disabled={!rejectInputs[`lst_${listing.id}`]?.trim()}
                        className="rounded-xl bg-red-500/15 px-5 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500/25 disabled:opacity-40">
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {loading ? (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">Loading...</div>
            ) : digitalListings.length === 0 ? (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center">
                <p className="text-3xl mb-3">✅</p>
                <p className="text-lg font-bold">All caught up</p>
                <p className="text-sm text-[var(--muted)] mt-1">No pending digital listings.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {digitalListings.map((listing) => (
                  <div key={listing.id} className="rounded-2xl border border-sky-500/20 bg-[var(--card)] p-6 shadow-xl">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-[var(--foreground)]">{listing.title}</span>
                          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400">Digital</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                          <span>Seller: {listing.sellerEmail || "—"}</span>
                          <span>Price: ${listing.price}</span>
                          <span>{listing.badgeForSale ? `Badge: ${listing.badgeForSale}` : `Category: ${listing.category || "—"}`}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button onClick={() => handleApproveDigital(listing.id)}
                        className="rounded-xl bg-sky-500/15 px-5 py-2.5 text-xs font-bold text-sky-400 transition hover:bg-sky-500/25">
                        ✅ Approve
                      </button>
                      <input type="text" value={rejectInputs[`dig_${listing.id}`] || ""} onChange={(e) => setRejectInputs((prev) => ({ ...prev, [`dig_${listing.id}`]: e.target.value }))}
                        placeholder="Rejection reason..."
                        className="flex-1 min-w-[180px] rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-red-500/40 placeholder:text-zinc-600" />
                      <button onClick={() => handleRejectDigital(listing.id)} disabled={!rejectInputs[`dig_${listing.id}`]?.trim()}
                        className="rounded-xl bg-red-500/15 px-5 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500/25 disabled:opacity-40">
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
