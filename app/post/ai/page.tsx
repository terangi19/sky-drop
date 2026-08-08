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
import {
  categoriesForListingType,
  isLegacyVehicleListing,
  listingTypeHelperDescription,
} from "../../lib/listing-type-config";
import { hasActiveListingDraft, mergeListingFillWithDraft } from "../../lib/sky-ai-draft-merge";
import { readListingDraftFromSkyAi, syncListingDraftToSkyAi, clearListingDraftFromSkyAi } from "../../lib/sky-ai-listing-context";
import {
  buildConfirmedListingContext,
  markProvenance,
  type ListingFieldProvenanceMap,
  type ListingDraftFormSnapshot,
} from "../../lib/listing-draft-confirmed";
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
import { SKY_AI_SELL_QUICK_PROMPTS } from "../../lib/sky-ai-prompts";
import {
  consumeListingWorkspaceHandoff,
  peekListingWorkspaceHandoff,
  setAwhinaSurface,
  useAwhinaConversation,
} from "../../lib/awhina-conversation-store";
import {
  formatListingSlotLabel,
  getActiveSellWorkspacePrompts,
} from "../../lib/awhina-ui-surface";
import {
  getListingReadinessState,
  readinessLabel,
} from "../../lib/awhina-listing-readiness";
import {
  SKY_AI_WORKSPACE_HANDOFF_EVENT,
  dispatchSkyAiOpen,
  type SkyAiWorkspaceHandoffDetail,
} from "../../lib/sky-ai-events";
import { computeMissingListingSlots } from "../../lib/awhina-pending-slots";
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
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
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
  const [rentalPropertyType, setRentalPropertyType] = useState("");
  const [rentalPriceWeekly, setRentalPriceWeekly] = useState("");
  const [rentalPriceMonthly, setRentalPriceMonthly] = useState("");
  const [rentalDeposit, setRentalDeposit] = useState("");
  const [rentalBedrooms, setRentalBedrooms] = useState("");
  const [rentalBathrooms, setRentalBathrooms] = useState("");
  const [rentalParkingSpaces, setRentalParkingSpaces] = useState("");
  const [rentalFurnishedStatus, setRentalFurnishedStatus] = useState("");
  const [rentalPetsPolicy, setRentalPetsPolicy] = useState("");
  const [rentalAvailableDate, setRentalAvailableDate] = useState("");
  const [rentalFeatures, setRentalFeatures] = useState<string[]>([]);
  const [rentalMinTenancy, setRentalMinTenancy] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [venue, setVenue] = useState("");
  const [ticketQuantity, setTicketQuantity] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleGeneration, setVehicleGeneration] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleOdometer, setVehicleOdometer] = useState("");
  const [vehicleBodyType, setVehicleBodyType] = useState("");
  const [vehicleFuelType, setVehicleFuelType] = useState("");
  const [vehicleTransmission, setVehicleTransmission] = useState("");
  const [vehicleColour, setVehicleColour] = useState("");
  /** Same-session restore when switching Vehicle ↔ other types (inactive while not vehicle). */
  const vehicleDraftMemoryRef = useRef<{
    make: string;
    model: string;
    generation: string;
    year: string;
    odometer: string;
    bodyType: string;
    fuelType: string;
    transmission: string;
    colour: string;
    category: string;
  } | null>(null);
  const [jobCompany, setJobCompany] = useState("");
  const [jobEmploymentType, setJobEmploymentType] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [propertyType, setPropertyType] = useState("");
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
  /** Provenance: DEFAULT_UNTOUCHED must never sync as listingContext facts */
  const [fieldProvenance, setFieldProvenance] = useState<ListingFieldProvenanceMap>({});
  const fieldProvenanceRef = useRef<ListingFieldProvenanceMap>({});
  fieldProvenanceRef.current = fieldProvenance;
  const markField = useCallback((key: keyof ListingDraftFormSnapshot, source: "USER" | "AWHINA" | "IMAGE" | "EDITED_EXISTING_LISTING" = "USER") => {
    setFieldProvenance((prev) => ({ ...prev, [key]: source }));
  }, []);
  const isUserLockedField = useCallback((key: keyof ListingDraftFormSnapshot) => {
    const p = fieldProvenanceRef.current[key];
    return p === "USER" || p === "EDITED_EXISTING_LISTING";
  }, []);

  const [editId, setEditId] = useState<string | null>(null);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [existingThumbnails, setExistingThumbnails] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scamAlert, setScamAlert] = useState<{ title: string; message: string; found: string[] } | null>(null);
  const [priceAlert, setPriceAlert] = useState(false);
  const [confirmedSubmit, setConfirmedSubmit] = useState(false);
  const [showTypeGuideModal, setShowTypeGuideModal] = useState(false);
  const [showAutoPublishConfirm, setShowAutoPublishConfirm] = useState(false);
  const [autoPublishCountdown, setAutoPublishCountdown] = useState(3);
  const [priceSuggestion, setPriceSuggestion] = useState<{ suggestedMin: number; suggestedMax: number; reasoning: string; marketFactors: string[]; confidence: string; missingDetails?: string[]; marketResearch?: boolean } | null>(null);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [loadingPriceSuggestion, setLoadingPriceSuggestion] = useState(false);

  /** Workspace keeps chat open by default — homepage handoff continues here */
  const [skyChatOpen, setSkyChatOpen] = useState(true);
  const [skyAutoQuery, setSkyAutoQuery] = useState<string | undefined>();
  /** Mobile workspace: conversation is primary; listing is the draft pane */
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<"chat" | "listing">("chat");
  const [liveFieldNotes, setLiveFieldNotes] = useState<string[]>([]);
  const awhinaConversation = useAwhinaConversation();
  const handoffBootstrapped = useRef(false);
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

  // V1: no formal offers product — negotiate in Messages. Keep acceptOffers state/impl dormant.
  useEffect(() => {
    if (stripeDisabledV1 && acceptOffers) {
      setAcceptOffers(false);
    }
  }, [stripeDisabledV1, acceptOffers]);

  // Form completion progress (honest important fields — photos first-class)
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

  const listingReadiness = useMemo(() => {
    const fill = {
      title,
      description,
      category,
      condition,
      price,
      listingType,
      location,
      pickupArea,
      // Vehicle fields only participate when type is actively vehicle.
      ...(listingType === "vehicle"
        ? {
            vehicleMake,
            vehicleModel,
            vehicleGeneration,
            vehicleYear,
            vehicleOdometer,
            vehicleColour,
            vehicleTransmission,
            vehicleFuelType,
          }
        : {}),
      extras: draftExtras,
      rentalSubType,
      rentalPriceWeekly,
      rentalPriceMonthly,
    };
    const state = getListingReadinessState(fill);
    const missing = computeMissingListingSlots(fill);
    return { state, label: readinessLabel(state), missing };
  }, [
    title,
    description,
    category,
    condition,
    price,
    listingType,
    location,
    pickupArea,
    vehicleMake,
    vehicleModel,
    vehicleGeneration,
    vehicleYear,
    vehicleOdometer,
    vehicleColour,
    vehicleTransmission,
    vehicleFuelType,
    draftExtras,
    rentalSubType,
    rentalPriceWeekly,
    rentalPriceMonthly,
  ]);

  /** Prefer live pendingSlot so progress never disagrees with the conversation. */
  const progressNextSlot =
    awhinaConversation.pendingSlot ||
    awhinaConversation.awhinaSession?.pendingSlot ||
    listingReadiness.missing[0] ||
    null;
  const progressNextLabel = progressNextSlot
    ? formatListingSlotLabel(String(progressNextSlot))
    : null;

  const isReadyToReview =
    listingReadiness.state === "READY_TO_REVIEW" ||
    listingReadiness.state === "READY_TO_PUBLISH";

  /** When Āwhina is waiting on a field, answering chat is the only primary action. */
  const awhinaIsAsking = Boolean(progressNextSlot) && !isReadyToReview;

  const hasDraftContent = Boolean(
    title.trim() ||
      (listingType === "vehicle" && (vehicleMake || vehicleYear)) ||
      String(price || "").trim() ||
      description.trim() ||
      awhinaConversation.listingFillOccurred
  );

  const openManualEditor = () => {
    setMobileWorkspaceTab("listing");
    setTimeout(() => {
      document.getElementById("manual-listing-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("listing-title")?.focus();
    }, 50);
  };

  const photoSubject = useMemo(() => {
    if (listingType === "vehicle") {
      const vehicle = [vehicleMake, vehicleModel].filter(Boolean).join(" ").trim();
      if (vehicle) {
        const model = String(vehicleModel || "").trim();
        if (model) return model;
        return vehicle;
      }
    }
    const fromTitle = String(title || "")
      .replace(/\b(19|20)\d{2}\b/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");
    return fromTitle;
  }, [listingType, vehicleMake, vehicleModel, title]);

  const photoCtaTitle = photoSubject
    ? `Add photos of your ${photoSubject}`
    : "Add photos";

  /** First-time UX: no suggestion chips while Āwhina is asking — answer in the composer. */
  const workspaceQuickPrompts = useMemo(() => {
    if (awhinaIsAsking || awhinaConversation.pendingSlot) return [];
    const sellActive =
      awhinaConversation.listingFillOccurred ||
      awhinaConversation.messages.some((m) => m.role === "user");
    if (!sellActive) return SKY_AI_SELL_QUICK_PROMPTS.slice(0, 2);
    return getActiveSellWorkspacePrompts({
      pendingSlot: awhinaConversation.pendingSlot,
      hasPhotos: imagePreviews.length > 0,
      hasDescription: !!description.trim(),
      hasPrice: !!String(price || "").trim(),
      hasTitle: !!title.trim(),
    }).slice(0, 2);
  }, [
    awhinaIsAsking,
    awhinaConversation.pendingSlot,
    awhinaConversation.listingFillOccurred,
    awhinaConversation.messages,
    imagePreviews.length,
    description,
    price,
    title,
  ]);

  const liveDraftTitle =
    title ||
    (listingType === "vehicle"
      ? [vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ")
      : "") ||
    "Your listing";

  const liveDraftTypeLabel =
    listingType === "vehicle"
      ? "Vehicle"
      : listingType === "rental"
        ? "Rental"
        : listingType === "service"
          ? "Service"
          : listingType === "wanted"
            ? "Wanted"
            : listingType === "property"
              ? "Property"
              : "Physical";

  const listingTypeHelper = listingTypeHelperDescription(listingType);

  // NEW create: canonical vehicle only. Legacy physical+Cars is upgrade-on-edit only.
  const isVehicleListing = listingType === "vehicle";

  const marketplaceTitle =
    title.trim() ||
    (isVehicleListing
      ? [vehicleYear, vehicleMake, vehicleModel, vehicleGeneration].filter(Boolean).join(" ")
      : "") ||
    "";

  const marketplacePrice = (() => {
    if (listingType === "service" && servicePricingType === "request_quote") return "Quote required";
    if (!String(price || "").trim()) return "";
    const n = Number(price);
    if (!Number.isFinite(n)) return `${price}`;
    const suffix =
      listingType === "service" && servicePricingType === "hourly"
        ? "/hr"
        : listingType === "rental"
          ? "/day"
          : "";
    return `${n.toLocaleString()}${suffix}`;
  })();

  const marketplaceMeta = (() => {
    const parts = [];
    if (isVehicleListing) {
      if (vehicleOdometer) {
        const n = Number(vehicleOdometer);
        parts.push(`${Number.isFinite(n) ? n.toLocaleString() : vehicleOdometer} km`);
      }
      if (vehicleTransmission) parts.push(vehicleTransmission);
      if (condition) parts.push(condition.replace(/^Used - /, ""));
      if (location || pickupArea) parts.push(location || pickupArea);
    } else if (listingType === "service") {
      if (category) parts.push(category);
      if (serviceDuration) parts.push(serviceDuration);
      if (location || pickupArea) parts.push(location || pickupArea);
    } else if (listingType === "rental") {
      if (rentalSubType) parts.push(rentalSubType === "vehicle" ? "Vehicle hire" : "Equipment hire");
      if (condition) parts.push(condition.replace(/^Used - /, ""));
      if (location || pickupArea) parts.push(location || pickupArea);
    } else {
      if (condition) parts.push(condition.replace(/^Used - /, ""));
      if (category) parts.push(category);
      if (location || pickupArea) parts.push(location || pickupArea);
    }
    return parts.filter(Boolean).join(" · ");
  })();

  const detailsRemaining = listingReadiness.missing.length;

  const draftFlash = (label: string) =>
    liveFieldNotes.some((n) => n.toLowerCase().includes(label.toLowerCase()));

  const classifierRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const manualEdit = useRef<Set<string>>(new Set());

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

  // Real-time validation handlers — manual edits are USER facts for Āwhina draft sync
  const handleTitleChange = (value: string) => {
    setTitle(value);
    markField("title");
    setValidationErrors(prev => ({ ...prev, title: validateTitle(value) }));
  };

  const handlePriceChange = (value: string) => {
    setPrice(value);
    markField("price");
    setValidationErrors(prev => ({ ...prev, price: validatePrice(value, listingType) }));
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    markField("description");
    setValidationErrors(prev => ({ ...prev, description: validateDescription(value) }));
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
    markField("location");
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
    const snapshot: ListingDraftFormSnapshot = {
      title,
      description,
      category,
      condition,
      price,
      listingType,
      location,
      paymentType,
      ...(listingType === "vehicle"
        ? {
            vehicleMake,
            vehicleModel,
            vehicleGeneration,
            vehicleYear,
            vehicleOdometer,
            vehicleColour,
            vehicleBodyType,
            vehicleFuelType,
            vehicleTransmission,
          }
        : listingType === "rental" && rentalSubType === "vehicle"
          ? {
              vehicleMake,
              vehicleModel,
              vehicleYear,
              vehicleTransmission,
            }
          : {}),
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
    };
    // Only confirmed / meaningful values — never untouched visual defaults
    syncListingDraftToSkyAi(buildConfirmedListingContext(snapshot, fieldProvenance));
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
      vehicleGeneration,
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
    fieldProvenance,
  ]);

  const applyFill = useCallback((fill: SkyAiListingFill) => {
    const prior = readListingDraftFromSkyAi();
    const replaceDraft = fill.replaceDraft === true;
    // Explicit NEW sell: clear prior draft — do not keep stale price/year/vehicle fields
    if (replaceDraft) {
      clearListingDraftFromSkyAi();
      setFieldProvenance({});
      setTitle("");
      setDescription("");
      setCategory("");
      setCondition("");
      setPrice("");
      setListingType("physical");
      setLocation("");
      setVehicleMake("");
      setVehicleModel("");
      setVehicleGeneration("");
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

    // Mark fields Āwhina actually provided — never demote USER / edit locks
    const awhinaKeys: (keyof ListingDraftFormSnapshot)[] = [];
    const maybeMark = (key: keyof ListingDraftFormSnapshot, val: unknown) => {
      if (typeof val !== "string" || !val.trim()) return;
      if (!replaceDraft && isUserLockedField(key)) return;
      awhinaKeys.push(key);
    };
    maybeMark("title", merged.title);
    maybeMark("description", merged.description);
    maybeMark("category", merged.category);
    maybeMark("condition", merged.condition);
    maybeMark("price", merged.price);
    maybeMark("listingType", merged.listingType);
    maybeMark("location", merged.location);
    maybeMark("paymentType", merged.paymentType);
    maybeMark("vehicleMake", merged.vehicleMake);
    maybeMark("vehicleModel", merged.vehicleModel);
    maybeMark("vehicleGeneration", merged.vehicleGeneration);
    maybeMark("vehicleYear", merged.vehicleYear);
    maybeMark("vehicleOdometer", merged.vehicleOdometer);
    maybeMark("vehicleColour", merged.vehicleColour);
    maybeMark("vehicleBodyType", merged.vehicleBodyType);
    maybeMark("vehicleFuelType", merged.vehicleFuelType);
    maybeMark("vehicleTransmission", merged.vehicleTransmission);
    maybeMark("rentalSubType", merged.rentalSubType);
    maybeMark("rentalPropertyType", merged.rentalPropertyType);
    maybeMark("rentalPriceWeekly", merged.rentalPriceWeekly);
    maybeMark("rentalPriceMonthly", merged.rentalPriceMonthly);
    maybeMark("rentalDeposit", merged.rentalDeposit);
    maybeMark("rentalBedrooms", merged.rentalBedrooms);
    maybeMark("rentalBathrooms", merged.rentalBathrooms);
    maybeMark("rentalParkingSpaces", merged.rentalParkingSpaces);
    maybeMark("rentalFurnishedStatus", merged.rentalFurnishedStatus);
    maybeMark("rentalPetsPolicy", merged.rentalPetsPolicy);
    maybeMark("rentalAvailableDate", merged.rentalAvailableDate);
    maybeMark("rentalMinTenancy", merged.rentalMinTenancy);
    maybeMark("stockQuantity", merged.stockQuantity);
    maybeMark("serviceDuration", merged.serviceDuration);
    if (awhinaKeys.length) {
      setFieldProvenance((prev) => markProvenance(prev, awhinaKeys, "AWHINA"));
    }

    /** Manual USER facts stay authoritative — fill may still rewrite unlocked fields (e.g. description). */
    const guardSet =
      <T,>(key: keyof ListingDraftFormSnapshot, setter: (v: T) => void) =>
      (v: T) => {
        if (!replaceDraft && isUserLockedField(key)) return;
        setter(v);
      };

    const ok = applySkyAiListingFill(merged, {
      setTitle: guardSet("title", trackingSetTitle),
      setDescription: guardSet("description", trackingSetDescription),
      setCategory: guardSet("category", trackingSetCategory),
      setCondition: guardSet("condition", trackingSetCondition),
      setPrice: guardSet("price", trackingSetPrice),
      setListingType: guardSet("listingType", trackingSetListingType),
      setLocation: guardSet("location", trackingSetLocation),
      setPaymentType: choosePaymentType,
      setVehicleMake: guardSet("vehicleMake", setVehicleMake),
      setVehicleModel: guardSet("vehicleModel", setVehicleModel),
      setVehicleGeneration: guardSet("vehicleGeneration", setVehicleGeneration),
      setVehicleYear: guardSet("vehicleYear", setVehicleYear),
      setVehicleOdometer: guardSet("vehicleOdometer", setVehicleOdometer),
      setVehicleTransmission: guardSet("vehicleTransmission", setVehicleTransmission),
      setVehicleFuelType: guardSet("vehicleFuelType", setVehicleFuelType),
      setVehicleBodyType: guardSet("vehicleBodyType", setVehicleBodyType),
      setVehicleColour: guardSet("vehicleColour", setVehicleColour),
      setRentalSubType,
      setRentalPropertyType: guardSet("rentalPropertyType", setRentalPropertyType),
      setRentalPriceWeekly: guardSet("rentalPriceWeekly", setRentalPriceWeekly),
      setRentalPriceMonthly: guardSet("rentalPriceMonthly", setRentalPriceMonthly),
      setRentalDeposit: guardSet("rentalDeposit", setRentalDeposit),
      setRentalBedrooms: guardSet("rentalBedrooms", setRentalBedrooms),
      setRentalBathrooms: guardSet("rentalBathrooms", setRentalBathrooms),
      setRentalParkingSpaces: guardSet("rentalParkingSpaces", setRentalParkingSpaces),
      setRentalFurnishedStatus: guardSet("rentalFurnishedStatus", setRentalFurnishedStatus),
      setRentalPetsPolicy: guardSet("rentalPetsPolicy", setRentalPetsPolicy),
      setRentalAvailableDate: guardSet("rentalAvailableDate", setRentalAvailableDate),
      setRentalMinTenancy: guardSet("rentalMinTenancy", setRentalMinTenancy),
      setRentalFeatures,
      setPricingType: (v) => setPricingType(v === "quote" ? "quote" : "fixed"),
      setServicePricingType: (v) => setServicePricingType(normalizeServicePricingType(v)),
      setPickupAvailable,
      setShippingAvailable,
      setAcceptOffers,
      setSaleType,
      setStockQuantity: guardSet("stockQuantity", setStockQuantity),
      setServiceDuration: guardSet("serviceDuration", setServiceDuration),
    });
    if (ok && fieldsChanged > 0) {
      const notes: string[] = [];
      if (merged.vehicleYear) notes.push(`Year ${merged.vehicleYear}`);
      if (merged.price && merged.price !== beforeSnapshot.price) notes.push(`Price $${merged.price}`);
      if (merged.vehicleOdometer) {
        const km = Number(merged.vehicleOdometer);
        notes.push(`Mileage ${Number.isFinite(km) ? km.toLocaleString() : merged.vehicleOdometer}km`);
      }
      if (merged.condition && merged.condition !== beforeSnapshot.condition) notes.push(`Condition ${merged.condition}`);
      if (merged.location && merged.location !== beforeSnapshot.location) notes.push(`Location ${merged.location}`);
      if (merged.title && merged.title !== beforeSnapshot.title) notes.push("Title");
      if (notes.length) {
        setLiveFieldNotes(notes.slice(0, 5).map((n) => `${n} ✓`));
        window.setTimeout(() => setLiveFieldNotes([]), 3200);
      }
      // Quiet draft update — stay on conversation; listing pane reflects changes live
      setSkyChatOpen(true);

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
  }, [imagePreviews.length, title, description, category, condition, price, listingType, location, autoPublish, choosePaymentType, isUserLockedField]);

  // Homepage → workspace expand: same conversation, auto-open chat, zero reset
  useEffect(() => {
    setAwhinaSurface("listing_workspace");
    const openFromHandoff = () => {
      const h = consumeListingWorkspaceHandoff() || peekListingWorkspaceHandoff();
      if (h?.autoOpen || h?.pending) {
        setSkyChatOpen(true);
        setMobileWorkspaceTab("chat");
        requestAnimationFrame(() => dispatchSkyAiOpen());
      }
    };
    if (!handoffBootstrapped.current) {
      handoffBootstrapped.current = true;
      openFromHandoff();
      // Also open when a pending fill arrived (classic handoff path)
      if (typeof window !== "undefined") {
        const hasMsgs = awhinaConversation.messages.some((m) => m.id !== "welcome");
        if (hasMsgs) setSkyChatOpen(true);
      }
    }
    const onHandoff = (e: Event) => {
      const detail = (e as CustomEvent<SkyAiWorkspaceHandoffDetail>).detail;
      if (detail?.autoOpen !== false) {
        setSkyChatOpen(true);
        setMobileWorkspaceTab("chat");
        dispatchSkyAiOpen();
      }
    };
    window.addEventListener(SKY_AI_WORKSPACE_HANDOFF_EVENT, onHandoff);
    return () => window.removeEventListener(SKY_AI_WORKSPACE_HANDOFF_EVENT, onHandoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once on mount + handoff events
  }, []);

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
    markField("price");
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
          if (!stripeDisabledV1) {
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
      setCategory(data.category || "");
      setPrice(String(data.price || ""));
      setCondition(data.condition || "");
      // Soft-upgrade legacy physical+Cars to canonical vehicle for editing.
      if (isLegacyVehicleListing({ type: data.type, category: data.category })) {
        setListingType("vehicle");
      } else {
        setListingType(data.type || "physical");
      }
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
      setTicketType(data.ticketType || "");
      setVehicleMake(data.vehicleMake || "");
      setVehicleModel(data.vehicleModel || "");
      setVehicleGeneration(data.vehicleGeneration || "");
      setVehicleYear(data.vehicleYear != null ? String(data.vehicleYear) : "");
      setVehicleOdometer(data.vehicleOdometer != null ? String(data.vehicleOdometer) : "");
      setVehicleBodyType(data.vehicleBodyType || "");
      setVehicleFuelType(data.vehicleFuelType || "");
      setVehicleTransmission(data.vehicleTransmission || "");
      setVehicleColour(data.vehicleColour || "");
      setJobCompany(data.jobCompany || "");
      setJobEmploymentType(data.jobEmploymentType || "");
      setSalaryMin(data.salaryMin != null ? String(data.salaryMin) : "");
      setSalaryMax(data.salaryMax != null ? String(data.salaryMax) : "");
      setPropertyType(data.propertyType || "");
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
      // Existing listing values are confirmed — safe to sync as listingContext
      const editKeys: (keyof ListingDraftFormSnapshot)[] = [
        "title", "description", "category", "condition", "price", "listingType", "location",
        "paymentType", "vehicleMake", "vehicleModel", "vehicleYear", "vehicleOdometer",
        "vehicleColour", "vehicleBodyType", "vehicleFuelType", "vehicleTransmission",
        "rentalSubType", "rentalPropertyType", "rentalPriceWeekly", "rentalPriceMonthly",
        "rentalDeposit", "rentalBedrooms", "rentalBathrooms", "rentalParkingSpaces",
        "rentalFurnishedStatus", "rentalPetsPolicy", "rentalAvailableDate", "rentalMinTenancy",
        "stockQuantity", "serviceDuration",
      ];
      setFieldProvenance((prev) => markProvenance(prev, editKeys, "EDITED_EXISTING_LISTING"));
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
    if (listingType === "vehicle") {
      if (!vehicleMake || !vehicleModel) {
        showToast("Enter the vehicle make and model.", "error");
        return;
      }
    }
    if (listingType === "physical" && category === "Cars") {
      showToast("Cars belong under Vehicle type — switch Type to Vehicle.", "error");
      return;
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
        vehicleMake, vehicleModel, vehicleGeneration,
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
        // Physical never persists vehicle fields (even if draft memory still has them).
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
        // Canonical V1 mode: Arrange Purchase / contact only — no payment-method UI choice
        listingData.paymentType = "contact";
        listingData.acceptOffers = false;
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

    const snapshotVehicleDraft = () => {
      if (
        vehicleMake ||
        vehicleModel ||
        vehicleYear ||
        vehicleOdometer ||
        vehicleColour ||
        vehicleGeneration
      ) {
        vehicleDraftMemoryRef.current = {
          make: vehicleMake,
          model: vehicleModel,
          generation: vehicleGeneration,
          year: vehicleYear,
          odometer: vehicleOdometer,
          bodyType: vehicleBodyType,
          fuelType: vehicleFuelType,
          transmission: vehicleTransmission,
          colour: vehicleColour,
          category: category || "Cars",
        };
      }
    };

    const restoreVehicleDraft = () => {
      const mem = vehicleDraftMemoryRef.current;
      if (!mem) return;
      setVehicleMake(mem.make);
      setVehicleModel(mem.model);
      setVehicleGeneration(mem.generation);
      setVehicleYear(mem.year);
      setVehicleOdometer(mem.odometer);
      setVehicleBodyType(mem.bodyType);
      setVehicleFuelType(mem.fuelType);
      setVehicleTransmission(mem.transmission);
      setVehicleColour(mem.colour);
    };

    if (listingType === "vehicle" && newType !== "vehicle") {
      snapshotVehicleDraft();
    }

    const typeConfig = [
      {
        key: "physical",
        icon: "📦",
        label: "Physical",
        desc: "Normal sellable items you can pick up or ship.",
        examples: "Phones, furniture, tools, clothing, collectibles.",
        action: () => {
          setAcceptOffers(false);
          // Reset off Cars / vehicle category — vehicle values stay in memory but inactive.
          if (category === "Cars" || !categoriesForListingType("physical").includes(category)) {
            setCategory("");
            markField("category");
          }
        },
      },
      {
        key: "service",
        icon: "🛠️",
        label: "Service",
        desc: "Local services performed in person.",
        examples: "Lawn mowing, cleaning, tutoring, photography, trades, handyman work, personal training.",
        action: () => {
          setCategory("Other Services");
          setServicePricingType("fixed");
          setPickupAvailable(true);
          setShippingAvailable(false);
          setAcceptOffers(true);
          setSaleType("buy_now");
        },
      },
      {
        key: "rental",
        icon: "🔑",
        label: "Rental",
        desc: "Something people can hire or rent temporarily.",
        examples: "Houses, rooms, trailers, equipment, party gear.",
        action: () => {
          setCategory("");
          markField("category");
          setPickupAvailable(true);
          setShippingAvailable(false);
          setAcceptOffers(false);
          setSaleType("buy_now");
          setLocation("");
          setCondition("");
          markField("condition");
        },
      },
      {
        key: "vehicle",
        icon: "🚗",
        label: "Vehicle",
        desc: "Motor vehicles for sale.",
        examples: "Cars, motorcycles, boats, caravans, trucks.",
        action: () => {
          setCategory("Cars");
          setSaleType("buy_now");
          setAcceptOffers(false);
          restoreVehicleDraft();
        },
      },
      {
        key: "wanted",
        icon: "📋",
        label: "Wanted",
        desc: "Post what you're looking for and let sellers come to you.",
        examples: "Looking for a car, need a service, want to rent something.",
        action: () => {
          setCategory("Items");
          setPickupAvailable(false);
          setShippingAvailable(false);
          setAcceptOffers(false);
          setSaleType("buy_now");
        },
      },
    ].find((t) => t.key === newType);

    if (typeConfig) {
      setListingType(typeConfig.key as any);
      markField("listingType");
      setPaymentType("contact");
      typeConfig.action();
    }
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      {imagePreviews.length > 0 && <img ref={imgRef} src={imagePreviews[0]} style={{display:'none'}} />}

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
        {editLoading && (
          <div className="mb-6 flex items-center justify-center gap-3 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500/70 border-t-transparent" />
            <span className="text-sm text-zinc-400">Loading listing…</span>
          </div>
        )}

        <header className="mb-5 sm:mb-6">
          <Link href="/" className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-white sm:text-3xl">
            {editId ? "Edit your listing" : "Build your listing"}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-zinc-500">
            {editId
              ? "Update details, photos, and publish when you're ready."
              : "Tell Āwhina what you're selling and we'll build it together."}
          </p>
        </header>

        {!editId && (
          <div className="mb-4 flex gap-1 rounded-xl bg-white/[0.03] p-1 lg:hidden">
            <button
              type="button"
              onClick={() => { setMobileWorkspaceTab("chat"); setSkyChatOpen(true); }}
              className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition ${mobileWorkspaceTab === "chat" ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMobileWorkspaceTab("listing")}
              className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition ${mobileWorkspaceTab === "listing" ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Listing
              {(hasDraftContent || imagePreviews.length > 0) && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-sky-400/80" aria-hidden />
              )}
            </button>
          </div>
        )}

        {!editId && detailsRemaining > 0 && hasDraftContent && !isReadyToReview && (
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px w-10 bg-sky-500/70" aria-hidden />
            <p className="text-[11px] text-zinc-500">
              {detailsRemaining} detail{detailsRemaining === 1 ? "" : "s"} remaining
            </p>
          </div>
        )}

        {/* Desktop: listing left · Āwhina right. Mobile: tabbed. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start lg:gap-8">

        {/* LISTING COLUMN */}
        <div
          className={`flex min-w-0 flex-col gap-5 ${!editId && mobileWorkspaceTab === "chat" ? "hidden lg:flex" : "flex"}`}
        >
          <SellPhotoUpload
            className="mb-0"
            ctaTitle={photoCtaTitle}
            ctaSubtitle={
              photoSubject
                ? "Up to 8 photos — first is the cover"
                : "Up to 8 photos — first is the cover"
            }
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
            <div className="text-center text-sm text-zinc-400">
              {analyzing ? "Detecting…" : detected}
            </div>
          )}

          {!editId && (
            <div id="live-listing-draft" className="space-y-4">
              {hasDraftContent || imagePreviews.length > 0 ? (
                <div className="space-y-2">
                  <h2
                    className={`text-xl font-semibold tracking-tight text-white sm:text-2xl ${draftFlash("title") || draftFlash("make") || draftFlash("model") ? "text-sky-100 transition-colors duration-500" : ""}`}
                  >
                    {marketplaceTitle || "Your listing"}
                  </h2>
                  {marketplacePrice ? (
                    <p
                      className={`text-lg font-medium text-white sm:text-xl ${draftFlash("price") ? "text-sky-100 transition-colors duration-500" : ""}`}
                    >
                      {marketplacePrice}
                      {draftFlash("price") ? <span className="ml-1.5 text-sm font-normal text-sky-400/80">✓</span> : null}
                    </p>
                  ) : null}
                  {marketplaceMeta ? (
                    <p className="text-sm leading-relaxed text-zinc-400">{marketplaceMeta}</p>
                  ) : null}
                  {description.trim() ? (
                    <p className="line-clamp-3 text-sm leading-relaxed text-zinc-500">{description}</p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1.5 py-1">
                  <p className="text-base font-medium text-white">No details yet</p>
                  <p className="text-sm text-zinc-500">Chat with Āwhina, or edit the listing yourself.</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {isReadyToReview ? (
                  <button
                    type="button"
                    onClick={openManualEditor}
                    className="rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
                  >
                    Review listing
                  </button>
                ) : null}
                {awhinaIsAsking ? (
                  <button
                    type="button"
                    onClick={() => { setMobileWorkspaceTab("chat"); setSkyChatOpen(true); }}
                    className="text-sm font-medium text-sky-400/90 transition hover:text-sky-300 lg:hidden"
                  >
                    Answer Āwhina
                  </button>
                ) : null}
              </div>
            </div>
          )}

        {/* Full manual form — always visible */}
        <div
          id="manual-listing-form"
          className="mt-2 block"
        >
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/45 p-4 sm:p-5">
        {!editId && (
          <div className="mb-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Listing details</p>
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Type</label>
              <button
                type="button"
                onClick={() => setShowTypeGuideModal(true)}
                className="text-[11px] text-zinc-500 transition hover:text-zinc-300"
              >
                Help choosing
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "physical", label: "Physical", action: () => setAcceptOffers(false) },
                { key: "vehicle", label: "Vehicle", action: () => { setCategory("Cars"); setSaleType("buy_now"); setAcceptOffers(false); } },
                { key: "service", label: "Service", action: () => { setCategory("Other Services"); setServicePricingType("fixed"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(true); setSaleType("buy_now"); } },
                { key: "rental", label: "Rental", action: () => { setCategory(""); markField("category"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); setLocation(""); setCondition(""); markField("condition"); } },
                { key: "wanted", label: "Wanted", action: () => { setCategory("Items"); setPickupAvailable(false); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); } },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleTypeChange(t.key, t.action)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                    listingType === t.key
                      ? "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/35"
                      : "bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {listingTypeHelper ? (
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {listingTypeHelper}
              </p>
            ) : null}
          </div>

          <div className="space-y-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Basics</p>
            <div className="space-y-1.5">
              <label htmlFor="listing-title" className="block text-xs font-medium text-zinc-500">Title</label>
              <input
                id="listing-title"
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                aria-label="Listing title"
                aria-describedby={validationErrors.title ? "title-error" : "title-count"}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-sky-500/45 ${
                  validationErrors.title ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-zinc-900/60"
                }`}
                placeholder="What are you selling?"
              />
              <div className="flex items-center justify-between">
                <p id="title-count" className="text-[10px] text-zinc-600">{title.length}/100</p>
                {validationErrors.title && (
                  <p id="title-error" className="text-[10px] text-red-400" role="alert">{validationErrors.title}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="listing-description" className="block text-xs font-medium text-zinc-500">Description</label>
              <textarea
                id="listing-description"
                value={description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                rows={4}
                aria-label="Listing description"
                aria-describedby={validationErrors.description ? "description-error" : "description-count"}
                className={`w-full resize-none rounded-xl border px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-sky-500/45 ${
                  validationErrors.description ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-zinc-900/60"
                }`}
                placeholder="Describe your item…"
              />
              <div className="flex items-center justify-between">
                <p id="description-count" className="text-[10px] text-zinc-600">{description.length}</p>
                {validationErrors.description && (
                  <p id="description-error" className="text-[10px] text-red-400" role="alert">{validationErrors.description}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-500">
                  {listingType === "service" ? "Service category" : "Category"}
                </label>
                <select
                  value={category}
                  onChange={(e) => { setCategory(e.target.value); markField("category"); }}
                  className="w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45"
                >
                  <option value="" className="bg-zinc-900 text-zinc-500">Select category</option>
                  {categoriesForListingType(listingType).map((c) => (
                    <option key={c} className="bg-zinc-900 text-white">{c}</option>
                  ))}
                </select>
              </div>
              {(listingType === "physical" || listingType === "vehicle") && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-500">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => { setCondition(e.target.value); markField("condition"); }}
                    className="w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45"
                  >
                    <option value="" className="bg-zinc-900 text-zinc-500">Select condition</option>
                    <option className="bg-zinc-900 text-white">New</option>
                    <option className="bg-zinc-900 text-white">Used - Like New</option>
                    <option className="bg-zinc-900 text-white">Used - Good</option>
                    <option className="bg-zinc-900 text-white">Used - Fair</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {listingType === "vehicle" && (
            <div className="space-y-3 border-t border-white/[0.06] pt-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Vehicle</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Make *</label>
                  <input type="text" value={vehicleMake} onChange={(e) => { setVehicleMake(e.target.value); markField("vehicleMake"); }} placeholder="e.g. Mazda"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Model *</label>
                  <input type="text" value={vehicleModel} onChange={(e) => { setVehicleModel(e.target.value); markField("vehicleModel"); }} placeholder="e.g. Axela"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Generation / variant</label>
                  <input type="text" value={vehicleGeneration} onChange={(e) => { setVehicleGeneration(e.target.value); markField("vehicleGeneration"); }} placeholder="e.g. R34"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Year</label>
                  <input type="number" value={vehicleYear} onChange={(e) => { setVehicleYear(e.target.value); markField("vehicleYear"); }} placeholder="e.g. 2015"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Odometer (km)</label>
                  <input type="number" value={vehicleOdometer} onChange={(e) => { setVehicleOdometer(e.target.value); markField("vehicleOdometer"); }} placeholder="e.g. 128000"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Colour</label>
                  <input type="text" value={vehicleColour} onChange={(e) => { setVehicleColour(e.target.value); markField("vehicleColour"); }} placeholder="e.g. Blue"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Body type</label>
                  <select value={vehicleBodyType} onChange={(e) => { setVehicleBodyType(e.target.value); markField("vehicleBodyType"); }}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45">
                    <option value="" className="bg-[var(--card)] text-[var(--muted)]">Select body type</option>
                    {["SUV", "Sedan", "Hatchback", "Wagon", "Coupe", "Convertible", "Ute", "Van", "Truck", "Motorcycle", "Other"].map((opt) => (
                      <option key={opt} className="bg-[var(--card)] text-[var(--foreground)]">{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Fuel</label>
                  <select value={vehicleFuelType} onChange={(e) => { setVehicleFuelType(e.target.value); markField("vehicleFuelType"); }}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45">
                    <option value="" className="bg-[var(--card)] text-[var(--muted)]">Select fuel</option>
                    {["Petrol", "Diesel", "Electric", "Hybrid", "Plug-in Hybrid", "Other"].map((opt) => (
                      <option key={opt} className="bg-[var(--card)] text-[var(--foreground)]">{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Transmission</label>
                  <select value={vehicleTransmission} onChange={(e) => { setVehicleTransmission(e.target.value); markField("vehicleTransmission"); }}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45">
                    <option value="" className="bg-[var(--card)] text-[var(--muted)]">Select transmission</option>
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
                  <input type="number" value={price} onChange={(e) => handlePriceChange(e.target.value)} placeholder="0" className="w-full rounded-xl bg-white/[0.03] pl-8 pr-4 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:border-sky-500/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/20 hover:bg-white/[0.04]" />
                </div>
                <p className="text-[10px] text-[var(--muted)]">Set the salary range or fixed price for this position.</p>
              </div>
            ) : saleType === "buy_now" && listingType === "service" && servicePricingType === "request_quote" ? (
              <div className="space-y-1.5">
                <div className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-center">
                  <p className="text-xs font-medium text-white">Quote Required — buyers will contact you for a quote</p>
                </div>
              </div>
            ) : saleType === "buy_now" ? (
              <div className="space-y-1.5">
                {stripeDisabledV1 &&
                  listingType !== "wanted" &&
                  !(listingType === "service" && servicePricingType === "request_quote") && (
                  <div className="mb-1">
                    <p className="text-sm font-bold text-[var(--foreground)]">
                      {listingType === "service" && servicePricingType === "hourly" ? "Hourly rate" : "Fixed price"}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--muted)] leading-relaxed">
                      Buyers message you to arrange the purchase.
                    </p>
                  </div>
                )}
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  {listingType === "service" && servicePricingType === "hourly" ? "Hourly Rate *" : listingType === "wanted" ? "Budget *" : "Price *"}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                  <input type="number" value={price} onChange={(e) => handlePriceChange(e.target.value)} placeholder="0" className={`w-full rounded-xl pl-8 pr-20 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:bg-white/[0.05] focus:ring-2 hover:bg-white/[0.04] focus:border-sky-500/60 ${validationErrors.price ? 'bg-red-500/10 focus:ring-red-500/20' : 'bg-white/[0.03] focus:ring-sky-500/20'}`} />
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
                  <p className="mt-1 text-[10px] text-red-400">{validationErrors.price}</p>
                )}
                {listingType === "wanted" && <p className="text-[10px] text-[var(--muted)]">Set your budget for this item.</p>}
                {!stripeDisabledV1 && listingType === "service" && servicePricingType === "hourly" && <p className="text-[10px] text-[var(--muted)]">Charge per hour for your service.</p>}
                {!stripeDisabledV1 && (listingType === "physical" || listingType === "vehicle" || listingType === "property") && <p className="text-[10px] text-[var(--muted)]">Set the fixed price for this item.</p>}
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
                      <input type="number" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} placeholder="0" className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-8 pr-4 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-150 focus:border-sky-500" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--foreground)]">Duration *</label>
                    <select value={auctionDuration} onChange={(e) => setAuctionDuration(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-all duration-150 focus:border-sky-500">
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
              <input type="text" value={location} onChange={(e) => handleLocationChange(e.target.value)} placeholder="e.g., Auckland, Wellington, Christchurch" className="w-full rounded-xl bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:border-sky-500/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/20 hover:bg-white/[0.04]" />
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
                    saleType === opt.id ? "border-sky-500/40 bg-sky-500/10 text-sky-300" : "border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:border-white/[0.15] hover:bg-white/[0.05] hover:text-zinc-300"
                  }`}>
                  <div className="font-bold text-sm">{opt.label}</div>
                  <div className="mt-1 text-[10px] leading-relaxed">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          )}
          {/* Payment Options — dormant while NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED is off (V1 messaging-first) */}
          {!stripeDisabledV1 && (listingType !== "wanted" && listingType !== "job" && listingType !== "property" && listingType !== "service") && (
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
                      paymentType === "contact" ? "border-sky-500/40 bg-sky-500/10 text-sky-300" : "bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
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
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                          : "bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
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
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Event time</label>
                  <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Venue *</label>
                <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Spark Arena, Auckland"
                  className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Ticket quantity</label>
                  <input type="number" value={ticketQuantity} onChange={(e) => setTicketQuantity(e.target.value)} placeholder="e.g. 100"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Ticket type</label>
                  <select value={ticketType} onChange={(e) => setTicketType(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45">
                    <option value="" className="bg-[var(--card)] text-[var(--muted)]">Select ticket type</option>
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
                  className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Employment type</label>
                  <select value={jobEmploymentType} onChange={(e) => setJobEmploymentType(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45">
                    <option value="" className="bg-[var(--card)] text-[var(--muted)]">Select employment type</option>
                    <option className="bg-[var(--card)] text-[var(--foreground)]">Full-time</option><option className="bg-[var(--card)] text-[var(--foreground)]">Part-time</option><option className="bg-[var(--card)] text-[var(--foreground)]">Contract</option><option className="bg-[var(--card)] text-[var(--foreground)]">Casual</option><option className="bg-[var(--card)] text-[var(--foreground)]">Fixed-term</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Location</label>
                  <input type="text" value={location} onChange={(e) => handleLocationChange(e.target.value)} placeholder="e.g. Auckland"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
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

          {/* Accept Offers — hidden in V1 (negotiate via Messages). Impl kept for Stripe reactivation. */}
          {!stripeDisabledV1 && listingType !== "event" && listingType !== "job" && listingType !== "wanted" && !(listingType === "service" && offersDisabledForService(servicePricingType)) && (
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
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                  className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45"
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
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                          : "border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:border-white/[0.15] hover:bg-white/[0.05] hover:text-zinc-300"
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
                <input type="text" value={location} onChange={(e) => handleLocationChange(e.target.value)}
                  placeholder="City or suburb"
                  className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
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
                          const v = e.target.value; setPrice(v); markField("price");
                          const d = Number(v);
                          if (d > 0) {
                            if (!manualEdit.current.has("weekly")) setRentalPriceWeekly(String(Math.round(d * 7)));
                            const w = manualEdit.current.has("weekly") ? Number(rentalPriceWeekly) : Math.round(d * 7);
                            if (!manualEdit.current.has("monthly") && w > 0) setRentalPriceMonthly(String(Math.round(w * 4)));
                          }
                        }}
                          placeholder="Day"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500" />
                      </div>
                    </div>
                    <div className="col-span-1">
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Weekly</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalPriceWeekly} onChange={(e) => { setRentalPriceWeekly(e.target.value); manualEdit.current.add("weekly"); }}
                          placeholder="Week"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500" />
                      </div>
                    </div>
                    <div className="col-span-1">
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                        <input type="number" value={rentalPriceMonthly} onChange={(e) => { setRentalPriceMonthly(e.target.value); manualEdit.current.add("monthly"); }}
                          placeholder="Month"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500" />
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
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition duration-150 focus:border-sky-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Condition</label>
                      <select value={condition} onChange={(e) => { setCondition(e.target.value); markField("condition"); }}
                        className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45">
                        <option value="" className="bg-[var(--card)] text-[var(--muted)]">Select condition</option>
                        <option className="bg-[var(--card)] text-[var(--foreground)]">New</option><option className="bg-[var(--card)] text-[var(--foreground)]">Used - Like New</option><option className="bg-[var(--card)] text-[var(--foreground)]">Used - Good</option><option className="bg-[var(--card)] text-[var(--foreground)]">Used - Fair</option>
                      </select>
                    </div>
                  </div>

                  {/* Vehicle details - only for vehicle rental */}
                  {rentalSubType === "vehicle" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Make</label>
                        <input type="text" value={vehicleMake} onChange={(e) => { setVehicleMake(e.target.value); markField("vehicleMake"); }}
                          placeholder="e.g. Toyota"
                          className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Model</label>
                        <input type="text" value={vehicleModel} onChange={(e) => { setVehicleModel(e.target.value); markField("vehicleModel"); }}
                          placeholder="e.g. HiAce"
                          className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
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
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/45" />
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


          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-[11px] text-zinc-500">
              <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/20 bg-zinc-900 text-sky-500 focus:ring-sky-500/30" />
              Auto-publish after AI fills
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
              Expires
              <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
                className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 outline-none focus:border-sky-500/45">
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </label>
          </div>

          <button
            id="listing-submit-btn"
            onClick={createListing}
            disabled={loading || editLoading}
            className="mt-2 w-full rounded-xl bg-sky-500 py-3.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40"
          >
            {loading ? "Saving…" : autoPublish && !editId ? "Generate with AI" : editId ? "Save changes" : "Post now"}
          </button>
        </div>
        </div>
        </div>
        </div>

        {/* CONVERSATION COLUMN */}
        {!editId && (
          <div
            className={`mb-4 flex min-h-[min(68vh,640px)] min-w-0 flex-col lg:mb-0 lg:sticky lg:top-20 lg:h-[min(78vh,760px)] lg:min-h-0 ${
              mobileWorkspaceTab === "listing" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="mb-2 flex items-center gap-2 px-0.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-500/15 text-[10px] text-sky-300" aria-hidden>
                ✦
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Āwhina</span>
              {awhinaIsAsking ? (
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden />
              ) : null}
            </div>
            <SkyAiChatPanel
              mode="inline"
              open={skyChatOpen}
              onOpenChange={setSkyChatOpen}
              autoQuery={skyAutoQuery}
              onAutoQueryConsumed={() => setSkyAutoQuery(undefined)}
              onFill={applyFill}
              quickPrompts={[]}
              welcomeText="Kia ora — tell me what you're selling. I'll build the listing with you."
              workspaceChrome
              className="awhina-listing-workspace-chat min-h-0 flex-1"
            />
          </div>
        )}

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
                <p className="mt-2 text-sm text-[var(--muted)]">Normal sellable items you can pick up or ship — not vehicles.</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Best for: Phones, furniture, tools, clothing, collectibles.</p>
              </div>
              <div className="rounded-xl bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🚗</span>
                  <h4 className="font-bold text-white">Vehicle</h4>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">Cars, motorbikes, vans and other vehicles for sale.</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Best for: Cars, utes, vans, motorcycles, boats, caravans.</p>
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
