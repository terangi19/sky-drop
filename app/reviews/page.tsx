"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";
import { showToast } from "../components/Toast";

import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import {
  User,
} from "firebase/auth";

import { auth, db, onAuthStateChanged } from "../lib/firebase";

interface Review {
  id: string;
  rating: number;
  comment?: string;
  sellerId?: string;
  sellerEmail?: string;
  buyerEmail?: string;
  reviewer?: string;
  listingId?: string;
  listingTitle?: string;
  reviewText?: string;
  createdAt?: any;
  [key: string]: unknown;
}

export default function ReviewsPage() {
  const [user, setUser] =
    useState<User | null>(null);

  const [reviews, setReviews] =
    useState<Review[]>([]);

  const [sellerEmail, setSellerEmail] =
    useState("");

  const [rating, setRating] =
    useState(5);

  const [reviewText, setReviewText] =
    useState("");

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
    const reviewsQuery = query(
      collection(db, "reviews"),
      orderBy("createdAt", "desc")
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
              } as any)
            );

          setReviews(items as any);
        }
      );

    return () => unsubscribe();
  }, []);

  async function submitReview() {
    if (!user?.email) {
      showToast("You must be logged in.", "error");
      return;
    }

    if (!sellerEmail.trim() || !reviewText.trim()) {
      showToast("Fill all fields.", "error");
      return;
    }

    try {
      await addDoc(collection(db, "reviews"), {
        sellerEmail,
        rating,
        reviewText,
        reviewer: user.email,
        createdAt: serverTimestamp(),
      });

      setSellerEmail("");
      setReviewText("");
      setRating(5);

      showToast("Review submitted.");
    } catch (error) {
      console.error(error);
      showToast("Failed to submit review.", "error");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />

      <Navbar />

      <ThemeToggle />

      <section className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        {/* HEADER */}
        <div className="mb-10">
          <h1 className="text-5xl font-black text-sky-400">
            Reviews
          </h1>

          <p className="mt-3 text-[var(--muted)]">
            Seller ratings and buyer
            feedback.
          </p>
        </div>

        {/* REVIEW FORM */}
        <div className="rounded-[40px] border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="text-3xl font-black">
            Leave Review
          </h2>

          <div className="mt-6 grid gap-5">
            <input
              type="text"
              placeholder="Seller email..."
              value={sellerEmail}
              onChange={(e) =>
                setSellerEmail(
                  e.target.value
                )
              }
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-4 outline-none transition focus:border-sky-400"
            />

            <select
              value={rating}
              onChange={(e) =>
                setRating(
                  Number(
                    e.target.value
                  )
                )
              }
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-4 outline-none"
            >
              <option value={5}>
                ⭐⭐⭐⭐⭐ 5 Stars
              </option>

              <option value={4}>
                ⭐⭐⭐⭐ 4 Stars
              </option>

              <option value={3}>
                ⭐⭐⭐ 3 Stars
              </option>

              <option value={2}>
                ⭐⭐ 2 Stars
              </option>

              <option value={1}>
                ⭐ 1 Star
              </option>
            </select>

            <textarea
              placeholder="Write review..."
              value={reviewText}
              onChange={(e) =>
                setReviewText(
                  e.target.value
                )
              }
              rows={5}
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-4 outline-none transition focus:border-sky-400"
            />

            <button
              onClick={
                submitReview
              }
              className="rounded-2xl bg-sky-500 px-8 py-4 font-black text-[var(--foreground)] transition hover:bg-sky-400"
            >
              Submit Review
            </button>
          </div>
        </div>

        {/* REVIEWS */}
        <div className="mt-12">
          <h2 className="text-4xl font-black">
            Latest Reviews
          </h2>

          <div className="mt-8 grid gap-6">
            {reviews.length === 0 ? (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center shadow-2xl">
                <div className="mb-4 text-6xl">
                  ⭐
                </div>

                <h2 className="text-3xl font-black">
                  No reviews yet
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">Complete a purchase to leave a review.</p>
                <Link href="/" className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                  Browse Marketplace
                </Link>
              </div>
            ) : (
              reviews.map(
                (review) => (
                  <div
                    key={
                      review.id
                    }
                    className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-2xl backdrop-blur-xl"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-black">
                          {
                            review.sellerEmail
                          }
                        </h2>

                        <p className="mt-1 text-sm text-[var(--muted)]">
                          Reviewed by{" "}
                          {
                            review.reviewer
                          }
                        </p>
                      </div>

                      <div className="rounded-2xl bg-yellow-500/10 px-5 py-3 text-xl font-black text-yellow-400">
                        {"⭐".repeat(
                          review.rating
                        )}
                      </div>
                    </div>

                    <p className="mt-6 text-lg leading-8 text-[var(--foreground)]">
                      {
                        review.reviewText
                      }
                    </p>
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