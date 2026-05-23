"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, Timestamp, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const items = [
  { title: "Vintage Kiwiana Paua Shell Jewellery Set", category: "Jewellery", price: 45 },
  { title: "Mountain Buggy Terrain Stroller - Green", category: "Baby & Kids", price: 120 },
  { title: "All Blacks Signed Rugby Ball 2023", category: "Sports", price: 200 },
  { title: "Buzzy Bee Pull-Along Toy - Vintage", category: "Toys", price: 35 },
  { title: "Steinlager Pure Mini Fridge", category: "Home & Living", price: 80 },
  { title: "L&P Bottle Collection - 12 Pack Assorted", category: "Collectables", price: 25 },
  { title: "Pavlova Recipe Book - Kiwi Classics", category: "Books", price: 20 },
  { title: "Jandals Size 10 - Barely Worn, Black", category: "Clothing", price: 15 },
  { title: "Shimano Fishing Rod & Reel Combo", category: "Sports", price: 95 },
  { title: "Canon EOS 2000D DSLR Camera Kit", category: "Electronics", price: 350 },
  { title: "PlayStation 5 Digital Edition + 2 Controllers", category: "Gaming", price: 650 },
  { title: "MacBook Pro M3 14inch 2024 - Space Grey", category: "Electronics", price: 2200 },
  { title: "Tesla Model 3 2021 - 60,000km", category: "Cars", price: 35000 },
  { title: "Bach Stay at Raglan - Weekend Rates", category: "Travel", price: 450 },
  { title: "Emeco Navy Chair - Set of 4", category: "Furniture", price: 600 },
  { title: "Breville Barista Express Coffee Machine", category: "Appliances", price: 550 },
  { title: "iPhone 15 Pro Max 256GB - Natural Titanium", category: "Phones", price: 1400 },
  { title: "Samsung 65inch 4K OLED TV - 2024 Model", category: "Electronics", price: 1800 },
  { title: "Toyota Hilux 2018 - 80,000km", category: "Cars", price: 28000 },
  { title: "Queen Bed Frame - Solid Rimu Wood", category: "Furniture", price: 350 },
  { title: "Whittakers Chocolate Gift Box - 6 Pack", category: "Food & Drink", price: 40 },
  { title: "Tramping Boots Size 11 - Merrell Moab", category: "Sports", price: 85 },
  { title: "Oculus Quest 2 VR Headset - 128GB", category: "Gaming", price: 300 },
  { title: "Bose QuietComfort Ultra Headphones", category: "Audio", price: 380 },
  { title: "Dyson V15 Detect Cordless Vacuum", category: "Appliances", price: 650 },
  { title: "Greenstone Pounamu Necklace - Hand Carved", category: "Jewellery", price: 90 },
];

const locations = [
  "Auckland CBD", "Wellington", "Christchurch", "Hamilton", "Tauranga",
  "Dunedin", "Queenstown", "Napier", "Rotorua", "Whangarei",
  "Palmerston North", "Nelson", "New Plymouth", "Invercargill", "Gisborne",
  "Blenheim", "Timaru", "Taupo", "Masterton", "Hastings",
];

const conditions = ["New", "Like New", "Good", "Fair", "Used"];

const categoryToWorld: Record<string, string> = {
  Gaming: "gaming",
  Electronics: "tech",
  Audio: "tech",
  Phones: "tech",
  Cars: "cars",
  Clothing: "fashion",
  Jewellery: "fashion",
  Collectables: "collector",
  Sports: "collector",
  Toys: "collector",
};

function randomItem() {
  const item = items[Math.floor(Math.random() * items.length)];
  const location = locations[Math.floor(Math.random() * locations.length)];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  return { ...item, location, condition, description: `${item.title}. ${condition} condition. Pick up from ${location}.` };
}

interface BotContextType {
  running: boolean;
  count: number;
  status: string;
  start: () => void;
  stop: () => void;
}

const BotContext = createContext<BotContextType>({
  running: false,
  count: 0,
  status: "Idle",
  start: () => {},
  stop: () => {},
});

