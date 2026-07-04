import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { isAdminEmail } from "../../lib/admin-check";

const realisticListings = [
  {
    title: "iPhone 14 Pro 256GB - Space Black",
    description: "Excellent condition, always kept in a case with screen protector. Battery health at 96%. Comes with original box, charger, and cable. Unlocked for any network.",
    price: "850.00",
    category: "Tech",
    type: "physical",
    condition: "Used - Like New",
    location: "Auckland",
    pickupAvailable: true,
    shippingAvailable: true,
    shippingFee: 12,
    freeShipping: false,
  },
  {
    title: "Sony WH-1000XM4 Wireless Headphones",
    description: "Premium noise-canceling headphones in perfect working condition. Minor cosmetic wear on ear cups. Includes original case and charging cable. 30-hour battery life.",
    price: "280.00",
    category: "Tech",
    type: "physical",
    condition: "Used - Good",
    location: "Wellington",
    pickupAvailable: true,
    shippingAvailable: true,
    shippingFee: 8,
    freeShipping: false,
  },
  {
    title: "Nintendo Switch OLED Model",
    description: "Like new Nintendo Switch OLED with white joy-cons. Includes original dock, AC adapter, HDMI cable, and Joy-Con grip. Also comes with Super Mario Odyssey and Zelda: Breath of the Wild.",
    price: "420.00",
    category: "Gaming",
    type: "physical",
    condition: "Used - Like New",
    location: "Christchurch",
    pickupAvailable: true,
    shippingAvailable: true,
    shippingFee: 15,
    freeShipping: false,
  },
  {
    title: "MacBook Air M2 13-inch 256GB",
    description: "Midnight color, 8GB RAM, 256GB SSD. In pristine condition with AppleCare+ until 2025. Includes original box and charger. Battery cycles: 45. Perfect for students or professionals.",
    price: "1350.00",
    category: "Tech",
    type: "physical",
    condition: "Used - Like New",
    location: "Auckland",
    pickupAvailable: true,
    shippingAvailable: true,
    shippingFee: 20,
    freeShipping: false,
  },
  {
    title: "Canon EOS R6 Mirrorless Camera Body",
    description: "Professional-grade mirrorless camera with 20MP full-frame sensor. Excellent condition, shutter count under 5,000. Includes body cap, battery, and charger. Perfect for photography enthusiasts.",
    price: "2200.00",
    category: "Tech",
    type: "physical",
    condition: "Used - Like New",
    location: "Hamilton",
    pickupAvailable: true,
    shippingAvailable: false,
    shippingFee: 0,
    freeShipping: false,
  },
  {
    title: "Herman Miller Aeron Chair - Size B",
    description: "Classic ergonomic office chair in graphite color with pellicle mesh. Fully adjustable with lumbar support. Minor wear on armrests. Excellent for home office setup.",
    price: "650.00",
    category: "Home",
    type: "physical",
    condition: "Used - Good",
    location: "Tauranga",
    pickupAvailable: true,
    shippingAvailable: false,
    shippingFee: 0,
    freeShipping: false,
  },
  {
    title: "Dyson V15 Detect Vacuum Cleaner",
    description: "Brand new in box, never used. Latest Dyson vacuum with laser detection and LCD screen. Includes all attachments and charging dock. Retails for $1299, selling for much less.",
    price: "950.00",
    category: "Home",
    type: "physical",
    condition: "New",
    location: "Auckland",
    pickupAvailable: true,
    shippingAvailable: true,
    shippingFee: 25,
    freeShipping: false,
  },
  {
    title: "2022 Toyota Corolla Hatchback SX",
    description: "Low mileage (18,000 km), full service history. Silver metallic paint, automatic transmission, 1.8L engine. Excellent fuel economy. Includes two sets of keys and floor mats.",
    price: "24500.00",
    category: "Cars",
    type: "vehicle",
    condition: "Used - Like New",
    location: "Auckland",
    pickupAvailable: true,
    shippingAvailable: false,
    shippingFee: 0,
    freeShipping: false,
    vehicleYear: "2022",
    vehicleMake: "Toyota",
    vehicleModel: "Corolla Hatchback",
    vehicleOdometer: "18000",
    vehicleFuelType: "Petrol",
    vehicleTransmission: "Automatic",
  },
  {
    title: "2018 Mazda CX-5 GSX AWD",
    description: "Well-maintained SUV with 65,000 km. Soul Red Crystal Metallic paint, leather interior, sunroof, reversing camera. Full service history at Mazda dealership. Two owners, non-smoker.",
    price: "28500.00",
    category: "Cars",
    type: "vehicle",
    condition: "Used - Good",
    location: "Wellington",
    pickupAvailable: true,
    shippingAvailable: false,
    shippingFee: 0,
    freeShipping: false,
    vehicleYear: "2018",
    vehicleMake: "Mazda",
    vehicleModel: "CX-5",
    vehicleOdometer: "65000",
    vehicleFuelType: "Petrol",
    vehicleTransmission: "Automatic",
  },
  {
    title: "Professional Website Design Service",
    description: "I'll create a stunning, responsive website for your business or personal brand. Includes 5 pages, SEO optimization, and 1 month of free support. Portfolio available upon request. Fast turnaround.",
    price: "450.00",
    category: "Services",
    type: "service",
    condition: "New",
    location: "Nationwide",
    pickupAvailable: false,
    shippingAvailable: false,
    shippingFee: 0,
    freeShipping: false,
  },
  {
    title: "Garden Maintenance & Landscaping",
    description: "Professional garden services including lawn mowing, hedge trimming, weeding, and planting. Servicing Auckland area. Weekly, fortnightly, or one-off visits available. Free quotes provided.",
    price: "45.00",
    category: "Services",
    type: "service",
    condition: "New",
    location: "Auckland",
    pickupAvailable: false,
    shippingAvailable: false,
    shippingFee: 0,
    freeShipping: false,
  },
  {
    title: "Photography Session - Portrait/Event",
    description: "Professional photographer available for portraits, events, and product photography. 2-hour session with edited high-resolution photos. Auckland-based but can travel NZ-wide.",
    price: "250.00",
    category: "Services",
    type: "service",
    condition: "New",
    location: "Auckland",
    pickupAvailable: false,
    shippingAvailable: false,
    shippingFee: 0,
    freeShipping: false,
  },
];

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    if (!isAdminEmail(decodedToken.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const expiresAt = new Date(Date.now() + 30 * 86400000); // 30 days from now
    const sellerEmail = decodedToken.email || "admin@skydrop.co.nz";
    const sellerUsername = sellerEmail.split("@")[0];

    const createdListings = [];
    
    for (const listing of realisticListings) {
      const docRef = await getAdminDb().collection("listings").add({
        ...listing,
        status: "live",
        saleType: "buy_now",
        acceptOffers: true,
        paymentType: "contact",
        sellerEmail,
        sellerUsername,
        sellerId: decodedToken.uid || "admin",
        views: Math.floor(Math.random() * 50) + 10,
        bidCount: 0,
        images: [],
        imageUrl: "",
        createdAt: now,
        expiresAt,
        pricingType: "fixed",
      });
      createdListings.push({ id: docRef.id, title: listing.title });
    }

    return NextResponse.json({ 
      success: true, 
      created: createdListings.length,
      listings: createdListings 
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
