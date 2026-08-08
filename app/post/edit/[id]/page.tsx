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
import { AwhinaUnderHeader } from "../../../components/AwhinaOnlineBadge";

import { uploadListingImagesViaApi } from "../../../lib/upload-listing-image.client";
import {
  auth,
  db,
  onAuthStateChanged,
} from "../../../lib/firebase";
import { isStripeCheckoutVisibleClient } from "../../../lib/stripe-checkout-flags";
import {
  categoriesForListingType,
  isLegacyVehicleListing,
  listingSupportsCondition,
  listingSupportsSaleType,
  isMessagingOnlyListingType,
  RENTAL_SUB_TYPES,
  RENTAL_RATE_PERIODS,
  type RentalSubType,
  type RentalRatePeriod,
} from "../../../lib/listing-type-config";
import { listingAmountFieldLabel } from "../../../lib/listing-price-display";
import { validateListingForPublish } from "../../../lib/listing-validation";
import {
  normalizeServicePricingType,
  type ServicePricingType,
} from "../../../lib/service-pricing";

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

  const [listingType, setListingType] = useState("physical");

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

  const [condition, setCondition] = useState("");

  const [sellerId, setSellerId] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");

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
  const stripeDisabledV1 = !isStripeCheckoutVisibleClient();

  const [servicePricingType, setServicePricingType] = useState<ServicePricingType>("fixed");
  const [rentalSubType, setRentalSubType] = useState<RentalSubType>("equipment");
  const [rentalRatePeriod, setRentalRatePeriod] = useState<RentalRatePeriod>("day");
  const [rentalPriceWeekly, setRentalPriceWeekly] = useState("");
  const [rentalPriceMonthly, setRentalPriceMonthly] = useState("");
  const [rentalDeposit, setRentalDeposit] = useState("");
  const [rentalAvailableDate, setRentalAvailableDate] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleOdometer, setVehicleOdometer] = useState("");

  const categoryOptions = categoriesForListingType(listingType);
  const supportsCondition = listingSupportsCondition(listingType);
  const supportsSaleType = listingSupportsSaleType(listingType);
  const messagingOnly = isMessagingOnlyListingType(listingType);
  const isPropertyRental =
    listingType === "rental" && rentalSubType === "property";
  const amountLabel = listingAmountFieldLabel({
    type: listingType,
    servicePricingType,
    rentalSubType,
  });

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

        const type = String(data.type || "physical").toLowerCase();
        if (isLegacyVehicleListing({ type, category: data.category })) {
          setListingType("vehicle");
        } else {
          setListingType(type);
        }

        setTitle(data.title || "");

        setPrice(data.price != null ? String(data.price) : "");

        setLocation(data.location || "");

        setCategory(data.category || "");

        setDescription(
          data.description || ""
        );

        setCondition(data.condition || "");

        setSellerId(data.sellerId || "");
        setSellerEmail(data.sellerEmail || "");

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

        setServicePricingType(
          normalizeServicePricingType(data.servicePricingType || data.pricingType, data.price)
        );
        const sub = String(data.rentalSubType || "equipment").toLowerCase();
        setRentalSubType(
          (RENTAL_SUB_TYPES as readonly string[]).includes(sub)
            ? (sub as RentalSubType)
            : "equipment"
        );
        const period = String(data.rentalRatePeriod || "day").toLowerCase();
        setRentalRatePeriod(
          (RENTAL_RATE_PERIODS as readonly string[]).includes(period)
            ? (period as RentalRatePeriod)
            : "day"
        );
        setRentalPriceWeekly(data.rentalPriceWeekly != null ? String(data.rentalPriceWeekly) : "");
        setRentalPriceMonthly(data.rentalPriceMonthly != null ? String(data.rentalPriceMonthly) : "");
        setRentalDeposit(data.rentalDeposit != null ? String(data.rentalDeposit) : "");
        setRentalAvailableDate(data.rentalAvailableDate || "");
        setVehicleMake(data.vehicleMake || "");
        setVehicleModel(data.vehicleModel || "");
        setVehicleYear(data.vehicleYear != null ? String(data.vehicleYear) : "");
        setVehicleOdometer(data.vehicleOdometer != null ? String(data.vehicleOdometer) : "");

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

    const ownsListing =
      (sellerId && user.uid === sellerId) ||
      (sellerEmail && user.email && sellerEmail === user.email);

    if (!ownsListing) {
      showToast("You don't have permission to edit this listing.", "error");
      return;
    }

    const validation = validateListingForPublish({
      type: listingType,
      title,
      description,
      price,
      category,
      location,
      condition,
      servicePricingType,
      rentalSubType,
      rentalRatePeriod,
      rentalPriceWeekly,
      rentalPriceMonthly,
      rentalDeposit,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleOdometer,
    });
    if (!validation.ok) {
      showToast(validation.errors[0] || "Please fix listing details.", "error");
      return;
    }

    try {

      setSaving(true);

      const uploadedImages = await Promise.all(
        images.map(async (img, index) => {
          if (img.startsWith("blob:")) {
            const response = await fetch(img);
            const blob = await response.blob();
            const uploaded = await uploadListingImagesViaApi(blob, blob, index);
            return uploaded.fullUrl;
          }
          return img;
        })
      );

      const token = await auth.currentUser?.getIdToken();
      const controller = new AbortController();
      const fetchTimeout = window.setTimeout(() => controller.abort(), 30_000);
      const payload: Record<string, unknown> = {
        listingId: id,
        title: sanitizeListingContent(title),
        price,
        location: sanitizeListingContent(location),
        category: listingType === "vehicle" ? "Cars" : category,
        description: sanitizeListingContent(description),
        images: uploadedImages,
        type: listingType,
        expiresInDays: expiresIn,
      };

      if (supportsCondition) {
        payload.condition = condition;
      }

      if (supportsSaleType && !messagingOnly) {
        payload.saleType = saleType;
        payload.pickupAvailable = pickupAvailable;
        payload.shippingAvailable = shippingAvailable;
        payload.pickupArea = pickupArea;
        payload.shippingFee = shippingAvailable && shippingFee ? Number(shippingFee) : null;
        payload.freeShipping = shippingAvailable ? freeShipping : false;
        payload.shipsWithinDays = shipsWithinDays ? Number(shipsWithinDays) : null;
        payload.stockQuantity = stockQuantity ? Number(stockQuantity) : null;
        payload.startingBid = saleType !== "buy_now" && startingBid ? Number(startingBid) : null;
        payload.reservePrice =
          (saleType === "auction" || saleType === "auction_buy_now") && reservePrice
            ? Number(reservePrice)
            : null;
      }

      if (listingType === "service") {
        payload.servicePricingType = servicePricingType;
      }

      if (listingType === "rental" || listingType === "property") {
        payload.rentalSubType = rentalSubType;
        payload.rentalRatePeriod = rentalRatePeriod;
        payload.rentalPriceWeekly = rentalPriceWeekly || null;
        payload.rentalPriceMonthly = rentalPriceMonthly || null;
        payload.rentalDeposit = rentalDeposit || null;
        payload.rentalAvailableDate = rentalAvailableDate || null;
      }

      if (listingType === "vehicle") {
        payload.vehicleMake = vehicleMake;
        payload.vehicleModel = vehicleModel;
        payload.vehicleYear = vehicleYear;
        payload.vehicleOdometer = vehicleOdometer || null;
        payload.pickupAvailable = pickupAvailable;
        payload.pickupArea = pickupArea;
      }

      if (listingType === "wanted") {
        // budget is stored in price
      }

      let res: Response;
      try {
        res = await fetch("/api/update-listing", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(fetchTimeout);
      }
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || "Failed to update listing", "error");
        return;
      }
      showToast("Listing updated.");
      window.history.back();

    } catch (error) {

      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to update listing.";
      showToast(message.includes("timed out") ? `${message} Try again.` : "Failed to update listing.", "error");

    } finally {
      setSaving(false);
    }
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

  const ownsListing =
    (sellerId && user.uid === sellerId) ||
    (sellerEmail && user.email && sellerEmail === user.email);

  if (!ownsListing) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-[var(--muted)]">Access denied</p>
      </main>
    );
  }

  const typeLabel =
    listingType === "service"
      ? "Service"
      : listingType === "rental"
        ? "Rental"
        : listingType === "wanted"
          ? "Wanted"
          : listingType === "vehicle"
            ? "Vehicle"
            : listingType === "property"
              ? "Property"
              : "Listing";

  return (
    <main className="min-h-screen bg-zinc-950 text-[var(--foreground)]">
      <Navbar />

      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-5xl font-black text-sky-400">Edit {typeLabel.toLowerCase()}</h1>
        <AwhinaUnderHeader className="mt-3" />
        <p className="mt-3 mb-10 text-[var(--muted)]">
          Update your {typeLabel.toLowerCase()} details.
          <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-sky-400">
            {listingType}
          </span>
        </p>

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
                <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">{amountLabel}</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors"
                />
                {listingType === "wanted" && (
                  <p className="mt-1 text-[10px] text-[var(--muted)]">Your maximum budget for this request.</p>
                )}
                {listingType === "rental" && !isPropertyRental && (
                  <p className="mt-1 text-[10px] text-[var(--muted)]">Primary rate — period below.</p>
                )}
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
            <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">
              {listingType === "service" ? "Service category" : "Category"}
            </label>
            <select
              value={categoryOptions.includes(category as never) ? category : categoryOptions[0] || ""}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors"
            >
              {categoryOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {listingType === "service" && (
            <div>
              <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider mb-2">Pricing type</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  { id: "fixed", label: "Fixed" },
                  { id: "hourly", label: "Hourly" },
                  { id: "from", label: "From" },
                  { id: "request_quote", label: "Quote" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setServicePricingType(opt.id)}
                    className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold text-left transition ${
                      servicePricingType === opt.id
                        ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                        : "border-zinc-700 bg-zinc-800/50 text-[var(--muted)] hover:border-zinc-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(listingType === "rental" || listingType === "property") && (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
              <div>
                <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider mb-2">Rental type</label>
                <div className="grid grid-cols-3 gap-2">
                  {RENTAL_SUB_TYPES.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setRentalSubType(sub)}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-bold capitalize transition ${
                        rentalSubType === sub
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                          : "border-zinc-700 bg-zinc-800/50 text-[var(--muted)]"
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
              {!isPropertyRental && (
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Rate period</label>
                  <select
                    value={rentalRatePeriod}
                    onChange={(e) => setRentalRatePeriod(e.target.value as RentalRatePeriod)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500"
                  >
                    {RENTAL_RATE_PERIODS.map((p) => (
                      <option key={p} value={p}>{p === "day" ? "Daily" : p === "hour" ? "Hourly" : p === "week" ? "Weekly" : "Monthly"}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Weekly ($)</label>
                  <input type="number" value={rentalPriceWeekly} onChange={(e) => setRentalPriceWeekly(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Monthly ($)</label>
                  <input type="number" value={rentalPriceMonthly} onChange={(e) => setRentalPriceMonthly(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Bond / deposit ($)</label>
                  <input type="number" value={rentalDeposit} onChange={(e) => setRentalDeposit(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Available from</label>
                  <input type="date" value={rentalAvailableDate} onChange={(e) => setRentalAvailableDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500" />
                </div>
              </div>
            </div>
          )}

          {listingType === "vehicle" && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Make *</label>
                <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Model *</label>
                <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Year *</label>
                <input type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Odometer (km)</label>
                <input type="number" value={vehicleOdometer} onChange={(e) => setVehicleOdometer(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500" />
              </div>
            </div>
          )}

          {supportsCondition && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors"
              >
                <option value="">Select condition</option>
                <option value="New">New</option>
                <option value="Like New">Like New</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="For Parts">For Parts</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors resize-none"
            />
          </div>

          {supportsSaleType && !messagingOnly && (
          <div>
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider mb-2">Sale Type</label>
            {stripeDisabledV1 ? (
              <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/40 px-3.5 py-3">
                <p className="text-xs font-bold text-[var(--foreground)]">
                  {String(saleType).includes("auction") ? "Auction (existing listing)" : "Fixed price"}
                </p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {String(saleType).includes("auction")
                    ? "Auction settings are preserved for this listing. New listings use fixed price only."
                    : "Buyers message you to arrange purchase at your asking price."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "buy_now", label: "Fixed price" },
                  { id: "buy_now_offers", label: "Fixed price + Offers" },
                  { id: "auction", label: "Auction" },
                  { id: "auction_buy_now", label: "Auction + fixed price" },
                ].map((opt) => (
                  <button key={opt.id} type="button" onClick={() => setSaleType(opt.id)}
                    className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold text-left transition ${
                      saleType === opt.id ? "border-sky-500/40 bg-sky-500/10 text-sky-400" : "border-zinc-700 bg-zinc-800/50 text-[var(--muted)] hover:border-zinc-600"
                    }`}>{opt.label}</button>
                ))}
              </div>
            )}
          </div>
          )}

          {supportsSaleType && !messagingOnly && !stripeDisabledV1 && (saleType === "auction" || saleType === "auction_buy_now") && (
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

          {(listingType === "physical" || listingType === "vehicle") && (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider mb-3">
              {listingType === "vehicle" ? "Pickup" : "Delivery Options"}
            </label>

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

              {listingType === "physical" && (
              <>
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
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30"
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
              </>
              )}

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
          )}

          {messagingOnly && (
            <div>
              <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Listing expires in</label>
              <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
          )}

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
