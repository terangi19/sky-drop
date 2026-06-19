import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

try {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
} catch {}

if (!getApps().length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    initializeApp({ credential: cert(JSON.parse(sa)) });
  } else {
    initializeApp({ projectId: "sky-drop-de459" });
  }
}

const db = getFirestore();

const AWHINA_SELLER = {
  email: "awhina@skydrop.nz",
  username: "Awhina",
  uid: "awhina_system",
};

const RANDOM_LISTINGS = [
  {
    type: "physical",
    title: "Bones Swiss Bearings — Skateboard Set",
    price: "45",
    description:
      "Classic Bones Swiss bearings — smooth, fast, and built to last. Lightly used on a street deck, spins clean. Perfect upgrade for any NZ skater.",
    condition: "Used - Good",
    category: "Sports",
    location: "Auckland",
    pickupAvailable: true,
    shippingAvailable: true,
    shippingFee: 6,
    freeShipping: false,
    stockQuantity: 1,
    saleType: "buy_now",
    acceptOffers: true,
  },
  {
    type: "physical",
    title: "Vintage All Blacks Rugby Jersey",
    price: "85",
    description:
      "Retro All Blacks jersey in great nick. Size L. No major pulls or stains — choice for game day or the collection.",
    condition: "Used - Good",
    category: "Fashion",
    location: "Wellington",
    pickupAvailable: true,
    shippingAvailable: true,
    shippingFee: 8,
    freeShipping: false,
    stockQuantity: 1,
    saleType: "buy_now",
  },
  {
    type: "physical",
    title: "Breville Barista Express — Coffee Machine",
    price: "420",
    description:
      "Home espresso machine pulling beautiful shots. Steam wand works a treat. Includes tamper and cleaning kit. Pickup preferred.",
    condition: "Used - Like New",
    category: "Home",
    location: "Christchurch",
    pickupAvailable: true,
    shippingAvailable: false,
    stockQuantity: 1,
    saleType: "buy_now",
    acceptOffers: true,
  },
  {
    type: "digital",
    title: "NZ Seller Listing Template Pack",
    price: "12",
    description:
      "Five polished listing description templates tuned for Trade Me–style NZ buyers. Instant download after purchase.",
    category: "Templates & Assets",
    saleType: "buy_now",
  },
  {
    type: "service",
    title: "Listing Photo & Description Polish",
    price: "35",
    description:
      "I'll rewrite your title and description and suggest a fair NZD price — same quality I use when I help sellers on Sky Drop.",
    category: "Design & Creative",
    serviceDuration: "1-2 days",
    saleType: "buy_now",
  },
];

async function seedAwhinaListing() {
  const pick = RANDOM_LISTINGS[Math.floor(Math.random() * RANDOM_LISTINGS.length)];
  const now = Date.now();

  await db.collection("profiles").doc(AWHINA_SELLER.uid).set(
    {
      email: AWHINA_SELLER.email,
      username: AWHINA_SELLER.username,
      bio: "Sky Drop's marketplace assistant — demo listings to show what's possible.",
      region: "New Zealand",
      createdAt: Timestamp.now(),
    },
    { merge: true }
  );

  const docRef = await db.collection("listings").add({
    ...pick,
    sellerEmail: AWHINA_SELLER.email,
    sellerUsername: AWHINA_SELLER.username,
    sellerId: AWHINA_SELLER.uid,
    status: "live",
    images: [],
    imageUrl: "",
    views: Math.floor(Math.random() * 80) + 10,
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + 60 * 86400000),
  });

  console.log(`✓ Āwhina profile: @${AWHINA_SELLER.username}`);
  console.log(`✓ Listing: ${pick.title}`);
  console.log(`  ID: ${docRef.id}`);
  console.log(`  URL: /post/listing/${docRef.id}`);
  process.exit(0);
}

seedAwhinaListing().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
