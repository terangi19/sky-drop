"use client";

import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  auth,
  db,
} from "../../lib/firebase";
import { createNotification } from "../../lib/notifications";
import { approveKYC, rejectKYC } from "../../lib/kyc";

const ADMIN_EMAILS = ["rangitr16@gmail.com"];

type Tab = "address" | "kyc" | "digital";

export default function AdminVerificationPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("address");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [digitalListings, setDigitalListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectInputs, setRejectInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (tab === "address") {
      setLoading(true);
      const q = query(collection(db, "profiles"), where("proofOfAddress.status", "==", "pending"));
      const unsub = onSnapshot(q, (snap) => {
        setProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => {
        console.error("Failed to load pending verifications:", err);
        setLoading(false);
      });
      return () => unsub();
    } else if (tab === "kyc") {
      setLoading(true);
      const q = query(collection(db, "profiles"), where("kycStatus", "==", "pending"));
      const unsub = onSnapshot(q, (snap) => {
        setProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => {
        console.error("Failed to load KYC:", err);
        setLoading(false);
      });
      return () => unsub();
    } else if (tab === "digital") {
      setLoading(true);
      const q = query(collection(db, "tradePosts"), where("type", "==", "digital"), where("status", "==", "pending_review"));
      const unsub = onSnapshot(q, (snap) => {
        setDigitalListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => {
        console.error("Failed to load digital listings:", err);
        setLoading(false);
      });
      return () => unsub();
    }
  }, [tab]);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

  async function handleApprove(profileId: string) {
    if (!confirm("Approve this user's proof of address?")) return;
    try {
      await setDoc(doc(db, "profiles", profileId), {
        proofOfAddress: { status: "approved", reviewedAt: Timestamp.now(), reviewedBy: user?.email || "admin" },
      }, { merge: true });

      const profileSnap = await getDoc(doc(db, "profiles", profileId));
      const profileData = profileSnap.data();
      if (profileData?.email) {
        await createNotification({
          targetEmail: profileData.email,
          fromEmail: user!.email!,
          type: "verification",
          title: "Address Verified ✓",
          message: "Your proof of address has been approved.",
        });
      }

      const referredBy = profileData?.referredBy;
      if (referredBy) {
        const referrerQuery = query(collection(db, "profiles"), where("referralCode", "==", referredBy));
        const referrerSnap = await getDocs(referrerQuery);
        if (!referrerSnap.empty) {
          const referrer = referrerSnap.docs[0];
          const referrerData = referrer.data();
          if (referrerData.phoneVerified) {
            for (let i = 0; i < 3; i++) {
              await addDoc(collection(db, "dropTokens"), {
                ownerId: referrer.id,
                ownerEmail: referrerData.email || "",
                originDropId: "referral_reward",
                status: "available",
                createdAt: serverTimestamp(),
              });
            }
            await createNotification({
              targetEmail: referrerData.email || "",
              fromEmail: user!.email!,
              type: "referral_reward",
              title: "🎁 Referral Reward Earned!",
              message: "Your referral completed verification — you earned 3 Drop Tokens!",
            });
          }
        }
      }
    } catch (e) { console.error(e); }
  }

  async function handleReject(profileId: string) {
    const reason = rejectInputs[profileId]?.trim();
    if (!reason) { alert("Enter a rejection reason."); return; }
    try {
      await setDoc(doc(db, "profiles", profileId), {
        proofOfAddress: { status: "rejected", rejectionReason: reason, reviewedAt: Timestamp.now(), reviewedBy: user?.email || "admin" },
      }, { merge: true });

      const profileSnap = await getDoc(doc(db, "profiles", profileId));
      const profileData = profileSnap.data();
      if (profileData?.email) {
        await createNotification({
          targetEmail: profileData.email,
          fromEmail: user!.email!,
          type: "verification",
          title: "Address Verification Rejected",
          message: `Your proof of address was rejected. Reason: ${reason}`,
        });
      }

      setRejectInputs((prev) => { const next = { ...prev }; delete next[profileId]; return next; });
    } catch (e) { console.error(e); }
  }

  async function handleApproveKYC(profileId: string) {
    if (!user?.email) return;
    if (!confirm("Approve this user's KYC?")) return;
    try {
      await approveKYC(profileId, user.email);
    } catch (e) { console.error(e); }
  }

  async function handleRejectKYC(profileId: string) {
    const reason = rejectInputs[`kyc_${profileId}`]?.trim();
    if (!reason) { alert("Enter a rejection reason."); return; }
    try {
      await rejectKYC(profileId, reason, user?.email || "admin");
      setRejectInputs((prev) => { const next = { ...prev }; delete next[`kyc_${profileId}`]; return next; });
    } catch (e) { console.error(e); }
  }

  async function handleApproveDigital(listingId: string) {
    if (!confirm("Approve this digital listing?")) return;
    try {
      await updateDoc(doc(db, "tradePosts", listingId), { status: "live" });
    } catch (e) { console.error(e); }
  }

  async function handleRejectDigital(listingId: string) {
    const reason = rejectInputs[`dig_${listingId}`]?.trim();
    if (!reason) { alert("Enter a rejection reason."); return; }
    try {
      await updateDoc(doc(db, "tradePosts", listingId), { status: "rejected" });
      const snap = await getDoc(doc(db, "tradePosts", listingId));
      const data = snap.data();
      if (data?.sellerEmail) {
        await createNotification({
          targetEmail: data.sellerEmail,
          fromEmail: user!.email!,
          type: "listing",
          title: "Digital Listing Rejected",
          message: `Your digital listing "${data.title}" was rejected. Reason: ${reason}`,
        });
      }
      setRejectInputs((prev) => { const next = { ...prev }; delete next[`dig_${listingId}`]; return next; });
    } catch (e) { console.error(e); }
  }

  if (!isAdmin) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar /><ThemeToggle />
        <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="max-w-xl rounded-[40px] border border-red-500/20 bg-[var(--card)] p-12 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-6 text-7xl">🔒</div>
            <h1 className="text-5xl font-black text-red-500">Access Denied</h1>
            <p className="mt-6 text-lg leading-8 text-[var(--muted)]">You do not have permission to access this page.</p>
          </div>
        </section>
      </main>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "address", label: "Proof of Address" },
    { key: "kyc", label: "KYC" },
    { key: "digital", label: "Digital Listings" },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background /><Navbar /><ThemeToggle />

      <section className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-emerald-500">Verification Review</h1>
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

        {tab === "digital" ? (
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
                        className="rounded-xl bg-emerald-500/15 px-5 py-2.5 text-xs font-bold text-emerald-400 transition hover:bg-emerald-500/25">
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
        ) : (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-[var(--card)] p-5 shadow-xl">
                <p className="text-sm text-[var(--muted)]">Pending Reviews</p>
                <p className="mt-1 text-3xl font-black text-emerald-400">{profiles.length}</p>
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">Loading...</div>
            ) : profiles.length === 0 ? (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center">
                <p className="text-3xl mb-3">✅</p>
                <p className="text-lg font-bold">All caught up</p>
                <p className="text-sm text-[var(--muted)] mt-1">No pending submissions.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {profiles.map((profile) => (
                  <div key={profile.id} className="rounded-2xl border border-emerald-500/20 bg-[var(--card)] p-6 shadow-xl">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-[var(--foreground)]">{profile.email || "No email"}</span>
                          {profile.phoneVerified && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">Phone ✓</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                          <span>Username: {profile.username || "—"}</span>
                          <span>Phone: {profile.phone || "—"}</span>
                          {profile.referredBy && <span>Referred by: <span className="font-bold text-amber-400">{profile.referredBy}</span></span>}
                          {tab === "kyc" ? (
                            profile.kycSubmittedAt?.toDate && <span>Submitted: {profile.kycSubmittedAt.toDate().toLocaleDateString()}</span>
                          ) : (
                            profile.proofOfAddress?.submittedAt?.toDate && <span>Submitted: {profile.proofOfAddress.submittedAt.toDate().toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Document preview */}
                    {tab === "kyc" ? (
                      profile.kycDocumentURL && (
                        <div className="mt-4">
                          <a href={profile.kycDocumentURL} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl bg-zinc-800/50 px-4 py-2 text-xs font-bold text-sky-400 hover:bg-zinc-700/50 transition">
                            📄 View ID Document →
                          </a>
                        </div>
                      )
                    ) : (
                      profile.proofOfAddress?.documentURL && (
                        <div className="mt-4">
                          <a href={profile.proofOfAddress.documentURL} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl bg-zinc-800/50 px-4 py-2 text-xs font-bold text-sky-400 hover:bg-zinc-700/50 transition">
                            📄 View Document →
                          </a>
                        </div>
                      )
                    )}

                    {/* Approve / Reject */}
                    <div className="mt-4 flex flex-wrap gap-3">
                      {tab === "kyc" ? (
                        <>
                          <button onClick={() => handleApproveKYC(profile.id)}
                            className="rounded-xl bg-emerald-500/15 px-5 py-2.5 text-xs font-bold text-emerald-400 transition hover:bg-emerald-500/25">
                            ✅ Approve KYC
                          </button>
                          <input type="text" value={rejectInputs[`kyc_${profile.id}`] || ""} onChange={(e) => setRejectInputs((prev) => ({ ...prev, [`kyc_${profile.id}`]: e.target.value }))}
                            placeholder="Rejection reason..."
                            className="flex-1 min-w-[180px] rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-red-500/40 placeholder:text-zinc-600" />
                          <button onClick={() => handleRejectKYC(profile.id)} disabled={!rejectInputs[`kyc_${profile.id}`]?.trim()}
                            className="rounded-xl bg-red-500/15 px-5 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500/25 disabled:opacity-40">
                            ❌ Reject KYC
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleApprove(profile.id)}
                            className="rounded-xl bg-emerald-500/15 px-5 py-2.5 text-xs font-bold text-emerald-400 transition hover:bg-emerald-500/25">
                            ✅ Approve
                          </button>
                          <input type="text" value={rejectInputs[profile.id] || ""} onChange={(e) => setRejectInputs((prev) => ({ ...prev, [profile.id]: e.target.value }))}
                            placeholder="Rejection reason..."
                            className="flex-1 min-w-[180px] rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-red-500/40 placeholder:text-zinc-600" />
                          <button onClick={() => handleReject(profile.id)} disabled={!rejectInputs[profile.id]?.trim()}
                            className="rounded-xl bg-red-500/15 px-5 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500/25 disabled:opacity-40">
                            ❌ Reject
                          </button>
                        </>
                      )}
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
