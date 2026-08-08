"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../../lib/firebase";
import { getFreshIdToken } from "../../lib/api-auth";
import { uploadListingImagesViaApi } from "../../lib/upload-listing-image.client";
import { createPendingXP, trackListingCreated } from "../../lib/xpValidation";
import { trackFunnelEvent } from "../../lib/funnel-events";
import { checkImage } from "../../lib/nsfw";
import { showToast } from "../../components/Toast";
import { detectScam } from "../../lib/scamdetection";
import { detectSuspiciousPrice } from "../../lib/pricedetection";
import { getListingBlockReason } from "../../lib/seller-eligibility";
import { STRIPE_CONNECT_REQUIRED_MSG, sellerCanUseStripeCheckout } from "../../lib/seller-payments";
import { resolveListingType } from "../../lib/listing-types";
import { hasActiveListingDraft, mergeListingFillWithDraft } from "../../lib/sky-ai-draft-merge";
import { readListingDraftFromSkyAi, syncListingDraftToSkyAi, clearListingDraftFromSkyAi } from "../../lib/sky-ai-listing-context";
import {
  applySkyAiListingFill,
  consumePendingListingFill,
  SKY_AI_LISTING_FILL_EVENT,
  type SkyAiListingFill,
} from "../../lib/sky-ai-listing-fill";
import {
  AWHINA_VOICE_FORM_ACTION_EVENT,
  type AwhinaVoiceFormAction,
} from "../../lib/awhina-voice-form-events";
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
import { compressImage, generateThumbnail, type CompressedImage, type Thumbnail } from "../../lib/image-optimization";
import { withTimeout } from "../../lib/with-timeout";
import { getClientCsrfToken } from "../../lib/csrf-client";
import { isStripeCheckoutVisibleClient } from "../../lib/stripe-checkout-flags";

