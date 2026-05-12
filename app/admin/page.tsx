"use client";

import { useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import {
  auth,
  db,
} from "../lib/firebase";

export default function AdminPage() {
  const [user, setUser] =
    useState<User | null>(null);

  const [reports, setReports] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  // ADMIN EMAILS
  const adminEmails = [
    "rangitr16@gmail.com",
  ];

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);
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

      alert(
        "Report removed."
      );
    } catch (error) {
      console.error(error);

      alert(
        "Failed to remove report."
      );
    }
  }

  // ACCESS CHECK
  const isAdmin =
    user?.email &&
    adminEmails.includes(
      user.email.toLowerCase()
    );

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

            <p className="mt-3 text-[var(--muted)]">
              Marketplace moderation
              and safety tools.
            </p>
          </div>

          <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] px-8 py-6 shadow-xl">
            <p className="text-sm text-zinc-500">
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
            <p className="text-sm text-zinc-500">
              Reports
            </p>

            <h2 className="mt-3 text-4xl font-black text-red-400">
              {reports.length}
            </h2>
          </div>

          <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl">
            <p className="text-sm text-zinc-500">
              Moderation
            </p>

            <h2 className="mt-3 text-4xl font-black text-yellow-400">
              Active
            </h2>
          </div>

          <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl">
            <p className="text-sm text-zinc-500">
              Platform Status
            </p>

            <h2 className="mt-3 text-4xl font-black text-green-400">
              Online
            </h2>
          </div>

          <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl">
            <p className="text-sm text-zinc-500">
              Safety System
            </p>

            <h2 className="mt-3 text-4xl font-black text-sky-400">
              Enabled
            </h2>
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
                        {report.reportedUser}
                      </h2>

                      <p className="mt-1 text-sm text-zinc-500">
                        Reported by {report.reporter}
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
                      className="rounded-2xl bg-red-500 px-6 py-3 font-black text-white transition hover:bg-red-400"
                    >
                      Remove Report
                    </button>

                    <a
                      href={`/seller/${encodeURIComponent(
                        report.reportedUser
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