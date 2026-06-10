"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import { AwhinaUnderHeader } from "../../components/AwhinaOnlineBadge";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";
import { User } from "firebase/auth";
import { collection, onSnapshot, orderBy, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../../lib/firebase";
import type { JobApplication } from "../../lib/jobApplications";

type Filter = "all" | "pending" | "reviewed" | "accepted" | "rejected";

export default function EmployerApplicationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    setLoading(true);
    const q = query(
      collection(db, "jobApplications"),
      where("employerEmail", "==", user.email),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setApplications(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobApplication)));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  async function handleStatusChange(id: string, status: "pending" | "reviewed" | "accepted" | "rejected") {
    await updateDoc(doc(db, "jobApplications", id), {
      status,
      reviewedAt: serverTimestamp(),
    });
  }

  async function handleSaveNotes(id: string) {
    const notes = notesInput[id]?.trim();
    if (notes) {
      await updateDoc(doc(db, "jobApplications", id), { employerNotes: notes });
    }
  }

  const filtered = filter === "all" ? applications : applications.filter((a) => a.status === filter);
  const counts = {
    all: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    reviewed: applications.filter((a) => a.status === "reviewed").length,
    accepted: applications.filter((a) => a.status === "accepted").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "pending", label: `Pending (${counts.pending})` },
    { key: "reviewed", label: `Reviewing (${counts.reviewed})` },
    { key: "accepted", label: `Accepted (${counts.accepted})` },
    { key: "rejected", label: `Rejected (${counts.rejected})` },
  ];

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar /><ThemeToggle />
      <section className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-[var(--foreground)]">Job Applications</h1>
            <AwhinaUnderHeader className="mt-2" />
            <p className="mt-1 text-sm text-[var(--muted)]">Review and manage applications for your job listings.</p>
          </div>
          <Link href="/dashboard" className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition">
            ← Back to Dashboard
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${filter === f.key ? "bg-sky-500 text-white" : "border border-zinc-700 text-[var(--muted)] hover:border-zinc-600"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-sm text-[var(--muted)]">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-10 text-center">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-lg font-bold">No applications</p>
            <p className="text-sm text-[var(--muted)] mt-1">
              {filter === "all" ? "No one has applied for your jobs yet." : `No ${filter} applications.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((app) => (
              <div key={app.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-zinc-700/50">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-[var(--foreground)]">{app.applicantName}</span>
                      {app.status === "pending" && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400">Pending</span>}
                      {app.status === "reviewed" && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400">Reviewed</span>}
                      {app.status === "accepted" && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400">Accepted</span>}
                      {app.status === "rejected" && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">Rejected</span>}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {app.applicantEmail}{app.applicantPhone ? ` · ${app.applicantPhone}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Applied for: <Link href={`/post/listing/${app.listingId}`} className="text-sky-400 hover:text-sky-300">{app.listingTitle}</Link>
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {app.status !== "accepted" && (
                      <button onClick={() => handleStatusChange(app.id, "accepted")}
                        className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-[11px] font-bold text-sky-400 hover:bg-sky-500/25 transition">
                        Accept
                      </button>
                    )}
                    {app.status !== "rejected" && (
                      <button onClick={() => handleStatusChange(app.id, "rejected")}
                        className="rounded-lg bg-red-500/15 px-3 py-1.5 text-[11px] font-bold text-red-400 hover:bg-red-500/25 transition">
                        Reject
                      </button>
                    )}
                    {app.status === "pending" && (
                      <button onClick={() => handleStatusChange(app.id, "reviewed")}
                        className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-[11px] font-bold text-sky-400 hover:bg-sky-500/25 transition">
                        Mark Reviewed
                      </button>
                    )}
                  </div>
                </div>

                {/* Cover Letter */}
                <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-800/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Cover Letter</p>
                  <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">{app.coverLetter}</p>
                </div>

                {/* Resume */}
                {app.resumeURL && (
                  <div className="mt-2">
                    <a href={app.resumeURL} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800/60 px-3 py-2 text-xs font-bold text-sky-400 hover:bg-zinc-700/60 transition">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {app.resumeName || "View Resume"}
                    </a>
                  </div>
                )}

                {/* Employer notes */}
                <div className="mt-3 flex gap-2">
                  <input type="text" value={notesInput[app.id] ?? app.employerNotes ?? ""}
                    onChange={(e) => setNotesInput((p) => ({ ...p, [app.id]: e.target.value }))}
                    placeholder="Private notes about this applicant..."
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-sky-500/40 placeholder:text-zinc-600" />
                  <button onClick={() => handleSaveNotes(app.id)} disabled={!notesInput[app.id]?.trim()}
                    className="rounded-lg bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-400 hover:bg-sky-500/25 transition disabled:opacity-40">
                    Save
                  </button>
                </div>

                <div className="mt-2 text-[10px] text-zinc-600">
                  Applied {app.createdAt?.toDate?.()?.toLocaleDateString() || "recently"}
                  {app.reviewedAt?.toDate?.() ? ` · Reviewed ${app.reviewedAt.toDate().toLocaleDateString()}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