export function BotProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(() => typeof window !== "undefined" && localStorage.getItem("botRunning") === "true");
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("Idle");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.email) setUserEmail(user.email);
    });
    return () => unsub();
  }, []);
  const addRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const purchaseRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const botEmails = ["buyer1@skydrop.nz", "buyer2@skydrop.nz", "trader@skydrop.nz"];

  async function addBotListing() {
    try {
      const data = randomItem();
      const idx = items.indexOf(items.find(i => i.title === data.title)!);
      const imageUrl = `https://picsum.photos/seed/${idx + 1}/400/300`;
      const types = ["WTS", "WTB", "Trading"];
      const type = types[Math.floor(Math.random() * types.length)];

      await addDoc(collection(db, "listings"), {
        title: data.title,
        price: data.price,
        category: data.category,
        location: data.location,
        condition: data.condition,
        description: data.description,
        imageUrl,
        sellerEmail: "bot@skydrop.nz",
        sellerUsername: "TradeBot",
        _isBot: true,
        _deleteAt: Timestamp.fromMillis(Date.now() + 240000),
        pickupAvailable: true,
        shippingAvailable: Math.random() > 0.5,
        pickupArea: locations[Math.floor(Math.random() * locations.length)],
        shippingFee: Math.random() > 0.5 ? Math.floor(Math.random() * 25) + 5 : null,
        freeShipping: Math.random() > 0.7,
        createdAt: serverTimestamp(),
      });

      const world = categoryToWorld[data.category] || null;
      const subcategories: Record<string, string[]> = {
        gaming: ["In-Game Collectibles", "PC Parts", "Consoles", "Gaming Setups"],
        tech: ["Phones", "PCs", "Cameras", "Audio", "Smart Home"],
        cars: ["Wheels", "Parts", "Cars", "Performance", "Detailing", "Tools"],
        fashion: ["Sneakers", "Streetwear", "Designer", "Vintage", "Accessories"],
        collector: ["Cards", "Figures", "Memorabilia", "Rare Items"],
      };
      const cats = world ? subcategories[world] : null;
      const category = cats ? cats[Math.floor(Math.random() * cats.length)] : null;

      await addDoc(collection(db, "tradePosts"), {
        type,
        title: data.title,
        price: String(data.price),
        location: data.location,
        message: `${type}: ${data.title} - $${data.price}. ${data.condition} condition. ${data.location}.`,
        image: imageUrl,
        sellerEmail: "bot@skydrop.nz",
        sellerUsername: "TradeBot",
        world,
        category,
        createdAt: serverTimestamp(),
      });

      setCount((c) => c + 1);
      setStatus(`Added: ${data.title}`);
    } catch (e) {
      console.error(e);
    }
  }

  async function sendBotMessage() {
    try {
      if (!userEmail) return;
      const msgs = ["Still available?", "Can pickup tonight.", "Sent offer.", "Price negotiable?", "Trade?"];
      const botBuyer = botEmails[Math.floor(Math.random() * botEmails.length)];
      // Send message FROM bot buyer TO current user
      await addDoc(collection(db, "messages"), {
        type: "text",
        text: msgs[Math.floor(Math.random() * msgs.length)],
        sender: botBuyer,
        receiver: userEmail,
        participants: [botBuyer, userEmail],
        listingTitle: "TradeBot Test Item",
        listingPrice: String(Math.floor(Math.random() * 500) + 20),
        read: false,
        createdAt: serverTimestamp(),
      });
      // Also send message FROM current user TO bot buyer (simulating a reply)
      await addDoc(collection(db, "messages"), {
        type: "text",
        text: "Sounds good, when can you meet?",
        sender: userEmail,
        receiver: botBuyer,
        participants: [userEmail, botBuyer],
        listingTitle: "TradeBot Test Item",
        listingPrice: String(Math.floor(Math.random() * 500) + 20),
        read: false,
        createdAt: serverTimestamp(),
      });
      setStatus(`Bot messaged ${userEmail.split("@")[0]}`);
    } catch (e) { console.error(e); }
  }

  async function makeBotPurchase() {
    try {
      if (!userEmail) return;
      const buyer = botEmails[Math.floor(Math.random() * botEmails.length)];
      await addDoc(collection(db, "purchases"), {
        listingId: "bot-test-" + Date.now(),
        listingTitle: "TradeBot Test Purchase",
        listingPrice: String(Math.floor(Math.random() * 200) + 50),
        listingImage: "",
        sellerEmail: userEmail, buyerEmail: buyer,
        buyerName: buyer.split("@")[0], buyerPhone: "021" + Math.floor(Math.random() * 1000000),
        deliveryMethod: Math.random() > 0.5 ? "pickup" : "shipping",
        shippingAddress: "123 Test Street, Auckland",
        total: Number(Math.floor(Math.random() * 200) + 50),
        status: "pending", createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "messages"), {
        type: "purchase", text: `${buyer.split("@")[0]} wants to buy "TradeBot Test Purchase"`,
        sender: buyer, receiver: userEmail,
        participants: [buyer, userEmail],
        listingTitle: "TradeBot Test Purchase",
        listingPrice: String(Math.floor(Math.random() * 200) + 50),
        deliveryMethod: "pickup", buyerName: buyer.split("@")[0],
        read: false, createdAt: serverTimestamp(),
      });
      setCount((c) => c + 1);
      setStatus(`Bot purchased from you!`);
    } catch (e) { console.error(e); }
  }

  async function cleanupBots() {
    try {
      const now = Date.now();
      let deleted = 0;

      const listingsSnap = await getDocs(collection(db, "listings"));
      for (const d of listingsSnap.docs) {
        const data = d.data();
        if (data._isBot) {
          const deleteAt = data._deleteAt?.toMillis?.() || 0;
          if (deleteAt > 0 && deleteAt <= now) {
            await deleteDoc(doc(db, "listings", d.id));
            deleted++;
          }
        }
      }

      const tradeSnap = await getDocs(collection(db, "tradePosts"));
      for (const d of tradeSnap.docs) {
        const data = d.data();
        if (data.sellerEmail === "bot@skydrop.nz") {
          await deleteDoc(doc(db, "tradePosts", d.id));
        }
      }

      if (deleted > 0) setStatus(`Cleaned up ${deleted} expired`);
    } catch (e) {
      console.error(e);
    }
  }

  function start() {
    if (addRef.current) return;
    setRunning(true);
    setStatus("Bot started");
    localStorage.setItem("botRunning", "true");
    addBotListing();
    addRef.current = setInterval(addBotListing, 45000);
    cleanRef.current = setInterval(cleanupBots, 60000);
    msgRef.current = setInterval(sendBotMessage, 30000);
    purchaseRef.current = setInterval(makeBotPurchase, 90000);
  }

  function stop() {
    if (addRef.current) { clearInterval(addRef.current); addRef.current = null; }
    if (cleanRef.current) { clearInterval(cleanRef.current); cleanRef.current = null; }
    if (msgRef.current) { clearInterval(msgRef.current); msgRef.current = null; }
    if (purchaseRef.current) { clearInterval(purchaseRef.current); purchaseRef.current = null; }
    setRunning(false);
    setStatus("Stopped");
    localStorage.setItem("botRunning", "false");
  }

  useEffect(() => {
    if (running) {
      addBotListing();
      addRef.current = setInterval(addBotListing, 45000);
      cleanRef.current = setInterval(cleanupBots, 60000);
      msgRef.current = setInterval(sendBotMessage, 30000);
      purchaseRef.current = setInterval(makeBotPurchase, 90000);
    }
    return () => {
      if (addRef.current) { clearInterval(addRef.current); addRef.current = null; }
      if (cleanRef.current) { clearInterval(cleanRef.current); cleanRef.current = null; }
      if (msgRef.current) { clearInterval(msgRef.current); msgRef.current = null; }
      if (purchaseRef.current) { clearInterval(purchaseRef.current); purchaseRef.current = null; }
    };
  }, []);

  return (
    <BotContext.Provider value={{ running, count, status, start, stop }}>
      {children}
    </BotContext.Provider>
  );
}

export function useBot() {
  return useContext(BotContext);
}
