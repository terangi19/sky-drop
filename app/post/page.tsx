"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import {
  auth,
  db,
  storage,
} from "../lib/firebase";
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { detectScam } from "../lib/scamdetection";
import { detectSuspiciousPrice } from "../lib/pricedetection";
import { checkImage } from "../lib/nsfw";
import { showToast } from "../components/Toast";
import { createPendingXP, trackListingCreated } from "../lib/xpValidation";
import { useProfile } from "../contexts/ProfileContext";

export default function PostPage() {
  const router = useRouter();
  const { username } = useProfile();
  const [user, setUser] =
    useState<User | null>(null);

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [price, setPrice] =
    useState("");

  const [category, setCategory] =
    useState("Other");

  const [location, setLocation] =
    useState("");

   const [condition, setCondition] =
     useState("New");
   
   const [acceptOffers, setAcceptOffers] =
     useState(false);

   const [saleType, setSaleType] = useState("buy_now");
   const [startingBid, setStartingBid] = useState("");
   const [reservePrice, setReservePrice] = useState("");
   const [auctionDuration, setAuctionDuration] = useState("3");

   const [pickupAvailable, setPickupAvailable] = useState(false);
   const [shippingAvailable, setShippingAvailable] = useState(false);
   const [pickupArea, setPickupArea] = useState("");
   const [shippingFee, setShippingFee] = useState("");
   const [freeShipping, setFreeShipping] = useState(false);
   const [shipsWithinDays, setShipsWithinDays] = useState("");
    const [stockQuantity, setStockQuantity] = useState("");
    const [expiresIn, setExpiresIn] = useState("14");

  const [loading, setLoading] =
    useState(false);

  const [restricted, setRestricted] =
    useState(false);

  const [scamAlert, setScamAlert] = useState<{ title: string; message: string; found: string[] } | null>(null);
  const [priceAlert, setPriceAlert] = useState(false);
  const [confirmedSubmit, setConfirmedSubmit] = useState(false);
  const formMountedAt = useRef(Date.now());
  const lastListingTime = useRef(0);

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            try {
              const profileSnap =
                await getDoc(
                  doc(
                    db,
                    "profiles",
                    currentUser.uid
                  )
                );

              if (
                profileSnap.exists()
              ) {
                setRestricted(
                  profileSnap.data().restricted === true
                );
              }
            } catch (error) {
              console.error(
                error
              );
            }
          }
        }
      );

    return () =>
      unsubscribe();
  }, []);

  async function createListing() {
    if (!user?.email) {
      alert("Please login first.");
      return;
    }

    if (restricted) {
      alert("Your account is temporarily restricted while we review reports.");
      return;
    }

    if (!title || !description || !price) {
      alert("Fill all required fields.");
      return;
    }

    if (!pickupAvailable && !shippingAvailable) {
      alert("Select at least one delivery method (pickup or shipping).");
      return;
    }

    // CAPTCHA: minimum 3 seconds since form loaded
    if (Date.now() - formMountedAt.current < 3000) {
      alert("Please wait a moment before submitting.");
      return;
    }

    // Rate limit: 30 seconds between listings
    if (Date.now() - lastListingTime.current < 30000) {
      alert("Please wait 30 seconds between listings.");
      return;
    }
    lastListingTime.current = Date.now();

    // Scam check on listing content
    const combinedText = `${title} ${description}`;
    const scamResult = detectScam(combinedText);
    if (scamResult.isScam && !confirmedSubmit) {
      setScamAlert({
        title: "Safety Flag Detected",
        message: "Your listing contains words that may be used in suspicious listings. Review and remove them, or submit anyway.",
        found: scamResult.keywords,
      });
      return;
    }

    // Price check
    const priceNum = Number(price);
    const isSuspiciousPrice = detectSuspiciousPrice(priceNum, category);
    if (isSuspiciousPrice && !confirmedSubmit) {
      setPriceAlert(true);
      return;
    }

    try {
      setLoading(true);

      const images: string[] = [];
      setUploadProgress(0);
      setLoading(true);
      for (const file of imageFiles) {
        const nsfwResult = await checkImage(file);
        if (!nsfwResult.safe) {
          showToast(`"${file.name}" flagged: ${nsfwResult.reason}. Remove it and try again.`, "error");
          setLoading(false);
          return;
        }
        const storageRef = ref(storage, `listings/${user.uid}/${Date.now()}_${file.name}`);
        const task = uploadBytesResumable(storageRef, file);
        await new Promise<void>((resolve, reject) => {
          task.on("state_changed", (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          }, reject, async () => {
            images.push(await getDownloadURL(task.snapshot.ref));
            setUploadProgress((prev) => prev + 1);
            resolve();
          });
        });
      }

      const listingRef = await addDoc(collection(db, "listings"), {
        title,
        description,
        price: String(price),
        category,
        location,
        condition,
        acceptOffers,
        images,
        imageUrl: images[0] || "",
        sellerEmail: user.email,
        sellerUsername: username,
        sellerId: user.uid,
        createdAt: serverTimestamp(),
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
        auctionEndsAt: (saleType === "auction" || saleType === "auction_buy_now") ? new Date(Date.now() + Number(auctionDuration) * 86400000) : null,
        expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
        currentBid: null,
        bidCount: 0,
        highestBidder: null,
      });
      createPendingXP(user.uid, "listing", listingRef.id, listingRef.id);
      trackListingCreated(user.uid, title);

      router.push("/");
      return;
      setDescription("");
      setPrice("");
      setLocation("");
      setCategory("Other");
      setCondition("New");
      setPickupAvailable(false);
      setShippingAvailable(false);
      setPickupArea("");
      setShippingFee("");
      setFreeShipping(false);
      setShipsWithinDays("");
      setStockQuantity("");
      setSaleType("buy_now");
      setStartingBid("");
      setReservePrice("");
      setAuctionDuration("3");
      setConfirmedSubmit(false);
    } catch (error) {
      console.error(error);
      alert("Failed to create listing.");
    }

    setLoading(false);
  }

  function bypassScamAlert() {
    setConfirmedSubmit(true);
    setScamAlert(null);
    setTimeout(() => createListing(), 0);
  }

  function bypassPriceAlert() {
    setConfirmedSubmit(true);
    setPriceAlert(false);
    setTimeout(() => createListing(), 0);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Background />

      <Navbar />

      <ThemeToggle />

      {/* SCAM ALERT MODAL */}
      {scamAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setScamAlert(null)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-amber-400">⚠️ {scamAlert.title}</h3>
              <button onClick={() => setScamAlert(null)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]">{scamAlert.message}</p>
            {scamAlert.found.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {scamAlert.found.map((kw) => (
                  <span key={kw} className="rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400">"{kw}"</span>
                ))}
              </div>
            )}
            <div className="mt-5 flex gap-3">
              <button onClick={() => setScamAlert(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.98]">
                Edit Listing
              </button>
              <button onClick={bypassScamAlert} className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-amber-400 active:scale-[0.98]">
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRICE ALERT MODAL */}
      {priceAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPriceAlert(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-amber-400">⚠️ Unusually Low Price</h3>
              <button onClick={() => setPriceAlert(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]">Your listing price (${price}) seems unusually low for the "{category}" category. This may attract scam filters or suspicious buyers.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setPriceAlert(false)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.98]">
                Set Higher Price
              </button>
              <button onClick={bypassPriceAlert} className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-amber-400 active:scale-[0.98]">
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
  Back
</Link>
          <h1 className="text-5xl font-black text-sky-400">
            Create Listing
          </h1>

          <p className="mt-3 text-[var(--muted)]">
            Sell your item on
            Sky Drop marketplace.
          </p>
        </div>

        <div className="rounded-[40px] border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
          <div className="space-y-6">
            {/* TITLE */}
            <div>
              <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">
                Title
              </label>

              <input
                type="text"
                value={title}
                onChange={(e) =>
                  setTitle(
                    e.target.value
                  )
                }
                placeholder="BMW 335i"
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-[var(--foreground)] outline-none transition focus:border-sky-400"
              />
            </div>

            {/* DESCRIPTION */}
            <div>
              <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">
                Description
              </label>

              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(
                    e.target.value
                  )
                }
                placeholder="Describe your item..."
                rows={6}
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-[var(--foreground)] outline-none transition focus:border-sky-400"
              />
            </div>

            {/* IMAGES */}
            <div>
              <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">
                Images
              </label>
              <div className="grid grid-cols-3 gap-3">
                {imagePreviews.map((preview, i) => (
                  <div key={i} className="group relative overflow-hidden rounded-2xl bg-zinc-800">
                    <img src={preview} alt="" className="aspect-square w-full object-cover" />
                    <button
                      onClick={() => {
                        setImageFiles((prev) => prev.filter((_, j) => j !== i));
                        setImagePreviews((prev) => prev.filter((_, j) => j !== i));
                      }}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600/80 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {imagePreviews.length < 8 && (
                  <button
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
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  const remaining = 8 - imagePreviews.length;
                  const toAdd = files.slice(0, remaining);
                  for (const file of toAdd) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      setImagePreviews((prev) => [...prev, reader.result as string]);
                    };
                    reader.readAsDataURL(file);
                  }
                  setImageFiles((prev) => [...prev, ...toAdd]);
                  if (e.target) e.target.value = "";
                }}
                className="hidden"
              />
            </div>

            {/* PRICE */}
            <div>
              <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">
                Price
              </label>

              <input
                type="number"
                value={price}
                onChange={(e) =>
                  setPrice(
                    e.target.value
                  )
                }
                placeholder="5000"
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-[var(--foreground)] outline-none transition focus:border-sky-400"
              />
            </div>

            {/* CATEGORY */}
            <div>
              <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">
                Category
              </label>

              <select
                value={category}
                onChange={(e) =>
                  setCategory(
                    e.target.value
                  )
                }
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-[var(--foreground)] outline-none transition focus:border-sky-400"
              >
                <option>
                  Cars
                </option>

                <option>
                  Tech
                </option>

                <option>
                  Gaming
                </option>

                <option>
                  Fashion
                </option>

                <option>
                  Home
                </option>

                <option>
                  Sports
                </option>

                <option>
                  Other
                </option>
              </select>
            </div>

             {/* CONDITION */}
             <div>
               <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">
                 Condition
               </label>
               <select
                 value={condition}
                 onChange={(e) =>
                   setCondition(
                     e.target.value
                   )
                 }
                 className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-[var(--foreground)] outline-none transition focus:border-sky-400"
               >
                 <option>New</option>
                 <option>Used - Like New</option>
                 <option>Used - Good</option>
                 <option>Used - Fair</option>
               </select>
             </div>

             {/* SALE TYPE */}
             <div>
               <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">
                 Sale Type
               </label>
               <div className="grid grid-cols-2 gap-2">
                 {[
                   { id: "buy_now", label: "Buy Now" },
                   { id: "buy_now_offers", label: "Buy Now + Offers" },
                   { id: "auction", label: "Auction" },
                   { id: "auction_buy_now", label: "Auction + Buy Now" },
                 ].map((opt) => (
                   <button key={opt.id} type="button" onClick={() => setSaleType(opt.id)}
                     className={`rounded-xl border px-4 py-3 text-xs font-bold text-left transition ${
                       saleType === opt.id ? "border-sky-500/40 bg-sky-500/10 text-sky-400" : "border-zinc-700 bg-zinc-800/50 text-[var(--muted)] hover:border-zinc-600"
                     }`}>
                     {opt.label}
                   </button>
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
                       className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500 placeholder:text-[var(--muted)]" />
                   </div>
                   <div>
                     <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Reserve price ($)</label>
                     <input type="number" value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} placeholder="Optional"
                       className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500 placeholder:text-[var(--muted)]" />
                   </div>
                 </div>
                 <div>
                   <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Duration</label>
                   <select value={auctionDuration} onChange={(e) => setAuctionDuration(e.target.value)}
                     className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500">
                     <option value="1">24 hours</option>
                     <option value="3">3 days</option>
                     <option value="7">7 days</option>
                     <option value="14">14 days</option>
                   </select>
                 </div>
               </div>
             )}

             {/* ACCEPT OFFERS */}
             <div className="flex items-start">
               <div className="flex items-center h-4">
                 <input
                   id="acceptOffers"
                   type="checkbox"
                   checked={acceptOffers}
                   onChange={(e) => setAcceptOffers(e.target.checked)}
                   className="rounded border-gray-300 text-sky-600 shadow-sm focus:border-sky-300 focus:ring-sky-200 focus:ring-offset-0 focus:ring-offset-gray-200"
                 />
               </div>
               <div className="ml-3 text-sm">
                 <label htmlFor="acceptOffers" className="font-medium text-[var(--foreground)]">
                   Accept offers
                 </label>
                 <p className="text-xs text-[var(--muted)]">
                   Allow buyers to make offers below your asking price
                 </p>
               </div>
             </div>

             {/* DELIVERY OPTIONS */}
             <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
               <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">
                 Delivery Options
               </label>

               <div className="space-y-4">
                 {/* Pickup toggle */}
                 <label className="flex cursor-pointer items-center gap-3">
                   <input
                     type="checkbox"
                     checked={pickupAvailable}
                     onChange={(e) => setPickupAvailable(e.target.checked)}
                     className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30"
                   />
                   <div>
                     <span className="text-sm font-medium text-[var(--foreground)]">Pickup available</span>
                     <p className="text-xs text-[var(--muted)]">Buyer collects the item in person</p>
                   </div>
                 </label>

                 {pickupAvailable && (
                   <div className="ml-7">
                     <input
                       type="text"
                       value={pickupArea}
                       onChange={(e) => setPickupArea(e.target.value)}
                       placeholder="Pickup area / suburb"
                       className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                     />
                   </div>
                 )}

                 {/* Shipping toggle */}
                 <label className="flex cursor-pointer items-center gap-3">
                   <input
                     type="checkbox"
                     checked={shippingAvailable}
                     onChange={(e) => setShippingAvailable(e.target.checked)}
                     className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30"
                   />
                   <div>
                     <span className="text-sm font-medium text-[var(--foreground)]">Shipping available</span>
                     <p className="text-xs text-[var(--muted)]">Send the item to the buyer</p>
                   </div>
                 </label>

                 {shippingAvailable && (
                   <div className="ml-7 space-y-3">
                     <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                       <input
                         type="number"
                         value={shippingFee}
                         onChange={(e) => setShippingFee(e.target.value)}
                         placeholder="Shipping fee"
                         className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 py-2.5 pl-8 pr-4 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                       />
                     </div>

                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={freeShipping}
                          onChange={(e) => setFreeShipping(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30"
                        />
                        <span className="text-xs font-medium text-[var(--foreground)]">Free shipping</span>
                      </label>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Ships within (days)</label>
                        <input
                          type="number"
                          value={shipsWithinDays}
                          onChange={(e) => setShipsWithinDays(e.target.value)}
                          placeholder="e.g. 3"
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Stock quantity</label>
                    <input
                      type="number"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      placeholder="e.g. 5"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Listing expires in</label>
                    <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* LOCATION */}
            <div>
              <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">
                Location
              </label>

              <input
                type="text"
                value={location}
                onChange={(e) =>
                  setLocation(
                    e.target.value
                  )
                }
                placeholder="Auckland"
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-[var(--foreground)] outline-none transition focus:border-sky-400"
              />
            </div>

            {/* BUTTON */}
            <button
              onClick={
                createListing
              }
              disabled={loading}
              className="w-full rounded-2xl bg-sky-500 px-6 py-5 text-lg font-black text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50"
            >
              {loading
                ? imageFiles.length > 0 ? `Uploading ${uploadProgress}/${imageFiles.length}...` : "Creating..."
                : "Create Listing"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}