function sentenceCaseFragment(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

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
  const [listingType, setListingType] = useState<"physical" | "service" | "rental" | "event" | "vehicle" | "job" | "property" | "wanted">("physical");
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
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeStatusLoaded, setStripeStatusLoaded] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [existingThumbnails, setExistingThumbnails] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scamAlert, setScamAlert] = useState<{ title: string; message: string; found: string[] } | null>(null);
  const [priceAlert, setPriceAlert] = useState(false);
  const [confirmedSubmit, setConfirmedSubmit] = useState(false);
  const [showTypeGuideModal, setShowTypeGuideModal] = useState(false);
  const [showAwhinaGuide, setShowAwhinaGuide] = useState(false);
  const [showAutoPublishConfirm, setShowAutoPublishConfirm] = useState(false);
  const [autoPublishCountdown, setAutoPublishCountdown] = useState(3);
  const [priceSuggestion, setPriceSuggestion] = useState<{ suggestedMin: number; suggestedMax: number; reasoning: string; marketFactors: string[]; confidence: string; missingDetails?: string[]; marketResearch?: boolean } | null>(null);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [loadingPriceSuggestion, setLoadingPriceSuggestion] = useState(false);

  const [skyChatOpen, setSkyChatOpen] = useState(false);
  const [skyAutoQuery, setSkyAutoQuery] = useState<string | undefined>();
  const [draftExtras, setDraftExtras] = useState<string[]>([]);
  const [formStep, setFormStep] = useState(1);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [showAcceptOffers, setShowAcceptOffers] = useState(false);
    const [showServiceDetails, setShowServiceDetails] = useState(false);
  const [showRentalDetails, setShowRentalDetails] = useState(false);
  const [showStockSettings, setShowStockSettings] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [autoPublish, setAutoPublish] = useState(false);

  // V1: UI visibility — server STRIPE_CHECKOUT_ENABLED authorizes charges
  const stripeDisabledV1 = !isStripeCheckoutVisibleClient();

  // V1 messaging-first: new listings are fixed-price only (do not rewrite historical auction edits)
  useEffect(() => {
    if (stripeDisabledV1 && !editId && saleType !== "buy_now") {
      setSaleType("buy_now");
    }
  }, [stripeDisabledV1, editId, saleType]);

  // Form completion progress (honest, field-based — not a fake stepper)
  const formProgress = useMemo(() => {
    let total = 0;
    let filled = 0;
    const add = (required: boolean, value: string | boolean | number | string[] | null) => {
      if (required) {
        total += 1;
        if (Array.isArray(value) ? value.length > 0 : typeof value === "boolean" ? value : String(value || "").trim()) {
          filled += 1;
        }
      }
    };
    add(true, title);
    add(true, description);
    add(true, category);
    add(listingType === "physical" || listingType === "vehicle" || listingType === "property", condition);
    add(listingType !== "rental", saleType === "buy_now" ? price : startingBid);
    add(listingType === "physical" || listingType === "vehicle" || listingType === "property" || listingType === "wanted", location);
    add(true, imageFiles.length > 0 || imagePreviews.length > 0 || existingImages.length > 0);
    return total === 0 ? 0 : Math.round((filled / total) * 100);
  }, [title, description, category, condition, listingType, saleType, price, startingBid, location, imageFiles.length, imagePreviews.length, existingImages.length]);
  const classifierRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const manualEdit = useRef<Set<string>>(new Set());
  const [showHelpPrompt, setShowHelpPrompt] = useState(false);
  const [timeOnPage, setTimeOnPage] = useState(0);

  // Validation functions
  const validateTitle = (value: string) => {
    if (!value.trim()) return "Title is required";
    if (value.trim().length < 3) return "Title must be at least 3 characters";
    if (value.trim().length > 100) return "Title must be less than 100 characters";
    return "";
  };

  const validatePrice = (value: string, type?: string) => {
    const numPrice = Number(value);
    if (!value.trim()) return "Price is required";
    if (isNaN(numPrice) || numPrice <= 0) return "Price must be a positive number";
    if (numPrice > 1000000) return "Price seems too high. Please verify.";
    return "";
  };

  const validateDescription = (value: string) => {
    if (!value.trim()) return "Description is required - helps buyers understand your item";
    if (value.trim().length < 10) return "Description must be at least 10 characters";
    return "";
  };

  const validateLocation = (value: string) => {
    if (!value.trim()) return "Location is required";
    return "";
  };

  const isFieldValid = (value: string, validator: (v: string) => string) => {
    return value.trim() && validator(value) === "";
  };

  const validateEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value.trim()) return "Email is required";
    if (!emailRegex.test(value)) return "Invalid email format";
    return "";
  };

  const validatePhone = (value: string) => {
    const phoneRegex = /^[\d\s+\-()]{8,}$/;
    if (!value.trim()) return "Phone number is required";
    if (!phoneRegex.test(value)) return "Invalid phone number format";
    return "";
  };

  // Real-time validation handlers
  const handleTitleChange = (value: string) => {
    setTitle(value);
    setValidationErrors(prev => ({ ...prev, title: validateTitle(value) }));
  };

  const handlePriceChange = (value: string) => {
    setPrice(value);
    setValidationErrors(prev => ({ ...prev, price: validatePrice(value, listingType) }));
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    setValidationErrors(prev => ({ ...prev, description: validateDescription(value) }));
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
    setValidationErrors(prev => ({ ...prev, location: validateLocation(value) }));
  };

  const choosePaymentType = useCallback((type: string) => {
    const next = type === "stripe" ? "stripe" : "contact";
    if (next === "stripe" && !stripeConnected) {
      showToast(STRIPE_CONNECT_REQUIRED_MSG, "error");
      return;
    }
    setPaymentType(next);
  }, [stripeConnected]);

  // Only clamp after profile Stripe status is known — otherwise edit load races
  // (stripeConnected starts false) and silently forces Arrange Purchase.
  useEffect(() => {
    if (!stripeStatusLoaded) return;
    if (!stripeConnected && paymentType === "stripe") {
      setPaymentType("contact");
    }
  }, [stripeStatusLoaded, stripeConnected, paymentType]);

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
    const replaceDraft = fill.replaceDraft === true;
    // Explicit NEW sell: clear prior draft — do not keep stale price/year/vehicle fields
    if (replaceDraft) {
      clearListingDraftFromSkyAi();
      setTitle("");
      setDescription("");
      setCategory("");
      setCondition("");
      setPrice("");
      setListingType("physical");
      setLocation("");
      setVehicleMake("");
      setVehicleModel("");
      setVehicleYear("");
      setVehicleOdometer("");
      setVehicleTransmission("");
      setVehicleFuelType("");
      setVehicleBodyType("");
      setVehicleColour("");
      setDraftExtras([]);
      setRentalSubType("equipment");
      setRentalPropertyType("");
      setRentalPriceWeekly("");
      setRentalPriceMonthly("");
      setRentalDeposit("");
      setRentalBedrooms("");
      setRentalBathrooms("");
      setRentalParkingSpaces("");
      setRentalFurnishedStatus("");
      setRentalPetsPolicy("");
      setRentalAvailableDate("");
      setRentalMinTenancy("");
      setRentalFeatures([]);
      setStockQuantity("");
      setServiceDuration("");
    }
    const merged = replaceDraft ? { ...fill } : mergeListingFillWithDraft(prior, fill);
    const isUpdate = !replaceDraft && hasActiveListingDraft(prior);

    const beforeSnapshot = { title, description, category, condition, price, listingType, location };
    let fieldsChanged = 0;

    const trackingSetTitle = (v: string) => { if (v !== beforeSnapshot.title) fieldsChanged++; setTitle(v); };
    const trackingSetDescription = (v: string) => { if (v !== beforeSnapshot.description) fieldsChanged++; setDescription(v); };
    const trackingSetCategory = (v: string) => { if (v !== beforeSnapshot.category) fieldsChanged++; setCategory(v); };
    const trackingSetCondition = (v: string) => { if (v !== beforeSnapshot.condition) fieldsChanged++; setCondition(v); };
    const trackingSetPrice = (v: string) => { if (v !== beforeSnapshot.price) fieldsChanged++; setPrice(v); };
    const trackingSetListingType = (v: "physical" | "service" | "rental" | "event" | "vehicle" | "job" | "property" | "wanted") => { if (v !== beforeSnapshot.listingType) fieldsChanged++; setListingType(v); };
    const trackingSetLocation = (v: string) => { if (v !== beforeSnapshot.location) fieldsChanged++; setLocation(v); };

    if (merged.extras?.length) setDraftExtras(merged.extras);
    const ok = applySkyAiListingFill(merged, {
      setTitle: trackingSetTitle,
      setDescription: trackingSetDescription,
      setCategory: trackingSetCategory,
      setCondition: trackingSetCondition,
      setPrice: trackingSetPrice,
      setListingType: trackingSetListingType,
      setLocation: trackingSetLocation,
      setPaymentType: choosePaymentType,
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
    if (ok && fieldsChanged > 0) {
      const msg =
        imagePreviews.length > 0
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
      
      // Trigger auto-publish if enabled
      if (autoPublish && fieldsChanged > 0) {
        setShowAutoPublishConfirm(true);
        setAutoPublishCountdown(3);
        const countdown = setInterval(() => {
          setAutoPublishCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(countdown);
              setShowAutoPublishConfirm(false);
              createListing();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } else if (!ok) {
      showToast("Āwhina couldn't fill your form — try describing the item again", "error");
    }
  }, [imagePreviews.length, title, description, category, condition, price, listingType, location, autoPublish, choosePaymentType]);

  const appendDescriptionFromVoice = useCallback((text: string) => {
    const incoming = text.trim();
    if (!incoming) return;
    setDescription((prev) => {
      const current = prev.trim();
      if (!current) return sentenceCaseFragment(incoming);
      const needsPeriod = /[.!?]$/.test(current) ? "" : ".";
      return `${current}${needsPeriod} ${sentenceCaseFragment(incoming)}`.trim();
    });
    showToast("Description updated");
  }, []);

  const fetchPriceSuggestion = async () => {
    if (!title || !category) {
      showToast("Please enter a title and category first", "error");
      return;
    }

    setLoadingPriceSuggestion(true);
    try {
      const token = await getFreshIdToken();
      if (!token) {
        showToast("Please sign in to get price suggestions", "error");
        setLoadingPriceSuggestion(false);
        return;
      }

      const res = await fetch("/api/ai-price-suggestion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          category,
          listingType,
          condition,
          price,
          location,
          vehicleMake,
          vehicleModel,
          vehicleYear,
          vehicleOdometer,
          vehicleBodyType,
          vehicleFuelType,
          vehicleTransmission,
          vehicleColour,
          bedrooms,
          bathrooms,
          landArea,
          floorArea,
          rentalSubType,
          rentalPriceWeekly,
          salaryMin,
          salaryMax,
          serviceDuration,
          stockQuantity,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to get price suggestion");
      }

      setPriceSuggestion(data);
      setShowPriceModal(true);
    } catch (error) {
      console.error("Price suggestion error:", error);
      showToast(error instanceof Error ? error.message : "Failed to get price suggestion", "error");
    } finally {
      setLoadingPriceSuggestion(false);
    }
  };

  const applyPriceSuggestion = (suggestedPrice: number) => {
    setPrice(String(suggestedPrice));
    setShowPriceModal(false);
    showToast(`Price updated to $${suggestedPrice}`, "success");
  };

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

    const onVoiceFormAction = (e: Event) => {
      const detail = (e as CustomEvent<AwhinaVoiceFormAction>).detail;
      if (!detail) return;
      if (detail.type === "apply_fill") {
        applyFill(detail.fill);
        return;
      }
      if (detail.type === "append_description") {
        appendDescriptionFromVoice(detail.text);
        return;
      }
      if (detail.type === "publish") {
        setTimeout(() => {
          document.getElementById("listing-submit-btn")?.click();
        }, 0);
      }
    };

    window.addEventListener(SKY_AI_LISTING_FILL_EVENT, onFill);
    window.addEventListener(SKY_AI_LISTING_IMAGES_EVENT, onImages);
    window.addEventListener(AWHINA_VOICE_FORM_ACTION_EVENT, onVoiceFormAction);
    return () => {
      window.removeEventListener(SKY_AI_LISTING_FILL_EVENT, onFill);
      window.removeEventListener(SKY_AI_LISTING_IMAGES_EVENT, onImages);
      window.removeEventListener(AWHINA_VOICE_FORM_ACTION_EVENT, onVoiceFormAction);
    };
  }, [appendDescriptionFromVoice, applyFill, imagePreviews.length]);

  // Load model from CDN
  useEffect(() => {
    async function loadModel() {
      const timeout = setTimeout(() => {
        if (process.env.NODE_ENV !== "production") console.warn("AI model CDN timed out");
        setModelReady(true);
      }, 8000);

      try {
        const script1 = document.createElement('script');
        script1.type = 'module';
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
          let connected = false;
          try {
            const token = await u.getIdToken();
            const statusRes = await fetch("/api/stripe-connect", {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (statusRes.ok) {
              const status = await statusRes.json();
              connected = !!status.connected;
            } else if (snap.exists()) {
              connected = sellerCanUseStripeCheckout(snap.data());
            }
          } catch {
            if (snap.exists()) connected = sellerCanUseStripeCheckout(snap.data());
          }
          setStripeConnected(connected);
          if (snap.exists()) {
            const d = snap.data();
            // Smart default: pre-fill location from user profile if not already set
            if (d.location && !location) {
              setLocation(d.location);
            }
          } else {
            setStripeConnected(false);
          }
        } catch {
          setStripeConnected(false);
        } finally {
          setStripeStatusLoaded(true);
        }
      } else {
        setStripeConnected(false);
        setStripeStatusLoaded(true);
      }
    });
    return () => unsub();
  }, []);

  // Track time on page and show help prompt for stuck users
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOnPage((prev) => prev + 1);
      
      // Show help prompt after 2 minutes if completion is low (<30%)
      if (timeOnPage === 120 && formProgress < 30 && !showHelpPrompt) {
        setShowHelpPrompt(true);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [timeOnPage, formProgress, showHelpPrompt]);

  // Funnel: listing_form_started — once per session, only for new listings (not edits)
  const formStartedRef = useRef(false);
  useEffect(() => {
    if (!user?.uid || formStartedRef.current) return;
    const editParam = new URLSearchParams(window.location.search).get("edit");
    if (editParam) return;
    formStartedRef.current = true;
    trackFunnelEvent({ event: "listing_form_started", userId: user.uid, listingType });
  }, [user?.uid, listingType]);

  // Pre-select listing type from ?type= query param
  useEffect(() => {
    const typeParam = new URLSearchParams(window.location.search).get("type");
    if (!typeParam) return;
    const valid = ["physical", "service", "rental", "event", "vehicle", "job", "property", "wanted"];
    if (valid.includes(typeParam)) {
      setListingType(typeParam as any);
    }
  }, []);

  useEffect(() => {
    const editParam = new URLSearchParams(window.location.search).get("edit");
    if (!editParam) return;
    setEditId(editParam);
    setShowAdvancedOptions(true);
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
      if (data.paymentType === "stripe") {
        setShowAdvancedOptions(true);
      }
      setPaymentType(data.paymentType === "stripe" ? "stripe" : "contact");
      setPricingType(data.pricingType === "quote" ? "quote" : "fixed");
      setServicePricingType(
        normalizeServicePricingType(data.servicePricingType, data.price, data.description)
      );
      setExistingImages(data.images || []);
      setExistingThumbnails(Array.isArray(data.thumbnails) ? data.thumbnails : []);
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

  const MAX_IMAGE_SIZE_MB = 10;
  const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  function isRemoteImageUrl(url: string): boolean {
    return url.startsWith("http://") || url.startsWith("https://");
  }

  function isLocalImagePreview(url: string): boolean {
    return url.startsWith("data:") || url.startsWith("blob:");
  }

  async function uploadListingImageFile(file: File, index: number): Promise<{ fullUrl: string; thumbUrl: string }> {
    try {
      const compressed: CompressedImage = await withTimeout(compressImage(file), 30_000, "Image compression");
      const thumbnail: Thumbnail = await withTimeout(generateThumbnail(file), 20_000, "Thumbnail generation");
      return await uploadListingImagesViaApi(compressed.blob, thumbnail.blob, index);
    } catch (error) {
      console.error(`Failed to process image ${index}:`, error);
      return await uploadListingImagesViaApi(file, file, index);
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 8);
    if (files.length === 0) return;

    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        showToast(`"${file.name}" is not a supported image. Use JPG, PNG, WebP, or GIF.`, "error");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        showToast(`"${file.name}" is too large. Max image size is ${MAX_IMAGE_SIZE_MB}MB.`, "error");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
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
    if (loading) return;
    const needsPrice =
      listingType === "service"
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    if (listingType === "physical" && !pickupAvailable && !shippingAvailable) {
      showToast("Select at least one delivery method (pickup or shipping).", "error");
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
    if (listingType === "vehicle" || (listingType === "physical" && category === "Cars")) {
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

    const publishType = resolveListingType({
      listingType,
      category,
    }) as typeof listingType;

    try {
      let images: string[] = [];
      let thumbnails: string[] = [];

      if (publishType !== "wanted" && imagePreviews.length > 0) {
        const pendingFiles = [...imageFiles];
        let uploadIndex = 0;

        for (const preview of imagePreviews) {
          if (isRemoteImageUrl(preview)) {
            images.push(preview);
            const existingIdx = existingImages.indexOf(preview);
            thumbnails.push(
              existingIdx >= 0 && existingThumbnails[existingIdx]
                ? existingThumbnails[existingIdx]
                : preview
            );
            continue;
          }

          if (!isLocalImagePreview(preview)) continue;

          const file = pendingFiles.shift();
          if (!file) {
            showToast("Could not match a new photo to upload — remove it and add again.", "error");
            setLoading(false);
            setConfirmedSubmit(false);
            return;
          }

          const uploaded = await uploadListingImageFile(file, uploadIndex++);
          images.push(uploaded.fullUrl);
          thumbnails.push(uploaded.thumbUrl);
        }
      } else if (existingImages.length > 0) {
        images = [...existingImages];
        thumbnails = existingThumbnails.length ? [...existingThumbnails] : [...existingImages];
      }

      const baseData: Record<string, any> = {
        title, description, price: String(price), category, acceptOffers,
        imageUrl: images[0] || "", images, thumbnails, paymentType,
      };

      if (editId) {
        baseData.updatedAt = serverTimestamp();
      } else {
        baseData.sellerEmail = user.email; baseData.sellerUsername = user.email?.split("@")[0] || "User";
        baseData.sellerId = user.uid; baseData.createdAt = serverTimestamp();
        baseData.expiresAt = new Date(Date.now() + Number(expiresIn) * 86400000);
      }

      const listingData: any = publishType === "service" ? {
        ...baseData,
        type: "service",
        serviceDuration,
        servicePricingType,
        price: servicePriceRequired(servicePricingType) ? String(price) : "",
        acceptOffers: offersDisabledForService(servicePricingType) ? false : acceptOffers,
        saleType: "buy_now",
        ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : publishType === "rental" ? {
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
      } : publishType === "event" ? {
        ...baseData, category,
        type: "event", acceptOffers: false,
        eventDate, eventTime, venue,
        ticketQuantity: ticketQuantity ? Number(ticketQuantity) : null,
        stockQuantity: ticketQuantity ? Number(ticketQuantity) : null,
        ticketType,
        ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : publishType === "job" ? {
        ...baseData, category, location,
        type: "job", acceptOffers: false,
        jobCompany, jobEmploymentType,
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : publishType === "property" ? {
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
      } : publishType === "vehicle" ? {
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
      } : publishType === "wanted" ? {
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
        ...(category === "Cars"
          ? {
              vehicleMake,
              vehicleModel,
              vehicleYear: vehicleYear ? Number(vehicleYear) : null,
              vehicleOdometer: vehicleOdometer ? Number(vehicleOdometer) : null,
              vehicleBodyType,
              vehicleFuelType,
              vehicleTransmission,
              vehicleColour,
            }
          : {}),
        ...(editId ? {} : {
          auctionEndsAt: (saleType === "auction" || saleType === "auction_buy_now") ? new Date(Date.now() + Number(auctionDuration) * 86400000) : null,
          expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
          currentBid: null, bidCount: 0, highestBidder: null, status: "live",
        }),
      };

      // Check Stripe Connect BEFORE creating/updating listing
      if (paymentType === "stripe" && !stripeDisabledV1) {
        if (!stripeConnected) {
          showToast(STRIPE_CONNECT_REQUIRED_MSG, "error");
          setTimeout(() => { window.location.href = "/profile?tab=payouts"; }, 1500);
          setLoading(false);
          setConfirmedSubmit(false);
          return;
        }
      }
      if (stripeDisabledV1) {
        listingData.paymentType = "contact";
      }

      let newId = editId;
      if (editId) {
        const token = await auth.currentUser?.getIdToken();
        const csrfToken = await getClientCsrfToken();
        const controller = new AbortController();
        const fetchTimeout = window.setTimeout(() => controller.abort(), 30_000);
        let res: Response;
        try {
          res = await fetch("/api/update-listing", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
            },
            body: JSON.stringify({ listingId: editId, ...listingData, expiresInDays: expiresIn }),
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(fetchTimeout);
        }
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
        const csrfToken = await getClientCsrfToken();
        const res = await fetch("/api/create-listing", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            Authorization: `Bearer ${token}`,
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          body: JSON.stringify({ ...listingData, expiresInDays: expiresIn, listingType: publishType }),
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
        createPendingXP(user.uid, "listing", data.listingId, data.listingId);
        trackListingCreated(user.uid, title);
        trackFunnelEvent({
          event: "listing_form_completed",
          userId: user.uid,
          listingId: data.listingId,
          listingType: publishType,
        });
        showToast("Listing created!", "success");
      }
      setImagePreviews([]); setImageFiles([]); setExistingImages([]); setExistingThumbnails([]);
      // Preserve form state for easier duplicate listings
      // setTitle(""); setDescription(""); setPrice("");
      // setLocation(""); setCategory("Other"); setDetected("");
      // setPickupAvailable(false); setShippingAvailable(false);
      // setPickupArea(""); setShippingFee(""); setFreeShipping(false);
      // setStockQuantity("");
      // setSaleType("buy_now"); setBuyNowPrice(""); setStartingBid(""); setReservePrice(""); setAuctionDuration("3"); setExpiresIn("14");
      // setPaymentType("contact");
      // setListingType("physical"); setServiceDuration(""); setRentalSubType("equipment"); setRentalPriceWeekly(""); setRentalPriceMonthly(""); setRentalDeposit(""); setRentalBedrooms(""); setRentalBathrooms(""); setRentalParkingSpaces(""); setRentalFurnishedStatus("Unfurnished"); setRentalPetsPolicy("No Pets"); setRentalAvailableDate(""); setRentalMinTenancy("Flexible"); setRentalFeatures([]); setEventDate(""); setEventTime(""); setVenue(""); setTicketQuantity(""); setTicketType("General Admission"); setVehicleMake(""); setVehicleModel(""); setVehicleYear(""); setVehicleOdometer(""); setVehicleBodyType("SUV"); setVehicleFuelType("Petrol"); setVehicleTransmission("Automatic"); setVehicleColour(""); setJobCompany(""); setJobEmploymentType("Full-time"); setSalaryMin(""); setSalaryMax(""); setPropertyType("House"); setBedrooms(""); setBathrooms(""); setLandArea(""); setFloorArea(""); setParking(""); setAcceptOffers(false); setCondition("New");
      setEditId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (publishType === "service") window.location.href = "/services";
      else if (publishType === "rental") window.location.href = `/post/listing/${newId}`;
      else if (publishType === "event") window.location.href = `/events`;
      else if (publishType === "vehicle") window.location.href = `/vehicles`;
      else if (publishType === "job") window.location.href = `/jobs`;
      else if (publishType === "property") window.location.href = `/property`;
      else if (publishType === "wanted") window.location.href = "/wanted";
      else window.location.href = `/post/listing/${newId}`;
    } catch (err) {
      console.error("Listing upload error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      
      // Provide specific error messages based on common issues
      if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        showToast("Network error - please check your connection and try again", "error");
      } else if (errorMessage.includes("permission") || errorMessage.includes("unauthorized")) {
        showToast("You don't have permission to create this listing", "error");
      } else if (errorMessage.includes("storage") || errorMessage.includes("upload")) {
        showToast("Failed to upload images - please try again", "error");
      } else if (errorMessage.includes("validation") || errorMessage.includes("required")) {
        showToast("Please fill in all required fields", "error");
      } else {
        showToast(`Failed to create listing: ${errorMessage}`, "error");
      }
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

  function handleTypeChange(newType: string, action: () => void) {
    if (listingType === newType) {
      action();
      return;
    }

    const typeConfig = [
      { key: "physical", icon: "📦", label: "Physical", desc: "Real items that can be picked up or shipped, including vehicles.", examples: "Phones, cars, furniture, tools, clothing, collectibles.", action: () => setAcceptOffers(false) },
      { key: "service", icon: "🛠️", label: "Service", desc: "Local services performed in person.", examples: "Lawn mowing, cleaning, tutoring, photography, trades, handyman work, personal training.", action: () => { setCategory("Other Services"); setServicePricingType("fixed"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(true); setSaleType("buy_now"); } },
      { key: "rental", icon: "🔑", label: "Rental", desc: "Something people can hire or rent temporarily.", examples: "Houses, rooms, trailers, equipment, party gear.", action: () => { setCategory("Other"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); setLocation(""); setCondition("New"); } },
      { key: "vehicle", icon: "🚗", label: "Vehicle", desc: "Motor vehicles for sale.", examples: "Cars, motorcycles, boats, caravans, trucks.", action: () => { setCategory("Cars"); setSaleType("buy_now"); setAcceptOffers(false); } },
      { key: "wanted", icon: "📋", label: "Wanted", desc: "Post what you're looking for and let sellers come to you.", examples: "Looking for a car, need a service, want to rent something.", action: () => { setCategory("Items"); setPickupAvailable(false); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); } },
    ].find(t => t.key === newType);

    if (typeConfig) {
      setListingType(typeConfig.key as any);
      setPaymentType("contact");
      typeConfig.action();
    }
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      {imagePreviews.length > 0 && <img ref={imgRef} src={imagePreviews[0]} style={{display:'none'}} />}

        <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {editLoading && (
          <div className="mb-6 flex items-center justify-center gap-3 rounded-xl bg-white/[0.03] p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
            <span className="text-sm text-[var(--muted)]">Loading listing...</span>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-sky-500/30 hover:bg-sky-500/10 hover:text-sky-300 mb-5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <div className="relative flex flex-col items-center">
            <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-sky-500/10 blur-3xl pointer-events-none" />
            <div className="relative mb-3 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-bold text-sky-300">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
              {editId ? "Edit Listing" : "AI-Powered Listing"}
            </div>
            <h1 className="relative text-3xl sm:text-4xl font-black tracking-tight text-white">
              {editId ? "Edit Your Listing" : "Create a Listing"}
            </h1>
            <p className="relative mt-3 max-w-xl mx-auto text-sm leading-relaxed text-[var(--muted)]">Describe your item or upload photos, and Āwhina will help you create a professional listing in minutes.</p>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Listing Progress</span>
            <span className="text-[11px] font-bold text-sky-400">{formProgress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500 ease-out"
              style={{ width: `${formProgress}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] text-[var(--muted)]">
            {formProgress < 30 ? "Get started by adding a title, description, and photo" : 
             formProgress < 60 ? "Good progress! Add more details to complete your listing" :
             formProgress < 100 ? "Almost there! Finish the remaining fields" :
             "Your listing is complete and ready to publish"}
          </p>
        </div>

        {showHelpPrompt && (
          <div className="mb-6 rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-500/10 to-sky-500/5 p-4 shadow-[0_0_30px_rgba(14,165,233,0.15)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-2xl">
                🤖
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-sky-300">Need help finishing your listing?</h3>
                <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
                  Let Āwhina fill in the details for you. Just describe your item in the chat box below and Āwhina will generate the title, description, and other listing details.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setShowHelpPrompt(false)}
                    className="rounded-lg border border-sky-500/30 bg-sky-500/20 px-3 py-1.5 text-[11px] font-bold text-sky-300 transition hover:bg-sky-500/30 active:scale-[0.97]"
                  >
                    I'll try Āwhina
                  </button>
                  <button
                    onClick={() => setShowHelpPrompt(false)}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:bg-white/[0.06] active:scale-[0.97]"
                  >
                    Continue manually
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowHelpPrompt(false)}
                className="shrink-0 text-zinc-500 hover:text-zinc-300 transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <SellPhotoUpload
          imagePreviews={imagePreviews}
          fileInputRef={fileInputRef}
          onUpload={handleImageUpload}
          onRemove={(index) => {
            const preview = imagePreviews[index];
            setImagePreviews((prev) => prev.filter((_, j) => j !== index));
            if (preview && isRemoteImageUrl(preview)) {
              setExistingImages((prev) => {
                const idx = prev.indexOf(preview);
                if (idx >= 0) {
                  setExistingThumbnails((thumbs) => thumbs.filter((_, j) => j !== idx));
                }
                return prev.filter((url) => url !== preview);
              });
            } else if (preview && isLocalImagePreview(preview)) {
              const newIndex = imagePreviews
                .slice(0, index)
                .filter((p) => isLocalImagePreview(p)).length;
              setImageFiles((prev) => prev.filter((_, j) => j !== newIndex));
            }
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
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-sky-500/[0.08] via-sky-500/[0.04] to-[var(--card)] p-5 shadow-[0_0_40px_rgba(14,165,233,0.08)]">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-sky-500/10 blur-2xl pointer-events-none" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3 min-w-0">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-sky-500/25 text-base shadow-[0_0_20px_rgba(56,189,248,0.2)] ring-1 ring-sky-400/30">
                    ✦
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">Āwhina</h2>
                      <span className="text-[10px] font-medium text-sky-400/70 bg-sky-500/10 px-2 py-0.5 rounded-full">Optional</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                      Let Āwhina fill out your listing for you, or complete it manually
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAwhinaGuide(true)}
                    className="shrink-0 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-2.5 text-sm font-bold text-sky-400 hover:bg-sky-500/10 transition-colors"
                  >
                    What&apos;s this?
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkyChatOpen((v) => !v)}
                    className="shrink-0 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(14,165,233,0.25)] hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    {skyChatOpen ? "Hide chat" : "Ask Āwhina"}
                  </button>
                </div>
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
                      className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/20 transition-colors"
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
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-sky-500/15 via-sky-500/5 to-sky-500/10 blur-xl pointer-events-none" />
          <div className="relative overflow-hidden rounded-3xl bg-[var(--card)] p-4 sm:p-6 md:p-8 shadow-2xl backdrop-blur-xl">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />

        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Honest form progress indicator */}
          <div className="sticky top-0 z-20 -mx-6 mb-2 border-b border-white/[0.06] bg-[var(--card)] px-6 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold text-[var(--muted)]">Form progress</span>
              <span className={`text-[11px] font-bold ${formProgress === 100 ? "text-sky-400" : "text-sky-400"}`}>{formProgress}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${formProgress === 100 ? "bg-gradient-to-r from-sky-500 to-sky-400" : "bg-gradient-to-r from-sky-500 to-sky-400"}`}
                style={{ width: `${formProgress}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-[var(--muted)]">
              {formProgress === 100 ? "Ready to submit" : "Fill the highlighted fields to complete your listing"}
            </p>
          </div>

          {/* Listing Type - Premium Redesign */}
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-lg font-black text-white tracking-tight">What are you selling?</label>
                <p className="mt-1 text-sm text-[var(--muted)]">Choose the option that best matches what you're offering.</p>
              </div>
              <button type="button" onClick={() => setShowTypeGuideModal(true)} className="group relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500/10 to-sky-400/10 px-4 py-2 text-sm font-bold text-sky-400 border border-sky-500/20 hover:border-sky-500/40 hover:bg-gradient-to-r hover:from-sky-500/20 hover:to-sky-400/20 transition-all duration-200 shadow-[0_0_20px_rgba(14,165,233,0.1)] hover:shadow-[0_0_30px_rgba(14,165,233,0.2)]">
                <span className="text-lg">✨</span>
                <span>Let Āwhina choose</span>
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { key: "physical", icon: "📦", label: "Physical", desc: "Sell items for pickup or shipping, including vehicles.", tags: ["Phones", "Vehicles", "Furniture"], action: () => setAcceptOffers(false) },
                { key: "service", icon: "🛠️", label: "Service", desc: "Offer local or online services.", tags: ["Cleaning", "Tutoring", "Photography"], action: () => { setCategory("Other Services"); setServicePricingType("fixed"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(true); setSaleType("buy_now"); } },
                { key: "rental", icon: "🔑", label: "Rental", desc: "Rent equipment, vehicles or tools.", tags: ["Equipment", "Vehicles", "Tools"], action: () => { setCategory("Other"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); setLocation(""); setCondition("New"); } },
                { key: "wanted", icon: "📋", label: "Wanted", desc: "Tell sellers what you're looking for.", tags: ["Items", "Services", "Rentals"], action: () => { setCategory("Items"); setPickupAvailable(false); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); } },
              ].map((t) => (
                <button key={t.key} type="button" onClick={() => handleTypeChange(t.key, t.action)}
                  className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200 ${
                    listingType === t.key
                      ? "border-sky-400/60 bg-gradient-to-br from-sky-500/[0.15] to-sky-400/[0.08] shadow-[0_0_50px_rgba(14,165,233,0.2)] scale-[1.02]"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.05] hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(0,0,0,0.3)]"
                  }`}>
                  <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
                    <div className={`relative mb-3 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl transition-all duration-200 ${
                      listingType === t.key
                        ? "bg-sky-500/30 shadow-[0_0_30px_rgba(14,165,233,0.4)] scale-110"
                        : "bg-white/[0.05] group-hover:bg-white/[0.08] group-hover:scale-105"
                    }`}>
                      {t.icon}
                      {listingType === t.key && (
                        <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 shadow-lg animate-in zoom-in duration-200">
                          <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                    </div>
                    <h3 className={`text-base font-bold tracking-tight transition-colors ${listingType === t.key ? "text-sky-400" : "text-white"}`}>{t.label}</h3>
                    <p className="mt-1.5 text-sm text-[var(--muted)] leading-snug">{t.desc}</p>
                    <div className="mt-3 flex flex-wrap gap-2 justify-center sm:justify-start">
                      {t.tags.map((tag, i) => (
                        <span key={i} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                          listingType === t.key
                            ? "bg-sky-500/25 text-sky-300 border border-sky-500/30"
                            : "bg-white/[0.08] text-[var(--muted)] border border-white/[0.05]"
                        }`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
            <label htmlFor="listing-title" className="text-sm font-bold text-white tracking-wide">Title</label>
            <div className="relative">
              <input id="listing-title" type="text" value={title} onChange={(e) => handleTitleChange(e.target.value)} aria-label="Listing title" aria-describedby={validationErrors.title ? "title-error" : "title-count"} className={`w-full rounded-xl bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:bg-white/[0.05] focus:ring-2 focus:shadow-[0_0_20px_rgba(14,165,233,0.1)] hover:bg-white/[0.04] focus:border-sky-500/60 placeholder="What are you selling?" ${validationErrors.title ? 'bg-red-500/10 focus:ring-red-500/20' : 'focus:ring-sky-500/20'}`} placeholder="What are you selling?" />
              {isFieldValid(title, validateTitle) && (
                <div className="absolute right-12 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400" aria-hidden="true">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p id="title-count" className="text-[10px] text-[var(--muted)]">{title.length}/100 characters</p>
              {validationErrors.title && (
                <p id="title-error" className="text-[10px] text-red-400 animate-in fade-in slide-in-from-top-2" role="alert">{validationErrors.title}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
            <label htmlFor="listing-description" className="text-sm font-bold text-white tracking-wide">Description</label>
            <div className="relative">
              <textarea id="listing-description" value={description} onChange={(e) => handleDescriptionChange(e.target.value)} rows={4} aria-label="Listing description" aria-describedby={validationErrors.description ? "description-error" : "description-count"} className={`w-full rounded-xl bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:bg-white/[0.05] focus:ring-2 focus:shadow-[0_0_20px_rgba(14,165,233,0.1)] hover:bg-white/[0.04] focus:border-sky-500/60 resize-none placeholder="Describe your item in detail..." ${validationErrors.description ? 'bg-red-500/10 focus:ring-red-500/20' : 'focus:ring-sky-500/20'}`} placeholder="Describe your item in detail..." />
              {isFieldValid(description, validateDescription) && (
                <div className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400" aria-hidden="true">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p id="description-count" className="text-[10px] text-[var(--muted)]">{description.length} characters</p>
              {validationErrors.description && (
                <p id="description-error" className="text-[10px] text-red-400 animate-in fade-in slide-in-from-top-2" role="alert">{validationErrors.description}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-white">
                {listingType === "service" ? "Service Category" : "Category"}
              </label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl bg-white/[0.03] px-4 py-3 text-[var(--foreground)] outline-none transition-all duration-200 focus:border-sky-500/60 focus:bg-[var(--card-hover)] focus:ring-2 focus:ring-sky-500/20 focus:shadow-[0_0_20px_rgba(14,165,233,0.1)] hover:bg-[var(--card-hover)] appearance-none cursor-pointer">
                {listingType === "service" ? (
                  <><option className="bg-[var(--card)] text-[var(--foreground)]">Trades & Repairs</option><option className="bg-[var(--card)] text-[var(--foreground)]">Cleaning & Maintenance</option><option className="bg-[var(--card)] text-[var(--foreground)]">Tutoring & Lessons</option><option className="bg-[var(--card)] text-[var(--foreground)]">Photography</option><option className="bg-[var(--card)] text-[var(--foreground)]">Personal Training</option><option className="bg-[var(--card)] text-[var(--foreground)]">Events & Catering</option><option className="bg-[var(--card)] text-[var(--foreground)]">Other Services</option></>
                ) : listingType === "rental" ? (
                  <><option className="bg-[var(--card)] text-[var(--foreground)]">Other</option><option className="bg-[var(--card)] text-[var(--foreground)]">Vehicles</option><option className="bg-[var(--card)] text-[var(--foreground)]">Equipment</option></>
                ) : listingType === "wanted" ? (
                  <><option className="bg-[var(--card)] text-[var(--foreground)]">Items</option><option className="bg-[var(--card)] text-[var(--foreground)]">Services</option><option className="bg-[var(--card)] text-[var(--foreground)]">Rentals</option><option className="bg-[var(--card)] text-[var(--foreground)]">Vehicles</option></>
                ) : (
                  <><option className="bg-[var(--card)] text-[var(--foreground)]">Tech</option><option className="bg-[var(--card)] text-[var(--foreground)]">Cars</option><option className="bg-[var(--card)] text-[var(--foreground)]">Gaming</option><option className="bg-[var(--card)] text-[var(--foreground)]">Fashion</option><option className="bg-[var(--card)] text-[var(--foreground)]">Home</option><option className="bg-[var(--card)] text-[var(--foreground)]">Sports</option><option className="bg-[var(--card)] text-[var(--foreground)]">Other</option></>
                )}
              </select>
            </div>
            {listingType === "physical" && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-white">Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full rounded-xl bg-white/[0.03] px-4 py-3 text-[var(--foreground)] outline-none transition-all duration-200 focus:border-sky-500/60 focus:bg-[var(--card-hover)] focus:ring-2 focus:ring-sky-500/20 focus:shadow-[0_0_20px_rgba(14,165,233,0.1)] hover:bg-[var(--card-hover)] appearance-none cursor-pointer">
                <option className="bg-[var(--card)] text-[var(--foreground)]">New</option><option className="bg-[var(--card)] text-[var(--foreground)]">Used - Like New</option><option className="bg-[var(--card)] text-[var(--foreground)]">Used - Good</option><option className="bg-[var(--card)] text-[var(--foreground)]">Used - Fair</option>
              </select>
            </div>
            )}
          </div>

          {(listingType === "vehicle" || (listingType === "physical" && category === "Cars")) && (
            <div className="space-y-3 rounded-xl bg-white/[0.03] p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <label className="text-sm font-bold text-[var(--foreground)]">Vehicle details</label>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Cars and motor vehicles listed under Physical Items.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Make *</label>
                  <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} placeholder="e.g. Mazda"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Model *</label>
                  <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="e.g. Axela"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Year</label>
                  <input type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} placeholder="e.g. 2015"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Odometer (km)</label>
                  <input type="number" value={vehicleOdometer} onChange={(e) => setVehicleOdometer(e.target.value)} placeholder="e.g. 128000"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Colour</label>
                  <input type="text" value={vehicleColour} onChange={(e) => setVehicleColour(e.target.value)} placeholder="e.g. Blue"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Body type</label>
                  <select value={vehicleBodyType} onChange={(e) => setVehicleBodyType(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                    {["SUV", "Sedan", "Hatchback", "Wagon", "Coupe", "Convertible", "Ute", "Van", "Truck", "Motorcycle", "Other"].map((opt) => (
                      <option key={opt} className="bg-[var(--card)] text-[var(--foreground)]">{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Fuel</label>
                  <select value={vehicleFuelType} onChange={(e) => setVehicleFuelType(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                    {["Petrol", "Diesel", "Electric", "Hybrid", "Plug-in Hybrid", "Other"].map((opt) => (
                      <option key={opt} className="bg-[var(--card)] text-[var(--foreground)]">{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Transmission</label>
                  <select value={vehicleTransmission} onChange={(e) => setVehicleTransmission(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                    {["Automatic", "Manual", "Other"].map((opt) => (
                      <option key={opt} className="bg-[var(--card)] text-[var(--foreground)]">{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {listingType !== "rental" && (
          <div className="space-y-4">
            {listingType === "job" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Salary / Price *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="w-full rounded-xl bg-white/[0.03] pl-8 pr-4 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:border-sky-500/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/20 focus:shadow-[0_0_20px_rgba(14,165,233,0.1)] hover:bg-white/[0.04]" />
                </div>
                <p className="text-[10px] text-[var(--muted)]">Set the salary range or fixed price for this position.</p>
              </div>
            ) : saleType === "buy_now" && listingType === "service" && servicePricingType === "request_quote" ? (
              <div className="space-y-1.5">
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-center">
                  <p className="text-xs font-medium text-sky-400">Quote Required — buyers will contact you for a quote</p>
                </div>
              </div>
            ) : saleType === "buy_now" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  {listingType === "service" && servicePricingType === "hourly" ? "Hourly Rate *" : listingType === "wanted" ? "Budget *" : "Price *"}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                  <input type="number" value={price} onChange={(e) => handlePriceChange(e.target.value)} placeholder="0" className={`w-full rounded-xl pl-8 pr-20 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:bg-white/[0.05] focus:ring-2 focus:shadow-[0_0_20px_rgba(14,165,233,0.1)] hover:bg-white/[0.04] focus:border-sky-500/60 ${validationErrors.price ? 'bg-red-500/10 focus:ring-red-500/20' : 'bg-white/[0.03] focus:ring-sky-500/20'}`} />
                  <button
                    type="button"
                    onClick={fetchPriceSuggestion}
                    disabled={loadingPriceSuggestion}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-400 hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Get AI-powered price suggestion based on market data"
                  >
                    {loadingPriceSuggestion ? "..." : "AI Suggest"}
                  </button>
                </div>
                {validationErrors.price && (
                  <p className="mt-1 text-[10px] text-red-400 animate-in fade-in slide-in-from-top-2">{validationErrors.price}</p>
                )}
                {listingType === "wanted" && <p className="text-[10px] text-[var(--muted)]">Set your budget for this item.</p>}
                {listingType === "service" && servicePricingType === "hourly" && <p className="text-[10px] text-[var(--muted)]">Charge per hour for your service.</p>}
                {(listingType === "physical" || listingType === "vehicle" || listingType === "property") && <p className="text-[10px] text-[var(--muted)]">Set the fixed price for this item.</p>}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/[0.08]" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Auction Details</p>
                  <div className="h-px flex-1 bg-white/[0.08]" />
                </div>
                <p className="text-[10px] text-[var(--muted)]">Buyers place bids until the auction ends. The highest bid wins.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--foreground)]">Starting Bid *</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                      <input type="number" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} placeholder="0" className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-8 pr-4 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--foreground)]">Duration *</label>
                    <select value={auctionDuration} onChange={(e) => setAuctionDuration(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-all duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]">
                      <option value="1" className="bg-[var(--card)] text-[var(--foreground)]">24 hours</option>
                      <option value="3" className="bg-[var(--card)] text-[var(--foreground)]">3 days</option>
                      <option value="7" className="bg-[var(--card)] text-[var(--foreground)]">7 days</option>
                      <option value="14" className="bg-[var(--card)] text-[var(--foreground)]">14 days</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            {(listingType === "physical" || listingType === "wanted") && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Location</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., Auckland, Wellington, Christchurch" className="w-full rounded-xl bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:border-sky-500/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/20 focus:shadow-[0_0_20px_rgba(14,165,233,0.1)] hover:bg-white/[0.04]" />
              <p className="text-[10px] text-[var(--muted)]">City or region helps buyers find your item</p>
            </div>
            )}
          </div>
          )}


          {listingType === "physical" && !stripeDisabledV1 && (
          <div className="space-y-4">
            <label className="text-sm font-bold text-[var(--foreground)]">How would you like to sell this?</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "buy_now", label: "Buy Now", desc: "Sell for a fixed price." },
                { id: "auction", label: "Auction", desc: "Let buyers compete by bidding." },
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => setSaleType(opt.id)}
                  className={`rounded-xl border px-4 py-4 text-left transition-all duration-150 active:scale-[0.98] ${
                    saleType === opt.id ? "border-sky-400/60 bg-gradient-to-b from-sky-500/[0.15] to-sky-500/[0.08] text-sky-400 shadow-[0_0_25px_rgba(14,165,233,0.2)] scale-[1.02]" : "border-white/[0.08] bg-white/[0.02] text-[var(--muted)] hover:border-white/[0.15] hover:bg-white/[0.05] hover:-translate-y-0.5"
                  }`}>
                  <div className="font-bold text-sm">{opt.label}</div>
                  <div className="mt-1 text-[10px] leading-relaxed">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          )}
          {listingType === "physical" && stripeDisabledV1 && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
            <p className="text-sm font-bold text-[var(--foreground)]">Fixed price</p>
            <p className="mt-1 text-[10px] text-[var(--muted)] leading-relaxed">Buyers message you to arrange purchase. Set your asking price below.</p>
          </div>
          )}

          {(listingType !== "wanted" && listingType !== "job" && listingType !== "property" && listingType !== "service") && (
          <div className="rounded-xl bg-white/[0.03] p-4">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="flex w-full items-center justify-between text-sm font-bold text-[var(--foreground)]"
            >
              <span>Payment Options</span>
              <svg
                className={`h-4 w-4 transition-transform ${showAdvancedOptions ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showAdvancedOptions && (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
                  <p className="text-xs text-sky-300 leading-relaxed">
                    <span className="font-bold">Choose your payment method:</span><br />
                    <span className="text-[var(--muted)]">🤝 Arrange Purchase</span> — No platform fees, arrange payment directly with seller in Messages. Use for trusted transactions.<br />
                    <span className="text-[var(--muted)]">💳 Stripe Checkout</span> — Card payment with buyer protection. Requires Stripe Connect setup.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => choosePaymentType("contact")}
                    className={`rounded-xl border px-4 py-3 text-xs font-bold text-left transition-all duration-200 active:scale-[0.97] ${
                      paymentType === "contact" ? "border-sky-500/40 bg-gradient-to-b from-sky-500/10 to-sky-500/5 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.06)]" : "bg-white/[0.02] text-[var(--muted)] hover:bg-white/[0.04]"
                    }`}>
                    <span className="flex items-center gap-1.5">🤝 Arrange Purchase</span>
                    <span className="ml-1 rounded bg-sky-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-sky-300">Default</span>
                    <p className="mt-1 text-[9px] font-normal text-[var(--muted)]">Bank transfer, cash, or pickup — agree payment in Messages</p>
                  </button>
                  {!stripeDisabledV1 && (
                  <button
                    type="button"
                    onClick={() => choosePaymentType("stripe")}
                    disabled={!stripeConnected}
                    title={stripeConnected ? "Card payment via Stripe Checkout" : STRIPE_CONNECT_REQUIRED_MSG}
                    className={`rounded-xl border px-4 py-3 text-xs font-bold text-left transition-all duration-200 active:scale-[0.97] ${
                      !stripeConnected
                        ? "cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-[var(--muted)] opacity-60"
                        : paymentType === "stripe"
                          ? "border-sky-500/40 bg-gradient-to-b from-sky-500/10 to-sky-500/5 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.06)]"
                          : "bg-white/[0.02] text-[var(--muted)] hover:bg-white/[0.04]"
                    }`}>
                    <span className="flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
                        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.866 6.001 1.632V2.94c-1.608-.732-3.965-1.413-6.076-1.413-3.659 0-6.328 1.803-6.328 4.866 0 3.354 2.547 4.545 5.644 5.604 2.162.795 3.251 1.499 3.251 2.476 0 .968-.747 1.49-2.153 1.49-2.49 0-5.206-1.156-6.748-2.041v4.133c1.682.827 4.127 1.435 6.824 1.435 3.943 0 6.827-1.835 6.827-5.017.001-3.452-2.587-4.596-5.617-5.608z"/>
                      </svg>
                      <span className="font-bold tracking-tight">Stripe</span>
                      <span className="text-[10px] font-normal text-[var(--muted)]">Checkout</span>
                    </span>
                    <p className="mt-1 text-[9px] font-normal text-[var(--muted)]">
                      {stripeConnected
                        ? "Card payment — buyer protection included"
                        : "Connect Stripe in Profile → Payouts to enable"}
                    </p>
                  </button>
                  )}
                </div>
                {!stripeDisabledV1 && !stripeConnected && (
                  <p className="text-[10px] text-amber-400/90 leading-relaxed">
                    Stripe Checkout is locked until you connect payouts.{" "}
                    <Link href="/profile?tab=payouts" className="underline hover:text-amber-300">
                      Set up Stripe
                    </Link>
                  </p>
                )}
                {paymentType === "contact" && (
                  <p className="text-[10px] text-sky-400/90 leading-relaxed">
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
          </div>
          )}

          {/* Event Details */}
          {listingType === "event" && (
            <div className="space-y-3">
              <label className="text-sm font-bold text-[var(--foreground)]">Event Details</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Event date *</label>
                  <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Event time</label>
                  <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Venue *</label>
                <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Spark Arena, Auckland"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Ticket quantity</label>
                  <input type="number" value={ticketQuantity} onChange={(e) => setTicketQuantity(e.target.value)} placeholder="e.g. 100"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Ticket type</label>
                  <select value={ticketType} onChange={(e) => setTicketType(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                    <option className="bg-[var(--card)] text-[var(--foreground)]">General Admission</option>
                    <option className="bg-[var(--card)] text-[var(--foreground)]">VIP</option>
                    <option className="bg-[var(--card)] text-[var(--foreground)]">Early Bird</option>
                    <option className="bg-[var(--card)] text-[var(--foreground)]">Student</option>
                    <option className="bg-[var(--card)] text-[var(--foreground)]">Family Pass</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Job Details */}
          {listingType === "job" && (
            <div className="space-y-3">
              <label className="text-sm font-bold text-[var(--foreground)]">Job Details</label>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Company *</label>
                <input type="text" value={jobCompany} onChange={(e) => setJobCompany(e.target.value)} placeholder="e.g. Sky Drop Ltd"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Employment type</label>
                  <select value={jobEmploymentType} onChange={(e) => setJobEmploymentType(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                    <option className="bg-[var(--card)] text-[var(--foreground)]">Full-time</option><option className="bg-[var(--card)] text-[var(--foreground)]">Part-time</option><option className="bg-[var(--card)] text-[var(--foreground)]">Contract</option><option className="bg-[var(--card)] text-[var(--foreground)]">Casual</option><option className="bg-[var(--card)] text-[var(--foreground)]">Fixed-term</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Location</label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Auckland"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Salary min</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                    <input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="70000"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Salary max</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                    <input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="90000"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Accept Offers — physical, service only */}
          {listingType !== "event" && listingType !== "job" && listingType !== "wanted" && !(listingType === "service" && offersDisabledForService(servicePricingType)) && (
            <div className="flex items-start gap-3">
              <div className="flex h-5 items-center pt-0.5">
                <input id="acceptOffers" type="checkbox" checked={acceptOffers}
                  onChange={(e) => setAcceptOffers(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] bg-[var(--card)] text-sky-500 focus:ring-sky-500/30" />
              </div>
              <div>
                <label htmlFor="acceptOffers" className="text-sm font-bold text-[var(--foreground)]">Allow buyers to make offers</label>
                <p className="text-[10px] text-[var(--muted)]">Buyers can send offers below your asking price</p>
              </div>
            </div>
          )}

          {/* Service Details */}
          {listingType === "service" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-[var(--foreground)]">Pricing</label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { value: "fixed", label: "Fixed Price" },
                    { value: "request_quote", label: "Quote Required" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setServicePricingType(opt.value as "fixed" | "request_quote");
                        if (opt.value === "request_quote") {
                          setPrice("");
                          setAcceptOffers(false);
                        }
                      }}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition ${
                        servicePricingType === opt.value
                          ? "border-sky-500 bg-sky-500/10 text-sky-400"
                          : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--border-hover)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Completion time</label>
                <input
                  type="text"
                  value={serviceDuration}
                  onChange={(e) => setServiceDuration(e.target.value)}
                  placeholder="e.g. Same day, 1-2 days, 3-5 days, 1 week"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {/* Rental Details */}
          {listingType === "rental" && (
            <div className="space-y-4">
              {/* Rental Sub-Type Selector */}
              <div>
                <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">What are you renting out?</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { id: "equipment", icon: "🔧", label: "Equipment" },
                    { id: "vehicle", icon: "🚗", label: "Vehicle" },
                  ] as const).map((opt) => (
                    <button key={opt.id} type="button"
                      onClick={() => setRentalSubType(opt.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-center transition-all duration-150 active:scale-[0.98] ${
                        rentalSubType === opt.id
                          ? "border-sky-400/60 bg-gradient-to-b from-sky-500/[0.15] to-sky-500/[0.08] text-sky-400 shadow-[0_0_25px_rgba(14,165,233,0.2)] scale-[1.02]"
                          : "border-white/[0.08] bg-white/[0.02] text-[var(--muted)] hover:border-white/[0.15] hover:bg-white/[0.05] hover:-translate-y-0.5"
                    }`}>
                      <span className="text-2xl transition-transform duration-150">{opt.icon}</span>
                      <span className="text-sm font-bold">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Where can this be collected?</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="City or suburb"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]" />
              </div>

              {/* Rental Pricing Section */}
              {rentalSubType === "equipment" || rentalSubType === "vehicle" ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/[0.08]" />
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Rental Pricing</p>
                    <div className="h-px flex-1 bg-white/[0.08]" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="mb-1 block text-[10px] font-semibold text-[var(--foreground)]">Daily Rate *</label>
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
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]" />
                      </div>
                    </div>
                    <div className="col-span-1">
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Weekly</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalPriceWeekly} onChange={(e) => { setRentalPriceWeekly(e.target.value); manualEdit.current.add("weekly"); }}
                          placeholder="Week"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]" />
                      </div>
                    </div>
                    <div className="col-span-1">
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalPriceMonthly} onChange={(e) => { setRentalPriceMonthly(e.target.value); manualEdit.current.add("monthly"); }}
                          placeholder="Month"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Security Deposit (optional)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalDeposit} onChange={(e) => setRentalDeposit(e.target.value)}
                          placeholder={rentalSubType === "vehicle" ? "e.g. 500" : "e.g. 200"}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Condition</label>
                      <select value={condition} onChange={(e) => setCondition(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]">
                        <option className="bg-[var(--card)] text-[var(--foreground)]">New</option><option className="bg-[var(--card)] text-[var(--foreground)]">Used - Like New</option><option className="bg-[var(--card)] text-[var(--foreground)]">Used - Good</option><option className="bg-[var(--card)] text-[var(--foreground)]">Used - Fair</option>
                      </select>
                    </div>
                  </div>

                  {/* Vehicle details - only for vehicle rental */}
                  {rentalSubType === "vehicle" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Make</label>
                        <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)}
                          placeholder="e.g. Toyota"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Model</label>
                        <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)}
                          placeholder="e.g. HiAce"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.1)]" />
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Delivery Options — physical & vehicle */}
          {(listingType === "physical" || listingType === "vehicle") && (
          <div className="rounded-xl bg-white/[0.03] p-4">
            <div className="mb-3">
              <label className="text-sm font-bold text-[var(--foreground)]">Delivery Options</label>
            </div>
            <p className="mb-3 text-[10px] text-[var(--muted)]">Select how buyers can receive the item. You can offer both pickup and shipping.</p>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={pickupAvailable} onChange={(e) => setPickupAvailable(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] bg-[var(--card)] text-sky-500 focus:ring-sky-500/30" />
                <span className="text-sm text-[var(--foreground)]">Pickup available</span>
              </label>
              {pickupAvailable && (
                <div className="ml-7">
                  <input type="text" value={pickupArea} onChange={(e) => setPickupArea(e.target.value)}
                    placeholder="Pickup location"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  <p className="mt-1 text-[10px] text-[var(--muted)]">Buyers will pick up the item from your location.</p>
                </div>
              )}
              <div className="border-t border-[var(--border)] pt-3 mt-3 space-y-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input type="checkbox" checked={shippingAvailable} onChange={(e) => setShippingAvailable(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border)] bg-[var(--card)] text-sky-500 focus:ring-sky-500/30" />
                  <span className="text-sm text-[var(--foreground)]">Shipping available</span>
                </label>
                {shippingAvailable && (
                  <div className="ml-7">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={freeShipping} onChange={(e) => { setFreeShipping(e.target.checked); if (e.target.checked) setShippingFee(""); }}
                        className="h-4 w-4 rounded border-[var(--border)] bg-[var(--card)] text-sky-500 focus:ring-sky-500/30" />
                      <span className="text-xs text-[var(--foreground)]">Free shipping</span>
                    </label>
                    {!freeShipping && (
                      <div className="mt-2">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                          <input type="number" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)}
                            placeholder="Shipping fee"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">Buyers pay this shipping fee on top of the item price.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] bg-[var(--card)] text-sky-500 focus:ring-sky-500/30" />
              <span className="text-xs text-[var(--muted)]">Auto-publish after AI fills form</span>
            </label>
            <span className="text-[9px] text-sky-400/70">• Save time, but review before it goes live</span>
          </div>

          <button
            id="listing-submit-btn"
            onClick={createListing}
            disabled={loading || editLoading}
            className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-sky-400 py-4 text-lg font-bold text-white shadow-2xl shadow-sky-500/30 transition-all duration-200 hover:shadow-[0_0_30px_rgba(56,189,248,0.35)] hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100 disabled:hover:translate-y-0">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </span>
            ) : autoPublish && !editId ? "Generate with AI" : editId ? "Save Changes" : "Post Now"}
          </button>

          <div className="mt-3 text-center">
            <label className="inline-flex items-center gap-2 text-[10px] text-[var(--muted)]">
              Listing expires in
              <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
                className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] text-[var(--foreground)] outline-none transition focus:border-sky-500">
                <option value="7" className="bg-[var(--card)] text-[var(--foreground)]">7 days</option>
                <option value="14" className="bg-[var(--card)] text-[var(--foreground)]">14 days</option>
                <option value="30" className="bg-[var(--card)] text-[var(--foreground)]">30 days</option>
              </select>
            </label>
          </div>
        </div>
          </div>
        </div>
      </div>

      {/* SCAM ALERT MODAL - INSIDE MAIN CONTAINER */}
      {scamAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setScamAlert(null)}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
              <button onClick={() => setScamAlert(null)} className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)] active:scale-[0.98]">
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
          <div className="mx-4 w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-sky-400">⚠️ Unusually Low Price</h3>
              <button onClick={() => setPriceAlert(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]">Your listing price (${price}) seems unusually low for the "{category}" category. This may attract scam filters or suspicious buyers.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setPriceAlert(false)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)] active:scale-[0.98]">
                Set Higher Price
              </button>
              <button onClick={bypassPriceAlert} className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400 active:scale-[0.98]">
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      
      {/* Listing Type Guide Modal */}
      {showTypeGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowTypeGuideModal(false)}>
          <div className="mx-4 w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-sky-400">Which listing type should I choose?</h3>
              <button onClick={() => setShowTypeGuideModal(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📦</span>
                  <h4 className="font-bold text-white">Physical Items</h4>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">Real items that can be picked up or shipped, including vehicles.</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Best for: Phones, furniture, tools, clothing, cars, collectibles.</p>
              </div>
              <div className="rounded-xl bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💾</span>
                  <h4 className="font-bold text-white">Digital Products</h4>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">Digital files and online services delivered remotely.</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Best for: Software, templates, e-books, web design, SEO.</p>
              </div>
              <div className="rounded-xl bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🛠️</span>
                  <h4 className="font-bold text-white">Services</h4>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">Local services performed in person at your location.</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Best for: Lawn mowing, cleaning, tutoring, trades, photography.</p>
              </div>
              <div className="rounded-xl bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔑</span>
                  <h4 className="font-bold text-white">Rentals</h4>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">Equipment or vehicles available for temporary hire.</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Best for: Equipment, vehicles, party gear.</p>
              </div>
              <div className="rounded-xl bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📋</span>
                  <h4 className="font-bold text-white">Wanted</h4>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">Post what you're looking for and sellers will contact you.</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Best for: Finding rare items, getting quotes, rental needs.</p>
              </div>
            </div>
            <div className="mt-6">
              <button onClick={() => setShowTypeGuideModal(false)} className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-white hover:bg-sky-400">Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* Awhina Guide Modal */}
      {showAwhinaGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowAwhinaGuide(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-sky-400">What is Āwhina?</h3>
              <button onClick={() => setShowAwhinaGuide(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <div className="mt-4">
              <p className="text-sm text-[var(--foreground)]">
                Āwhina is an AI assistant that helps you create professional listings quickly.
              </p>
              <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                <li className="flex gap-2">
                  <span className="text-sky-400">•</span>
                  <span>Upload photos and Āwhina will describe your item</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-sky-400">•</span>
                  <span>Type what you're selling and Āwhina fills in the details</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-sky-400">•</span>
                  <span>Auto-selects the right category and pricing model</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-sky-400">•</span>
                  <span>Always review and edit before publishing</span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-[var(--muted)]">
                You can still fill the form manually if you prefer. Āwhina is here to help speed things up!
              </p>
            </div>
            <div className="mt-6">
              <button onClick={() => setShowAwhinaGuide(false)} className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-white hover:bg-sky-400">Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Publish Confirmation Modal */}
      {showAutoPublishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowAutoPublishConfirm(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-sky-400">Auto-Publishing Listing</h3>
              <button onClick={() => setShowAutoPublishConfirm(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <p className="mt-4 text-sm text-[var(--foreground)]">
              Āwhina has filled your form. Publishing in <span className="font-bold text-sky-400">{autoPublishCountdown}</span> second{autoPublishCountdown !== 1 ? "s" : ""}...
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Review the listing below before it goes live.
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowAutoPublishConfirm(false)} className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)] active:scale-[0.98]">
                Cancel & Review
              </button>
              <button onClick={() => { setShowAutoPublishConfirm(false); createListing(); }} className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-white hover:bg-sky-400 active:scale-[0.98]">
                Publish Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Price Suggestion Modal */}
      {showPriceModal && priceSuggestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowPriceModal(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-sky-400">AI Price Suggestion</h3>
              <button onClick={() => setShowPriceModal(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <div className="mt-4 rounded-xl bg-sky-500/10 p-4">
              <p className="text-sm font-medium text-sky-300">
                Suggested Price: <span className="font-bold text-white">${priceSuggestion.suggestedMin} - ${priceSuggestion.suggestedMax}</span>
              </p>
              <p className="mt-2 text-xs text-sky-400/80">
                Confidence: <span className="font-medium">{priceSuggestion.confidence}</span>
              </p>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Why this price?</p>
              <p className="mt-2 text-sm text-[var(--foreground)]">{priceSuggestion.reasoning}</p>
            </div>
            {priceSuggestion.marketFactors?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Market Factors</p>
                <ul className="mt-2 space-y-1">
                  {priceSuggestion.marketFactors.map((factor, i) => (
                    <li key={i} className="text-xs text-[var(--muted)] flex gap-2">
                      <span className="text-sky-400">•</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {priceSuggestion.missingDetails && priceSuggestion.missingDetails.length > 0 && (
              <div className="mt-4 rounded-xl bg-amber-500/10 p-4">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  {priceSuggestion.confidence === "high" ? "For an even better price" : "Need more details for an accurate price"}
                </p>
                <ul className="mt-2 space-y-1">
                  {priceSuggestion.missingDetails.map((detail, i) => (
                    <li key={i} className="text-xs text-[var(--foreground)] flex gap-2">
                      <span className="text-amber-400">•</span>
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {priceSuggestion.marketResearch && (
              <p className="mt-4 text-[10px] text-sky-400/80">
                Based on live NZ market research.
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowPriceModal(false)} className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)] active:scale-[0.98]">
                Keep My Price
              </button>
              <button onClick={() => applyPriceSuggestion(Math.round((priceSuggestion.suggestedMin + priceSuggestion.suggestedMax) / 2))} className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-white hover:bg-sky-400 active:scale-[0.98]">
                Apply Suggestion
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
