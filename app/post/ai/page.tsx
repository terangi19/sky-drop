"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";
import { onAuthStateChanged, User } from "firebase/auth";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../lib/firebase";
import { createPendingXP, trackListingCreated } from "../../lib/xpValidation";
import { checkImage } from "../../lib/nsfw";
import { showToast } from "../../components/Toast";
import DigitalAssetUpload from "../../components/DigitalAssetUpload";
import KYCGuard from "../../components/KYCGuard";
import { detectScam } from "../../lib/scamdetection";
import { detectSuspiciousPrice } from "../../lib/pricedetection";

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
  const [listingType, setListingType] = useState<"physical" | "digital" | "service" | "rental" | "event" | "vehicle" | "job" | "property">("physical");
  const [digitalFileURL, setDigitalFileURL] = useState("");
  const [digitalFileName, setDigitalFileName] = useState("");
  const [digitalStoragePath, setDigitalStoragePath] = useState("");
  const [serviceDuration, setServiceDuration] = useState("");
  const [rentalPriceWeekly, setRentalPriceWeekly] = useState("");
  const [rentalPriceMonthly, setRentalPriceMonthly] = useState("");
  const [rentalDeposit, setRentalDeposit] = useState("");
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
  const [acceptOffers, setAcceptOffers] = useState(false);
  const [showKYC, setShowKYC] = useState(false);
  const [kycStatus, setKycStatus] = useState("unsubmitted");
  const [kycRejectionReason, setKycRejectionReason] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scamAlert, setScamAlert] = useState<{ title: string; message: string; found: string[] } | null>(null);
  const [priceAlert, setPriceAlert] = useState(false);
  const [confirmedSubmit, setConfirmedSubmit] = useState(false);
  const [promoteEnabled, setPromoteEnabled] = useState(false);
  const [promoteCommissionType, setPromoteCommissionType] = useState<"percent" | "fixed">("percent");
  const [promoteCommissionValue, setPromoteCommissionValue] = useState("");
  const [promoteMaxBudget, setPromoteMaxBudget] = useState("");
  const [promoteExpiryDays, setPromoteExpiryDays] = useState("30");
  const isDigital = listingType === "digital";
  const classifierRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

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
            setKycStatus(d.kycStatus || "unsubmitted");
            setKycRejectionReason(d.kycRejectionReason || "");
          }
        } catch {}
      }
    });
    return () => unsub();
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
      setExistingImages(data.images || []);
      if (data.images?.length) setImagePreviews(data.images);
    }).catch(console.error).finally(() => setEditLoading(false));
  }, []);

  function dataURLtoBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(",");
    const mime = parts[0].match(/:(.*?);/)![1];
    const bytes = atob(parts[1]);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
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
    const requiredPrice = (saleType === "auction" || saleType === "auction_buy_now") ? startingBid : price;
    if (!user?.email || !title || !requiredPrice) {
      alert(`Please fill in title and ${(saleType === "auction" || saleType === "auction_buy_now") ? "starting bid" : "price"}`);
      return;
    }
    if (listingType === "physical" && !pickupAvailable && !shippingAvailable) {
      alert("Select at least one delivery method (pickup or shipping).");
      return;
    }
    if (listingType === "digital" && !digitalFileURL && !editId) {
      alert("Upload the digital file you're selling.");
      return;
    }
    if (listingType === "rental" && !location) {
      alert("Enter the pickup location for your rental.");
      return;
    }
    if (listingType === "event") {
      if (!eventDate || !venue) {
        alert("Enter the event date and venue.");
        return;
      }
    }
    if (listingType === "vehicle") {
      if (!vehicleMake || !vehicleModel) {
        alert("Enter the vehicle make and model.");
        return;
      }
    }
    if (listingType === "job") {
      if (!jobCompany) {
        alert("Enter the company name.");
        return;
      }
    }
    if (listingType === "property" && !location) {
      alert("Enter the property location.");
      return;
    }
    if (kycStatus !== "approved") {
      setShowKYC(true);
      setLoading(false);
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
      if (listingType !== "digital" && imageFiles.length > 0) {
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
        imageUrl: images[0] || "", images,
      };

      if (editId) {
        baseData.updatedAt = serverTimestamp();
      } else {
        baseData.sellerEmail = user.email; baseData.sellerUsername = user.email?.split("@")[0] || "User";
        baseData.sellerId = user.uid; baseData.createdAt = serverTimestamp();
        baseData.expiresAt = new Date(Date.now() + Number(expiresIn) * 86400000);
      }

      const listingData: any = listingType === "digital" ? {
        ...baseData, condition: "Digital",
        type: "digital", digitalStoragePath, digitalFileName,
        saleType: "buy_now", ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : listingType === "service" ? {
        ...baseData, type: "service", serviceDuration,
        saleType: "buy_now", ...(editId ? {} : { expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000), status: "live" }),
      } : listingType === "rental" ? {
        ...baseData, condition, location,
        type: "rental", pickupAvailable: true, shippingAvailable: false,
        stockQuantity: stockQuantity ? Number(stockQuantity) : 1,
        rentalPriceWeekly: rentalPriceWeekly ? Number(rentalPriceWeekly) : null,
        rentalPriceMonthly: rentalPriceMonthly ? Number(rentalPriceMonthly) : null,
        rentalDeposit: rentalDeposit ? Number(rentalDeposit) : null,
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
      } : {
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
      };

      let newId = editId;
      if (editId) {
        await updateDoc(doc(db, "listings", editId), listingData);
        alert("Listing updated!");
      } else {
        const listingRef = await addDoc(collection(db, "listings"), listingData);
        newId = listingRef.id;
        if (listingType !== "digital") {
          createPendingXP(user.uid, "listing", listingRef.id, listingRef.id);
          trackListingCreated(user.uid, title);
        }

        // Create promotion if enabled
        if (promoteEnabled && promoteCommissionValue && promoteMaxBudget) {
          const expiresDate = new Date(Date.now() + Number(promoteExpiryDays) * 86400000);
          await setDoc(doc(db, "promotions", listingRef.id), {
            listingId: listingRef.id,
            sellerId: user.uid,
            enabled: true,
            commissionType: promoteCommissionType,
            commissionValue: Number(promoteCommissionValue),
            maxBudget: Number(promoteMaxBudget),
            totalCommissionPaid: 0,
            expiresAt: Timestamp.fromDate(expiresDate),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        alert("Listing created!");
      }

      // Handle promotion for edit mode
      if (editId) {
        if (promoteEnabled && promoteCommissionValue && promoteMaxBudget) {
          const expiresDate = new Date(Date.now() + Number(promoteExpiryDays) * 86400000);
          await setDoc(doc(db, "promotions", editId), {
            listingId: editId,
            sellerId: user.uid,
            enabled: true,
            commissionType: promoteCommissionType,
            commissionValue: Number(promoteCommissionValue),
            maxBudget: Number(promoteMaxBudget),
            totalCommissionPaid: 0,
            expiresAt: Timestamp.fromDate(expiresDate),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } else {
          await setDoc(doc(db, "promotions", editId), { enabled: false }, { merge: true }).catch(() => {});
        }
      }
      setImagePreviews([]); setImageFiles([]); setExistingImages([]);
      setTitle(""); setDescription(""); setPrice("");
      setLocation(""); setCategory("Other"); setDetected("");
      setPickupAvailable(false); setShippingAvailable(false);
      setPickupArea(""); setShippingFee(""); setFreeShipping(false);
      setStockQuantity("");
      setSaleType("buy_now"); setBuyNowPrice(""); setStartingBid(""); setReservePrice(""); setAuctionDuration("3"); setExpiresIn("14");
      setListingType("physical"); setDigitalFileURL(""); setDigitalFileName(""); setDigitalStoragePath(""); setServiceDuration(""); setRentalPriceWeekly(""); setRentalPriceMonthly(""); setRentalDeposit(""); setEventDate(""); setEventTime(""); setVenue(""); setTicketQuantity(""); setTicketType("General Admission"); setVehicleMake(""); setVehicleModel(""); setVehicleYear(""); setVehicleOdometer(""); setVehicleBodyType("SUV"); setVehicleFuelType("Petrol"); setVehicleTransmission("Automatic"); setVehicleColour(""); setJobCompany(""); setJobEmploymentType("Full-time"); setSalaryMin(""); setSalaryMax(""); setPropertyType("House"); setBedrooms(""); setBathrooms(""); setLandArea(""); setFloorArea(""); setParking(""); setAcceptOffers(false); setCondition("New");
      setEditId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (listingType === "service") window.location.href = "/services";
      else if (listingType === "digital") window.location.href = "/digital";
      else if (listingType === "rental") window.location.href = `/post/listing/${newId}`;
      else if (listingType === "event") window.location.href = `/events`;
      else if (listingType === "vehicle") window.location.href = `/vehicles`;
      else if (listingType === "job") window.location.href = `/jobs`;
      else if (listingType === "property") window.location.href = `/property`;
      else window.location.href = `/post/listing/${newId}`;
    } catch (err) {
      console.error("Listing upload error:", err);
      alert("Failed to create listing — check console for details");
    }
    setLoading(false);
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
      <ThemeToggle />
      {imagePreviews.length > 0 && <img ref={imgRef} src={imagePreviews[0]} style={{display:'none'}} />}

        <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {editLoading && (
          <div className="mb-6 flex items-center justify-center gap-3 rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
            <span className="text-sm text-[var(--muted)]">Loading listing...</span>
          </div>
        )}

        {/* Header */}
        <div className="mb-10 text-center sm:text-left">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <div className="relative">
            <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/5 via-violet-500/5 to-sky-500/5 blur-3xl pointer-events-none" />
            <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-white via-sky-100 to-white bg-clip-text text-transparent">{editId ? "Edit Listing" : "Quick Post"}</span>
            </h1>
            <p className="relative mt-3 text-[var(--muted)]">{editId ? "Update your listing details" : "List your item in minutes"}</p>
          </div>
        </div>

        {/* Form Card */}
        <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-b from-sky-500/10 via-violet-500/5 to-transparent rounded-3xl blur-xl pointer-events-none" />
          <div className="relative rounded-2xl border border-white/[0.06] bg-zinc-950/80 backdrop-blur-xl p-6 sm:p-8 space-y-6 shadow-2xl shadow-black/40">
          {imagePreviews.length === 0 ? (
            <div onClick={() => fileInputRef.current?.click()} className="flex h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.01] text-zinc-500 transition-all duration-200 hover:border-sky-500/40 hover:bg-sky-500/[0.02] active:scale-[0.99]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/10 to-violet-500/10 border border-white/[0.06]">
                <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <span className="mt-4 text-sm font-bold text-zinc-400">Upload photos</span>
              <span className="mt-1 text-[11px] text-zinc-600">Tap to select — up to 8 images</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {imagePreviews.map((preview, i) => (
                <div key={i} className="group relative overflow-hidden rounded-xl bg-zinc-900/60 ring-1 ring-white/[0.06]">
                  <img src={preview} className="h-28 w-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button onClick={() => {
                    setImagePreviews((prev) => prev.filter((_, j) => j !== i));
                    setImageFiles((prev) => prev.filter((_, j) => j !== i));
                  }} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90 text-[11px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400">✕</button>
                </div>
              ))}
              {imagePreviews.length < 8 && (
                <button onClick={() => fileInputRef.current?.click()} className="flex h-28 items-center justify-center rounded-xl border-2 border-dashed border-white/[0.08] text-zinc-500 transition-all duration-200 hover:border-sky-500/40 hover:bg-sky-500/[0.02] active:scale-[0.97]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
        </div>

        {analyzing && (
          <div className="flex items-center justify-center gap-2.5 rounded-xl border border-sky-500/15 bg-sky-500/5 px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            <span className="text-sm font-medium text-sky-400">Detecting...</span>
          </div>
        )}

        {detected && !analyzing && (
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 text-center">
            <span className="text-sm font-bold text-emerald-400">✅ {detected}</span>
          </div>
        )}

        {showKYC && (
          <KYCGuard
            status={kycStatus as "unsubmitted" | "pending" | "rejected"}
            rejectionReason={kycRejectionReason}
            userId={user?.uid || ""}
            onClose={() => setShowKYC(false)}
            onSubmitted={() => { setKycStatus("pending"); setShowKYC(false); }}
          />
        )}

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

        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" placeholder="What are you selling?" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10 resize-none" placeholder="Describe your item in detail..." />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 appearance-none cursor-pointer">
                {listingType === "digital" ? (
                  <><option>Templates & Assets</option><option>E-books & Guides</option><option>Art & Photography</option><option>Software & Audio</option><option>Gaming & 3D</option></>
                ) : listingType === "service" ? (
                  <><option>Design & Development</option><option>Writing & Translation</option><option>Video & Animation</option><option>Music & Audio</option><option>Marketing & SEO</option><option>Consulting & Coaching</option><option>Other</option></>
                ) : listingType === "event" ? (
                  <><option>Concerts & Gigs</option><option>Festivals</option><option>Sports</option><option>Workshops & Classes</option><option>Community</option><option>Food & Drink</option><option>Other</option></>
                ) : (
                  <><option>Tech</option><option>Cars</option><option>Gaming</option><option>Fashion</option><option>Home</option><option>Sports</option><option>Other</option></>
                )}
              </select>
            </div>
            {(listingType === "physical" || listingType === "vehicle" || listingType === "property") && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 appearance-none cursor-pointer">
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
            ) : saleType === "buy_now" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Price *</label>
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
            {(listingType === "physical" || listingType === "vehicle" || listingType === "property") && (
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

          {/* Listing Type */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Listing Type</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { key: "physical", icon: "📦", label: "Physical", desc: "Sell items — ship or pickup", action: () => setAcceptOffers(false) },
                { key: "digital", icon: "📥", label: "Digital", desc: "Instant delivery", action: () => { setCategory("Templates & Assets"); setPickupAvailable(false); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); } },
                { key: "service", icon: "🤝", label: "Service", desc: "Scope discussed in messages", action: () => { setCategory("Design & Development"); setPickupAvailable(false); setShippingAvailable(false); setAcceptOffers(true); setSaleType("buy_now"); } },
                { key: "rental", icon: "🔑", label: "Rental", desc: "By the day", action: () => { setCategory("Other"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); setLocation(""); setCondition("New"); } },
                { key: "event", icon: "🎟", label: "Event", desc: "Sell tickets", action: () => { setCategory("Concerts & Gigs"); setPickupAvailable(false); setShippingAvailable(false); setAcceptOffers(false); setSaleType("buy_now"); } },
                { key: "vehicle", icon: "🚗", label: "Vehicle", desc: "Cars, bikes & boats", action: () => { setCategory("Cars"); setSaleType("buy_now"); setAcceptOffers(false); } },
                { key: "job", icon: "💼", label: "Job", desc: "Employment listing", action: () => { setCategory("IT & Tech"); setSaleType("buy_now"); setPickupAvailable(false); setShippingAvailable(false); setAcceptOffers(false); } },
                { key: "property", icon: "🏠", label: "Property", desc: "Real estate", action: () => { setCategory("Houses"); setSaleType("buy_now"); setPickupAvailable(true); setShippingAvailable(false); setAcceptOffers(false); } },
              ].map((t) => (
                <button key={t.key} type="button" onClick={() => { setListingType(t.key as any); t.action(); }}
                  className={`rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.97] ${
                    listingType === t.key
                      ? "border-sky-500/40 bg-gradient-to-b from-sky-500/10 to-sky-500/5 shadow-[0_0_20px_rgba(14,165,233,0.08)]"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]"
                  }`}>
                  <span className="text-lg">{t.icon}</span>
                  <p className={`mt-1 text-xs font-bold ${listingType === t.key ? "text-sky-400" : "text-[var(--foreground)]"}`}>{t.label}</p>
                  <p className="mt-1 text-[10px] leading-tight text-[var(--muted)]">{t.desc}</p>
                </button>
              ))}
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
          {listingType !== "digital" && listingType !== "event" && listingType !== "job" && (
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

          {/* Digital File Upload */}
          {listingType === "digital" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Digital File</label>
              <p className="mb-3 text-[11px] font-medium tracking-wide bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">Upload your digital asset file</p>
              {digitalFileURL ? (
                <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-4 py-3">
                  <span className="text-xs text-emerald-400">✓ {digitalFileName}</span>
                  <button onClick={() => { setDigitalFileURL(""); setDigitalFileName(""); setDigitalStoragePath(""); }} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
                </div>
              ) : (
                <DigitalAssetUpload onUpload={(url, name, path) => { setDigitalFileURL(url); setDigitalFileName(name); setDigitalStoragePath(path); }} />
              )}
            </div>
          )}

          {/* Service Details */}
          {listingType === "service" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Service Details</label>
              <input type="text" value={serviceDuration} onChange={(e) => setServiceDuration(e.target.value)}
                placeholder="Estimated delivery time (e.g. 3-5 days)"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
              <p className="mt-2 text-[10px] text-[var(--muted)]">Buyers will message you to discuss scope before purchasing.</p>
            </div>
          )}

          {/* Rental Details */}
          {listingType === "rental" && (
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
              <label className="mb-3 block text-sm font-bold text-[var(--foreground)]">Rental Details</label>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Daily rate *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                      <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                        placeholder="Day"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Weekly <span className="text-zinc-600">(opt)</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                      <input type="number" value={rentalPriceWeekly} onChange={(e) => setRentalPriceWeekly(e.target.value)}
                        placeholder="Week"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Monthly <span className="text-zinc-600">(opt)</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                      <input type="number" value={rentalPriceMonthly} onChange={(e) => setRentalPriceMonthly(e.target.value)}
                        placeholder="Month"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Security deposit / bond <span className="text-zinc-600">(opt)</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                    <input type="number" value={rentalDeposit} onChange={(e) => setRentalDeposit(e.target.value)}
                      placeholder="Deposit amount"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 py-2 pl-7 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Quantity available</label>
                  <input type="number" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Condition</label>
                  <select value={condition} onChange={(e) => setCondition(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                    <option>New</option><option>Used - Like New</option><option>Used - Good</option><option>Used - Fair</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Pickup location *</label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                    placeholder="City or suburb"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                </div>
              </div>
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
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30" />
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

          {/* Sky Hustlers — Promote & Earn */}
          <div className="rounded-2xl border border-amber-500/10 bg-gradient-to-b from-amber-500/3 to-transparent p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚀</span>
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">Sky Hustlers — Promote & Earn</p>
                  <p className="text-[10px] text-zinc-500">Let others promote your listing and earn commission from sales</p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={promoteEnabled} onChange={(e) => setPromoteEnabled(e.target.checked)} className="peer sr-only" />
                <div className="h-6 w-11 rounded-full border border-zinc-700 bg-zinc-800 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-zinc-400 after:transition-all after:content-[''] peer-checked:border-amber-500/30 peer-checked:bg-amber-500/20 peer-checked:after:translate-x-full peer-checked:after:bg-amber-400" />
              </label>
            </div>

            {promoteEnabled && (
              <div className="space-y-3 mt-3 pt-3 border-t border-amber-500/10">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Commission type</label>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setPromoteCommissionType("percent")}
                        className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition ${promoteCommissionType === "percent" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/30 hover:text-zinc-300"}`}>
                        %
                      </button>
                      <button type="button" onClick={() => setPromoteCommissionType("fixed")}
                        className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition ${promoteCommissionType === "fixed" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/30 hover:text-zinc-300"}`}>
                        $
                      </button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">{promoteCommissionType === "percent" ? "Commission %" : "Fixed amount ($)"}</label>
                    <input type="number" value={promoteCommissionValue} onChange={(e) => setPromoteCommissionValue(e.target.value)}
                      placeholder={promoteCommissionType === "percent" ? "e.g. 10" : "e.g. 20"}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-amber-500" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Max budget ($)</label>
                    <input type="number" value={promoteMaxBudget} onChange={(e) => setPromoteMaxBudget(e.target.value)}
                      placeholder="e.g. 200"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-amber-500" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Promotion expires in</label>
                    <select value={promoteExpiryDays} onChange={(e) => setPromoteExpiryDays(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-amber-500">
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                      <option value="60">60 days</option>
                      <option value="90">90 days</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

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

          <button onClick={createListing} disabled={loading || editLoading || ((saleType === "auction" || saleType === "auction_buy_now") ? !startingBid : !price)}
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
    </main>
  );
}