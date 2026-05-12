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
  setDoc,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import { db, auth } from "../../lib/firebase";

export default function ListingPage() {
  const [listings, setListings] =
    useState<any[]>([]);

  const [favorites, setFavorites] =
    useState<string[]>([]);

  const [search, setSearch] =
    useState("");

  const [selectedCategory, setSelectedCategory] =
    useState("All");

  const [user, setUser] =
    useState<User | null>(null);

  const [loading, setLoading] =
    useState(true);

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
    const listingsQuery = query(
      collection(db, "listings"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe =
      onSnapshot(
        listingsQuery,
        (snapshot) => {

          const items =
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));

          setListings(items);

          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }

    const favoritesRef =
      collection(
        db,
        "users",
        user.uid,
        "favorites"
      );

    const unsubscribe =
      onSnapshot(
        favoritesRef,
        (snapshot) => {

          const saved =
            snapshot.docs.map(
              (doc) => doc.id
            );

          setFavorites(saved);
        }
      );

    return () => unsubscribe();
  }, [user]);

  async function toggleFavorite(
    item: any
  ) {
    if (!user) {

      alert(
        "Login first to save favorites."
      );

      return;
    }

    const favoriteRef = doc(
      db,
      "users",
      user.uid,
      "favorites",
      item.id
    );

    if (
      favorites.includes(item.id)
    ) {

      await deleteDoc(
        favoriteRef
      );

    } else {

      await setDoc(
        favoriteRef,
        {
          listingId: item.id,

          title:
            item.title || "",

          price:
            item.price || "",

          location:
            item.location || "",

          category:
            item.category || "Other",

          description:
            item.description || "",

          sellerEmail:
            item.sellerEmail || "",

          imageUrl:
            item.imageUrl || "",

          savedAt:
            new Date(),
        }
      );
    }
  }

  async function handleDelete(
    id: string
  ) {
    const confirmDelete =
      confirm(
        "Delete this listing?"
      );

    if (!confirmDelete) return;

    try {

      await deleteDoc(
        doc(
          db,
          "listings",
          id
        )
      );

    } catch (error) {

      console.error(error);

      alert(
        "Failed to delete."
      );
    }
  }

  const categories = [
    "All",
    "Cars",
    "Gaming",
    "Phones",
    "Tech",
    "Clothing",
    "Other",
  ];

  const filteredListings =
    listings.filter((item) => {

      const searchText =
        search.toLowerCase();

      const matchesSearch =
        item.title
          ?.toLowerCase()
          .includes(searchText) ||

        item.description
          ?.toLowerCase()
          .includes(searchText) ||

        item.location
          ?.toLowerCase()
          .includes(searchText) ||

        item.category
          ?.toLowerCase()
          .includes(searchText);

      const matchesCategory =
        selectedCategory === "All"
          ? true
          : item.category ===
            selectedCategory;

      return (
        matchesSearch &&
        matchesCategory
      );
    });

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">

      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-12">

        <h1 className="text-5xl font-black text-sky-400">
          Live Listings
        </h1>

        <p className="mt-3 text-zinc-400">
          Browse real items posted on Sky Drop.
        </p>

        {/* FILTERS */}
        <div className="mt-8 flex flex-col gap-4 md:flex-row">

          <input
            type="text"
            placeholder="Search listings..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none backdrop-blur-xl focus:border-sky-400"
          />

          <select
            value={selectedCategory}
            onChange={(e) =>
              setSelectedCategory(
                e.target.value
              )
            }
            className="rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none backdrop-blur-xl focus:border-sky-400"
          >

            {categories.map(
              (category) => (

                <option
                  key={category}
                  value={category}
                >
                  {category}
                </option>

              )
            )}

          </select>

        </div>

        {loading && (

          <p className="mt-10 text-zinc-500">
            Loading listings...
          </p>

        )}

        {!loading &&
          filteredListings.length === 0 && (

          <div className="mt-10 rounded-3xl border border-white/10 bg-black/40 p-8 text-center">

            <h2 className="text-2xl font-bold text-white">
              No listings found
            </h2>

            <p className="mt-2 text-zinc-400">
              Try another search or category.
            </p>

          </div>

        )}

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">

          {filteredListings.map(
            (item) => (

              <div
                key={item.id}
                className="relative rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl transition hover:-translate-y-1 hover:border-sky-400"
              >

                {/* FAVORITE */}
                <button
                  onClick={() =>
                    toggleFavorite(
                      item
                    )
                  }
                  className="absolute right-5 top-5 z-20 text-2xl transition hover:scale-110"
                >

                  {favorites.includes(
                    item.id
                  )
                    ? "❤️"
                    : "🤍"}

                </button>

                {/* IMAGE */}
                {item.imageUrl ? (

                  <img
                    src={
                      item.imageUrl
                    }
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

                    {item.category ||
                      "Other"}

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

                    {item.sellerEmail ||
                      "Unknown seller"}

                  </p>

                </div>

                <div className="mt-6 flex gap-3">

                  <a
                    href={`/post/listing/${item.id}`}
                    className="flex-1 rounded-2xl bg-sky-500 px-4 py-3 text-center font-bold text-white transition hover:bg-sky-400"
                  >
                    View
                  </a>

                  <button
                    onClick={() =>
                      handleDelete(
                        item.id
                      )
                    }
                    className="rounded-2xl bg-red-600 px-5 py-3 font-black text-white transition hover:bg-red-500"
                  >
                    X
                  </button>

                </div>

              </div>

            )
          )}

        </div>

      </section>

    </main>
  );
}