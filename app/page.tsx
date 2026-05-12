"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Navbar from "./components/Navbar";
import Background from "./components/Background";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import ThemeToggle from "./components/ThemeToggle";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { auth, db } from "./lib/firebase";

const categories = [
  "All",
  "Cars",
  "Tech",
  "Gaming",
  "Fashion",
  "Other",
];

export default function Home() {

  const [listings, setListings] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState("");

  const [selectedCategory, setSelectedCategory] =
    useState("All");

  const [sortBy, setSortBy] =
    useState("newest");

  const [user, setUser] =
    useState<User | null>(null);

  useEffect(() => {

    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);
        }
      );

    return () =>
      unsubscribeAuth();

  }, []);

  useEffect(() => {

    const listingsQuery =
      query(
        collection(
          db,
          "listings"
        ),
        orderBy(
          "createdAt",
          "desc"
        )
      );

    const unsubscribe =
      onSnapshot(
        listingsQuery,
        (snapshot) => {

          const items =
            snapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...doc.data(),
              })
            );

          setListings(items);

          setLoading(false);

        }
      );

    return () =>
      unsubscribe();

  }, []);

  async function deleteListing(
    id: string
  ) {

    const confirmDelete =
      confirm(
        "Delete this listing?"
      );

    if (!confirmDelete)
      return;

    try {

      await deleteDoc(
        doc(
          db,
          "listings",
          id
        )
      );

      alert(
        "Listing deleted."
      );

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Failed to delete listing."
      );

    }

  }

  function saveFavorite(
    item: any
  ) {

    const existingFavorites =
      JSON.parse(
        localStorage.getItem(
          "favorites"
        ) || "[]"
      );

    const alreadySaved =
      existingFavorites.find(
        (fav: any) =>
          fav.id === item.id
      );

    if (alreadySaved) {

      alert(
        "Already in favorites."
      );

      return;

    }

    const updatedFavorites =
      [
        ...existingFavorites,
        item,
      ];

    localStorage.setItem(
      "favorites",
      JSON.stringify(
        updatedFavorites
      )
    );

    alert(
      "Saved to favorites."
    );

  }

  const filteredListings =
    useMemo(() => {

      let filtered =
        listings.filter(
          (item) => {

            const matchesSearch =
              item.title
                ?.toLowerCase()
                .includes(
                  search.toLowerCase()
                ) ||
              item.description
                ?.toLowerCase()
                .includes(
                  search.toLowerCase()
                ) ||
              item.category
                ?.toLowerCase()
                .includes(
                  search.toLowerCase()
                );

            const matchesCategory =
              selectedCategory ===
                "All" ||
              item.category ===
                selectedCategory;

            return (
              matchesSearch &&
              matchesCategory
            );

          }
        );

      if (
        sortBy ===
        "low-high"
      ) {

        filtered.sort(
          (a, b) =>
            Number(
              a.price
            ) -
            Number(
              b.price
            )
        );

      }

      if (
        sortBy ===
        "high-low"
      ) {

        filtered.sort(
          (a, b) =>
            Number(
              b.price
            ) -
            Number(
              a.price
            )
        );

      }

      if (
        sortBy ===
        "oldest"
      ) {

        filtered.reverse();

      }

      return filtered;

    }, [
      listings,
      search,
      selectedCategory,
      sortBy,
    ]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">

      <Background />

      <Navbar />

      <ThemeToggle />

      {/* HERO */}
      <section className="relative z-10 mx-auto max-w-[1700px] px-6 pb-8 pt-6">

        {/* TOP BADGE */}
        <div className="flex justify-center">

          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/[0.08] px-4 py-2">

            <div className="h-2 w-2 rounded-full bg-sky-400" />

            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300">

              New Zealand Marketplace

            </span>

          </div>

        </div>

        {/* TITLE */}
        <div className="mt-6 text-center">

          <h1 className="text-[52px] font-black leading-none tracking-tight text-white lg:text-[68px]">

            Buy. Sell.
            <span className="text-sky-400">

              Sky Drop.

            </span>

          </h1>

          <p className="mx-auto mt-4 max-w-[700px] text-[15px] leading-relaxed text-[var(--muted)]">

            Search listings, browse categories and discover amazing deals across New Zealand.

          </p>

        </div>

        {/* SEARCH */}
        <div className="mx-auto mt-8 max-w-[1250px]">

          <div className="flex overflow-hidden rounded-[28px] border border-[var(--card-border)] bg-[var(--card)] shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">

            {/* INPUT */}
            <div className="flex flex-1 items-center gap-4 px-6">

              <span className="text-[18px] text-zinc-500">

                🔍

              </span>

              <input
                type="text"
                placeholder="Search listings, cars, tech, gaming..."
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                className="h-[72px] w-full bg-transparent text-[16px] text-[var(--foreground)] outline-none placeholder:text-zinc-600"
              />

            </div>

            {/* BUTTON */}
            <button className="m-3 rounded-2xl bg-sky-500 px-10 text-[14px] font-bold text-white transition hover:bg-sky-400">

              Search

            </button>

          </div>

          {/* CATEGORY ROW */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">

            {categories.map(
              (category) => (

                <button
                  key={category}
                  onClick={() =>
                    setSelectedCategory(
                      category
                    )
                  }
                  className={`rounded-2xl px-5 py-3 text-[13px] font-bold transition-all duration-200 ${
                    selectedCategory ===
                    category
                      ? "bg-sky-500 text-white shadow-[0_0_30px_rgba(14,165,233,0.35)]"
                      : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:border-sky-400 hover:text-sky-400"
                  }`}
                >

                  {category}

                </button>

              )
            )}

          </div>

          {/* SORT */}
          <div className="mt-4 flex justify-center">

            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value
                )
              }
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-5 py-3 text-[13px] font-bold text-[var(--foreground)] shadow-xl outline-none"
            >

              <option value="newest">

                Newest

              </option>

              <option value="oldest">

                Oldest

              </option>

              <option value="low-high">

                Price Low → High

              </option>

              <option value="high-low">

                Price High → Low

              </option>

            </select>

          </div>

        </div>

      </section>

      {/* LISTINGS */}
      <section className="relative z-10 mx-auto max-w-[1700px] px-6 pb-24">

        <div className="mb-8">

          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">

            Marketplace

          </p>

          <h2 className="mt-2 text-[40px] font-black tracking-tight text-white">

            Latest Listings

          </h2>

          <p className="mt-2 text-[14px] text-[var(--muted)]">

            {filteredListings.length} listings found

          </p>

        </div>

        {loading && (

          <p className="mt-10 text-zinc-500">

            Loading listings...

          </p>

        )}

        {!loading &&
          filteredListings.length ===
            0 && (

            <div className="rounded-[32px] border border-[var(--card-border)] bg-[var(--card)] p-14 text-center shadow-[0_20px_80px_rgba(0,0,0,0.45)]">

              <h2 className="text-[34px] font-black tracking-tight text-white">

                No listings found

              </h2>

              <p className="mx-auto mt-4 max-w-[500px] text-[15px] leading-relaxed text-[var(--muted)]">

                Try another search or category.

              </p>

            </div>

          )}

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">

          {filteredListings.map(
            (item) => (

              <div
                key={item.id}
                className="group overflow-hidden rounded-[30px] border border-[var(--card-border)] bg-[var(--card)] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-sky-400"
              >

                {item.imageUrl ? (

                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="h-64 w-full object-cover"
                  />

                ) : (

                  <div className="flex h-64 items-center justify-center bg-[var(--soft-card)] text-zinc-600">

                    No Image Yet

                  </div>

                )}

                <div className="p-5">

                  <div className="flex items-center justify-between gap-3">

                    <span className="rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-bold text-sky-400">

                      {item.category ||
                        "Other"}

                    </span>

                    <button
                      onClick={() =>
                        saveFavorite(
                          item
                        )
                      }
                      className="text-[20px] text-zinc-600 transition hover:text-red-400"
                    >

                      ♥

                    </button>

                  </div>

                  <h2 className="mt-4 line-clamp-1 text-[26px] font-black tracking-tight text-white">

                    {item.title}

                  </h2>

                  <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-[var(--muted)]">

                    {item.description}

                  </p>

                  <p className="mt-5 text-[34px] font-black tracking-tight text-sky-400">

                    ${item.price}

                  </p>

                  <div className="mt-5 border-t border-[var(--card-border)] pt-4">

                    <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                      Seller

                    </p>

                    <a
                      href={`/seller/${item.sellerUsername}`}
                      className="mt-2 block truncate text-[14px] font-bold text-sky-400 transition hover:text-sky-300 hover:underline"
                    >

                      by{" "}
                      {item.sellerUsername ||
                        "Unknown Seller"}

                    </a>

                  </div>

                  <div className="mt-6 flex gap-3">

                    <a
                      href={`/post/listing/${item.id}`}
                      className="flex-1 rounded-2xl bg-sky-500 px-4 py-3 text-center text-[14px] font-bold text-white transition hover:bg-sky-400"
                    >

                      View

                    </a>

                    {user &&
                      user.email ===
                        item.sellerEmail && (

                        <>
                          <a
                            href={`/post/edit/${item.id}`}
                            className="rounded-2xl bg-yellow-500 px-4 py-3 text-[14px] font-bold text-black transition hover:bg-yellow-400"
                          >

                            Edit

                          </a>

                          <button
                            onClick={() =>
                              deleteListing(
                                item.id
                              )
                            }
                            className="rounded-2xl bg-red-600 px-4 py-3 text-[14px] font-bold text-white transition hover:bg-red-500"
                          >

                            X

                          </button>
                        </>
                      )}

                  </div>

                </div>

              </div>

            )
          )}

        </div>

      </section>

    </main>
  );
}