"use client";

import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import {
  User,
} from "firebase/auth";
import {
  auth,
  db,
  onAuthStateChanged,
} from "../../lib/firebase";

const ADMIN_EMAILS = ["rangitr16@gmail.com"];

export default function AdminReportsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

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

  async function handleReview(reportId: string) {
    try {
      await setDoc(doc(db, "reports", reportId), { status: "reviewed" }, { merge: true });
    } catch (e) { console.error(e); }
  }

  async function handleDismiss(reportId: string) {
    try {
      await setDoc(doc(db, "reports", reportId), { status: "dismissed" }, { merge: true });
    } catch (e) { console.error(e); }
  }

  async function handleDelete(reportId: string) {
    if (!confirm("Delete this report permanently?")) return;
    try {
      await deleteDoc(doc(db, "reports", reportId));
    } catch (e) { console.error(e); }
  }

  async function handleRestrict(userId: string) {
    if (!confirm("Restrict this user? They won't be able to create listings or send offers.")) return;
    try {
      await setDoc(doc(db, "profiles", userId), {
        restricted: true,
        restrictionReason: "Pending review of reports",
        restrictedAt: Timestamp.now(),
      }, { merge: true });
      alert("User restricted.");
    } catch (e) { console.error(e); }
  }

  const pendingReports = reports.filter((r) => !r.status || r.status === "pending");
  const reviewedReports = reports.filter((r) => r.status === "reviewed" || r.status === "dismissed");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background /><Navbar /><ThemeToggle />

      <section className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-red-500">Report Moderation</h1>
          <p className="mt-2 text-[var(--muted)]">Review, dismiss, or escalate reported listings and users.</p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-red-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Pending</p>
            <p className="mt-1 text-3xl font-black text-red-400">{pendingReports.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Reviewed</p>
            <p className="mt-1 text-3xl font-black text-emerald-400">{reviewedReports.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Total</p>
            <p className="mt-1 text-3xl font-black text-[var(--foreground)]">{reports.length}</p>
          </div>
        </div>

        {/* Pending Reports */}
        <div>
          <h2 className="text-2xl font-black mb-4">Pending Review</h2>
          {loading ? (
            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">Loading...</div>
          ) : pendingReports.length === 0 ? (
            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center">
              <p className="text-3xl mb-3">🛡️</p>
              <p className="text-lg font-bold">No pending reports</p>
              <p className="text-sm text-[var(--muted)] mt-1">All reports have been reviewed.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingReports.map((report) => {
                const reportedId = report.reportedUserId || "";
                return (
                  <div key={report.id} className="rounded-2xl border border-red-500/20 bg-[var(--card)] p-6 shadow-xl">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {report.type === "listing" ? (
                            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400">Listing</span>
                          ) : (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">User</span>
                          )}
                          <span className="text-lg font-bold text-[var(--foreground)] truncate">
                            {report.reportedUserEmail || report.reportedUser || "Unknown"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                          <span>Reason: <span className="font-bold text-red-400">{report.reason}</span></span>
                          <span>Reporter: {report.reporterUserEmail || report.reporter || "Unknown"}</span>
                          {report.createdAt?.toDate && (
                            <span>{report.createdAt.toDate().toLocaleDateString()}</span>
                          )}
                        </div>
                        {report.listingId && (
                          <a href={`/post/listing/${report.listingId}`} className="mt-1 inline-block text-xs text-sky-400 hover:underline">
                            View listing &rarr;
                          </a>
                        )}
                        {report.details && (
                          <p className="mt-2 text-sm text-[var(--foreground)] bg-zinc-800/30 rounded-xl p-3">{report.details}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleReview(report.id)}
                        className="rounded-xl bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-400 transition hover:bg-emerald-500/25"
                      >
                        Mark Reviewed
                      </button>
                      <button
                        onClick={() => handleDismiss(report.id)}
                        className="rounded-xl bg-zinc-700/50 px-4 py-2 text-xs font-bold text-[var(--foreground)] transition hover:bg-zinc-600/50"
                      >
                        Dismiss
                      </button>
                      {reportedId && (
                        <button
                          onClick={() => handleRestrict(reportedId)}
                          className="rounded-xl bg-red-500/15 px-4 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/25"
                        >
                          Restrict User
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(report.id)}
                        className="rounded-xl bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400/60 transition hover:bg-red-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reviewed Reports */}
        {reviewedReports.length > 0 && (
          <div className="mt-10">
            <h2 className="text-2xl font-black mb-4">Reviewed</h2>
            <div className="space-y-3">
              {reviewedReports.map((report) => (
                <div key={report.id} className="rounded-2xl border border-zinc-700/30 bg-[var(--card)] p-5 shadow-xl opacity-60">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-bold text-[var(--foreground)]">{report.reportedUserEmail || report.reportedUser}</span>
                      <span className="ml-2 text-xs text-[var(--muted)]">({report.reason})</span>
                      <span className="ml-2 rounded-full bg-zinc-700/50 px-2 py-0.5 text-[10px] text-[var(--muted)]">{report.status}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(report.id)}
                      className="text-xs text-[var(--muted)] hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
