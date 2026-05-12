"use client";

import { useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

export default function BlockedPage() {
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const saved = JSON.parse(
      localStorage.getItem("blockedUsers") || "[]"
    );

    setBlockedUsers(saved);
  }, []);

  function blockUser() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      alert("Enter an email.");
      return;
    }

    if (blockedUsers.includes(cleanEmail)) {
      alert("User already blocked.");
      return;
    }

    const updated = [...blockedUsers, cleanEmail];

    setBlockedUsers(updated);
    localStorage.setItem("blockedUsers", JSON.stringify(updated));
    setEmail("");

    alert("User blocked.");
  }

  function unblockUser(userEmail: string) {
    const updated = blockedUsers.filter((item) => item !== userEmail);

    setBlockedUsers(updated);
    localStorage.setItem("blockedUsers", JSON.stringify(updated));
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />
      <Navbar />
      <ThemeToggle />

      <section className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <div className="mb-10">
          <h1 className="text-5xl font-black text-red-500">
            Block Users
          </h1>

          <p className="mt-3 text-[var(--muted)]">
            Block scammers, spam, or unwanted users.
          </p>
        </div>

        <div className="rounded-[40px] border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="text-3xl font-black">
            Add Block
          </h2>

          <div className="mt-6 flex gap-4">
            <input
              type="email"
              placeholder="User email..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-4 text-[var(--foreground)] outline-none transition focus:border-red-500"
            />

            <button
              onClick={blockUser}
              className="rounded-2xl bg-red-500 px-8 py-4 font-black text-white transition hover:bg-red-400"
            >
              Block
            </button>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-4xl font-black">
            Blocked Users
          </h2>

          <div className="mt-8 grid gap-4">
            {blockedUsers.length === 0 ? (
              <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center shadow-2xl">
                <div className="mb-4 text-6xl">🛡️</div>

                <h2 className="text-3xl font-black">
                  No blocked users
                </h2>

                <p className="mt-3 text-[var(--muted)]">
                  Blocked users will appear here.
                </p>
              </div>
            ) : (
              blockedUsers.map((userEmail) => (
                <div
                  key={userEmail}
                  className="flex items-center justify-between rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl"
                >
                  <div>
                    <p className="font-black">{userEmail}</p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                      This user is blocked on this device.
                    </p>
                  </div>

                  <button
                    onClick={() => unblockUser(userEmail)}
                    className="rounded-2xl border border-red-500/30 px-5 py-3 font-bold text-red-500 transition hover:bg-red-500/10"
                  >
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}