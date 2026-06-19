"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage, onAuthStateChanged } from "../../lib/firebase";
import { getFreshIdToken } from "../../lib/api-auth";
import { createPendingXP, trackListingCreated } from "../../lib/xpValidation";
import { checkImage } from "../../lib/nsfw";
import { showToast } from "../../components/Toast";
import DigitalAssetUpload from "../../components/DigitalAssetUpload";
import { detectScam } from "../../lib/scamdetection";
import { detectSuspiciousPrice } from "../../lib/pricedetection";
import { getListingBlockReason } from "../../lib/seller-eligibility";
import { hasActiveListingDraft, mergeListingFillWithDraft } from "../../lib/sky-ai-draft-merge";
import { readListingDraftFromSkyAi, syncListingDraftToSkyAi } from "../../lib/sky-ai-listing-context";
import {
  applySkyAiListingFill,
  consumePendingListingFill,
  SKY_AI_LISTING_FILL_EVENT,
  type SkyAiListingFill,
} from "../../lib/sky-ai-listing-fill";
import {
  dataUrlToFile,
  SKY_AI_LISTING_IMAGES_EVENT,
  type SkyAiListingImagesDetail,
} from "../../lib/sky-ai-images";
import SkyAiChatPanel from "../../components/SkyAiChatPanel";
import SellPhotoUpload from "../../components/SellPhotoUpload";
import { SKY_AI_SELL_QUICK_PROMPTS, SKY_AI_SELL_WELCOME } from "../../lib/sky-ai-prompts";
import {
  SERVICE_PRICING_OPTIONS,
  type ServicePricingType,
  servicePriceRequired,
  offersDisabledForService,
  normalizeServicePricingType,
} from "../../lib/service-pricing";

const objectToCategory: Record<string, string> = {
  "car": "Cars", "truck": "Cars", "bus": "Cars", "motorcycle": "Cars",
  "bicycle": "Sports", "bike": "Sports",
  "laptop": "Tech", "computer": "Tech", "cell phone": "Tech", "phone": "Tech",
  "tv": "Tech", "keyboard": "Tech",
  "sports ball": "Sports", "skateboard": "Sports", "surfboard": "Sports",
  "backpack": "Fashion", "handbag": "Fashion", "suitcase": "Fashion",
  "chair": "Home", "couch": "Home", "potted plant": "Home", "bed": "Home",
  "dog": "Other", "cat": "Other", "person": "Other",
};

