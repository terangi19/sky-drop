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
const now = Date.now();

const sellers = [
  { email: "seller1@skydrop.nz", name: "TechTrader", uid: "seed_s1" },
  { email: "seller2@skydrop.nz", name: "KiwiCollector", uid: "seed_s2" },
  { email: "seller3@skydrop.nz", name: "DesignStudio", uid: "seed_s3" },
];

const listings = [
  // ── Physical items ──
  {
    type: "physical", title: "Sony WH-1000XM5 Headphones", price: "499",
    description: "Premium noise-cancelling headphones. Used twice, like new condition. Comes with original case, cable and USB-C charger.",
    condition: "Used - Like New", category: "Tech", location: "Auckland",
    pickupAvailable: true, shippingAvailable: true, shippingFee: 12,
    freeShipping: false, stockQuantity: 1, saleType: "buy_now",
    images: [], status: "live",
  },
  {
    type: "physical", title: "Nintendo Switch OLED - White", price: "549",
    description: "Barely used Nintendo Switch OLED model. White colourway. Includes dock, Joy-Cons, and original box. 3 games included.",
    condition: "Used - Like New", category: "Gaming", location: "Wellington",
    pickupAvailable: true, shippingAvailable: true, shippingFee: 8,
    freeShipping: false, stockQuantity: 1, saleType: "buy_now",
    acceptOffers: true,
    images: [], status: "live",
  },
  {
    type: "physical", title: "Mountain Bike - Giant Talon 1", price: "1200",
    description: "Giant Talon 1 hardtail mountain bike. 29\" wheels, hydraulic disc brakes. Great condition, regularly serviced.",
    condition: "Used - Good", category: "Sports", location: "Christchurch",
    pickupAvailable: true, shippingAvailable: false,
    stockQuantity: 1, saleType: "buy_now", acceptOffers: true,
    images: [], status: "live",
  },
  // ── Digital ──
  {
    type: "digital", title: "Premium Resume Template Pack", price: "19",
    description: "5 professionally designed resume templates in AI, PSD, and Figma formats. ATS-friendly. Instant download after purchase.",
    category: "Templates & Assets",
    saleType: "buy_now", status: "live",
  },
  {
    type: "digital", title: "Lightroom Preset Pack - Urban Collection", price: "29",
    description: "25 premium Lightroom presets for urban photography. Works with desktop and mobile Lightroom. Instant download.",
    category: "Art & Photography",
    saleType: "buy_now", status: "live",
  },
  // ── Services ──
  {
    type: "service", title: "Professional Website Development", price: "",
    description: "Custom website built with Next.js or React. Includes responsive design, SEO optimisation, and 1 month support.",
    category: "Design & Development", serviceDuration: "2-4 weeks",
    saleType: "buy_now", status: "live",
  },
  {
    type: "service", title: "Logo Design & Brand Identity", price: "350",
    description: "Complete brand identity package including logo, colour palette, typography, and brand guidelines. 3 rounds of revisions.",
    category: "Design & Creative", serviceDuration: "5-7 days",
    saleType: "buy_now", status: "live",
  },
  // ── Rentals ──
  {
    type: "rental", title: "Canon EOS R5 Camera Kit", price: "80",
    description: "Full-frame mirrorless camera kit. Includes 24-105mm f/4 lens, battery charger, and 128GB CFexpress card.",
    condition: "Used - Like New", category: "Tech", location: "Auckland",
    pickupAvailable: true, shippingAvailable: false,
    stockQuantity: 1, rentalPriceWeekly: "420", rentalPriceMonthly: "1400",
    rentalDeposit: "500",
    saleType: "buy_now", status: "live",
  },
  {
    type: "rental", title: "Mountain Bike - Norco Fluid FS", price: "60",
    description: "Full suspension mountain bike for rent. Perfect for a weekend on the trails. Helmet included.",
    condition: "Used - Good", category: "Sports", location: "Rotorua",
    pickupAvailable: true, shippingAvailable: false,
    stockQuantity: 1, rentalPriceWeekly: "300", rentalPriceMonthly: "900",
    rentalDeposit: "400",
    saleType: "buy_now", status: "live",
  },
  // ── Events ──
  {
    type: "event", title: "Laneway Festival 2025 - Weekend Pass", price: "249",
    description: "Weekend pass to Laneway Festival 2025. Two days of live music across 4 stages. Non-transferable.",
    category: "Festivals", location: "Auckland",
    eventDate: "2026-02-15", eventTime: "10:00 AM", venue: "Western Springs",
    ticketQuantity: 2, stockQuantity: 2, ticketType: "Weekend Pass",
    saleType: "buy_now", status: "live",
  },
  {
    type: "event", title: "All Blacks vs Wallabies - Eden Park", price: "120",
    description: "2 tickets to the Bledisloe Cup match at Eden Park. Great seats in the North Stand.",
    category: "Sports", location: "Auckland",
    eventDate: "2026-08-10", eventTime: "7:00 PM", venue: "Eden Park",
    ticketQuantity: 2, stockQuantity: 2, ticketType: "General Admission",
    saleType: "buy_now", status: "live",
  },
  // ── Vehicles ──
  {
    type: "vehicle", title: "2021 Toyota Corolla Hybrid", price: "28500",
    description: "2021 Toyota Corolla Hybrid Limited. 45,000km, one owner, full service history. Excellent fuel economy - 3.5L/100km.",
    condition: "Used - Like New", category: "Cars", location: "Auckland",
    pickupAvailable: true, shippingAvailable: false,
    stockQuantity: 1, saleType: "buy_now",
    vehicleMake: "Toyota", vehicleModel: "Corolla Hybrid", vehicleYear: 2021,
    vehicleOdometer: 45000, vehicleFuelType: "Hybrid", vehicleTransmission: "Automatic",
    vehicleBodyType: "Sedan", vehicleColour: "Silver",
    images: [], status: "live",
  },
  {
    type: "vehicle", title: "2019 Ford Ranger XLT", price: "42000",
    description: "2019 Ford Ranger XLT 4x4 Double Cab. 68,000km, tow bar, canopy, Bluetooth. Ute of all trades.",
    condition: "Used - Good", category: "Cars", location: "Christchurch",
    pickupAvailable: true, shippingAvailable: false,
    stockQuantity: 1, saleType: "buy_now", acceptOffers: true,
    vehicleMake: "Ford", vehicleModel: "Ranger XLT", vehicleYear: 2019,
    vehicleOdometer: 68000, vehicleFuelType: "Diesel", vehicleTransmission: "Automatic",
    vehicleBodyType: "Ute", vehicleColour: "White",
    images: [], status: "live",
  },
  // ── Jobs ──
  {
    type: "job", title: "Senior React Developer", price: "130000",
    description: "We're looking for an experienced React developer to join our team. Remote-friendly, NZ-based company. Work on cutting-edge web applications.",
    category: "IT & Tech", location: "Remote NZ",
    jobCompany: "TechWorks NZ", jobEmploymentType: "Full-time",
    salaryMin: "110000", salaryMax: "130000",
    saleType: "buy_now", status: "live",
  },
  {
    type: "job", title: "Graphic Designer - Part Time", price: "45000",
    description: "Part-time graphic designer for marketing agency. 20 hours/week, flexible hours. Must be based in Auckland.",
    category: "Design & Creative", location: "Auckland",
    jobCompany: "Pixel Studio", jobEmploymentType: "Part-time",
    salaryMin: "40000", salaryMax: "50000",
    saleType: "buy_now", status: "live",
  },
  // ── Property ──
  {
    type: "property", title: "Modern 3-Bedroom Townhouse - Mt Eden", price: "925000",
    description: "Beautiful modern townhouse in sought-after Mt Eden. Open plan living, double glazing, sunny deck. Built 2021.",
    condition: "New", category: "Houses", location: "Auckland",
    pickupAvailable: true, shippingAvailable: false,
    saleType: "buy_now",
    propertyType: "Townhouse", bedrooms: 3, bathrooms: 2,
    landArea: 250, floorArea: 140, parking: 2,
    acceptOffers: true,
    images: [], status: "live",
  },
  {
    type: "property", title: "Apartment - Wellington CBD", price: "550000",
    description: "1-bedroom apartment in the heart of Wellington city. Great views, secure parking, close to public transport.",
    condition: "Used - Good", category: "Houses", location: "Wellington",
    pickupAvailable: true, shippingAvailable: false,
    saleType: "buy_now",
    propertyType: "Apartment", bedrooms: 1, bathrooms: 1,
    floorArea: 55, parking: 1,
    images: [], status: "live",
  },
];

async function seed() {
  console.log(`Seeding ${listings.length} listings...\n`);

  for (const seller of sellers) {
    await db.collection("profiles").doc(seller.uid).set({
      email: seller.email,
      username: seller.name,
      displayName: seller.name,
      createdAt: Timestamp.now(),
    }, { merge: true });
  }
  console.log(`✓ ${sellers.length} seller profiles created`);

  let i = 0;
  for (const data of listings) {
    i++;
    const seller = sellers[i % sellers.length];
    const docRef = await db.collection("listings").add({
      ...data,
      sellerEmail: seller.email,
      sellerUsername: seller.name,
      sellerId: seller.uid,
      createdAt: Timestamp.fromMillis(now - (listings.length - i) * 3600000),
      expiresAt: Timestamp.fromMillis(now + 60 * 86400000),
      views: Math.floor(Math.random() * 200),
    });
    console.log(`  ${i.toString().padStart(2)}. [${data.type.padEnd(9)}] ${data.title.slice(0, 50)}`);
  }

  console.log(`\n✓ ${listings.length} listings seeded successfully`);
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
