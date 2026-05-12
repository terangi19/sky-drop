"use client";

import { useEffect, useState } from "react";

import Navbar from "../../components/Navbar";
import Background from "../../components/Background";

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

import { auth, db } from "../../lib/firebase";

export default function ListingPage() {
  const [listings, setListings] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribeAuth =
      onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
      });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const listingsQuery = query(
      collection(db, "listings"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      listingsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setListings(items);

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  async function deleteListing(id: string) {
    const confirmDelete = confirm(
      "Delete this listing?"
    );

    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "listings", id));

      alert("Listing deleted.");
    } catch (error) {
      console.error(error);

      alert("Failed to delete listing.");
    }
  }

  function saveFavorite(item: any) {
    const existingFavorites = JSON.parse(
      localStorage.getItem("favorites") || "[]"
    );

    const alreadySaved = existingFavorites.find(
      (fav: any) => fav.id === item.id
    );

    if (alreadySaved) {
      alert("Already in favorites.");
      return;
    }

    const updatedFavorites = [
      ...existingFavorites,
      item,
    ];

    localStorage.setItem(
      "favorites",
      JSON.stringify(updatedFavorites)
    );

    alert("Saved to favorites.");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <Background />

      <Navbar />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-5xl font-black text-sky-400">
            Live Listings
          </h1>

          <p className="text-zinc-400">
            Browse real items posted on Sky Drop.
          </p>
        </div>

        {loading && (
          <p className="mt-10 text-zinc-500">
            Loading listings...
          </p>
        )}

        {!loading && listings.length === 0 && (
          <div className="mt-10 rounded-3xl border border-white/10 bg-black/40 p-8 text-center">
            <h2 className="text-2xl font-bold text-white">
              No listings yet
            </h2>

            <p className="mt-2 text-zinc-400">
              Be the first person to sell something on Sky Drop.
            </p>

            <a
              href="/post"
              className="mt-6 inline-block rounded-2xl bg-sky-500 px-6 py-3 font-bold text-white hover:bg-sky-400"
            >
              Post a Listing
            </a>
          </div>
        )}

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((item) => (
            <div
              key={item.id}
              className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl transition hover:-translate-y-1 hover:border-sky-400"
            >
              <button
                onClick={() => saveFavorite(item)}
                className="mb-4 text-2xl text-red-500"
              >
                ♥
              </button>

              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="h-52 w-full rounded-2xl object-cover"
                />
              ) : (
                <div className="flex h-52 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-600">
                  No Image Yet
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-400">
                  {item.category || "Other"}
                </span>

                <span className="text-sm text-zinc-500">
                  {item.location}
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-black">
                {item.title}
              </h2>

              <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-400">
                {item.description}
              </p>

              <p className="mt-5 text-3xl font-black text-sky-400">
                ${item.price}
              </p>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs text-zinc-500">
                  Seller
                </p>

                <p className="truncate text-sm text-zinc-300">
                  {item.sellerEmail || "Unknown seller"}
                </p>
              </div>

              <div className="mt-6 flex gap-3">
                <a
                  href={`/post/listing/${item.id}`}
                  className="flex-1 rounded-2xl bg-sky-500 px-4 py-3 text-center font-bold text-white transition hover:bg-sky-400"
                >
                  View
                </a>

                {user &&
                  user.email === item.sellerEmail && (
                    <>
                      <a
                        href={`/post/edit/${item.id}`}
                        className="rounded-2xl bg-yellow-500 px-4 py-3 font-bold text-black transition hover:bg-yellow-400"
                      >
                        Edit
                      </a>

                      <button
                        onClick={() =>
                          deleteListing(item.id)
                        }
                        className="rounded-2xl bg-red-600 px-4 py-3 font-bold text-white transition hover:bg-red-500"
                      >
                        X
                      </button>
                    </>
                  )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}