export default function AIPostPage() {
  const [user, setUser] = useState<User | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [detected, setDetected] = useState<string>("");
  const [modelReady, setModelReady] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [condition, setCondition] = useState("New");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [pickupAvailable, setPickupAvailable] = useState(false);
  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [pickupArea, setPickupArea] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [freeShipping, setFreeShipping] = useState(false);
  const [saleType, setSaleType] = useState("buy_now");
  const [startingBid, setStartingBid] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [auctionDuration, setAuctionDuration] = useState("3");
  const [stockQuantity, setStockQuantity] = useState("");
  const [expiresIn, setExpiresIn] = useState("14");
  const [listingType, setListingType] = useState<"physical" | "digital" | "service" | "rental" | "event" | "vehicle" | "job" | "property" | "wanted">("physical");
  const [digitalFileURL, setDigitalFileURL] = useState("");
  const [digitalFileName, setDigitalFileName] = useState("");
  const [digitalStoragePath, setDigitalStoragePath] = useState("");
  const [serviceDuration, setServiceDuration] = useState("");
  const [rentalSubType, setRentalSubType] = useState<"property" | "equipment" | "vehicle">("equipment");
  const [rentalPropertyType, setRentalPropertyType] = useState("House");
  const [rentalPriceWeekly, setRentalPriceWeekly] = useState("");
  const [rentalPriceMonthly, setRentalPriceMonthly] = useState("");
  const [rentalDeposit, setRentalDeposit] = useState("");
  const [rentalBedrooms, setRentalBedrooms] = useState("");
  const [rentalBathrooms, setRentalBathrooms] = useState("");
  const [rentalParkingSpaces, setRentalParkingSpaces] = useState("");
  const [rentalFurnishedStatus, setRentalFurnishedStatus] = useState("Unfurnished");
  const [rentalPetsPolicy, setRentalPetsPolicy] = useState("No Pets");
  const [rentalAvailableDate, setRentalAvailableDate] = useState("");
  const [rentalFeatures, setRentalFeatures] = useState<string[]>([]);
  const [rentalMinTenancy, setRentalMinTenancy] = useState("Flexible");
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
  const [pricingType, setPricingType] = useState<"fixed" | "quote">("fixed");
  const [servicePricingType, setServicePricingType] = useState<ServicePricingType>("fixed");
  const [acceptOffers, setAcceptOffers] = useState(false);
  const [paymentType, setPaymentType] = useState("contact");

  const [editId, setEditId] = useState<string | null>(null);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scamAlert, setScamAlert] = useState<{ title: string; message: string; found: string[] } | null>(null);
  const [priceAlert, setPriceAlert] = useState(false);
  const [confirmedSubmit, setConfirmedSubmit] = useState(false);

  const [skyChatOpen, setSkyChatOpen] = useState(false);
  const [skyAutoQuery, setSkyAutoQuery] = useState<string | undefined>();
  const [draftExtras, setDraftExtras] = useState<string[]>([]);

  const isDigital = listingType === "digital";
  const classifierRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const manualEdit = useRef<Set<string>>(new Set());

  useEffect(() => {
    const stored = readListingDraftFromSkyAi();
    if (stored?.extras?.length && draftExtras.length === 0) {
      setDraftExtras(stored.extras);
    }
  }, []);

  useEffect(() => {
    syncListingDraftToSkyAi({
      title,
      description,
      category,
      condition,
      price,
      listingType,
      location,
      paymentType,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleOdometer,
      vehicleColour,
      vehicleBodyType,
      vehicleFuelType,
      vehicleTransmission,
      rentalSubType,
      rentalPropertyType,
      rentalPriceWeekly,
      rentalPriceMonthly,
      rentalDeposit,
      rentalBedrooms,
      rentalBathrooms,
      rentalParkingSpaces,
      rentalFurnishedStatus,
      rentalPetsPolicy,
      rentalAvailableDate,
      rentalMinTenancy,
      stockQuantity,
      serviceDuration,
      extras: draftExtras.length ? draftExtras : undefined,
    });
  }, [
    title,
    description,
    category,
    condition,
    price,
    listingType,
    location,
    paymentType,
    vehicleMake,
    vehicleModel,
    vehicleYear,
    vehicleOdometer,
    vehicleColour,
    vehicleBodyType,
    vehicleFuelType,
    vehicleTransmission,
    rentalSubType,
    rentalPropertyType,
    rentalPriceWeekly,
    rentalPriceMonthly,
    rentalDeposit,
    rentalBedrooms,
    rentalBathrooms,
    rentalParkingSpaces,
    rentalFurnishedStatus,
    rentalPetsPolicy,
    rentalAvailableDate,
    rentalMinTenancy,
    stockQuantity,
    serviceDuration,
    draftExtras,
  ]);

  const applyFill = useCallback((fill: SkyAiListingFill) => {
    const prior = readListingDraftFromSkyAi();
    const merged = mergeListingFillWithDraft(prior, fill);
    const isUpdate = hasActiveListingDraft(prior);
    if (merged.extras?.length) setDraftExtras(merged.extras);
    const ok = applySkyAiListingFill(merged, {
      setTitle,
      setDescription,
      setCategory,
      setCondition,
      setPrice,
      setListingType,
      setLocation,
      setPaymentType,
      setVehicleMake,
      setVehicleModel,
      setVehicleYear,
      setVehicleOdometer,
      setVehicleTransmission,
      setVehicleFuelType,
      setVehicleBodyType,
      setVehicleColour,
      setRentalSubType,
      setRentalPropertyType,
      setRentalPriceWeekly,
      setRentalPriceMonthly,
      setRentalDeposit,
      setRentalBedrooms,
      setRentalBathrooms,
      setRentalParkingSpaces,
      setRentalFurnishedStatus,
      setRentalPetsPolicy,
      setRentalAvailableDate,
      setRentalMinTenancy,
      setRentalFeatures,
      setPricingType: (v) => setPricingType(v === "quote" ? "quote" : "fixed"),
      setServicePricingType: (v) => setServicePricingType(normalizeServicePricingType(v)),
      setPickupAvailable,
      setShippingAvailable,
      setAcceptOffers,
      setSaleType,
      setStockQuantity,
      setServiceDuration,
    });
    if (ok) {
      const msg =
        fill.listingType === "digital"
          ? isUpdate
            ? "Āwhina updated your listing — upload your digital file, then publish"
            : "Āwhina filled your listing — upload your digital file, then publish"
          : imagePreviews.length > 0
            ? isUpdate
              ? "Āwhina updated your listing — review and publish"
              : "Āwhina filled your listing — review and publish"
            : isUpdate
              ? "Āwhina updated your listing — add photos and publish"
              : "Āwhina filled your listing — add photos and publish";
      showToast(msg);
      setTimeout(() => {
        document.getElementById("listing-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [imagePreviews.length]);

  useEffect(() => {
    const pending = consumePendingListingFill();
    if (pending) applyFill(pending);

    const onFill = (e: Event) => {
      const detail = (e as CustomEvent<SkyAiListingFill>).detail;
      if (detail) applyFill(detail);
    };

    const onImages = async (e: Event) => {
      const { dataUrls, names } = (e as CustomEvent<SkyAiListingImagesDetail>).detail || {};
      if (!dataUrls?.length) return;

      const room = Math.max(0, 8 - imagePreviews.length);
      const addUrls = dataUrls.slice(0, room);
      const addFiles = addUrls.map((url, i) =>
        dataUrlToFile(url, names?.[i] || `sky-ai-${i + 1}.jpg`)
      );
      if (!addFiles.length) {
        showToast("Listing already has 8 photos", "error");
        return;
      }

      const isFirst = imagePreviews.length === 0;
      setImagePreviews((prev) => [...prev, ...addUrls]);
      setImageFiles((prev) => [...prev, ...addFiles]);

      showToast(
        addFiles.length === 1
          ? "Āwhina added a photo to your listing"
          : `Āwhina added ${addFiles.length} photos to your listing`
      );

      if (isFirst) {
        setAnalyzing(true);
        setDetected("");
        await new Promise((r) => setTimeout(r, 500));
        await runDetection();
        setAnalyzing(false);
      }
    };

    window.addEventListener(SKY_AI_LISTING_FILL_EVENT, onFill);
    window.addEventListener(SKY_AI_LISTING_IMAGES_EVENT, onImages);
    return () => {
      window.removeEventListener(SKY_AI_LISTING_FILL_EVENT, onFill);
      window.removeEventListener(SKY_AI_LISTING_IMAGES_EVENT, onImages);
    };
  }, [applyFill, imagePreviews.length]);

  // Load model from CDN
  useEffect(() => {
    async function loadModel() {
      const timeout = setTimeout(() => {
        if (process.env.NODE_ENV !== "production") console.warn("AI model CDN timed out");
        setModelReady(true);
      }, 8000);

      try {
        const script1 = document.createElement('script');
        script1.src = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
        
        await Promise.race([
          new Promise((resolve, reject) => {
            script1.onload = resolve;
            script1.onerror = reject;
            document.head.appendChild(script1);
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Script load timeout")), 5000)),
        ]);
        
        clearTimeout(timeout);

        // @ts-ignore
        if (!(window as any).transformers) {
          if (process.env.NODE_ENV !== "production") console.warn("AI model CDN loaded but transformers not found. Manual mode enabled.");
          setModelReady(true);
          return;
        }
        // @ts-ignore
        const { pipeline, env } = await (window as any).transformers;
        
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        
        classifierRef.current = await pipeline('zero-shot-classification', 'Xenova/distilbert-base-uncased-mnli');
        
        setModelReady(true);
      } catch (err) {
        clearTimeout(timeout);
        console.warn("AI model unavailable:", err);
        setModelReady(true);
      }
    }
    
    loadModel();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u?.uid) {
        try {
          const snap = await getDoc(doc(db, "profiles", u.uid));
          if (snap.exists()) {
            const d = snap.data();

          }
        } catch {}
      }
    });
    return () => unsub();
  }, []);

  // Pre-select listing type from ?type= query param
  useEffect(() => {
    const typeParam = new URLSearchParams(window.location.search).get("type");
    if (!typeParam) return;
    const valid = ["physical", "digital", "service", "rental", "event", "vehicle", "job", "property", "wanted"];
    if (valid.includes(typeParam)) {
      setListingType(typeParam as any);
    }
  }, []);

  useEffect(() => {
    const editParam = new URLSearchParams(window.location.search).get("edit");
    if (!editParam) return;
    setEditId(editParam);
    setEditLoading(true);
    getDoc(doc(db, "listings", editParam)).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      setTitle(data.title || "");
      setDescription(data.description || "");
      setCategory(data.category || "Other");
      setPrice(String(data.price || ""));
      setCondition(data.condition || "New");
      setListingType(data.type || "physical");
      setLocation(data.location || "");
      setPickupAvailable(!!data.pickupAvailable);
      setShippingAvailable(!!data.shippingAvailable);
      setPickupArea(data.pickupArea || "");
      setShippingFee(data.shippingFee != null ? String(data.shippingFee) : "");
      setFreeShipping(!!data.freeShipping);
      setStockQuantity(data.stockQuantity != null ? String(data.stockQuantity) : "");
      setSaleType(data.saleType || "buy_now");
      setStartingBid(data.startingBid != null ? String(data.startingBid) : "");
      setReservePrice(data.reservePrice != null ? String(data.reservePrice) : "");
      setBuyNowPrice(data.buyNowPrice != null ? String(data.buyNowPrice) : "");
      setAuctionDuration(String(data.auctionDuration || "3"));
      if (data.expiresAt?.toDate) {
        const daysLeft = Math.round((data.expiresAt.toDate() - Date.now()) / 86400000);
        setExpiresIn(String(Math.max(daysLeft, 1)));
      } else {
        setExpiresIn(data.expiresIn || "14");
      }
      setDigitalFileURL(data.digitalFileURL || "");
      setDigitalFileName(data.digitalFileName || "");
      setDigitalStoragePath(data.digitalStoragePath || "");
      setServiceDuration(data.serviceDuration || "");
      setEventDate(data.eventDate || "");
      setEventTime(data.eventTime || "");
      setVenue(data.venue || "");
      setTicketQuantity(data.ticketQuantity != null ? String(data.ticketQuantity) : "");
      setTicketType(data.ticketType || "General Admission");
      setVehicleMake(data.vehicleMake || "");
      setVehicleModel(data.vehicleModel || "");
      setVehicleYear(data.vehicleYear != null ? String(data.vehicleYear) : "");
      setVehicleOdometer(data.vehicleOdometer != null ? String(data.vehicleOdometer) : "");
      setVehicleBodyType(data.vehicleBodyType || "SUV");
      setVehicleFuelType(data.vehicleFuelType || "Petrol");
      setVehicleTransmission(data.vehicleTransmission || "Automatic");
      setVehicleColour(data.vehicleColour || "");
      setJobCompany(data.jobCompany || "");
      setJobEmploymentType(data.jobEmploymentType || "Full-time");
      setSalaryMin(data.salaryMin != null ? String(data.salaryMin) : "");
      setSalaryMax(data.salaryMax != null ? String(data.salaryMax) : "");
      setPropertyType(data.propertyType || "House");
      setBedrooms(data.bedrooms != null ? String(data.bedrooms) : "");
      setBathrooms(data.bathrooms != null ? String(data.bathrooms) : "");
      setLandArea(data.landArea != null ? String(data.landArea) : "");
      setFloorArea(data.floorArea != null ? String(data.floorArea) : "");
      setParking(data.parking != null ? String(data.parking) : "");
      setAcceptOffers(!!data.acceptOffers);
      setPaymentType(data.paymentType === "stripe" ? "stripe" : "contact");
      setPricingType(data.pricingType === "quote" ? "quote" : "fixed");
      setServicePricingType(
        normalizeServicePricingType(data.servicePricingType, data.price, data.description)
      );
      setExistingImages(data.images || []);
      if (data.images?.length) setImagePreviews(data.images);
    }).catch(console.error).finally(() => setEditLoading(false));
  }, []);

  function dataURLtoBlob(dataUrl: string): Blob | null {
    const parts = dataUrl.split(",");
    const match = parts[0]?.match(/:(.*?);/);
    if (!match || !parts[1]) return null;
    const mime = match[1];
    try {
      const bytes = atob(parts[1]);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch { return null; }
  }

  const runDetection = async () => {
    if (!classifierRef.current || !imgRef.current) return;
    
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = imgRef.current;
      
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx?.drawImage(img, 0, 0);
      
      const imageBase64 = canvas.toDataURL('image/jpeg');
      
      const categories = ['car', 'truck', 'bicycle', 'bike', 'laptop', 'computer', 'phone', 'tv', 'dog', 'cat', 'person', 'chair', 'couch', 'backpack', 'handbag', 'skateboard'];
      
      const result: any = await classifierRef.current(imageBase64, categories);
      
      if (result?.labels?.length > 0) {
        const topLabel = result.labels[0];
        const topScore = Math.round(result.scores[0] * 100);
        
        setDetected(`${topLabel} (${topScore}%)`);
        setCategory(objectToCategory[topLabel.toLowerCase()] || "Other");
        setTitle(topLabel.charAt(0).toUpperCase() + topLabel.slice(1));
        setDescription(`Detected: ${topLabel}, ${topScore}% confidence.`);
      }
    } catch (err) {
      console.error("Error:", err);
      setDetected("Try again");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 8);
    if (files.length === 0) return;

    for (const file of files) {
      const nsfwResult = await checkImage(file);
      if (!nsfwResult.safe) {
        showToast(`"${file.name}" flagged: ${nsfwResult.reason}. Remove it and try again.`, "error");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    const newPreviews: string[] = [];
    for (const file of files) {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newPreviews.push(dataUrl);
    }

    const isFirstImage = imagePreviews.length === 0;
    setImagePreviews((prev) => [...prev, ...newPreviews].slice(0, 8));
    setImageFiles((prev) => [...prev, ...files].slice(0, 8));

    if (isFirstImage) {
      setAnalyzing(true);
      setDetected("");
      await new Promise(r => setTimeout(r, 500));
      await runDetection();
      setAnalyzing(false);
    }
  };

  const createListing = async () => {
    const needsPrice =
      listingType === "digital"
        ? pricingType !== "quote"
        : listingType === "service"
          ? servicePriceRequired(servicePricingType)
          : listingType !== "rental";
    const requiredPrice =
      (saleType === "auction" || saleType === "auction_buy_now") ? startingBid : needsPrice ? price : true;
    if (!user?.email || !title || !requiredPrice) {
      const fieldLabel =
        listingType === "service" && servicePricingType === "hourly"
          ? "hourly rate"
          : (saleType === "auction" || saleType === "auction_buy_now")
            ? "starting bid"
            : "price";
      showToast(`Please fill in title and ${fieldLabel}`, "error");
      return;
    }

    if (!editId) {
      try {
        await user.reload();
      } catch {
        /* use cached user */
      }
      const profileSnap = user?.uid ? await getDoc(doc(db, "profiles", user.uid)) : null;
      const profileData = profileSnap?.exists() ? profileSnap.data() : null;
      const blockReason = getListingBlockReason({
        authEmailVerified: auth.currentUser?.emailVerified ?? user.emailVerified,
        phone: profileData ? String(profileData.phone || profileData.phoneNumber || "") : "",
        phoneVerified: !!profileData?.phoneVerified || !!profileData?.verified,
        authPhoneNumber: auth.currentUser?.phoneNumber,
        profileExists: profileSnap?.exists(),
      });
      if (blockReason) {
        showToast(blockReason, "error");
        return;
      }
    }
    if (listingType === "physical" && !pickupAvailable && !shippingAvailable) {
      showToast("Select at least one delivery method (pickup or shipping).", "error");
      return;
    }
    if (listingType === "digital" && pricingType === "fixed" && !digitalFileURL && !editId) {
      showToast("Upload the digital file you're selling.", "error");
      return;
    }
    if (listingType === "rental" && !location) {
      showToast("Enter the pickup location for your rental.", "error");
      return;
    }
    if (listingType === "rental" && !price) {
      showToast("Enter the daily rate for your rental.", "error");
      return;
    }
    if (listingType === "event") {
      if (!eventDate || !venue) {
        showToast("Enter the event date and venue.", "error");
        return;
      }
    }
    if (listingType === "vehicle") {
      if (!vehicleMake || !vehicleModel) {
        showToast("Enter the vehicle make and model.", "error");
        return;
      }
    }
    if (listingType === "job") {
      if (!jobCompany) {
        showToast("Enter the company name.", "error");
        return;
      }
    }
    if (listingType === "property" && !location) {
      showToast("Enter the property location.", "error");
      return;
    }
    // Scam detection
    const scamResult = detectScam(`${title} ${description}`);
    if (scamResult.isScam && !confirmedSubmit) {
      setScamAlert({
        title: "Potential Scam Detected",
        message: "Your listing contains language commonly used in scams. Please review and edit.",
        found: scamResult.keywords,
      });
      setLoading(false);
      return;
    }

    // Price detection
    if (detectSuspiciousPrice(Number(price), category) && !confirmedSubmit) {
      setPriceAlert(true);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let images: string[] = existingImages;
      if (listingType !== "digital" && listingType !== "wanted" && imageFiles.length > 0) {
        images = [];
        for (let i = 0; i < imageFiles.length; i++) {
          const blob = dataURLtoBlob(imagePreviews[i]);
          const storageRef = ref(storage, `listings/${user.uid}/${Date.now()}_${i}.jpg`);
          const snap = await uploadBytes(storageRef, blob);
          images.push(await getDownloadURL(snap.ref));
        }
      }

      const baseData: Record<string, any> = {
        title, description, price: String(price), category, acceptOffers,
        imageUrl: images[0] || "", images, paymentType,
      };

      if (editId) {
        baseData.updatedAt = serverTimestamp();
      } else {
        baseData.sellerEmail = user.email; baseData.sellerUsername = user.email?.split("@")[0] || "User";
        baseData.sellerId = user.uid; baseData.createdAt = serverTimestamp();
        baseData.expiresAt = new Date(Date.now() + Number(expiresIn) * 86400000);
      }

      const listingData: any = listingType === "digital" ? {
        ...baseData,
        price: pricingType === "quote" ? "" : String(price),
        condition: "Digital",
        type: "digital", digitalStoragePath, digitalFileName,
        pricingType,
        saleType: "buy_now", ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : listingType === "service" ? {
        ...baseData,
        type: "service",
        serviceDuration,
        servicePricingType,
        price: servicePriceRequired(servicePricingType) ? String(price) : "",
        acceptOffers: offersDisabledForService(servicePricingType) ? false : acceptOffers,
        saleType: "buy_now",
        ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : listingType === "rental" ? {
        ...baseData, condition, location,
        type: "rental", pickupAvailable: true, shippingAvailable: false,
        rentalSubType,
        stockQuantity: stockQuantity ? Number(stockQuantity) : (rentalSubType === "property" ? 1 : 1),
        rentalPriceWeekly: rentalPriceWeekly ? Number(rentalPriceWeekly) : null,
        rentalPriceMonthly: rentalPriceMonthly ? Number(rentalPriceMonthly) : null,
        rentalDeposit: rentalDeposit ? Number(rentalDeposit) : null,
        ...(rentalSubType === "property" ? {
          rentalBedrooms: rentalBedrooms ? Number(rentalBedrooms) : null,
          rentalBathrooms: rentalBathrooms ? Number(rentalBathrooms) : null,
          rentalParkingSpaces: rentalParkingSpaces ? Number(rentalParkingSpaces) : null,
          rentalPropertyType,
          rentalFurnishedStatus,
          rentalPetsPolicy,
          rentalMinTenancy,
          rentalFeatures: rentalFeatures.length ? rentalFeatures : [],
          rentalAvailableDate: rentalAvailableDate || null,
        } : rentalSubType === "vehicle" ? {
          vehicleMake,
          vehicleModel,
          vehicleYear: vehicleYear ? Number(vehicleYear) : null,
          vehicleTransmission,
          rentalVehicleSeats: stockQuantity || null,
        } : {}),
        ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : listingType === "event" ? {
        ...baseData, category,
        type: "event", acceptOffers: false,
        eventDate, eventTime, venue,
        ticketQuantity: ticketQuantity ? Number(ticketQuantity) : null,
        stockQuantity: ticketQuantity ? Number(ticketQuantity) : null,
        ticketType,
        ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : listingType === "job" ? {
        ...baseData, category, location,
        type: "job", acceptOffers: false,
        jobCompany, jobEmploymentType,
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : listingType === "property" ? {
        ...baseData, condition, location,
        pickupAvailable: true, shippingAvailable: false,
        saleType,
        startingBid: (saleType === "auction" || saleType === "auction_buy_now") && startingBid ? Number(startingBid) : null,
        reservePrice: (saleType === "auction" || saleType === "auction_buy_now") && reservePrice ? Number(reservePrice) : null,
        ...(editId ? {} : {
          auctionEndsAt: (saleType === "auction" || saleType === "auction_buy_now") ? new Date(Date.now() + Number(auctionDuration) * 86400000) : null,
          expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
          currentBid: null, bidCount: 0, highestBidder: null, status: "live",
        }),
        type: "property",
        propertyType,
        bedrooms: bedrooms ? Number(bedrooms) : null,
        bathrooms: bathrooms ? Number(bathrooms) : null,
        landArea: landArea ? Number(landArea) : null,
        floorArea: floorArea ? Number(floorArea) : null,
        parking: parking ? Number(parking) : null,
      } : listingType === "vehicle" ? {
        ...baseData, condition, location,
        pickupAvailable, shippingAvailable, pickupArea,
        shippingFee: shippingAvailable && shippingFee ? Number(shippingFee) : null,
        freeShipping: shippingAvailable ? freeShipping : false,
        stockQuantity: stockQuantity ? Number(stockQuantity) : null,
        saleType,
        buyNowPrice: buyNowPrice ? Number(buyNowPrice) : null,
        startingBid: (saleType === "auction" || saleType === "auction_buy_now") && startingBid ? Number(startingBid) : null,
        reservePrice: (saleType === "auction" || saleType === "auction_buy_now") && reservePrice ? Number(reservePrice) : null,
        ...(editId ? {} : {
          auctionEndsAt: (saleType === "auction" || saleType === "auction_buy_now") ? new Date(Date.now() + Number(auctionDuration) * 86400000) : null,
          expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
          currentBid: null, bidCount: 0, highestBidder: null, status: "live",
        }),
        type: "vehicle",
        vehicleMake, vehicleModel,
        vehicleYear: vehicleYear ? Number(vehicleYear) : null,
        vehicleOdometer: vehicleOdometer ? Number(vehicleOdometer) : null,
        vehicleBodyType, vehicleFuelType, vehicleTransmission, vehicleColour,
      } : listingType === "wanted" ? {
        ...baseData, condition: "New", location,
        type: "wanted",
        pickupAvailable: false,
        shippingAvailable: false,
        stockQuantity: null,
        saleType: "buy_now",
        paymentType: "contact",
        ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : {
        ...baseData, condition, location,
        type: "physical",
        pickupAvailable, shippingAvailable, pickupArea,
        shippingFee: shippingAvailable && shippingFee ? Number(shippingFee) : null,
        freeShipping: shippingAvailable ? freeShipping : false,
        stockQuantity: stockQuantity ? Number(stockQuantity) : null,
        saleType,
        buyNowPrice: buyNowPrice ? Number(buyNowPrice) : null,
        startingBid: (saleType === "auction" || saleType === "auction_buy_now") && startingBid ? Number(startingBid) : null,
        reservePrice: (saleType === "auction" || saleType === "auction_buy_now") && reservePrice ? Number(reservePrice) : null,
        ...(editId ? {} : {
          auctionEndsAt: (saleType === "auction" || saleType === "auction_buy_now") ? new Date(Date.now() + Number(auctionDuration) * 86400000) : null,
          expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
          currentBid: null, bidCount: 0, highestBidder: null, status: "live",
        }),
      };

      let newId = editId;
      if (editId) {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/update-listing", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
          body: JSON.stringify({ listingId: editId, ...listingData, expiresInDays: expiresIn }),
        });
        const data = await res.json();
        if (!data.success) {
          showToast(data.error || "Failed to update listing", "error");
          setLoading(false);
          return;
        }
        showToast("Listing updated!", "success");
      } else {
        const token = await getFreshIdToken();
        if (!token) {
          showToast("Please sign in again to create a listing.", "error");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/create-listing", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...listingData, expiresInDays: expiresIn, listingType }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          showToast(data.error || `Failed to create listing (${res.status})`, "error");
          if (res.status === 401) {
            setTimeout(() => { window.location.href = "/login?redirect=/post/ai"; }, 1500);
          }
          setLoading(false);
          return;
        }
        newId = data.listingId;
        if (listingType !== "digital") {
          createPendingXP(user.uid, "listing", data.listingId, data.listingId);
          trackListingCreated(user.uid, title);
        }
        showToast("Listing created!", "success");
        // Check Stripe Connect — prompt if not set up
        if (paymentType === "stripe") {
          try {
            const profileSnap = await getDoc(doc(db, "profiles", user.uid));
            if (profileSnap.exists()) {
              const profileData = profileSnap.data();
              if (!profileData.stripeAccountId) {
                showToast("⚠️ Connect Stripe to receive payouts — go to Profile", "info");
                setTimeout(() => { window.location.href = "/profile?tab=payouts"; }, 1500);
                setLoading(false);
                setConfirmedSubmit(false);
                return;
              }
            }
          } catch (e) { console.error("Stripe check error:", e); }
        }
      }
      setImagePreviews([]); setImageFiles([]); setExistingImages([]);
      setTitle(""); setDescription(""); setPrice("");
      setLocation(""); setCategory("Other"); setDetected("");
      setPickupAvailable(false); setShippingAvailable(false);
      setPickupArea(""); setShippingFee(""); setFreeShipping(false);
      setStockQuantity("");
      setSaleType("buy_now"); setBuyNowPrice(""); setStartingBid(""); setReservePrice(""); setAuctionDuration("3"); setExpiresIn("14");
      setPaymentType("contact");
      setListingType("physical"); setDigitalFileURL(""); setDigitalFileName(""); setDigitalStoragePath(""); setServiceDuration(""); setRentalSubType("equipment"); setRentalPriceWeekly(""); setRentalPriceMonthly(""); setRentalDeposit(""); setRentalBedrooms(""); setRentalBathrooms(""); setRentalParkingSpaces(""); setRentalFurnishedStatus("Unfurnished"); setRentalPetsPolicy("No Pets"); setRentalAvailableDate(""); setRentalMinTenancy("Flexible"); setRentalFeatures([]); setEventDate(""); setEventTime(""); setVenue(""); setTicketQuantity(""); setTicketType("General Admission"); setVehicleMake(""); setVehicleModel(""); setVehicleYear(""); setVehicleOdometer(""); setVehicleBodyType("SUV"); setVehicleFuelType("Petrol"); setVehicleTransmission("Automatic"); setVehicleColour(""); setJobCompany(""); setJobEmploymentType("Full-time"); setSalaryMin(""); setSalaryMax(""); setPropertyType("House"); setBedrooms(""); setBathrooms(""); setLandArea(""); setFloorArea(""); setParking(""); setAcceptOffers(false); setCondition("New");
      setEditId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (listingType === "service") window.location.href = "/services";
      else if (listingType === "digital") window.location.href = "/digital";
      else if (listingType === "rental") window.location.href = `/post/listing/${newId}`;
      else if (listingType === "event") window.location.href = `/events`;
      else if (listingType === "vehicle") window.location.href = `/vehicles`;
      else if (listingType === "job") window.location.href = `/jobs`;
      else if (listingType === "property") window.location.href = `/property`;
      else if (listingType === "wanted") window.location.href = "/wanted";
      else window.location.href = `/post/listing/${newId}`;
    } catch (err) {
      console.error("Listing upload error:", err);
      showToast("Failed to create listing — check console for details", "error");
    }
    setLoading(false);
    setConfirmedSubmit(false);
  };

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
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      {imagePreviews.length > 0 && <img ref={imgRef} src={imagePreviews[0]} style={{display:'none'}} />}

        <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {editLoading && (
          <div className="mb-6 flex items-center justify-center gap-3 rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
            <span className="text-sm text-[var(--muted)]">Loading listing...</span>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <div className="relative flex flex-col items-center">
            <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/5 via-sky-500/5 to-sky-500/5 blur-3xl pointer-events-none" />
            <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight">
              <span className="text-[#0a1628] drop-shadow-[0_0_12px_rgba(14,165,233,0.15)] dark:text-white dark:drop-shadow-[0_0_12px_rgba(14,165,233,0.25)]">{editId ? "Edit Listing" : "Quick Post"}</span>
            </h1>
            <p className="relative mt-3 max-w-xl mx-auto text-sm leading-relaxed text-[#1e4976] dark:text-white">Sell faster with Āwhina. Describe your item or upload photos, and Āwhina will help create a professional listing in minutes.</p>
          </div>
        </div>

        <SellPhotoUpload
          imagePreviews={imagePreviews}
          fileInputRef={fileInputRef}
          onUpload={handleImageUpload}
          onRemove={(index) => {
            setImagePreviews((prev) => prev.filter((_, j) => j !== index));
            setImageFiles((prev) => prev.filter((_, j) => j !== index));
          }}
        />

        {(analyzing || (detected && !analyzing)) && (
          <div className="-mt-3 mb-6 space-y-3">
            {analyzing && (
              <div className="flex items-center justify-center gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-500/15 dark:bg-sky-500/5">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent dark:border-sky-400" />
                <span className="text-sm font-medium text-sky-600 dark:text-sky-400">Detecting...</span>
              </div>
            )}
            {detected && !analyzing && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-center dark:border-sky-500/15 dark:bg-sky-500/5">
                <span className="text-sm font-bold text-sky-600 dark:text-sky-400">✅ {detected}</span>
              </div>
            )}
          </div>
        )}

        {!editId && (
          <div className="mb-6">
            <div className="relative overflow-hidden rounded-2xl border border-[#D6ECFF] bg-white p-5 shadow-[0_4px_24px_rgba(14,165,233,0.08)] dark:border-sky-500/20 dark:bg-gradient-to-br dark:from-sky-500/[0.06] dark:via-sky-500/[0.04] dark:to-zinc-950/80 dark:shadow-[0_0_40px_rgba(14,165,233,0.08)]">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-sky-500/10 blur-2xl pointer-events-none" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3 min-w-0">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-sky-500/25 text-base shadow-[0_0_20px_rgba(56,189,248,0.2)] ring-1 ring-sky-400/30">
                    ✦
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-[#111827] dark:text-white">Āwhina</h2>
                    <p className="mt-1 text-xs leading-relaxed text-[#6B7280] dark:text-zinc-400">
                      Tell me what you&apos;re selling and I&apos;ll help fill the listing for you 🙂
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSkyChatOpen((v) => !v)}
                  className="shrink-0 rounded-xl bg-gradient-to-r from-sky-500 to-sky-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(14,165,233,0.25)] hover:brightness-110 active:scale-[0.98]"
                >
                  {skyChatOpen ? "Hide chat" : "Ask Āwhina"}
                </button>
              </div>
              {!skyChatOpen && (
                <div className="relative mt-4 flex flex-wrap gap-1.5">
                  {SKY_AI_SELL_QUICK_PROMPTS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setSkyChatOpen(true);
                        setSkyAutoQuery(undefined);
                        setTimeout(() => setSkyAutoQuery(p.query), 0);
                      }}
                      className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/20"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SkyAiChatPanel
              mode="inline"
              open={skyChatOpen}
              onOpenChange={setSkyChatOpen}
              autoQuery={skyAutoQuery}
              onAutoQueryConsumed={() => setSkyAutoQuery(undefined)}
              onFill={applyFill}
              quickPrompts={SKY_AI_SELL_QUICK_PROMPTS}
              welcomeText={SKY_AI_SELL_WELCOME}
            />
          </div>
        )}

        {/* Form Card */}
        <div className="relative">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-sky-500/10 via-sky-500/5 to-transparent blur-xl pointer-events-none" />
          <div className="relative rounded-2xl border border-[#D6ECFF] bg-white p-6 shadow-[0_4px_24px_rgba(14,165,233,0.06)] dark:border-white/[0.06] dark:bg-zinc-950/80 dark:shadow-2xl dark:shadow-black/40 sm:p-8">

        {/* SCAM ALERT MODAL */}
        {scamAlert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setScamAlert(null)}>
            <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-sky-400">⚠️ {scamAlert.title}</h3>
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
                <button onClick={bypassScamAlert} className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400 active:scale-[0.98]">
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
                <h3 className="text-lg font-black text-sky-400">⚠️ Unusually Low Price</h3>
                <button onClick={() => setPriceAlert(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
              </div>
              <p className="mt-2 text-sm text-[var(--foreground)]">Your listing price (${price}) seems unusually low for the "{category}" category. This may attract scam filters or suspicious buyers.</p>
              <div className="mt-5 flex gap-3">
                <button onClick={() => setPriceAlert(false)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.98]">
                  Set Higher Price
                </button>
                <button onClick={bypassPriceAlert} className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400 active:scale-[0.98]">
                  Submit Anyway
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Title</label>
            <input id="listing-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" placeholder="What are you selling?" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10 resize-none" placeholder="Describe your item in detail..." />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-[var(--foreground)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 appearance-none cursor-pointer">
                {listingType === "digital" ? (
                  <><option>Templates & Assets</option><option>E-books & Guides</option><option>Art & Photography</option><option>Software & Audio</option><option>Gaming & 3D</option><option>Web & App Development</option><option>Graphic Design</option><option>SEO & Digital Marketing</option><option>Other Digital Services</option></>
                ) : listingType === "service" ? (
                  <><option>Trades & Repairs</option><option>Cleaning & Maintenance</option><option>Tutoring & Lessons</option><option>Photography</option><option>Personal Training</option><option>Events & Catering</option><option>Other Services</option></>
                ) : listingType === "event" ? (
                  <><option>Concerts & Gigs</option><option>Festivals</option><option>Sports</option><option>Workshops & Classes</option><option>Community</option><option>Food & Drink</option><option>Other</option></>
                ) : listingType === "property" ? (
                  <><option>Property</option><option>Houses</option><option>Apartments</option><option>Land</option><option>Commercial</option></>
                ) : listingType === "job" ? (
                  <><option>Jobs</option><option>IT & Tech</option><option>Design & Creative</option><option>Sales & Marketing</option><option>Trades & Services</option><option>Other</option></>
                ) : listingType === "rental" ? (
                  <><option>Other</option><option>Vehicles</option><option>Equipment</option><option>Property</option></>
                ) : listingType === "wanted" ? (
                  <><option>Items</option><option>Services</option><option>Rentals</option><option>Vehicles</option></>
                ) : (
                  <><option>Tech</option><option>Cars</option><option>Gaming</option><option>Fashion</option><option>Home</option><option>Sports</option><option>Other</option></>
                )}
              </select>
            </div>
            {(listingType === "physical" || listingType === "vehicle" || listingType === "property") && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-[var(--foreground)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 appearance-none cursor-pointer">
                <option>New</option><option>Used - Like New</option><option>Used - Good</option><option>Used - Fair</option>
              </select>
            </div>
            )}
          </div>

          {listingType !== "rental" && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {listingType === "job" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Salary / Price *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-8 pr-4 py-3 text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                </div>
              </div>
            ) : saleType === "buy_now" && listingType === "service" && servicePricingType === "request_quote" ? (
              <div className="space-y-1.5">
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-center">
                  <p className="text-xs font-medium text-sky-400">Quote Required — buyers will contact you for a quote</p>
                </div>
              </div>
            ) : saleType === "buy_now" && listingType === "digital" && pricingType === "quote" ? (
              <div className="space-y-1.5">
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-center">
                  <p className="text-xs font-medium text-sky-400">Quote Required — buyers will contact you for pricing</p>
                </div>
              </div>
            ) : saleType === "buy_now" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  {listingType === "service" && servicePricingType === "hourly" ? "Hourly Rate *" : listingType === "wanted" ? "Budget *" : "Price *"}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-8 pr-4 py-3 text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Starting Bid *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                  <input type="number" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} placeholder="0" className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-8 pr-4 py-3 text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                </div>
              </div>
            )}
            {listingType !== "job" && saleType === "auction_buy_now" && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Buy Now Price <span className="text-zinc-600 font-normal">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                  <input type="number" value={buyNowPrice} onChange={(e) => setBuyNowPrice(e.target.value)} placeholder="0" className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-8 pr-4 py-3 text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                </div>
              </div>
            )}
            {(listingType === "physical" || listingType === "vehicle" || listingType === "property" || listingType === "wanted") && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Location</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City" className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
            </div>
            )}
          </div>
          )}

          {(listingType === "physical" || listingType === "vehicle" || listingType === "property") && (saleType === "auction" || saleType === "auction_buy_now") && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Reserve Price <span className="text-[var(--muted)] font-normal">(optional)</span></label>
                <input type="number" value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} placeholder="$"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)]" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Auction Duration</label>
                <select value={auctionDuration} onChange={(e) => setAuctionDuration(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-sky-500">
                  <option value="1">24 hours</option>
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                </select>
              </div>
            </div>
          )}

          {(listingType === "physical" || listingType === "vehicle" || listingType === "property") && (
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Sale Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "buy_now", label: "Buy Now" },
                { id: "auction", label: "Auction" },
                { id: "auction_buy_now", label: "Auction + Buy Now" },
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => setSaleType(opt.id)}
                  className={`rounded-xl border px-4 py-3 text-xs font-bold text-left transition-all duration-200 active:scale-[0.97] ${
                    saleType === opt.id ? "border-sky-500/40 bg-gradient-to-b from-sky-500/10 to-sky-500/5 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.06)]" : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:border-white/[0.12]"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {(listingType !== "wanted" && listingType !== "job" && listingType !== "property") && (
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Payment Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaymentType("contact")}
                className={`rounded-xl border px-4 py-3 text-xs font-bold text-left transition-all duration-200 active:scale-[0.97] ${
                  paymentType === "contact" ? "border-sky-500/40 bg-gradient-to-b from-sky-500/10 to-sky-500/5 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.06)]" : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:border-white/[0.12]"
                }`}>
                <span className="flex items-center gap-1.5">🤝 Arrange Purchase</span>
                <span className="ml-1 rounded bg-sky-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-sky-300">Default</span>
                <p className="mt-1 text-[9px] font-normal text-zinc-500">Bank transfer, cash, or pickup — agree payment in Messages</p>
              </button>
              <button type="button" onClick={() => setPaymentType("stripe")}
                className={`rounded-xl border px-4 py-3 text-xs font-bold text-left transition-all duration-200 active:scale-[0.97] ${
                  paymentType === "stripe" ? "border-sky-500/40 bg-gradient-to-b from-sky-500/10 to-sky-500/5 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.06)]" : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:border-white/[0.12]"
                }`}>
                <span className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
                    <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.866 6.001 1.632V2.94c-1.608-.732-3.965-1.413-6.076-1.413-3.659 0-6.328 1.803-6.328 4.866 0 3.354 2.547 4.545 5.644 5.604 2.162.795 3.251 1.499 3.251 2.476 0 .968-.747 1.49-2.153 1.49-2.49 0-5.206-1.156-6.748-2.041v4.133c1.682.827 4.127 1.435 6.824 1.435 3.943 0 6.827-1.835 6.827-5.017.001-3.452-2.587-4.596-5.617-5.608z"/>
                  </svg>
                  <span className="font-bold tracking-tight">Stripe</span>
                  <span className="text-[10px] font-normal text-zinc-500">Checkout</span>
                </span>
                <p className="mt-1 text-[9px] font-normal text-zinc-500">Card payment — requires Stripe Connect on your profile</p>
              </button>
            </div>
            {paymentType === "contact" && (
              <p className="mt-2 text-[10px] text-sky-400/90 leading-relaxed">
                Sellers: add bank details in{" "}
                <Link href="/profile#payment-settings" className="underline hover:text-sky-300">
                  Profile → Payment settings
                </Link>{" "}
                so buyers see how to pay in Messages.{" "}
                <Link href="/seller-guidelines#arrange-payment" className="text-sky-400 underline hover:text-sky-300">
                  Setup guide
                </Link>
              </p>
            )}
          </div>
          )}

          {/* Listing Type */}
          <div className="space-y-4">
            <div>
              <label className="text-base font-bold text-white">What are you selling?</label>
              <p className="mt-1 text-xs text-zinc-500">Choose the option that best matches what you're offering.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[
                { key: "physical", icon: "📦", label: "Physical", desc: "Real items that can be picked up or shipped.", examples: "Phones, furniture, tools, clothing, collectibles.", action: () => setAcceptOffers(false) },
                { key: "digital", icon: "💾", label: "Digital", desc: "Digital products and online services delivered remotely.", examples: "Software, templates, e-books, web design, graphic design, SEO, digital marketing.", action: () => { setCategory("Other Digital Services"); setPricingType("fixed"); setPickupAvailable(false); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); } },
                { key: "service", icon: "🛠️", label: "Service", desc: "Local services performed in person.", examples: "Lawn mowing, cleaning, tutoring, photography, trades, handyman work, personal training.", action: () => { setCategory("Other Services"); setServicePricingType("fixed"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(true); setSaleType("buy_now"); } },
                { key: "rental", icon: "🔑", label: "Rental", desc: "Something people can hire or rent temporarily.", examples: "Houses, rooms, trailers, equipment, party gear.", action: () => { setCategory("Other"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); setLocation(""); setCondition("New"); } },
                { key: "vehicle", icon: "🚗", label: "Vehicle", desc: "Motor vehicles for sale.", examples: "Cars, motorcycles, boats, caravans, trucks.", action: () => { setCategory("Cars"); setSaleType("buy_now"); setAcceptOffers(false); } },
                { key: "wanted", icon: "📋", label: "Wanted", desc: "Post what you're looking for and let sellers come to you.", examples: "Looking for a car, need a service, want to rent something.", action: () => { setCategory("Items"); setPickupAvailable(false); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); } },
              ].map((t) => (
                <button key={t.key} type="button" onClick={() => { setListingType(t.key as any); setPaymentType("contact"); t.action(); }}
                  className={`group relative rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.97] ${
                    listingType === t.key
                      ? "border-sky-400/40 bg-gradient-to-b from-sky-500/[0.08] to-sky-500/[0.03] shadow-[0_0_30px_rgba(14,165,233,0.1)] ring-1 ring-sky-400/20"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]"
                  }`}>
                  <div className="flex items-start gap-3 sm:flex-col sm:gap-0">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition-all duration-200 sm:h-12 sm:w-12 sm:text-2xl ${
                      listingType === t.key
                        ? "bg-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.15)]"
                        : "bg-white/[0.04] group-hover:bg-white/[0.06]"
                    }`}>{t.icon}</span>
                    <div className="min-w-0 flex-1 sm:mt-2">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold transition-colors ${listingType === t.key ? "text-sky-400" : "text-white"}`}>{t.label}</p>
                        {listingType === t.key && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20">
                            <svg className="h-3 w-3 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-white">{t.desc}</p>
                      <p className="mt-1 text-[10px] leading-snug text-zinc-400"><span className="font-medium text-zinc-300">Best for: </span>{t.examples}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] px-4 py-3">
              <p className="text-[11px] leading-relaxed text-zinc-500">
                <span className="font-semibold text-zinc-400">Not sure which option to choose?</span> Pick the option that best describes what you're offering. Āwhina will automatically adjust the listing form based on your selection.
              </p>
            </div>
          </div>

          {/* Event Details */}
          {listingType === "event" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Event Details</label>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Event date *</label>
                    <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Event time</label>
                    <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Venue *</label>
                  <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Spark Arena, Auckland"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Ticket quantity</label>
                    <input type="number" value={ticketQuantity} onChange={(e) => setTicketQuantity(e.target.value)} placeholder="e.g. 100"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Ticket type</label>
                    <select value={ticketType} onChange={(e) => setTicketType(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
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

          {/* Vehicle Details */}
          {listingType === "vehicle" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Vehicle Details</label>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Make *</label>
                    <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} placeholder="e.g. Toyota"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Model *</label>
                    <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="e.g. Corolla"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Year</label>
                    <input type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} placeholder="e.g. 2020"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Odometer (km)</label>
                    <input type="number" value={vehicleOdometer} onChange={(e) => setVehicleOdometer(e.target.value)} placeholder="e.g. 50000"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Colour</label>
                    <input type="text" value={vehicleColour} onChange={(e) => setVehicleColour(e.target.value)} placeholder="e.g. White"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Body type</label>
                    <select value={vehicleBodyType} onChange={(e) => setVehicleBodyType(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                      <option>SUV</option><option>Sedan</option><option>Hatchback</option><option>Wagon</option><option>Coupe</option><option>Convertible</option><option>Ute</option><option>Van</option><option>Truck</option><option>Motorcycle</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Fuel type</label>
                    <select value={vehicleFuelType} onChange={(e) => setVehicleFuelType(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                      <option>Petrol</option><option>Diesel</option><option>Electric</option><option>Hybrid</option><option>Plug-in Hybrid</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Transmission</label>
                    <select value={vehicleTransmission} onChange={(e) => setVehicleTransmission(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                      <option>Automatic</option><option>Manual</option><option>Tiptronic</option><option>CVT</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Job Details */}
          {listingType === "job" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Job Details</label>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Company *</label>
                  <input type="text" value={jobCompany} onChange={(e) => setJobCompany(e.target.value)} placeholder="e.g. Sky Drop Ltd"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Employment type</label>
                    <select value={jobEmploymentType} onChange={(e) => setJobEmploymentType(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                      <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Casual</option><option>Fixed-term</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Location</label>
                    <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Auckland"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Salary min</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                      <input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="70000"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Salary max</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                      <input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="90000"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Property Details */}
          {listingType === "property" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Property Details</label>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Property type</label>
                    <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                      <option>House</option><option>Apartment</option><option>Unit</option><option>Townhouse</option><option>Lifestyle</option><option>Land</option><option>Commercial</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Parking spaces</label>
                    <input type="number" value={parking} onChange={(e) => setParking(e.target.value)} placeholder="e.g. 2"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Bedrooms</label>
                    <input type="number" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} placeholder="e.g. 3"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Bathrooms</label>
                    <input type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} placeholder="e.g. 2"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Land area (m²)</label>
                    <input type="number" value={landArea} onChange={(e) => setLandArea(e.target.value)} placeholder="e.g. 675"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Floor area (m²)</label>
                    <input type="number" value={floorArea} onChange={(e) => setFloorArea(e.target.value)} placeholder="e.g. 150"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Accept Offers — physical, vehicle, service, property only */}
          {listingType !== "digital" && listingType !== "event" && listingType !== "job" && listingType !== "wanted" && !(listingType === "service" && offersDisabledForService(servicePricingType)) && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <div className="flex items-start">
                <div className="flex h-5 items-center">
                  <input id="acceptOffers" type="checkbox" checked={acceptOffers}
                    onChange={(e) => setAcceptOffers(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
                </div>
                <div className="ml-3">
                  <label htmlFor="acceptOffers" className="text-sm font-bold text-[var(--foreground)]">Accept offers</label>
                  <p className="text-[10px] text-[var(--muted)]">Allow buyers to make offers below your asking price</p>
                </div>
              </div>
            </div>
          )}

          {/* Digital Pricing Type */}
          {listingType === "digital" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Pricing Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPricingType("fixed")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    pricingType === "fixed"
                      ? "border-sky-500 bg-sky-500/10 text-sky-400"
                      : "border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  Fixed Price
                </button>
                <button
                  type="button"
                  onClick={() => setPricingType("quote")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    pricingType === "quote"
                      ? "border-sky-500 bg-sky-500/10 text-sky-400"
                      : "border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  Quote Required
                </button>
              </div>
              <p className="mt-2 text-[10px] text-zinc-500">
                {pricingType === "fixed"
                  ? "Buyers see the exact price and can purchase immediately."
                  : "Buyers contact you to request a custom quote."}
              </p>
            </div>
          )}

          {/* Digital File Upload */}
          {listingType === "digital" && pricingType === "fixed" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Digital File</label>
              <p className="mb-3 text-[11px] font-medium tracking-wide bg-gradient-to-r from-sky-400 to-sky-400 bg-clip-text text-transparent">Upload your digital asset file</p>
              {digitalFileURL ? (
                <div className="flex items-center justify-between rounded-lg bg-sky-500/10 px-4 py-3">
                  <span className="text-xs text-sky-400">✓ {digitalFileName}</span>
                  <button onClick={() => { setDigitalFileURL(""); setDigitalFileName(""); setDigitalStoragePath(""); }} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
                </div>
              ) : (
                <DigitalAssetUpload onUpload={(url, name, path) => { setDigitalFileURL(url); setDigitalFileName(name); setDigitalStoragePath(path); }} />
              )}
            </div>
          )}

          {/* Service Details */}
          {listingType === "service" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4 space-y-4">
              <div>
                <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Pricing Type</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SERVICE_PRICING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setServicePricingType(opt.value);
                        if (opt.value === "request_quote") {
                          setPrice("");
                          setAcceptOffers(false);
                        }
                      }}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition ${
                        servicePricingType === opt.value
                          ? "border-sky-500 bg-sky-500/10 text-sky-400"
                          : "border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-[var(--muted)]">
                  {SERVICE_PRICING_OPTIONS.find((o) => o.value === servicePricingType)?.hint}
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Estimated turnaround</label>
                <input
                  type="text"
                  value={serviceDuration}
                  onChange={(e) => setServiceDuration(e.target.value)}
                  placeholder="e.g. 1 hour, same day, 3-5 days"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                />
                <p className="mt-2 text-[10px] text-[var(--muted)]">
                  Local, in-person services — buyers message you to agree scope and timing.
                </p>
              </div>
            </div>
          )}

          {/* Rental Details */}
          {listingType === "rental" && (
            <div className="space-y-4">
              {/* Rental Sub-Type Selector */}
              <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
                <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Rental Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "property", icon: "🏠", label: "Property" },
                    { id: "equipment", icon: "🔧", label: "Equipment" },
                    { id: "vehicle", icon: "🚗", label: "Vehicle" },
                  ] as const).map((opt) => (
                    <button key={opt.id} type="button"
                      onClick={() => setRentalSubType(opt.id)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all active:scale-[0.97] ${
                        rentalSubType === opt.id
                          ? "border-sky-500/40 bg-gradient-to-b from-sky-500/10 to-sky-500/5 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.06)]"
                          : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:border-white/[0.12]"
                      }`}>
                      <span className="text-xl">{opt.icon}</span>
                      <span className="text-xs font-bold">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location — all sub-types */}
              <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">
                  {rentalSubType === "property" ? "Property address / suburb *" : "Pickup location *"}
                </label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder={rentalSubType === "property" ? "e.g. Auckland CBD, Wellington" : "City or suburb"}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
              </div>

              {/* PROPERTY RENTAL */}
              {rentalSubType === "property" && (
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4 space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Property Rental</p>

                  {/* Property Type */}
                  <div>
                    <label className="mb-2 block text-[10px] font-medium text-[var(--muted)]">Property Type *</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(["House", "Apartment", "Townhouse", "Unit", "Room"] as const).map((pt) => (
                        <button key={pt} type="button" onClick={() => setRentalPropertyType(pt)}
                          className={`rounded-lg border px-2 py-2 text-center text-[11px] font-bold transition-all active:scale-[0.97] ${
                            rentalPropertyType === pt
                              ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                              : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:border-white/[0.12] hover:bg-white/[0.04]"
                          }`}>{pt}</button>
                      ))}
                    </div>
                  </div>

                  {/* Weekly rent + bond */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Weekly Rent *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalPriceWeekly} onChange={(e) => {
                          setRentalPriceWeekly(e.target.value);
                          const w = Number(e.target.value);
                          if (w > 0 && !manualEdit.current.has("monthly")) setRentalPriceMonthly(String(Math.round(w * 4)));
                          if (w > 0 && !manualEdit.current.has("price")) setPrice(String(Math.round(w / 7)));
                        }}
                          placeholder="e.g. 550"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-sky-400">Bond Amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalDeposit} onChange={(e) => setRentalDeposit(e.target.value)}
                          placeholder="e.g. 1100"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                      <p className="mt-1 text-[10px] text-zinc-600">Typically 2 weeks rent</p>
                    </div>
                  </div>

                  {/* Bedrooms / bathrooms / parking spaces */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Bedrooms</label>
                      <input type="number" min="0" value={rentalBedrooms} onChange={(e) => setRentalBedrooms(e.target.value)}
                        placeholder="e.g. 3"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Bathrooms</label>
                      <input type="number" min="0" value={rentalBathrooms} onChange={(e) => setRentalBathrooms(e.target.value)}
                        placeholder="e.g. 2"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Parking Spaces</label>
                      <input type="number" min="0" value={rentalParkingSpaces} onChange={(e) => setRentalParkingSpaces(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                  </div>

                  {/* Furnished Status */}
                  <div>
                    <label className="mb-2 block text-[10px] font-medium text-[var(--muted)]">Furnished Status</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Furnished", "Partly Furnished", "Unfurnished"] as const).map((fs) => (
                        <button key={fs} type="button" onClick={() => setRentalFurnishedStatus(fs)}
                          className={`rounded-lg border px-2 py-2 text-center text-[11px] font-bold transition-all active:scale-[0.97] ${
                            rentalFurnishedStatus === fs
                              ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                              : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:border-white/[0.12] hover:bg-white/[0.04]"
                          }`}>{fs}</button>
                      ))}
                    </div>
                  </div>

                  {/* Pets Policy */}
                  <div>
                    <label className="mb-2 block text-[10px] font-medium text-[var(--muted)]">Pets Policy</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["No Pets", "Cats Allowed", "Dogs Allowed", "Pets By Negotiation"] as const).map((pp) => (
                        <button key={pp} type="button" onClick={() => setRentalPetsPolicy(pp)}
                          className={`rounded-lg border px-2 py-2 text-center text-[11px] font-bold transition-all active:scale-[0.97] ${
                            rentalPetsPolicy === pp
                              ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                              : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:border-white/[0.12] hover:bg-white/[0.04]"
                          }`}>{pp}</button>
                      ))}
                    </div>
                  </div>

                  {/* Available from */}
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Available From</label>
                    <input type="date" value={rentalAvailableDate} onChange={(e) => setRentalAvailableDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>

                  {/* Minimum Tenancy */}
                  <div>
                    <label className="mb-2 block text-[10px] font-medium text-[var(--muted)]">Minimum Tenancy <span className="text-zinc-600">(optional)</span></label>
                    <div className="grid grid-cols-4 gap-2">
                      {(["Flexible", "3 Months", "6 Months", "12 Months"] as const).map((mt) => (
                        <button key={mt} type="button" onClick={() => setRentalMinTenancy(mt)}
                          className={`rounded-lg border px-2 py-2 text-center text-[11px] font-bold transition-all active:scale-[0.97] ${
                            rentalMinTenancy === mt
                              ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                              : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:border-white/[0.12] hover:bg-white/[0.04]"
                          }`}>{mt}</button>
                      ))}
                    </div>
                  </div>

                  {/* Optional Features */}
                  <div>
                    <label className="mb-2 block text-[10px] font-medium text-[var(--muted)]">Features <span className="text-zinc-600">(optional)</span></label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {["Fibre Internet", "Heat Pump", "Air Conditioning", "Dishwasher", "Washing Machine", "Garage", "Balcony", "Healthy Homes Compliant"].map((feat) => {
                        const active = rentalFeatures.includes(feat);
                        return (
                          <button key={feat} type="button"
                            onClick={() => setRentalFeatures(active ? rentalFeatures.filter(f => f !== feat) : [...rentalFeatures, feat])}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-all active:scale-[0.97] ${
                              active
                                ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                                : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:border-white/[0.12] hover:bg-white/[0.04]"
                            }`}>
                            <span className={`h-3 w-3 flex-shrink-0 rounded-sm border ${active ? "border-sky-500 bg-sky-500" : "border-zinc-600"}`} />
                            {feat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* EQUIPMENT RENTAL */}
              {rentalSubType === "equipment" && (
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4 space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Equipment Rental</p>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Daily Rate *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={price} onChange={(e) => {
                          const v = e.target.value; setPrice(v);
                          const d = Number(v);
                          if (d > 0) {
                            if (!manualEdit.current.has("weekly")) setRentalPriceWeekly(String(Math.round(d * 7)));
                            const w = manualEdit.current.has("weekly") ? Number(rentalPriceWeekly) : Math.round(d * 7);
                            if (!manualEdit.current.has("monthly") && w > 0) setRentalPriceMonthly(String(Math.round(w * 4)));
                          }
                        }}
                          placeholder="Day"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Weekly</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalPriceWeekly} onChange={(e) => { setRentalPriceWeekly(e.target.value); manualEdit.current.add("weekly"); }}
                          placeholder="Week"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalPriceMonthly} onChange={(e) => { setRentalPriceMonthly(e.target.value); manualEdit.current.add("monthly"); }}
                          placeholder="Month"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-500">Weekly and monthly auto-calculated — edit manually to override.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-sky-400">Refundable Deposit</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalDeposit} onChange={(e) => setRentalDeposit(e.target.value)}
                          placeholder="e.g. 200"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Quantity Available</label>
                      <input type="number" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)}
                        placeholder="e.g. 2"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Condition</label>
                    <select value={condition} onChange={(e) => setCondition(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                      <option>New</option><option>Used - Like New</option><option>Used - Good</option><option>Used - Fair</option>
                    </select>
                  </div>
                </div>
              )}

              {/* VEHICLE RENTAL */}
              {rentalSubType === "vehicle" && (
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4 space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Vehicle Rental</p>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Daily Rate *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={price} onChange={(e) => {
                          const v = e.target.value; setPrice(v);
                          const d = Number(v);
                          if (d > 0) {
                            if (!manualEdit.current.has("weekly")) setRentalPriceWeekly(String(Math.round(d * 7)));
                            const w = manualEdit.current.has("weekly") ? Number(rentalPriceWeekly) : Math.round(d * 7);
                            if (!manualEdit.current.has("monthly") && w > 0) setRentalPriceMonthly(String(Math.round(w * 4)));
                          }
                        }}
                          placeholder="Day"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Weekly</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalPriceWeekly} onChange={(e) => { setRentalPriceWeekly(e.target.value); manualEdit.current.add("weekly"); }}
                          placeholder="Week"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalPriceMonthly} onChange={(e) => { setRentalPriceMonthly(e.target.value); manualEdit.current.add("monthly"); }}
                          placeholder="Month"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-sky-400">Refundable Deposit</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalDeposit} onChange={(e) => setRentalDeposit(e.target.value)}
                          placeholder="e.g. 500"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Condition</label>
                      <select value={condition} onChange={(e) => setCondition(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                        <option>New</option><option>Used - Like New</option><option>Used - Good</option><option>Used - Fair</option>
                      </select>
                    </div>
                  </div>

                  {/* Vehicle details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Make</label>
                      <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)}
                        placeholder="e.g. Toyota"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Model</label>
                      <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)}
                        placeholder="e.g. HiAce"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Year</label>
                      <input type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)}
                        placeholder="e.g. 2018"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Transmission</label>
                      <select value={vehicleTransmission} onChange={(e) => setVehicleTransmission(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                        <option>Automatic</option><option>Manual</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Seats</label>
                      <input type="number" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)}
                        placeholder="e.g. 5"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Delivery Options — physical & vehicle */}
          {(listingType === "physical" || listingType === "vehicle") && (
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
            <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Delivery Options</label>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={pickupAvailable} onChange={(e) => setPickupAvailable(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
                <span className="text-sm text-[var(--foreground)]">Pickup available</span>
              </label>
              {pickupAvailable && (
                <div className="ml-7">
                  <input type="text" value={pickupArea} onChange={(e) => setPickupArea(e.target.value)}
                    placeholder="Pickup area / suburb"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={shippingAvailable} onChange={(e) => setShippingAvailable(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
                <span className="text-sm text-[var(--foreground)]">Shipping available</span>
              </label>
              {shippingAvailable && (
                <>
                  <label className="flex cursor-pointer items-center gap-2 ml-7">
                    <input type="checkbox" checked={freeShipping} onChange={(e) => { setFreeShipping(e.target.checked); if (e.target.checked) setShippingFee(""); }}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
                    <span className="text-xs text-[var(--foreground)]">Free shipping</span>
                  </label>
                  {!freeShipping && (
                    <div className="ml-7">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)}
                          placeholder="Shipping fee"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Stock quantity</label>
                <input type="number" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
              </div>
            </div>
          </div>
          )}

          {/* Expires in — all types */}
          <div>
            <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Listing expires in</label>
            <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </div>

          <button
            id="listing-submit-btn"
            onClick={createListing}
            disabled={
              loading ||
              editLoading ||
              ((saleType === "auction" || saleType === "auction_buy_now")
                ? !startingBid
                : listingType === "service"
                  ? servicePriceRequired(servicePricingType) && !price
                  : listingType === "digital" && pricingType === "quote"
                    ? false
                    : listingType === "rental"
                      ? !price
                      : !price)
            }
            className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-4 text-lg font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </span>
            ) : editId ? "Save Changes" : "Post Now"}
          </button>
        </div>
          </div>
        </div>
      </div>
    </main>
  );
}