"use client";

import {
  useEffect,
  useState,
} from "react";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";
import { showToast } from "../components/Toast";

import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  limit,
} from "firebase/firestore";

import {
  User,
} from "firebase/auth";

import { auth, db, onAuthStateChanged } from "../lib/firebase";

export default function ReportsPage() {
  const [user, setUser] =
    useState<User | null>(null);

  const [reports, setReports] =
    useState<any[]>([]);

  const [reportedUser, setReportedUser] =
    useState("");

  const [reason, setReason] =
    useState("");

  const [details, setDetails] =
    useState("");

  useEffect(() => {
    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);
        }
      );

    return () => unsubscribeAuth();
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
        }
      );

    return () => unsubscribe();
  }, []);

  async function submitReport() {
    if (!user?.email) {
      showToast("You must be logged in.", "error");
      return;
    }
    if (!reportedUser.trim() || !reason.trim() || !details.trim()) {
      showToast("Fill all fields.", "error");
      return;
    }
    const cooldownKey = `report_cooldown_${reportedUser.trim()}`;
    let lastReport = null;
    try { lastReport = localStorage.getItem(cooldownKey); } catch (e) { console.error("Failed to read report cooldown:", e); }
    if (lastReport && Date.now() - Number(lastReport) < 300000) {
      showToast("Please wait 5 minutes between reports.", "info");
      return;
    }
    try {
      // Server-side cooldown: check for recent report from this reporter for this user
      const cooldownQuery = query(
        collection(db, "reports"),
        where("reporter", "==", user.email),
        where("reportedUser", "==", reportedUser.trim()),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const recentSnap = await getDocs(cooldownQuery);
      if (!recentSnap.empty) {
        const lastReport = recentSnap.docs[0].data();
        const lastTime = lastReport.createdAt?.toMillis?.();
        if (lastTime && Date.now() - lastTime < 10 * 60 * 1000) {
          showToast("Please wait before reporting again.", "info");
          return;
        }
      }

      await addDoc(
        collection(db, "reports"),
        {
          reportedUser,
          reason,
          details,
          reporter:
            user.email,
          createdAt:
            serverTimestamp(),
        }
      );

      try { localStorage.setItem(cooldownKey, String(Date.now())); } catch (e) { console.error("Failed to save report cooldown:", e); }
      setReportedUser("");
      setReason("");
      setDetails("");

      showToast("Report submitted.");
    } catch (error) {
      console.error(error);
      showToast("Failed to submit report.", "error");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />

      <Navbar />

      <ThemeToggle />

      <section className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        {/* HEADER */}
        <div className="mb-10">
          <h1 className="text-5xl font-black text-red-500">
            Reports
          </h1>

          <p className="mt-3 text-[var(--muted)]">
            Marketplace safety and
            moderation reports.
          </p>
        </div>

        {/* REPORT FORM */}
        <div className="rounded-[40px] border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="text-3xl font-black">
            Report User
          </h2>

          <div className="mt-6 grid gap-5">
            <input
              type="text"
              placeholder="Seller or buyer email..."
              value={reportedUser}
              onChange={(e) =>
                setReportedUser(
                  e.target.value
                )
              }
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-4 outline-none transition focus:border-red-500"
            />

            <select
              value={reason}
              onChange={(e) =>
                setReason(
                  e.target.value
                )
              }
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-4 outline-none"
            >
              <option value="">
                Select reason
              </option>

              <option value="Scam">
                Scam
              </option>

              <option value="Fake Listing">
                Fake Listing
              </option>

              <option value="Spam">
                Spam
              </option>

              <option value="Harassment">
                Harassment
              </option>

              <option value="Inappropriate Content">
                Inappropriate
                Content
              </option>
            </select>

            <textarea
              placeholder="Describe the issue..."
              value={details}
              onChange={(e) =>
                setDetails(
                  e.target.value
                )
              }
              rows={6}
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-4 outline-none transition focus:border-red-500"
            />

            <button
              onClick={
                submitReport
              }
              className="rounded-2xl bg-red-500 px-8 py-4 font-black text-[var(--foreground)] transition hover:bg-red-400"
            >
              Submit Report
            </button>
          </div>
        </div>

        {/* REPORTS */}
        <div className="mt-14">
          <h2 className="text-4xl font-black">
            Recent Reports
          </h2>

          <div className="mt-8 grid gap-6">
            {reports.length ===
            0 ? (
              <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center shadow-2xl">
                <div className="mb-4 text-6xl">
                  🚨
                </div>

                <h2 className="text-3xl font-black">
                  No reports yet
                </h2>
              </div>
            ) : (
              reports.map(
                (report) => (
                  <div
                    key={
                      report.id
                    }
                    className="rounded-3xl border border-red-500/20 bg-[var(--card)] p-8 shadow-2xl backdrop-blur-xl"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-black text-red-400">
                          {
                            report.reportedUser
                          }
                        </h2>

                        <p className="mt-1 text-sm text-[var(--muted)]">
                          Reported by{" "}
                          {
                            report.reporter
                          }
                        </p>
                      </div>

                      <div className="rounded-2xl bg-red-500/10 px-5 py-3 font-black text-red-400">
                        {
                          report.reason
                        }
                      </div>
                    </div>

                    <p className="mt-6 text-lg leading-8">
                      {
                        report.details
                      }
                    </p>
                  </div>
                )
              )
            )}
          </div>
        </div>
      </section>
    </main>
  );
}