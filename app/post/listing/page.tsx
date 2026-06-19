"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import { AwhinaUnderHeader } from "../../components/AwhinaOnlineBadge";
import { showToast } from "../../components/Toast";

import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

import {
  User,
} from "firebase/auth";

import { db, auth, onAuthStateChanged } from "../../lib/firebase";

interface Listing {
  id: string;
  title: string;
  price: string;
  description?: string;
  category?: string;
  image?: string;
  location?: string;
  condition?: string;
  imageUrl?: string;
  images?: string[];
  sellerEmail?: string;
  sellerUsername?: string;
  acceptOffers?: boolean;
  status?: string;
  createdAt?: any;
  [key: string]: unknown;
}

export default function ListingPage() {
  const [listings, setListings] =
    useState<Listing[]>([]);

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
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe =
      onSnapshot(
        listingsQuery,
        (snapshot) => {

          const items =
            snapshot.docs
              .map((doc) => ({
                id: doc.id,
                ...doc.data(),
              } as any))
              .filter((l: any) => l.sellerEmail !== user?.email);

          setListings(items as any);

          setLoading(false);
        },
        (error) => {
          console.error(error);
          setLoading(false);
          showToast("Failed to load listings: " + error.message, "error");
        }
      );

    return () => unsubscribe();
  }, [user]);

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
        },
        (error) => {
          console.error(error);
          showToast("Failed to load favorites: " + error.message, "error");
        }
      );

    return () => unsubscribe();
  }, [user]);

  async function toggleFavorite(
    item: any
  ) {
    if (!user) {
      showToast("Please log in to save favorites.", "error");
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

    const item = listings.find((l: any) => l.id === id);
    if (!item || item.sellerEmail !== user?.email) {
      showToast("You can only delete your own listings", "error");
      return;
    }

    try {

      await deleteDoc(
        doc(
          db,
          "listings",
          id
        )
      );

    } catch (error) {

      console.error("Delete failed:", error);

      showToast("Failed to delete listing. Please try again.", "error");

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
    <main className="relative min-h-screen overflow-hidden bg-black text-[var(--foreground)]">

      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-12">

        <h1 className="text-5xl font-black text-sky-400">
          Live Listings
        </h1>
        <AwhinaUnderHeader className="mt-3" />

        <p className="mt-3 text-[var(--foreground)]">
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
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-[var(--foreground)] outline-none backdrop-blur-xl focus:border-sky-400"
          />

          <select
            value={selectedCategory}
            onChange={(e) =>
              setSelectedCategory(
                e.target.value
              )
            }
            className="rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-[var(--foreground)] outline-none backdrop-blur-xl focus:border-sky-400"
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

          <p className="mt-10 text-[var(--muted)]">
            Loading listings...
          </p>

        )}

        {!loading &&
          filteredListings.length === 0 && (

          <div className="mt-10 rounded-3xl border border-white/10 bg-black/40 p-8 text-center">

            <h2 className="text-2xl font-bold text-[var(--foreground)]">
              No listings found
            </h2>

            <p className="mt-2 text-[var(--foreground)]">
              Try another search or category.
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button onClick={() => { setSearch(""); setSelectedCategory("All"); }}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-[var(--foreground)] transition hover:bg-zinc-700 active:scale-[0.97]">
                Clear Filters
              </button>
              <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                Browse All
              </Link>
            </div>

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
                {item.images?.[0] || item.imageUrl || item.image ? (

                  <img
                    src={item.images?.[0] || item.imageUrl || item.image || ""}
                    alt={item.title}
                    className="h-52 w-full rounded-2xl object-cover"
                  />

                ) : (

                  <div className="flex h-52 items-center justify-center rounded-2xl bg-zinc-900 text-[var(--muted)]">
                    No Image Yet
                  </div>

                )}

                <div className="mt-5 flex items-center justify-between gap-3">

                  <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-400">

                    {item.category ||
                      "Other"}

                  </span>

                  <span className="text-sm text-[var(--muted)]">

                    {item.location}

                  </span>

                </div>

                <h2 className="mt-4 text-2xl font-black">

                  {item.title}

                </h2>

                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--foreground)]">

                  {item.description}

                </p>

                <p className="mt-5 text-3xl font-black text-sky-400">

                  ${item.price}

                </p>

                <div className="mt-4 border-t border-white/10 pt-4">

                  <p className="text-xs text-[var(--muted)]">
                    Seller
                  </p>

                  <p className="truncate text-sm text-[var(--foreground)]">

                    {item.sellerEmail === user?.email ? "You" : (item.sellerUsername || "Seller")}

                  </p>

                </div>

                <div className="mt-6 flex gap-3">

                  <a
                    href={item.type === "service" ? "/services" : item.type === "event" ? "/events" : item.type === "vehicle" ? "/vehicles" : item.type === "job" ? "/jobs" : item.type === "property" ? "/property" : item.type === "digital" ? "/digital" : item.type === "rental" ? "/rentals" : `/post/listing/${item.id}`}
                    className="flex-1 rounded-2xl bg-sky-500 px-4 py-3 text-center font-bold text-[var(--foreground)] transition hover:bg-sky-400"
                  >
                    View
                  </a>

                  {user?.email === item.sellerEmail && (
                  <button
                    onClick={() =>
                      handleDelete(
                        item.id
                      )
                    }
                    className="rounded-2xl bg-red-600 px-5 py-3 font-black text-[var(--foreground)] transition hover:bg-red-500"
                  >
                    X
                  </button>
                  )}

                </div>

              </div>

            )
          )}

        </div>

      </section>

    </main>
  );
}