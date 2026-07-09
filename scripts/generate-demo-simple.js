// Simple demo listing generator using existing Firebase admin setup
const admin = require('firebase-admin');

// Use the same initialization as the app
function parseServiceAccountJson() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  }
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(JSON.parse(raw));
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is invalid JSON");
    }
  }
}

const serviceAccount = parseServiceAccountJson();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
});

const db = admin.firestore();
const auth = admin.auth();

const DEMO_LISTINGS = [
  {
    title: "2018 BMW 320i Sport Line",
    description: "Well-maintained BMW 320i with full service history. Features include M Sport package, sunroof, navigation, and premium sound system. Recently serviced with new tires. Perfect for someone looking for a reliable luxury sedan.",
    price: "35000",
    category: "Cars",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=BMW+320i"],
    type: "vehicle",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Toyota Hilux 4x4 Double Cab",
    description: "2017 Toyota Hilux 4x4 in excellent condition. Features include canopy, tow bar, and off-road tires. Perfect for work or adventure. Low kilometers for year.",
    price: "42000",
    category: "Cars",
    condition: "Used",
    location: "Christchurch",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Toyota+Hilux"],
    type: "vehicle",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "MacBook Pro 14-inch M3 Pro",
    description: "Latest MacBook Pro with M3 Pro chip, 18GB RAM, 512GB SSD. Perfect for creative professionals and developers. Includes original charger and box. AppleCare+ until 2026.",
    price: "2800",
    category: "Electronics",
    condition: "New",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=MacBook+Pro"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "iPhone 15 Pro Max 256GB",
    description: "Brand new iPhone 15 Pro Max in Natural Titanium. Still sealed in box. Includes 1-year Apple warranty. All accessories included.",
    price: "1800",
    category: "Phones",
    condition: "New",
    location: "Wellington",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=iPhone+15+Pro+Max"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Makita 18V Cordless Drill Kit",
    description: "Professional-grade Makita drill with 2 batteries, charger, and carry case. Brushless motor for longer life and more power. Perfect for DIY or trade use.",
    price: "280",
    category: "Tools",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Makita+Drill"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Modern Leather Sofa Set",
    description: "3+2 seater leather sofa set in dark brown. Genuine leather, excellent condition. Comfortable and stylish. Perfect for living room.",
    price: "800",
    category: "Furniture",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Leather+Sofa"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Road Bike - Giant Contend",
    description: "Giant Contend road bike in excellent condition. Carbon fork, Shimano Tiagra groupset. Perfect for road cycling and fitness. Size Medium.",
    price: "850",
    category: "Sports",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Road+Bike"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Designer Leather Jacket",
    description: "Genuine leather jacket in excellent condition. Size L, classic style. Perfect for casual or formal wear. Minor wear on cuffs.",
    price: "180",
    category: "Clothing",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Leather+Jacket"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "PlayStation 5 with 2 Controllers",
    description: "PS5 console with 2 DualSense controllers and 3 games (Spider-Man 2, FIFA 24, Call of Duty). Excellent condition, works perfectly.",
    price: "650",
    category: "Gaming",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=PS5"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Lawn Mower - Honda Self-Propelled",
    description: "Honda self-propelled lawn mower in excellent condition. Easy to start and use. Includes catcher. Perfect for medium-sized lawns.",
    price: "350",
    category: "Home & Garden",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Lawn+Mower"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  }
];

async function createDemoAccount() {
  const demoEmail = "demo@skydrop.nz";
  const demoPassword = "DemoAccount2024!";
  
  try {
    const userRecord = await auth.getUserByEmail(demoEmail);
    console.log("Demo account already exists:", userRecord.uid);
    return userRecord.uid;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      const userRecord = await auth.createUser({
        email: demoEmail,
        password: demoPassword,
        emailVerified: true
      });
      console.log("Demo account created:", userRecord.uid);
      return userRecord.uid;
    } else {
      throw error;
    }
  }
}

async function createDemoListings(userId) {
  const batch = db.batch();
  const listingsRef = db.collection('listings');
  
  for (const listing of DEMO_LISTINGS) {
    const docRef = listingsRef.doc();
    const listingData = {
      ...listing,
      sellerId: userId,
      sellerEmail: "demo@skydrop.nz",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // 30 days from now
      visible: true
    };
    batch.set(docRef, listingData);
  }
  
  await batch.commit();
  console.log(`Created ${DEMO_LISTINGS.length} demo listings`);
}

async function main() {
  try {
    console.log("Creating demo account...");
    const userId = await createDemoAccount();
    
    console.log("Creating demo listings...");
    await createDemoListings(userId);
    
    console.log("Demo listings created successfully!");
    console.log("Demo email: demo@skydrop.nz");
    console.log("Demo password: DemoAccount2024!");
  } catch (error) {
    console.error("Error creating demo listings:", error);
    process.exit(1);
  }
}

main();
