"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";
import { showToast } from "../components/Toast";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";

import {
  User,
  sendEmailVerification,
} from "firebase/auth";

import {
  auth,
  db,
  storage,
  onAuthStateChanged,
} from "../lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { detectScam } from "../lib/scamdetection";
import { detectSuspiciousPrice } from "../lib/pricedetection";
import { checkImage } from "../lib/nsfw";
import { createPendingXP, trackListingCreated } from "../lib/xpValidation";
import { useProfile } from "../contexts/ProfileContext";
import DigitalAssetUpload from "../components/DigitalAssetUpload";
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
   const [listingType, setListingType] = useState<"physical" | "digital" | "service" | "vehicle" | "rental">("physical");
    const [digitalFileURL, setDigitalFileURL] = useState("");
    const [digitalFileName, setDigitalFileName] = useState("");
    const [digitalStoragePath, setDigitalStoragePath] = useState("");
   const [serviceDuration, setServiceDuration] = useState("");
   const [eventDate, setEventDate] = useState("");
   const [eventTime, setEventTime] = useState("");
   const [venue, setVenue] = useState("");
   const [ticketQuantity, setTicketQuantity] = useState("");
   const [ticketType, setTicketType] = useState("General Admission");
   const [vehicleMake, setVehicleMake] = useState("");
   const [vehicleModel, setVehicleModel] = useState("");
   const [vehicleYear, setVehicleYear] = useState("");
   const [vehicleOdometer, setVehicleOdometer] = useState("");
   const [vehicleBodyType, setVehicleBodyType] = useState("SUV");
   const [vehicleFuelType, setVehicleFuelType] = useState("Petrol");
   const [vehicleTransmission, setVehicleTransmission] = useState("Automatic");
   const [vehicleColour, setVehicleColour] = useState("");
   const [jobCompany, setJobCompany] = useState("");
   const [jobEmploymentType, setJobEmploymentType] = useState("Full-time");
   const [salaryMin, setSalaryMin] = useState("");
   const [salaryMax, setSalaryMax] = useState("");
   const [propertyType, setPropertyType] = useState("House");
   const [bedrooms, setBedrooms] = useState("");
   const [bathrooms, setBathrooms] = useState("");
   const [landArea, setLandArea] = useState("");
   const [floorArea, setFloorArea] = useState("");
   const [parking, setParking] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [restricted, setRestricted] =
    useState(false);


  const [scamAlert, setScamAlert] = useState<{ title: string; message: string; found: string[] } | null>(null);
  const [priceAlert, setPriceAlert] = useState(false);
  const [confirmedSubmit, setConfirmedSubmit] = useState(false);

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const progressSteps = [
    { label: "Details", check: !!(title && description) },
    { label: "Photos", check: imagePreviews.length > 0 },
    { label: "Price", check: !!(price && category) },
    { label: "Type", check: !!(listingType && (listingType === "physical" || listingType === "vehicle" || listingType === "rental" ? (pickupAvailable || shippingAvailable) : listingType === "digital" ? !!digitalFileURL : listingType === "service" ? true : true)) },
    { label: "Submit", check: false },
  ];
  const completedSteps = progressSteps.filter(s => s.check).length;
  const progressPercent = Math.round((completedSteps / (progressSteps.length - 1)) * 100);

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
                const data = profileSnap.data();
                setRestricted(data.restricted === true);

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
      showToast("Please login first.", "error");
      return;
    }

    if (restricted) {
      showToast("Your account is temporarily restricted while we review reports.", "error");
      return;
    }

    // Check email verified + phone before allowing listing
    if (user?.uid) {
      const profileSnap = await getDoc(doc(db, "profiles", user.uid));
      if (profileSnap.exists()) {
        const profileData = profileSnap.data();
        if (!user.emailVerified) {
          try {
            await sendEmailVerification(user, { url: window.location.origin + "/post" });
            showToast("Verification email sent! Check your inbox (and spam) to verify your email.", "success");
          } catch {
            showToast("Please verify your email address before creating a listing.", "error");
          }
          return;
        }
        if (!profileData.phone || !profileData.phoneVerified) {
          showToast("Please add and verify your phone number in Profile to create listings.", "error");
          return;
        }
      }
    }

    if (!title || !description || (listingType !== "service" && !price)) {
      showToast("Fill all required fields.", "error");
      return;
    }

    if (title.trim().length < 3) {
      showToast("Title must be at least 3 characters.", "error");
      return;
    }

    if (price && (Number(price) < 1 || Number(price) > 999999)) {
      showToast("Price must be between $1 and $999,999.", "error");
      return;
    }

    if ((listingType === "physical" || listingType === "vehicle" || listingType === "rental") && !pickupAvailable && !shippingAvailable) {
      showToast("Select at least one delivery method (pickup or shipping).", "error");
      return;
    }

    let listingStatus = "live";

    if (listingType === "digital") {
      if (!digitalFileURL) {
        showToast("Upload the digital file you're selling.", "error");
        return;
      }
      const profileSnap = await getDoc(doc(db, "profiles", user.uid));
      if (!profileSnap.exists()) { showToast("Profile not found. Complete your profile first.", "error"); return; }
      const profileData = profileSnap.data();
    }

    if (listingType === "vehicle") {
      if (!vehicleMake || !vehicleModel) {
        showToast("Enter the vehicle make and model.", "error");
        return;
      }
    }

    // Scam detection
    const scamResult = detectScam(`${title} ${description}`);
    if (scamResult.isScam && !confirmedSubmit) {
      setScamAlert({
        title: "Potential Scam Detected",
        message: "Your listing contains language commonly used in scams. Please review and edit.",
        found: scamResult.keywords,
      });
      return;
    }

    // Price detection
    if (detectSuspiciousPrice(Number(price), category) && !confirmedSubmit) {
      setPriceAlert(true);
      return;
    }

    try {
      setLoading(true);

      const images: string[] = [];
      setUploadProgress(0);

      // NSFW check all images first before uploading
      for (const file of imageFiles) {
        const nsfwResult = await checkImage(file);
        if (!nsfwResult.safe) {
          showToast(`"${file.name}" flagged: ${nsfwResult.reason}. Remove it and try again.`, "error");
          setLoading(false);
          return;
        }
      }

      // Upload all images in parallel
      if (imageFiles.length > 0) {
        const uploadTasks = imageFiles.map(async (file) => {
          const storageRef = ref(storage, `listings/${user.uid}/${Date.now()}_${file.name}`);
          const task = uploadBytesResumable(storageRef, file);
          return new Promise<string>((resolve, reject) => {
            task.on("state_changed", (snap) => {
              setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
            }, reject, async () => {
              resolve(await getDownloadURL(task.snapshot.ref));
            });
          });
        });
        const results = await Promise.all(uploadTasks);
        images.push(...results);
        setUploadProgress(100);
      }

      const listingData: any = listingType === "digital" ? {
        title,
        description,
        price: String(price),
        category,
        condition: "Digital",
        acceptOffers: false,
        images,
        imageUrl: images[0] || "",
        sellerEmail: user.email,
        sellerUsername: username,
        sellerId: user.uid,
        createdAt: serverTimestamp(),
        type: "digital",
        digitalStoragePath,
        digitalFileName,
        saleType: "buy_now",
        expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
        status: listingStatus,
      } : listingType === "service" ? {
        title,
        description,
        price: String(price),
        category,
        acceptOffers: true,
        images,
        imageUrl: images[0] || "",
        sellerEmail: user.email,
        sellerUsername: username,
        sellerId: user.uid,
        createdAt: serverTimestamp(),
        type: "service",
        serviceDuration,
        saleType: "buy_now",
        expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
        status: "live",
      } : listingType === "rental" ? {
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
        type: "rental",
        status: "live",
        pickupAvailable: true,
        shippingAvailable: false,
        pickupArea,
        stockQuantity: stockQuantity ? Number(stockQuantity) : null,
        saleType: "buy_now",
        expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
      } : listingType === "vehicle" ? {
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
        type: "vehicle",
        status: "live",
        vehicleMake,
        vehicleModel,
        vehicleYear: vehicleYear ? Number(vehicleYear) : null,
        vehicleOdometer: vehicleOdometer ? Number(vehicleOdometer) : null,
        vehicleBodyType,
        vehicleFuelType,
        vehicleTransmission,
        vehicleColour,
      } : listingType === "job" ? {
        title,
        description,
        price: String(price),
        category,
        acceptOffers: false,
        images,
        imageUrl: images[0] || "",
        sellerEmail: user.email,
        sellerUsername: username,
        sellerId: user.uid,
        createdAt: serverTimestamp(),
        type: "job",
        location,
        jobCompany,
        jobEmploymentType,
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        saleType: "buy_now",
        expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
        status: "live",
      } : listingType === "property" ? {
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
        shippingAvailable: false,
        saleType,
        startingBid: saleType !== "buy_now" && startingBid ? Number(startingBid) : null,
        reservePrice: (saleType === "auction" || saleType === "auction_buy_now") && reservePrice ? Number(reservePrice) : null,
        auctionEndsAt: (saleType === "auction" || saleType === "auction_buy_now") ? new Date(Date.now() + Number(auctionDuration) * 86400000) : null,
        expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
        currentBid: null,
        bidCount: 0,
        highestBidder: null,
        type: "property",
        status: "live",
        propertyType,
        bedrooms: bedrooms ? Number(bedrooms) : null,
        bathrooms: bathrooms ? Number(bathrooms) : null,
        landArea: landArea ? Number(landArea) : null,
        floorArea: floorArea ? Number(floorArea) : null,
        parking: parking ? Number(parking) : null,
      } : {
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
        type: "physical",
        status: "live",
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
      };

      listingData.images = images;
      listingData.imageUrl = images[0] || "";
      listingData.sellerUsername = username;
      listingData.acceptOffers = acceptOffers;
      listingData.expiresInDays = expiresIn;
      listingData.listingType = listingType;

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/create-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify(listingData),
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.error || "Failed to create listing", "error");
        setLoading(false);
        return;
      }

      if (listingType !== "digital") {
        createPendingXP(user.uid, "listing", data.listingId, data.listingId);
        trackListingCreated(user.uid, title);
      }

      // Check Stripe Connect — warn but don't block listing creation
      try {
        const profileSnap = await getDoc(doc(db, "profiles", user.uid));
        if (profileSnap.exists()) {
          const profileData = profileSnap.data();
          if (!profileData.stripeAccountId) {
            showToast("⚠️ Remember to connect Stripe in Profile to receive payouts", "info");
          }
        }
      } catch (e) { console.error("Stripe check error:", e); }

      router.push("/");
    } catch (error) {
      console.error(error);
      showToast("Failed to create listing.", "error");
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

        {/* PROGRESS INDICATOR */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[var(--muted)]">Listing Progress</span>
            <span className="text-xs font-bold text-sky-400">{progressPercent}%</span>
          </div>
          <div className="flex gap-1">
            {progressSteps.map((step, i) => (
              <div key={step.label} className={`flex-1 h-2 rounded-full transition-all duration-500 ${i < completedSteps ? "bg-sky-500" : i === completedSteps && completedSteps < progressSteps.length - 1 ? "bg-sky-500/30" : "bg-zinc-700/50"}`} />
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            {progressSteps.map((step) => (
              <span key={step.label} className={`text-[9px] font-medium ${step.check ? "text-sky-400" : "text-[var(--muted)]"}`}>{step.label}</span>
            ))}
          </div>
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
                maxLength={80}
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
                maxLength={5000}
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
                  const oversized = files.find((f) => f.size > 10 * 1024 * 1024);
                  if (oversized) { showToast(`"${oversized.name}" exceeds 10MB limit`, "error"); if (e.target) e.target.value = ""; return; }
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
                min={0}
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
                  {listingType === "event" ? (
                    <>
                      <option>Concerts & Gigs</option>
                      <option>Festivals</option>
                      <option>Sports</option>
                      <option>Workshops & Classes</option>
                      <option>Community</option>
                      <option>Food & Drink</option>
                      <option>Other</option>
                    </>
                  ) : listingType === "property" ? (
                    <>
                      <option>Property</option>
                      <option>Houses</option>
                      <option>Apartments</option>
                      <option>Land</option>
                      <option>Commercial</option>
                    </>
                  ) : listingType === "job" ? (
                    <>
                      <option>Jobs</option>
                      <option>IT & Tech</option>
                      <option>Design & Creative</option>
                      <option>Sales & Marketing</option>
                      <option>Trades & Services</option>
                      <option>Other</option>
                    </>
                  ) : (
                    <>
                      <option>Cars</option>
                      <option>Tech</option>
                      <option>Gaming</option>
                      <option>Fashion</option>
                      <option>Home</option>
                      <option>Sports</option>
                      <option>Other</option>
                    </>
                  )}
                </select>
              </div>

             {/* CONDITION — physical, vehicle, rental & property */}
             {(listingType === "physical" || listingType === "vehicle" || listingType === "property" || listingType === "rental") && (
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
             )}

             {/* SALE TYPE — physical, vehicle & property */}
             {(listingType === "physical" || listingType === "vehicle" || listingType === "property") && (
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
              )}

              {/* Auction settings — physical, vehicle & property */}
              {(listingType === "physical" || listingType === "vehicle" || listingType === "property") && (saleType === "auction" || saleType === "auction_buy_now") && (
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

              {/* ACCEPT OFFERS — physical, vehicle, rental & property */}
             {(listingType === "physical" || listingType === "vehicle" || listingType === "property" || listingType === "rental") && (
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
              )}

                {/* LISTING TYPE */}
                <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                  <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Listing Type</label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <button onClick={() => { setListingType("physical"); setCategory("Other"); }}
                      className={`rounded-xl border p-3 text-left transition-all ${listingType === "physical" ? "border-sky-500/40 bg-sky-500/10" : "border-zinc-700/50 bg-zinc-800/30 hover:border-zinc-600"}`}>
                      <span className="text-lg">📦</span>
                      <p className="mt-1 text-xs font-bold text-[var(--foreground)]">Physical</p>
                      <p className="text-[10px] text-[var(--muted)]">Sell a physical item</p>
                    </button>
                    <button onClick={() => { setListingType("digital"); setCategory("Templates & Assets"); setPickupAvailable(false); setShippingAvailable(false); }}
                      className={`rounded-xl border p-3 text-left transition-all ${listingType === "digital" ? "border-sky-500/40 bg-sky-500/10" : "border-zinc-700/50 bg-zinc-800/30 hover:border-zinc-600"}`}>
                      <span className="text-lg">📥</span>
                      <p className="mt-1 text-xs font-bold text-[var(--foreground)]">Digital</p>
                      <p className="text-[10px] text-[var(--muted)]">Sell a downloadable file</p>
                    </button>
                    <button onClick={() => { setListingType("service"); setCategory("Other"); }}
                      className={`rounded-xl border p-3 text-left transition-all ${listingType === "service" ? "border-sky-500/40 bg-sky-500/10" : "border-zinc-700/50 bg-zinc-800/30 hover:border-zinc-600"}`}>
                      <span className="text-lg">🤝</span>
                      <p className="mt-1 text-xs font-bold text-[var(--foreground)]">Service</p>
                      <p className="text-[10px] text-[var(--muted)]">Offer a service</p>
                    </button>
                    <button onClick={() => { setListingType("event"); setCategory("Concerts & Gigs"); setPickupAvailable(false); setShippingAvailable(false); }}
                      className={`rounded-xl border p-3 text-left transition-all ${listingType === "event" ? "border-sky-500/40 bg-sky-500/10" : "border-zinc-700/50 bg-zinc-800/30 hover:border-zinc-600"}`}>
                      <span className="text-lg">🎟</span>
                      <p className="mt-1 text-xs font-bold text-[var(--foreground)]">Event</p>
                      <p className="text-[10px] text-[var(--muted)]">Sell event tickets</p>
                    </button>
                    <button onClick={() => { setListingType("vehicle"); setCategory("Cars"); }}
                      className={`rounded-xl border p-3 text-left transition-all ${listingType === "vehicle" ? "border-sky-500/40 bg-sky-500/10" : "border-zinc-700/50 bg-zinc-800/30 hover:border-zinc-600"}`}>
                      <span className="text-lg">🚗</span>
                      <p className="mt-1 text-xs font-bold text-[var(--foreground)]">Vehicle</p>
                      <p className="text-[10px] text-[var(--muted)]">Sell a car, bike, boat</p>
                    </button>
                    <button onClick={() => { setListingType("rental"); setCategory("Other"); }}
                      className={`rounded-xl border p-3 text-left transition-all ${listingType === "rental" ? "border-sky-500/40 bg-sky-500/10" : "border-zinc-700/50 bg-zinc-800/30 hover:border-zinc-600"}`}>
                      <span className="text-lg">🔑</span>
                      <p className="mt-1 text-xs font-bold text-[var(--foreground)]">Rental</p>
                      <p className="text-[10px] text-[var(--muted)]">Rent out an item</p>
                    </button>
                  </div>
                </div>

                {/* DELIVERY OPTIONS — physical, vehicle & rental */}
                {(listingType === "physical" || listingType === "vehicle" || listingType === "rental") && (
               <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                 <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">
                   Delivery Options
                 </label>

                <div className="space-y-4">
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
                 </div>
               </div>
               )}

               {/* DIGITAL FILE UPLOAD */}
               {listingType === "digital" && (
                 <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                   <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">
                     Digital File
                   </label>
                   {digitalFileURL ? (
                     <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 px-4 py-3">
                       <span className="text-xs text-emerald-400">✓ {digitalFileName}</span>
                       <button onClick={() => { setDigitalFileURL(""); setDigitalFileName(""); setDigitalStoragePath(""); }} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
                     </div>
                   ) : (
                     <div className="space-y-2">
                       <DigitalAssetUpload onUpload={(url, name, path) => { setDigitalFileURL(url); setDigitalFileName(name); setDigitalStoragePath(path); }} />
                       <p className="text-[10px] text-[var(--muted)]">Up to 50MB. Buyers receive this file instantly after purchase.</p>
                     </div>
                   )}
                 </div>
               )}

               {/* SERVICE DETAILS */}
               {listingType === "service" && (
                 <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                   <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Service Details</label>
                   <div>
                     <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Estimated delivery time</label>
                     <input
                       type="text"
                       value={serviceDuration}
                       onChange={(e) => setServiceDuration(e.target.value)}
                       placeholder="e.g. 3-5 days, 2 weeks, negotiable"
                       className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                     />
                     <p className="mt-1 text-[10px] text-[var(--muted)]">Buyers will contact you through messages to agree on scope before purchasing.</p>
                   </div>
                 </div>
               )}

                {/* EVENT DETAILS */}
                {listingType === "event" && (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                    <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Event Details</label>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Event date *</label>
                          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Event time</label>
                          <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Venue *</label>
                        <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Spark Arena, Auckland"
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Ticket quantity</label>
                          <input type="number" value={ticketQuantity} onChange={(e) => setTicketQuantity(e.target.value)} placeholder="e.g. 100"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Ticket type</label>
                          <select value={ticketType} onChange={(e) => setTicketType(e.target.value)}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                            <option>General Admission</option>
                            <option>VIP</option>
                            <option>Early Bird</option>
                            <option>Student</option>
                            <option>Family Pass</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* VEHICLE DETAILS */}
                {listingType === "vehicle" && (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                    <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Vehicle Details</label>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Make *</label>
                          <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} placeholder="e.g. Toyota"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Model *</label>
                          <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="e.g. Corolla"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Year</label>
                          <input type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} placeholder="e.g. 2020"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Odometer (km)</label>
                          <input type="number" value={vehicleOdometer} onChange={(e) => setVehicleOdometer(e.target.value)} placeholder="e.g. 50000"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Colour</label>
                          <input type="text" value={vehicleColour} onChange={(e) => setVehicleColour(e.target.value)} placeholder="e.g. White"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Body type</label>
                          <select value={vehicleBodyType} onChange={(e) => setVehicleBodyType(e.target.value)}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                            <option>SUV</option><option>Sedan</option><option>Hatchback</option><option>Wagon</option><option>Coupe</option><option>Convertible</option><option>Ute</option><option>Van</option><option>Truck</option><option>Motorcycle</option><option>Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Fuel type</label>
                          <select value={vehicleFuelType} onChange={(e) => setVehicleFuelType(e.target.value)}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                            <option>Petrol</option><option>Diesel</option><option>Electric</option><option>Hybrid</option><option>Plug-in Hybrid</option><option>Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Transmission</label>
                          <select value={vehicleTransmission} onChange={(e) => setVehicleTransmission(e.target.value)}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                            <option>Automatic</option><option>Manual</option><option>Tiptronic</option><option>CVT</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* JOB DETAILS */}
                {listingType === "job" && (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                    <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Job Details</label>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Company *</label>
                        <input type="text" value={jobCompany} onChange={(e) => setJobCompany(e.target.value)} placeholder="e.g. Sky Drop Ltd"
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Employment type</label>
                          <select value={jobEmploymentType} onChange={(e) => setJobEmploymentType(e.target.value)}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                            <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Casual</option><option>Fixed-term</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Location</label>
                          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Auckland"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Salary min</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                            <input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="70000"
                              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 py-2.5 pl-7 pr-4 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Salary max</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                            <input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="90000"
                              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 py-2.5 pl-7 pr-4 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PROPERTY DETAILS */}
                {listingType === "property" && (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                    <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Property Details</label>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Property type</label>
                          <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                            <option>House</option><option>Apartment</option><option>Unit</option><option>Townhouse</option><option>Lifestyle</option><option>Land</option><option>Commercial</option><option>Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Parking spaces</label>
                          <input type="number" value={parking} onChange={(e) => setParking(e.target.value)} placeholder="e.g. 2"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Bedrooms</label>
                          <input type="number" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} placeholder="e.g. 3"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Bathrooms</label>
                          <input type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} placeholder="e.g. 2"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Land area (m²)</label>
                          <input type="number" value={landArea} onChange={(e) => setLandArea(e.target.value)} placeholder="e.g. 675"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Floor area (m²)</label>
                          <input type="number" value={floorArea} onChange={(e) => setFloorArea(e.target.value)} placeholder="e.g. 150"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* RENTAL DETAILS */}
                {listingType === "rental" && (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                    <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Rental Details</label>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Daily rate ($)</label>
                          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 50"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Refundable deposit ($)</label>
                          <input type="number" placeholder="e.g. 200"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Weekly rate (optional)</label>
                          <input type="number" placeholder="e.g. 300"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Monthly rate (optional)</label>
                          <input type="number" placeholder="e.g. 1000"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* LOCATION — physical, vehicle, rental & property */}
                {(listingType === "physical" || listingType === "vehicle" || listingType === "property" || listingType === "rental") && (
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
               )}

               {/* EXPIRES IN — all types */}
               <div>
                 <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Listing expires in</label>
                 <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
                   className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                   <option value="7">7 days</option>
                   <option value="14">14 days</option>
                   <option value="30">30 days</option>
                 </select>
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