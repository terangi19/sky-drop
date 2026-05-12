"use client";

import { useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import TradeComposer from "../components/TradeComposer";
import TradePostCard from "../components/TradePostCard";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import { onAuthStateChanged, User } from "firebase/auth";

import { auth, db } from "../lib/firebase";

const filters = [
  "All",
  "WTS",
  "WTB",
  "Trading",
];

export default function TradeFeedPage() {

  const [user, setUser] =
    useState<User | null>(
      null
    );

  const [username, setUsername] =
    useState("");

  const [posts, setPosts] =
    useState<any[]>([]);

  const [selectedFilter, setSelectedFilter] =
    useState("All");

  const [type, setType] =
    useState("WTS");

  const [title, setTitle] =
    useState("");

  const [price, setPrice] =
    useState("");

  const [location, setLocation] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [imagePreview, setImagePreview] =
    useState("");

  const [posting, setPosting] =
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

        }
      );

    return () =>
      unsubscribe();

  }, []);

  useEffect(() => {

    const tradeQuery =
      query(
        collection(
          db,
          "tradePosts"
        ),
        orderBy(
          "createdAt",
          "desc"
        )
      );

    const unsubscribe =
      onSnapshot(
        tradeQuery,
        (snapshot) => {

          const items =
            snapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...doc.data(),
              })
            );

          setPosts(items);

        }
      );

    return () =>
      unsubscribe();

  }, []);

  async function postTrade() {

    if (!user?.email) {
      return;
    }

    if (!title) {
      return;
    }

    try {

      setPosting(true);

      await addDoc(
        collection(
          db,
          "tradePosts"
        ),
        {
          type,
          title,
          price,
          location,
          message,
          image: imagePreview,

          sellerEmail:
            user.email,

          sellerUsername:
            username ||
            user.email,

          createdAt:
            serverTimestamp(),
        }
      );

      setTitle("");
      setPrice("");
      setLocation("");
      setMessage("");
      setImagePreview("");

    } catch (error) {

      console.error(
        error
      );

    }

    setPosting(false);

  }

  async function deleteTrade(
    id: string
  ) {

    await deleteDoc(
      doc(
        db,
        "tradePosts",
        id
      )
    );

  }

  const filteredPosts =
    selectedFilter ===
    "All"
      ? posts
      : posts.filter(
          (post) =>
            post.type ===
            selectedFilter
        );

  function formatTime(
    timestamp: any
  ) {

    if (
      !timestamp?.seconds
    ) {
      return "Now";
    }

    const date =
      new Date(
        timestamp.seconds *
          1000
      );

    return date.toLocaleTimeString(
      [],
      {
        hour: "numeric",
        minute: "2-digit",
      }
    );

  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">

      <Background />

      <Navbar />

      <section className="relative z-10 mx-auto max-w-[1780px] px-5 pb-10 pt-5">

        {/* HERO */}
        <div className="relative overflow-hidden rounded-[28px] border border-white/[0.05] bg-[#070707]/85 p-4 backdrop-blur-sm">

          <div className="relative z-10">

            {/* TOP */}
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

              {/* LEFT */}
              <div>

                <div className="flex items-center gap-2">

                  <div className="h-2 w-2 rounded-full bg-sky-400" />

                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-400">

                    Live Marketplace

                  </span>

                </div>

                <h1 className="mt-3 text-[42px] font-black leading-none tracking-tight text-white">

                  Trade Feed

                </h1>

                <p className="mt-2 max-w-[500px] text-[13px] leading-relaxed text-zinc-500">

                  Real-time marketplace activity and live community trading.

                </p>

              </div>

              {/* RIGHT */}
              <div className="flex flex-col gap-3 xl:items-end">

                {/* FILTERS */}
                <div className="flex flex-wrap items-center gap-3">

                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">

                    Filter

                  </span>

                  {filters.map(
                    (filter) => (

                      <button
                        key={filter}
                        onClick={() =>
                          setSelectedFilter(
                            filter
                          )
                        }
                        className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-200 ${
                          selectedFilter ===
                          filter
                            ? "bg-sky-500 text-white"
                            : "border border-white/[0.04] bg-black/30 text-zinc-500 hover:border-white/[0.08] hover:bg-white/[0.03] hover:text-white"
                        }`}
                      >

                        {filter}

                      </button>

                    )
                  )}

                </div>

                {/* SEARCH */}
                <div className="flex h-11 items-center gap-3 rounded-2xl border border-white/[0.045] bg-black/30 px-4">

                  <span className="text-[13px] text-zinc-600">

                    🔍

                  </span>

                  <input
                    type="text"
                    placeholder="Search trades..."
                    className="w-[260px] bg-transparent text-[12px] text-white outline-none placeholder:text-zinc-600"
                  />

                </div>

              </div>

            </div>

            {/* COMPOSER */}
            <div className="mt-6">

              <TradeComposer
                type={type}
                setType={setType}
                title={title}
                setTitle={setTitle}
                price={price}
                setPrice={setPrice}
                location={location}
                setLocation={setLocation}
                message={message}
                setMessage={setMessage}
                selectedListing=""
                setSelectedListing={() => {}}
                listings={[]}
                posting={posting}
                postTrade={postTrade}
                imagePreview={imagePreview}
                setImagePreview={setImagePreview}
              />

            </div>

          </div>

        </div>

        {/* MAIN */}
        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_230px]">

          {/* FEED */}
          <div>

            <div className="mb-3 flex items-center justify-between">

              <div className="flex items-center gap-2">

                <div className="h-2 w-2 rounded-full bg-sky-400" />

                <h2 className="text-[16px] font-black tracking-tight text-white">

                  Live Trades

                </h2>

              </div>

              <span className="text-[11px] text-zinc-500">

                {filteredPosts.length} active

              </span>

            </div>

            <div className="space-y-3">

              {filteredPosts.map(
                (post) => (

                  <TradePostCard
                    key={post.id}
                    post={post}
                    user={user}
                    formatTime={formatTime}
                    deleteTrade={deleteTrade}
                  />

                )
              )}

            </div>

          </div>

          {/* SIDEBAR */}
          <div className="space-y-4">

            {/* ONLINE */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.045] bg-[#0a0a0a]/85 p-4 backdrop-blur-sm">

              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-zinc-600">

                Online Now

              </p>

              <h2 className="mt-3 text-[42px] font-black leading-none tracking-tight text-sky-400">

                124

              </h2>

            </div>

            {/* LIVE ACTIVITY */}
            <div className="rounded-2xl border border-white/[0.045] bg-[#0a0a0a]/85 p-4 backdrop-blur-sm">

              <div className="flex items-center justify-between">

                <h2 className="text-[16px] font-black tracking-tight text-white">

                  Live Activity

                </h2>

                <div className="h-2 w-2 rounded-full bg-sky-400" />

              </div>

              <div className="mt-4 space-y-3">

                {posts.slice(0, 5).map(
                  (post) => (

                    <div
                      key={post.id}
                      className="rounded-xl border border-white/[0.03] bg-black/20 p-3"
                    >

                      <p className="truncate text-[11px] font-black text-white">

                        {post.title}

                      </p>

                      <p className="mt-1 text-[10px] text-zinc-500">

                        @{post.sellerUsername}

                      </p>

                    </div>

                  )
                )}

              </div>

            </div>

          </div>

        </div>

      </section>

    </main>
  );
}