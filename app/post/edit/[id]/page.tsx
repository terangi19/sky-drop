"use client";

import { useEffect, useState, useRef } from "react";

import { showToast } from "../../../components/Toast";
import { sanitizeListingContent } from "../../../lib/sanitize";

import { User } from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import Navbar from "../../../components/Navbar";
import ThemeToggle from "../../../components/ThemeToggle";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  auth,
  db,
  storage,
  onAuthStateChanged,
} from "../../../lib/firebase";

export default function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {

  const [id, setId] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    params.then((resolved) => {
      setId(resolved.id);
    });
  }, [params]);

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

  const [pickupAvailable, setPickupAvailable] = useState(false);
  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [pickupArea, setPickupArea] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [freeShipping, setFreeShipping] = useState(false);
  const [shipsWithinDays, setShipsWithinDays] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [expiresIn, setExpiresIn] = useState("14");
  const [saleType, setSaleType] = useState("buy_now");
  const [startingBid, setStartingBid] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [auctionDuration, setAuctionDuration] = useState("3");

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
      if (!id || !user) {
        return;
      }

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

        if (data.sellerEmail && data.sellerEmail !== user.email) {
          setListingExists(false);
          setLoading(false);
          return;
        }

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

        setImages(
          data.images || (data.imageUrl ? [data.imageUrl] : [])
        );

        setPickupAvailable(data.pickupAvailable === true || data.pickupAvailable === "true");
        setShippingAvailable(data.shippingAvailable === true || data.shippingAvailable === "true");
        setPickupArea(data.pickupArea || "");
        setShippingFee(data.shippingFee ? String(data.shippingFee) : "");
        setFreeShipping(data.freeShipping === true || data.freeShipping === "true");
        setShipsWithinDays(data.shipsWithinDays ? String(data.shipsWithinDays) : "");
        setStockQuantity(data.stockQuantity ? String(data.stockQuantity) : "");
        setSaleType(data.saleType || "buy_now");
        setStartingBid(data.startingBid ? String(data.startingBid) : "");
        setReservePrice(data.reservePrice ? String(data.reservePrice) : "");

      } catch (error) {

        console.error(error);

        setListingExists(false);
      }

      setLoading(false);
    }

    loadListing();

  }, [id, user, checkingUser]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = 8 - images.length;
    const toAdd = files.slice(0, remaining);
    for (const file of toAdd) {
      const url = URL.createObjectURL(file);
      setImages((prev) => [...prev, url]);
    }
    if (e.target) e.target.value = "";
  };

  async function handleSave() {

    if (!user) {
      showToast("Login first.", "error");
      return;
    }

    if (!sellerId || user.uid !== sellerId) {
      showToast("You don't have permission to edit this listing.", "error");
      return;
    }

    try {

      setSaving(true);

      // Upload any new images (blob URLs) to Firebase Storage
      const uploadedImages = await Promise.all(images.map(async (img) => {
        if (img.startsWith("blob:")) {
          const response = await fetch(img);
          const blob = await response.blob();
          const storageRef = ref(storage, `listings/${user.uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
          await uploadBytes(storageRef, blob);
          return await getDownloadURL(storageRef);
        }
        return img;
      }));

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/update-listing", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          listingId: id,
          title: sanitizeListingContent(title),
          price,
          location: sanitizeListingContent(location),
          category,
          description: sanitizeListingContent(description),
          images: uploadedImages,
          pickupAvailable,
          shippingAvailable,
          pickupArea,
          shippingFee: shippingAvailable && shippingFee ? Number(shippingFee) : null,
          freeShipping: shippingAvailable ? freeShipping : false,
          shipsWithinDays: shipsWithinDays ? Number(shipsWithinDays) : null,
          stockQuantity: stockQuantity ? Number(stockQuantity) : null,
          saleType,
          startingBid: saleType !== "buy_now" && startingBid ? Number(startingBid) : null,
          reservePrice: (saleType === "auction" || saleType === "auction_buy_now") && reservePrice ? Number(reservePrice) : null,
          expiresInDays: expiresIn,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || "Failed to update listing", "error");
        setSaving(false);
        return;
      }
      showToast("Listing updated.");

    } catch (error) {

      console.error(error);

      showToast("Failed to update listing.", "error");
    }

    setSaving(false);
  }

  if (checkingUser || loading) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-[var(--muted)]">Loading...</p>
      </main>
    );
  }

  if (!listingExists) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-[var(--muted)]">Listing not found</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-[var(--muted)]">Please login to edit</p>
      </main>
    );
  }

  if (sellerId && user.uid !== sellerId) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-[var(--muted)]">Access denied</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-[var(--foreground)]">
      <Navbar />

      <ThemeToggle />

      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-5xl font-black text-sky-400 mb-10">Edit listing</h1>
        <p className="mt-3 text-[var(--muted)]">Update your listing details.</p>

        <div className="rounded-[40px] border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
          <div className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">Price ($)</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors"
                />
              </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors"
            >
              <option value="Cars">Cars</option>
              <option value="Tech">Tech</option>
              <option value="Gaming">Gaming</option>
              <option value="Fashion">Fashion</option>
              <option value="Home">Home</option>
              <option value="Sports">Sports</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors resize-none"
            />
          </div>

          {/* SALE TYPE */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider mb-2">Sale Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "buy_now", label: "Buy Now" },
                { id: "buy_now_offers", label: "Buy Now + Offers" },
                { id: "auction", label: "Auction" },
                { id: "auction_buy_now", label: "Auction + Buy Now" },
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => setSaleType(opt.id)}
                  className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold text-left transition ${
                    saleType === opt.id ? "border-sky-500/40 bg-sky-500/10 text-sky-400" : "border-zinc-700 bg-zinc-800/50 text-[var(--muted)] hover:border-zinc-600"
                  }`}>{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Auction settings */}
          {(saleType === "auction" || saleType === "auction_buy_now") && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-4 space-y-3">
              <p className="text-xs font-bold text-[var(--foreground)]">Auction Settings</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Starting bid ($)</label>
                  <input type="number" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} placeholder="100"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none focus:border-sky-500 placeholder:text-[var(--muted)]" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Reserve price ($)</label>
                  <input type="number" value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} placeholder="Optional"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none focus:border-sky-500 placeholder:text-[var(--muted)]" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Duration</label>
                <select value={auctionDuration} onChange={(e) => setAuctionDuration(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none focus:border-sky-500">
                  <option value="1">24 hours</option>
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                </select>
              </div>
            </div>
          )}

          {/* DELIVERY OPTIONS */}
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider mb-3">Delivery Options</label>

            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={pickupAvailable}
                  onChange={(e) => setPickupAvailable(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30"
                />
                <span className="text-sm text-[var(--foreground)]">Pickup available</span>
              </label>

              {pickupAvailable && (
                <div className="ml-7">
                  <input
                    type="text"
                    value={pickupArea}
                    onChange={(e) => setPickupArea(e.target.value)}
                    placeholder="Pickup area / suburb"
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                  />
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={shippingAvailable}
                  onChange={(e) => setShippingAvailable(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30"
                />
                <span className="text-sm text-[var(--foreground)]">Shipping available</span>
              </label>

              {shippingAvailable && (
                <div className="ml-7 space-y-2.5">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                    <input
                      type="number"
                      value={shippingFee}
                      onChange={(e) => setShippingFee(e.target.value)}
                      placeholder="Shipping fee"
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                    />
                  </div>

                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={freeShipping}
                      onChange={(e) => setFreeShipping(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30"
                    />
                    <span className="text-xs text-[var(--foreground)]">Free shipping</span>
                  </label>

                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Ships within (days)</label>
                    <input
                      type="number"
                      value={shipsWithinDays}
                      onChange={(e) => setShipsWithinDays(e.target.value)}
                      placeholder="e.g. 3"
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Stock quantity</label>
                <input
                  type="number"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Listing expires in</label>
                <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">Photos</label>
            <div className="grid grid-cols-3 gap-3">
              {images.map((img, i) => (
                <div key={i} className="group relative overflow-hidden rounded-2xl bg-zinc-800">
                  <img src={img} alt="" className="aspect-square w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600/80 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {images.length < 8 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-700 text-[var(--muted)] transition hover:border-sky-500"
                >
                  <span className="text-2xl">+</span>
                  <span className="mt-1 text-[10px] font-medium">Add photo</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-2xl bg-sky-500 px-6 py-5 text-lg font-black text-[var(--foreground)] hover:bg-sky-400 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button
              onClick={() => window.history.back()}
              className="rounded-2xl border border-white/10 bg-zinc-900 px-6 py-5 text-lg font-black text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
    </main>
  );
}