"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";
import { onAuthStateChanged, User } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../lib/firebase";

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
  const [loading, setLoading] = useState(false);
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
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

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
    if (!pickupAvailable && !shippingAvailable) {
      alert("Select at least one delivery method (pickup or shipping).");
      return;
    }
    setLoading(true);
    try {
      const images: string[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const res = await fetch(imagePreviews[i]);
        const blob = await res.blob();
        const storageRef = ref(storage, `listings/${user.uid}/${Date.now()}_${i}.jpg`);
        const snap = await uploadBytes(storageRef, blob);
        images.push(await getDownloadURL(snap.ref));
      }
      await addDoc(collection(db, "listings"), {
        title, description, price: String(saleType === "auction_buy_now" && buyNowPrice ? buyNowPrice : (saleType === "auction" || saleType === "auction_buy_now") ? startingBid : price), category, condition, location,
        imageUrl: images[0] || "", images, sellerEmail: user.email, sellerUsername: user.email?.split("@")[0] || "User", sellerId: user.uid, createdAt: serverTimestamp(),
        pickupAvailable, shippingAvailable, pickupArea,
        shippingFee: shippingAvailable && shippingFee ? Number(shippingFee) : null,
        freeShipping: shippingAvailable ? freeShipping : false,
        stockQuantity: stockQuantity ? Number(stockQuantity) : null,
        saleType,
        startingBid: (saleType === "auction" || saleType === "auction_buy_now") && startingBid ? Number(startingBid) : null,
        reservePrice: (saleType === "auction" || saleType === "auction_buy_now") && reservePrice ? Number(reservePrice) : null,
        auctionEndsAt: (saleType === "auction" || saleType === "auction_buy_now") ? new Date(Date.now() + Number(auctionDuration) * 86400000) : null,
        expiresAt: new Date(Date.now() + Number(expiresIn) * 86400000),
        currentBid: null, bidCount: 0, highestBidder: null,
      });
      alert("Listing created!");
      setImagePreviews([]); setImageFiles([]); setTitle(""); setDescription(""); setPrice("");
      setLocation(""); setCategory("Other"); setDetected("");
      setPickupAvailable(false); setShippingAvailable(false);
      setPickupArea(""); setShippingFee(""); setFreeShipping(false);
      setStockQuantity("");
      setSaleType("buy_now"); setBuyNowPrice(""); setStartingBid(""); setReservePrice(""); setAuctionDuration("3"); setExpiresIn("14");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      alert("Failed");
    }
    setLoading(false);
  };

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <ThemeToggle />
      {imagePreviews.length > 0 && <img ref={imgRef} src={imagePreviews[0]} style={{display:'none'}} />}

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
  Back
</Link>
            <h1 className="text-4xl font-black text-[var(--foreground)]">AI Quick Post</h1>
            <p className="mt-2 text-[var(--muted)]">Free unlimited AI</p>
          </div>
          <div className={`rounded-xl px-4 py-2 text-sm ${modelReady ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
            {modelReady ? "✓ AI Ready" : "Loading model... (fallback available)"}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          {imagePreviews.length === 0 ? (
            <div onClick={() => fileInputRef.current?.click()} className="flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 text-[var(--muted)] hover:border-sky-500">
              <span className="text-5xl">📸</span>
              <span className="mt-3 font-bold">Upload Photo</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {imagePreviews.map((preview, i) => (
                <div key={i} className="relative">
                  <img src={preview} className="h-28 w-full rounded-lg object-cover" />
                  <button onClick={() => {
                    setImagePreviews((prev) => prev.filter((_, j) => j !== i));
                    setImageFiles((prev) => prev.filter((_, j) => j !== i));
                  }} className="absolute right-1 top-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">✕</button>
                </div>
              ))}
              {imagePreviews.length < 8 && (
                <button onClick={() => fileInputRef.current?.click()} className="flex h-28 items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 text-[var(--muted)] hover:border-sky-500">
                  <span className="text-2xl">+</span>
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
        </div>

        {analyzing && (
          <div className="mt-4 flex items-center justify-center gap-3 rounded-lg bg-sky-500/10 p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
            <span className="text-sky-400">Detecting...</span>
          </div>
        )}

        {detected && !analyzing && (
          <div className="mt-4 rounded-lg bg-green-500/10 p-4 text-center">
            <span className="text-green-400 font-bold">✅ {detected}</span>
          </div>
        )}

        <div className="mt-6 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)]" placeholder="Auto-filled" />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)]" placeholder="Auto-filled" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)]">
                <option>Tech</option><option>Cars</option><option>Gaming</option><option>Fashion</option><option>Home</option><option>Sports</option><option>Other</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)]">
                <option>New</option><option>Used - Like New</option><option>Used - Good</option><option>Used - Fair</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {saleType === "buy_now" ? (
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Price *</label>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)]" />
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Starting Bid *</label>
                <input type="number" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} placeholder="$" className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)]" />
              </div>
            )}
            {saleType === "auction_buy_now" && (
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Buy Now Price <span className="text-[var(--muted)] font-normal">(optional)</span></label>
                <input type="number" value={buyNowPrice} onChange={(e) => setBuyNowPrice(e.target.value)} placeholder="$"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)]" />
              </div>
            )}
            <div>
              <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Location</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City" className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)]" />
            </div>
          </div>

          {(saleType === "auction" || saleType === "auction_buy_now") && (
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

          {/* Sale Type */}
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--foreground)]">Sale Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "buy_now", label: "Buy Now" },
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

          {/* Delivery Options */}
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
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Listing expires in</label>
                <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                </select>
              </div>
            </div>
          </div>

          <button onClick={createListing} disabled={loading || ((saleType === "auction" || saleType === "auction_buy_now") ? !startingBid : !price)} className="w-full rounded-xl bg-sky-500 py-4 text-lg font-bold text-[var(--foreground)] hover:bg-sky-400 disabled:opacity-50">
            {loading ? "Posting..." : "Post Now"}
          </button>
        </div>
      </div>
    </main>
  );
}