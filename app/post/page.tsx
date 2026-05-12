"use client";

import { useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import {
  auth,
  db,
} from "../lib/firebase";

export default function PostPage() {
  const [user, setUser] =
    useState<User | null>(null);

  const [username, setUsername] =
    useState("");

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [price, setPrice] =
    useState("");

  const [category, setCategory] =
    useState("Other");

  const [location, setLocation] =
    useState("");

  const [loading, setLoading] =
    useState(false);

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

  async function createListing() {
    if (!user?.email) {
      alert(
        "Please login first."
      );

      return;
    }

    if (
      !title ||
      !description ||
      !price
    ) {
      alert(
        "Fill all required fields."
      );

      return;
    }

    try {
      setLoading(true);

      await addDoc(
        collection(
          db,
          "listings"
        ),
        {
          title,
          description,

          price:
            Number(price),

          category,

          location,

          imageUrl: "",

          sellerEmail:
            user.email,

          sellerUsername:
            username,

          createdAt:
            serverTimestamp(),
        }
      );

      alert(
        "Listing created!"
      );

      setTitle("");
      setDescription("");
      setPrice("");
      setLocation("");
      setCategory("Other");
    } catch (error) {
      console.error(error);

      alert(
        "Failed to create listing."
      );
    }

    setLoading(false);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Background />

      <Navbar />

      <ThemeToggle />

      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10">
          <h1 className="text-5xl font-black text-sky-400">
            Create Listing
          </h1>

          <p className="mt-3 text-[var(--muted)]">
            Sell your item on
            Sky Drop marketplace.
          </p>
        </div>

        <div className="rounded-[40px] border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
          <div className="space-y-6">
            {/* TITLE */}
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Title
              </label>

              <input
                type="text"
                value={title}
                onChange={(e) =>
                  setTitle(
                    e.target.value
                  )
                }
                placeholder="BMW 335i"
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-white outline-none transition focus:border-sky-400"
              />
            </div>

            {/* DESCRIPTION */}
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Description
              </label>

              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(
                    e.target.value
                  )
                }
                placeholder="Describe your item..."
                rows={6}
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-white outline-none transition focus:border-sky-400"
              />
            </div>

            {/* PRICE */}
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Price
              </label>

              <input
                type="number"
                value={price}
                onChange={(e) =>
                  setPrice(
                    e.target.value
                  )
                }
                placeholder="5000"
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-white outline-none transition focus:border-sky-400"
              />
            </div>

            {/* CATEGORY */}
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Category
              </label>

              <select
                value={category}
                onChange={(e) =>
                  setCategory(
                    e.target.value
                  )
                }
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-white outline-none transition focus:border-sky-400"
              >
                <option>
                  Cars
                </option>

                <option>
                  Tech
                </option>

                <option>
                  Gaming
                </option>

                <option>
                  Fashion
                </option>

                <option>
                  Other
                </option>
              </select>
            </div>

            {/* LOCATION */}
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Location
              </label>

              <input
                type="text"
                value={location}
                onChange={(e) =>
                  setLocation(
                    e.target.value
                  )
                }
                placeholder="Auckland"
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-white outline-none transition focus:border-sky-400"
              />
            </div>

            {/* BUTTON */}
            <button
              onClick={
                createListing
              }
              disabled={loading}
              className="w-full rounded-2xl bg-sky-500 px-6 py-5 text-lg font-black text-white transition hover:bg-sky-400 disabled:opacity-50"
            >
              {loading
                ? "Creating..."
                : "Create Listing"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}