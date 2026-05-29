import { NextResponse } from "next/server";
import { getAdminDb } from "../../lib/firebase-admin";

const sellers = [
  { email: "seller1@skydrop.nz", name: "TechTrader", uid: "seed_s1" },
  { email: "seller2@skydrop.nz", name: "KiwiCollector", uid: "seed_s2" },
  { email: "seller3@skydrop.nz", name: "DesignStudio", uid: "seed_s3" },
];

const listings = [
  { type: "physical", title: "Sony WH-1000XM5 Headphones", price: "499", description: "Premium noise-cancelling headphones. Used twice, like new condition. Comes with original case, cable and USB-C charger.", condition: "Used - Like New", category: "Tech", location: "Auckland", pickupAvailable: true, shippingAvailable: true, shippingFee: 12, freeShipping: false, stockQuantity: 1, saleType: "buy_now" },
  { type: "physical", title: "Nintendo Switch OLED - White", price: "549", description: "Barely used Nintendo Switch OLED. White colourway. Includes dock, Joy-Cons, and original box. 3 games included.", condition: "Used - Like New", category: "Gaming", location: "Wellington", pickupAvailable: true, shippingAvailable: true, shippingFee: 8, freeShipping: false, stockQuantity: 1, saleType: "buy_now", acceptOffers: true },
  { type: "physical", title: "Mountain Bike - Giant Talon 1", price: "1200", description: "Giant Talon 1 hardtail mountain bike. 29\" wheels, hydraulic disc brakes. Great condition, regularly serviced.", condition: "Used - Good", category: "Sports", location: "Christchurch", pickupAvailable: true, shippingAvailable: false, stockQuantity: 1, saleType: "buy_now", acceptOffers: true },
  { type: "digital", title: "Premium Resume Template Pack", price: "19", description: "5 professionally designed resume templates. ATS-friendly. Instant download.", category: "Templates & Assets", saleType: "buy_now" },
  { type: "digital", title: "Lightroom Preset Pack - Urban Collection", price: "29", description: "25 premium Lightroom presets for urban photography. Instant download.", category: "Art & Photography", saleType: "buy_now" },
  { type: "service", title: "Professional Website Development", price: "", description: "Custom website with Next.js or React. Responsive, SEO optimised.", category: "Design & Development", serviceDuration: "2-4 weeks", saleType: "buy_now" },
  { type: "service", title: "Logo Design & Brand Identity", price: "350", description: "Complete brand identity package. 3 rounds of revisions.", category: "Design & Creative", serviceDuration: "5-7 days", saleType: "buy_now" },
  { type: "rental", title: "Canon EOS R5 Camera Kit", price: "80", description: "Full-frame mirrorless camera kit with 24-105mm f/4 lens.", condition: "Used - Like New", category: "Tech", location: "Auckland", pickupAvailable: true, shippingAvailable: false, stockQuantity: 1, rentalPriceWeekly: 420, rentalPriceMonthly: 1400, rentalDeposit: 500, saleType: "buy_now" },
  { type: "rental", title: "Mountain Bike - Norco Fluid FS", price: "60", description: "Full suspension mountain bike. Helmet included.", condition: "Used - Good", category: "Sports", location: "Rotorua", pickupAvailable: true, shippingAvailable: false, stockQuantity: 1, rentalPriceWeekly: 300, rentalPriceMonthly: 900, rentalDeposit: 400, saleType: "buy_now" },
  { type: "event", title: "Laneway Festival - Weekend Pass", price: "249", description: "Weekend pass. Two days of live music across 4 stages.", category: "Festivals", location: "Auckland", eventDate: "2026-02-15", eventTime: "10:00 AM", venue: "Western Springs", ticketQuantity: 2, stockQuantity: 2, ticketType: "Weekend Pass", saleType: "buy_now" },
  { type: "event", title: "All Blacks vs Wallabies - Eden Park", price: "120", description: "2 tickets to the Bledisloe Cup. North Stand.", category: "Sports", location: "Auckland", eventDate: "2026-08-10", eventTime: "7:00 PM", venue: "Eden Park", ticketQuantity: 2, stockQuantity: 2, ticketType: "General Admission", saleType: "buy_now" },
  { type: "vehicle", title: "2021 Toyota Corolla Hybrid", price: "28500", description: "2021 Toyota Corolla Hybrid Limited. 45,000km, one owner.", condition: "Used - Like New", category: "Cars", location: "Auckland", pickupAvailable: true, shippingAvailable: false, stockQuantity: 1, saleType: "buy_now", vehicleMake: "Toyota", vehicleModel: "Corolla Hybrid", vehicleYear: 2021, vehicleOdometer: 45000, vehicleFuelType: "Hybrid", vehicleTransmission: "Automatic", vehicleBodyType: "Sedan", vehicleColour: "Silver" },
  { type: "vehicle", title: "2019 Ford Ranger XLT", price: "42000", description: "2019 Ford Ranger XLT 4x4 Double Cab. 68,000km.", condition: "Used - Good", category: "Cars", location: "Christchurch", pickupAvailable: true, shippingAvailable: false, stockQuantity: 1, saleType: "buy_now", acceptOffers: true, vehicleMake: "Ford", vehicleModel: "Ranger XLT", vehicleYear: 2019, vehicleOdometer: 68000, vehicleFuelType: "Diesel", vehicleTransmission: "Automatic", vehicleBodyType: "Ute", vehicleColour: "White" },
  { type: "job", title: "Senior React Developer", price: "130000", description: "Senior React developer. Remote-friendly, NZ-based.", category: "IT & Tech", location: "Remote NZ", jobCompany: "TechWorks NZ", jobEmploymentType: "Full-time", salaryMin: 110000, salaryMax: 130000, saleType: "buy_now" },
  { type: "job", title: "Graphic Designer - Part Time", price: "45000", description: "Part-time graphic designer. 20 hrs/week.", category: "Design & Creative", location: "Auckland", jobCompany: "Pixel Studio", jobEmploymentType: "Part-time", salaryMin: 40000, salaryMax: 50000, saleType: "buy_now" },
  { type: "property", title: "Modern 3-Bed Townhouse - Mt Eden", price: "925000", description: "Modern townhouse. Open plan, double glazing, built 2021.", condition: "New", category: "Houses", location: "Auckland", pickupAvailable: true, shippingAvailable: false, saleType: "buy_now", acceptOffers: true, propertyType: "Townhouse", bedrooms: 3, bathrooms: 2, landArea: 250, floorArea: 140, parking: 2 },
  { type: "property", title: "Apartment - Wellington CBD", price: "550000", description: "1-bedroom apartment. Great views, secure parking.", condition: "Used - Good", category: "Houses", location: "Wellington", pickupAvailable: true, shippingAvailable: false, saleType: "buy_now", propertyType: "Apartment", bedrooms: 1, bathrooms: 1, floorArea: 55, parking: 1 },
];

export async function GET() {
  try {
    const results: string[] = [];
    const now = Date.now();

    for (const s of sellers) {
      await getAdminDb().collection("profiles").doc(s.uid).set({
        email: s.email, username: s.name, displayName: s.name,
        createdAt: new Date(),
      }, { merge: true });
      results.push(`Seller: ${s.name}`);
    }

    let i = 0;
    for (const data of listings) {
      i++;
      const seller = sellers[i % sellers.length];
      const expiresAt = new Date(now + 60 * 86400000);
      const createdAt = new Date(now - (listings.length - i) * 3600000);
      await getAdminDb().collection("listings").add({
        ...data,
        sellerEmail: seller.email,
        sellerUsername: seller.name,
        sellerId: seller.uid,
        createdAt,
        expiresAt,
        status: "live",
        views: Math.floor(Math.random() * 200),
        images: [],
      });
      results.push(`[${data.type}] ${data.title}`);
    }

    return NextResponse.json({ ok: true, count: listings.length, sellers: sellers.length });
  } catch (e: any) {
    console.error("Seed error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
