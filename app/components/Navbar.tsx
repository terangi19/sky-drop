"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  auth,
  db,
} from "../lib/firebase";

import NotificationBell from "./NotificationBell";
import NotificationDropdown from "./NotificationDropdown";

export default function Navbar() {
  const [user, setUser] =
    useState<User | null>(
      null
    );

  const [username, setUsername] =
    useState("");

  const [
    notificationCount,
  ] = useState(3);

  const [
    showNotifications,
    setShowNotifications,
  ] = useState(false);

  const [notifications] =
    useState([
      {
        id: 1,
        text: "🔥 New Gaming trade posted",
      },

      {
        id: 2,
        text: "🚗 Supra parts added in Cars",
      },

      {
        id: 3,
        text: "💬 New message received",
      },
    ]);

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (
          currentUser
        ) => {
          setUser(
            currentUser
          );

          if (
            currentUser?.uid
          ) {
            try {
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
            } catch (error) {
              console.error(
                error
              );
            }
          }
        }
      );

    return () =>
      unsubscribe();
  }, []);

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <header className="sticky top-0 z-[9999] border-b border-white/10 bg-black/90 backdrop-blur-xl">
      <div className="flex h-24 items-center justify-between px-6">

        {/* LEFT */}
        <a
          href="/"
          className="flex items-center gap-4"
        >
          <div>
            <h1 className="text-4xl font-black text-white">
              <span className="text-sky-400">
                SKY
              </span>{" "}
              DROP
            </h1>

            <p className="text-sm text-zinc-400">
              Marketplace
            </p>
          </div>
        </a>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-5">

          {/* NAV */}
          {user && (
            <nav className="flex items-center gap-6 text-sm font-bold text-white">
              <a
                href="/list-list"
                className="transition hover:text-sky-400"
              >
                Listings
              </a>

              <a
                href="/favorites"
                className="transition hover:text-sky-400"
              >
                Favorites
              </a>

              <a
                href="/messages"
                className="transition hover:text-sky-400"
              >
                Messages
              </a>

              <a
                href="/trade-feed"
                className="transition hover:text-sky-400"
              >
                Trade Feed
              </a>
            </nav>
          )}

          {/* NOTIFICATIONS */}
          {user && (
            <div className="relative">
              <div
                onClick={() =>
                  setShowNotifications(
                    !showNotifications
                  )
                }
                className="cursor-pointer"
              >
                <NotificationBell
                  count={
                    notificationCount
                  }
                />
              </div>

              {showNotifications && (
                <NotificationDropdown
                  notifications={
                    notifications
                  }
                />
              )}
            </div>
          )}

          {/* PROFILE */}
          {user ? (
            <>
              <a
                href="/profile"
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-white transition hover:border-sky-400 hover:text-sky-400"
              >
                {username ||
                  "Profile"}
              </a>

              <a
                href="/post"
                className="rounded-2xl bg-sky-500 px-6 py-3 font-bold text-white transition hover:bg-sky-400"
              >
                Sell
              </a>

              <button
                onClick={
                  handleLogout
                }
                className="rounded-2xl border border-white/10 px-6 py-3 font-bold text-white transition hover:border-red-500 hover:text-red-400"
              >
                Logout
              </button>
            </>
          ) : (
            <a
              href="/lib/auth"
              className="rounded-2xl bg-sky-500 px-6 py-3 font-bold text-white transition hover:bg-sky-400"
            >
              Login
            </a>
          )}
        </div>
      </div>
    </header>
  );
} 