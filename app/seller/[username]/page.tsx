"use client";

import { useEffect, useState } from "react";

import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";

import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { db } from "../../lib/firebase";

export default function SellerPage({
  params,
}: {
  params: {
    username: string;
  };
}) {
  const [listings, setListings] =
    useState<any[]>([]);

  const [reviews, setReviews] =
    useState<any[]>([]);

  const [sellerEmail, setSellerEmail] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const username =
    decodeURIComponent(
      params.username
    );

  useEffect(() => {
    async function fetchSeller() {
      try {
        // FIND PROFILE
        const profileQuery =
          query(
            collection(
              db,
              "profiles"
            ),
            where(
              "username",
              "==",
              username
            )
          );

        const profileSnap =
          await getDocs(
            profileQuery
          );

        if (
          profileSnap.empty
        ) {
          setLoading(false);

          return;
        }

        const profileData =
          profileSnap.docs[0].data();

        const email =
          profileData.email;

        setSellerEmail(
          email
        );

        // LISTINGS
        const listingsQuery =
          query(
            collection(
              db,
              "listings"
            ),
            where(
              "sellerEmail",
              "==",
              email
            )
          );

        const listingsSnap =
          await getDocs(
            listingsQuery
          );

        const listingItems =
          listingsSnap.docs.map(
            (doc) => ({
              id: doc.id,
              ...doc.data(),
            })
          );

        setListings(
          listingItems
        );
      } catch (error) {
        console.error(error);
      }

      setLoading(false);
    }

    fetchSeller();
  }, [username]);

  useEffect(() => {
    if (!sellerEmail)
      return;

    const reviewsQuery =
      query(
        collection(
          db,
          "reviews"
        ),
        where(
          "sellerEmail",
          "==",
          sellerEmail
        )
      );

    const unsubscribe =
      onSnapshot(
        reviewsQuery,
        (snapshot) => {
          const items =
            snapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...doc.data(),
              })
            );

          setReviews(items);
        }
      );

    return () => unsubscribe();
  }, [sellerEmail]);

  const averageRating =
    reviews.length > 0
      ? (
          reviews.reduce(
            (
              total,
              review
            ) =>
              total +
              review.rating,
            0
          ) / reviews.length
        ).toFixed(1)
      : "0.0";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />

      <Navbar />

      <ThemeToggle />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-12">
        {/* HEADER */}
        <div className="rounded-[40px] border border-[var(--card-border)] bg-[var(--card)] p-10 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-6">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-sky-500 text-5xl font-black text-white shadow-lg shadow-sky-500/30">
                {username
                  ?.charAt(0)
                  .toUpperCase()}
              </div>

              <div>
                <h1 className="text-5xl font-black">
                  {username}
                </h1>

                <p className="mt-3 text-lg text-[var(--muted)]">
                  Seller Profile
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <div className="rounded-2xl bg-yellow-500/10 px-5 py-3 text-xl font-black text-yellow-400">
                    ⭐{" "}
                    {
                      averageRating
                    }
                  </div>

                  <p className="text-sm text-zinc-500">
                    {
                      reviews.length
                    }{" "}
                    reviews
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--soft-card)] px-8 py-6 text-center">
              <p className="text-sm text-zinc-500">
                Listings
              </p>

              <p className="mt-2 text-4xl font-black text-sky-400">
                {
                  listings.length
                }
              </p>
            </div>
          </div>
        </div>

        {/* LISTINGS */}
        <div className="mt-14">
          <h2 className="text-4xl font-black">
            Seller Listings
          </h2>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <p className="text-zinc-500">
                Loading listings...
              </p>
            ) : listings.length ===
              0 ? (
              <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-12 shadow-2xl">
                No listings found.
              </div>
            ) : (
              listings.map(
                (item) => (
                  <div
                    key={
                      item.id
                    }
                    className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl backdrop-blur-xl transition hover:-translate-y-1 hover:border-sky-400"
                  >
                    {item.imageUrl ? (
                      <img
                        src={
                          item.imageUrl
                        }
                        alt={
                          item.title
                        }
                        className="h-52 w-full rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-52 items-center justify-center rounded-2xl bg-[var(--soft-card)] text-zinc-500">
                        No Image Yet
                      </div>
                    )}

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-400">
                        {
                          item.category
                        }
                      </span>

                      <span className="text-sm text-zinc-500">
                        {
                          item.location
                        }
                      </span>
                    </div>

                    <h2 className="mt-4 text-2xl font-black">
                      {
                        item.title
                      }
                    </h2>

                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
                      {
                        item.description
                      }
                    </p>

                    <p className="mt-5 text-3xl font-black text-sky-400">
                      $
                      {
                        item.price
                      }
                    </p>

                    <div className="mt-6">
                      <a
                        href={`/post/listing/${item.id}`}
                        className="block rounded-2xl bg-sky-500 px-4 py-3 text-center font-bold text-white transition hover:bg-sky-400"
                      >
                        View Listing
                      </a>
                    </div>
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