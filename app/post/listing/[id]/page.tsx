"use client";

import { useEffect, useState } from "react";

import Navbar from "../../../components/Navbar";
import Background from "../../../components/Background";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "../../../lib/firebase";

export default function ListingPage({
  params,
}: {
  params: { id: string };
}) {
  const [listing, setListing] =
    useState<any>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    async function fetchListing() {
      try {
        const docRef = doc(
          db,
          "listings",
          params.id
        );

        const docSnap =
          await getDoc(docRef);

        if (docSnap.exists()) {
          setListing({
            id: docSnap.id,
            ...docSnap.data(),
          });
        }
      } catch (error) {
        console.error(error);
      }

      setLoading(false);
    }

    fetchListing();
  }, [params.id]);

  function saveFavorite() {
    const existingFavorites =
      JSON.parse(
        localStorage.getItem(
          "favorites"
        ) || "[]"
      );

    const alreadySaved =
      existingFavorites.find(
        (fav: any) =>
          fav.id === listing.id
      );

    if (alreadySaved) {
      alert(
        "Already in favorites."
      );

      return;
    }

    localStorage.setItem(
      "favorites",
      JSON.stringify([
        ...existingFavorites,
        listing,
      ])
    );

    alert(
      "Saved to favorites."
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
        <p className="text-2xl font-bold">
          Loading listing...
        </p>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
        <p className="text-2xl font-bold">
          Listing not found.
        </p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />

      <Navbar />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-2">
          {/* IMAGE */}
          <div className="rounded-[32px] border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl backdrop-blur-xl">
            {listing.imageUrl ? (
              <img
                src={listing.imageUrl}
                alt={listing.title}
                className="h-[500px] w-full rounded-3xl object-cover"
              />
            ) : (
              <div className="flex h-[500px] items-center justify-center rounded-3xl bg-[var(--soft-card)] text-2xl text-zinc-500">
                No Image Yet
              </div>
            )}
          </div>

          {/* INFO */}
          <div className="space-y-6">
            <div className="rounded-[32px] border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-400">
                  {listing.category ||
                    "Other"}
                </span>

                <span className="rounded-full bg-zinc-500/10 px-4 py-2 text-sm font-bold text-zinc-500">
                  {listing.location ||
                    "Unknown"}
                </span>
              </div>

              <h1 className="mt-6 text-5xl font-black leading-tight">
                {listing.title}
              </h1>

              <p className="mt-6 text-6xl font-black text-sky-400">
                ${listing.price}
              </p>

              <div className="mt-8 border-t border-[var(--card-border)] pt-6">
                <p className="text-sm text-zinc-500">
                  Seller
                </p>

                <p className="mt-2 text-lg font-bold">
                  {listing.sellerEmail ||
                    "Unknown seller"}
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={
                    saveFavorite
                  }
                  className="rounded-2xl bg-red-500 px-6 py-4 font-black text-white transition hover:bg-red-400"
                >
                  ♥ Save
                </button>

                <button className="rounded-2xl bg-sky-500 px-6 py-4 font-black text-white transition hover:bg-sky-400">
                  Contact Seller
                </button>
              </div>
            </div>

            {/* DESCRIPTION */}
            <div className="rounded-[32px] border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-2xl backdrop-blur-xl">
              <h2 className="text-3xl font-black">
                Description
              </h2>

              <p className="mt-6 whitespace-pre-wrap text-lg leading-8 text-[var(--muted)]">
                {listing.description}
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}