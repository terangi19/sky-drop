"use client";

import { useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import {
  auth,
  db,
} from "../lib/firebase";

export default function ProfilePage() {
  const [user, setUser] =
    useState<User | null>(null);

  const [username, setUsername] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (
          currentUser
        ) => {
          try {
            setUser(
              currentUser
            );

            if (
              currentUser?.uid
            ) {
              const profileRef =
                doc(
                  db,
                  "profiles",
                  currentUser.uid
                );

              const profileSnap =
                await getDoc(
                  profileRef
                );

              if (
                profileSnap.exists()
              ) {
                setUsername(
                  profileSnap.data()
                    .username ||
                    ""
                );
              }
            }
          } catch (error) {
            console.error(
              error
            );
          }

          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, []);

  async function saveProfile() {
    if (!user) return;

    if (!username.trim()) {
      alert(
        "Enter username."
      );

      return;
    }

    try {
      setSaving(true);

      await setDoc(
        doc(
          db,
          "profiles",
          user.uid
        ),
        {
          username:
            username.trim(),
          email:
            user.email,
        }
      );

      alert(
        "Profile updated!"
      );
    } catch (error) {
      console.error(error);

      alert(
        "Failed to save profile."
      );
    }

    setSaving(false);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />

      <Navbar />

      <ThemeToggle />

      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10">
          <h1 className="text-5xl font-black text-sky-400">
            Profile Settings
          </h1>

          <p className="mt-3 text-[var(--muted)]">
            Customize your
            marketplace identity.
          </p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-black/40 p-10 shadow-2xl">
            Loading profile...
          </div>
        ) : !user ? (
          <div className="rounded-3xl border border-red-500/20 bg-black/40 p-10 shadow-2xl">
            Please log in first.
          </div>
        ) : (
          <div className="rounded-[40px] border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-8 flex items-center gap-5">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-sky-500 text-4xl font-black text-white shadow-lg shadow-sky-500/30">
                {username
                  ?.charAt(0)
                  ?.toUpperCase() ||
                  "U"}
              </div>

              <div>
                <h2 className="text-3xl font-black">
                  {username ||
                    "No Username"}
                </h2>

                <p className="mt-2 text-zinc-400">
                  {user.email}
                </p>
              </div>
            </div>

            <div>
              <label className="mb-3 block text-sm font-bold text-zinc-300">
                Username
              </label>

              <input
                type="text"
                placeholder="Sky335i"
                value={username}
                onChange={(e) =>
                  setUsername(
                    e.target.value
                  )
                }
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-white outline-none transition focus:border-sky-400"
              />
            </div>

            <button
              onClick={
                saveProfile
              }
              disabled={saving}
              className="mt-8 w-full rounded-2xl bg-sky-500 px-6 py-5 text-lg font-black text-white transition hover:bg-sky-400 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : "Save Profile"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}