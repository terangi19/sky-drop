"use client";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import { onAuthStateChanged, User } from "firebase/auth";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import Navbar from "../../../components/Navbar";
import Background from "../../../components/Background";

import {
  auth,
  db,
} from "../../../lib/firebase";

export default function EditListingPage() {

  const params = useParams();

  const id = params.id as string;

  const [user, setUser] =
    useState<User | null>(null);

  const [checkingUser, setCheckingUser] =
    useState(true);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [listingExists, setListingExists] =
    useState(true);

  const [title, setTitle] =
    useState("");

  const [price, setPrice] =
    useState("");

  const [location, setLocation] =
    useState("");

  const [category, setCategory] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [sellerId, setSellerId] =
    useState("");

  useEffect(() => {

    const unsubscribe =
      onAuthStateChanged(
        auth,
        (currentUser) => {

          setUser(currentUser);

          setCheckingUser(false);
        }
      );

    return () => unsubscribe();

  }, []);

  useEffect(() => {

    async function loadListing() {

      if (!id) return;

      try {

        const listingRef =
          doc(db, "listings", id);

        const snapshot =
          await getDoc(listingRef);

        if (!snapshot.exists()) {

          setListingExists(false);

          setLoading(false);

          return;
        }

        const data: any =
          snapshot.data();

        setTitle(data.title || "");

        setPrice(data.price || "");

        setLocation(data.location || "");

        setCategory(data.category || "");

        setDescription(
          data.description || ""
        );

        setSellerId(
          data.sellerId || ""
        );

      } catch (error) {

        console.error(error);

        setListingExists(false);
      }

      setLoading(false);
    }

    loadListing();

  }, [id]);

  async function handleSave() {

    if (!user) {
      alert("Login first.");
      return;
    }

    if (user.uid !== sellerId) {
      alert(
        "You can only edit your own listings."
      );
      return;
    }

    try {

      setSaving(true);

      await updateDoc(
        doc(db, "listings", id),
        {
          title,
          price,
          location,
          category,
          description,
        }
      );

      alert("Listing updated.");

    } catch (error) {

      console.error(error);

      alert(
        "Failed to update listing."
      );
    }

    setSaving(false);
  }

  if (checkingUser || loading) {

    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Loading editor...
      </main>
    );
  }

  if (!listingExists) {

    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Listing not found.
      </main>
    );
  }

  if (!user) {

    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Login required.
      </main>
    );
  }

  if (user.uid !== sellerId) {

    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Access denied.
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">

      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-3xl px-6 py-12">

        <div className="rounded-3xl border border-white/10 bg-black/40 p-8 backdrop-blur-xl">

          <h1 className="text-5xl font-black text-sky-400">
            Edit Listing
          </h1>

          <p className="mt-3 text-zinc-400">
            Update your listing details.
          </p>

          <div className="mt-8 space-y-5">

            <input
              type="text"
              placeholder="Listing title"
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 outline-none"
            />

            <input
              type="number"
              placeholder="Price"
              value={price}
              onChange={(e) =>
                setPrice(e.target.value)
              }
              className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 outline-none"
            />

            <input
              type="text"
              placeholder="Location"
              value={location}
              onChange={(e) =>
                setLocation(e.target.value)
              }
              className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 outline-none"
            />

            <input
              type="text"
              placeholder="Category"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value)
              }
              className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 outline-none"
            />

            <textarea
              placeholder="Description"
              value={description}
              onChange={(e) =>
                setDescription(
                  e.target.value
                )
              }
              className="h-40 w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 outline-none"
            />

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-2xl bg-sky-500 px-6 py-5 text-lg font-black text-white transition hover:bg-sky-400"
            >

              {saving
                ? "Saving..."
                : "Save Changes"}

            </button>

          </div>

        </div>

      </section>

    </main>
  );
}