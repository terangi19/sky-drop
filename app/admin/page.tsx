"use client";

import { useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";
import ThemeToggle from "../components/ThemeToggle";
import { showToast } from "../components/Toast";

import {
  collection,
  deleteDoc,
  doc,
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
} from "../lib/firebase";
import { isAdminEmail } from "../lib/admin-check";

export default function AdminPage() {
  const [user, setUser] =
    useState<User | null>(null);

  const [reports, setReports] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [checking, setChecking] = useState(true);
  const [pendingVerifications, setPendingVerifications] = useState(0);

  const [pendingDigital, setPendingDigital] = useState(0);
  const [openDisputes, setOpenDisputes] = useState(0);
  const [adminAlerts, setAdminAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (auth.currentUser) {
      setUser(auth.currentUser);
      setChecking(false);
      return;
    }
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);
          setChecking(false);
        }
      );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const reportsQuery = query(
      collection(db, "reports"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe =
      onSnapshot(
        reportsQuery,
        (snapshot) => {
          const items =
            snapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...doc.data(),
              })
            );

          setReports(items);

          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "profiles"), where("proofOfAddress.status", "==", "pending"));
    const unsub = onSnapshot(q, (snap) => setPendingVerifications(snap.docs.length));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "tradePosts"), where("type", "==", "digital"));
    const unsub = onSnapshot(q, (snap) => setPendingDigital(snap.docs.filter((d) => d.data().status === "pending_review").length));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "disputes"), where("status", "in", ["open", "under_review"]));
    const unsub = onSnapshot(q, (snap) => setOpenDisputes(snap.docs.length));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "adminNotifications"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAdminAlerts(items.slice(0, 20));
    });
    return () => unsub();
  }, []);

  async function deleteReport(
    id: string
  ) {
    const confirmDelete =
      confirm(
        "Delete this report?"
      );

    if (!confirmDelete)
      return;

    try {
      await deleteDoc(
        doc(
          db,
          "reports",
          id
        )
      );

      showToast("Report removed.");
    } catch (error) {
      console.error(error);

      showToast("Failed to remove report.", "error");
    }
  }

  if (checking) return <main className="flex min-h-screen items-center justify-center bg-[var(--background)]"><p className="text-sm text-[var(--muted)]">Checking...</p></main>;

  // ACCESS CHECK
  const isAdmin = isAdminEmail(user?.email);

  // BLOCK NON ADMINS
  if (!isAdmin) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <Background />

        <Navbar />

        <ThemeToggle />

        <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="max-w-xl rounded-[40px] border border-red-500/20 bg-[var(--card)] p-12 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-6 text-7xl">
              🔒
            </div>

            <h1 className="text-5xl font-black text-red-500">
              Access Denied
            </h1>
            <AwhinaUnderHeader centered className="mt-4" />

            <p className="mt-6 text-lg leading-8 text-[var(--muted)]">
              You do not have permission
              to access the admin dashboard.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />

      <Navbar />

      <ThemeToggle />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-12">
        {/* HEADER */}
        <div className="mb-10 flex flex-wrap items-center justify-between gap-6">
          <div>
            <h1 className="text-5xl font-black text-red-500">
              Admin Dashboard
            </h1>
            <AwhinaUnderHeader className="mt-3" />

            <p className="mt-3 text-[var(--muted)]">
              Marketplace moderation
              and safety tools.
            </p>
          </div>

          <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] px-8 py-6 shadow-xl">
            <p className="text-sm text-[var(--muted)]">
              Total Reports
            </p>

            <p className="mt-2 text-4xl font-black text-red-400">
              {reports.length}
            </p>
          </div>
        </div>

        {/* STATS */}
        <div className="mb-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl">
            <p className="text-sm text-[var(--muted)]">
              Total Reports
            </p>

            <h2 className="mt-3 text-4xl font-black text-red-400">
              {reports.length}
            </h2>
          </div>

          <div className="rounded-3xl border border-amber-500/20 bg-[var(--card)] p-6 shadow-xl">
            <p className="text-sm text-[var(--muted)]">
              Pending
            </p>

            <h2 className="mt-3 text-4xl font-black text-amber-400">
              {reports.filter(r => !r.status || r.status === "pending").length}
            </h2>
          </div>

          <a href="/admin/reports" className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl transition hover:border-sky-500/40 hover:shadow-[0_0_20px_rgba(14,165,233,0.1)]">
            <p className="text-sm text-[var(--muted)]">
              Moderation
            </p>

            <h2 className="mt-3 text-4xl font-black text-yellow-400">
              Active →
            </h2>
          </a>

          <a href="/admin/disputes" className="rounded-3xl border border-red-500/20 bg-[var(--card)] p-6 shadow-xl transition hover:border-red-500/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]">
            <p className="text-sm text-[var(--muted)]">
              Disputes
            </p>

            <h2 className="mt-3 text-4xl font-black text-red-400">
              {openDisputes} open →
            </h2>
          </a>

          <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl">
            <p className="text-sm text-[var(--muted)]">
              Safety System
            </p>

            <h2 className="mt-3 text-4xl font-black text-sky-400">
              Enabled
            </h2>
          </div>

          <a href="/admin/verification" className="rounded-3xl border border-emerald-500/20 bg-[var(--card)] p-6 shadow-xl transition hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]">
            <p className="text-sm text-[var(--muted)]">
              Address Verification
            </p>

            <h2 className="mt-3 text-4xl font-black text-emerald-400">
              {pendingVerifications} pending →
            </h2>
          </a>

          <a href="/admin/verification" className="rounded-3xl border border-sky-500/20 bg-[var(--card)] p-6 shadow-xl transition hover:border-sky-500/40 hover:shadow-[0_0_20px_rgba(14,165,233,0.1)]">
            <p className="text-sm text-[var(--muted)]">
              Digital Listings
            </p>

            <h2 className="mt-3 text-4xl font-black text-sky-400">
              {pendingDigital} pending →
            </h2>
          </a>
        </div>

        {/* SYSTEM ALERTS */}
        <div className="mb-12">
          <h2 className="text-4xl font-black flex items-center gap-3">
            System Alerts
            {adminAlerts.filter(a => !a.read).length > 0 && (
              <span className="rounded-full bg-red-500 px-3 py-0.5 text-sm font-bold text-white">
                {adminAlerts.filter(a => !a.read).length} new
              </span>
            )}
          </h2>
          <div className="mt-6 grid gap-3">
            {adminAlerts.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-6 text-center text-sm text-zinc-500">
                No alerts
              </div>
            ) : (
              adminAlerts.slice(0, 10).map((alert) => (
                <div key={alert.id} className={`rounded-2xl border p-4 ${!alert.read ? "border-red-500/20 bg-red-500/[0.03]" : "border-zinc-800/30 bg-zinc-900/20"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm font-bold ${!alert.read ? "text-red-400" : "text-zinc-400"}`}>
                        {!alert.read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-500" />}
                        {alert.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{alert.message}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-600">
                      {alert.createdAt?.toDate?.() ? new Date(alert.createdAt.toDate()).toLocaleString() : ""}
                    </span>
                  </div>
                  {alert.metadata && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[10px] text-zinc-600 hover:text-zinc-400">Details</summary>
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-black/30 p-2 text-[10px] text-zinc-500">{JSON.stringify(alert.metadata, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* REPORTS */}
        <div>
          <h2 className="text-4xl font-black">
            Recent Reports
          </h2>

          <div className="mt-8 grid gap-6">
            {loading ? (
              <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center shadow-2xl">
                Loading reports...
              </div>
            ) : reports.length === 0 ? (
              <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center shadow-2xl">
                <div className="mb-4 text-6xl">
                  🛡️
                </div>

                <h2 className="text-3xl font-black">
                  No reports
                </h2>

                <p className="mt-3 text-[var(--muted)]">
                  Marketplace is clean right now.
                </p>
              </div>
            ) : (
              reports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-3xl border border-red-500/20 bg-[var(--card)] p-8 shadow-2xl backdrop-blur-xl"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black text-red-400">
                        {report.reportedUserEmail || report.reportedUser || "Unknown"}
                      </h2>

                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Reported by {report.reporterUserEmail || report.reporterEmail || report.reporter || "Unknown"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-red-500/10 px-5 py-3 font-black text-red-400">
                      {report.reason}
                    </div>
                  </div>

                  <p className="mt-6 text-lg leading-8">
                    {report.details}
                  </p>

                  <div className="mt-8 flex gap-4">
                    <button
                      onClick={() =>
                        deleteReport(report.id)
                      }
                      className="rounded-2xl bg-red-500 px-6 py-3 font-black text-[var(--foreground)] transition hover:bg-red-400"
                    >
                      Remove Report
                    </button>

                    <a
                      href={`/seller/${encodeURIComponent(
                        report.reportedUserEmail || report.reportedUser || ""
                      )}`}
                      className="rounded-2xl border border-[var(--card-border)] px-6 py-3 font-black transition hover:border-sky-400 hover:text-sky-400"
                    >
                      View Seller
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}