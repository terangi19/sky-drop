import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const digital = readFileSync(join(root, "app/digital/page.tsx"), "utf8");

function clone(base, rules) {
  let s = base;
  for (const [from, to] of rules) {
    s = s.split(from).join(to);
  }
  return s;
}

const services = clone(digital, [
  ["DigitalPage", "ServicesPage"],
  ["digitalSearchText", "serviceSearchText"],
  ["digitalRecentlyViewed", "serviceRecentlyViewed"],
  ['where("type", "==", "digital")', 'where("type", "==", "service")'],
  ["type=digital", "type=service"],
  ["digital listing", "service listing"],
  ["digital listings", "service listings"],
  ["Failed to load digital", "Failed to load services"],
  ["Digital Store", "Services"],
  ["Digital Marketplace", "Service Marketplace"],
  ["Digital Listings", "Service Listings"],
  ["Digital products", "Services"],
  ["digital product", "service"],
  ["📥 Digital", "🤝 Service"],
  ["Curated Collection", "Freelance Services"],
  [
    'const CATEGORIES = [\n  "All",\n  "Templates & Assets",\n  "E-books & Guides",\n  "Art & Photography",\n  "Software & Audio",\n  "Gaming & 3D",\n];',
    `const CATEGORIES = [\n  "All",\n  "Web Development",\n  "Design & Creative",\n  "Writing & Translation",\n  "Video & Animation",\n  "Music & Audio",\n  "Consulting",\n  "Photography",\n  "Tutoring",\n];`,
  ],
  [
    "Browse templates, software, design assets, e-books, and creative tools — delivered directly to you on purchase.",
    "Hire talented freelancers for web development, design, writing, video, music, and more. Discuss scope in messages and pay securely.",
  ],
  ["Create Listing", "Offer a Service"],
  ["Browse & Buy", "Browse & Choose"],
  [
    "Find a digital product you need and click Buy Now to purchase instantly.",
    "Find a service you need and check the price and delivery time.",
  ],
  ["Seller Delivers", "Discuss Scope"],
  [
    "The seller sends files, access details, or license keys through the chat.",
    "Message the seller to agree on details, timeline, and price.",
  ],
  ["Instant Download", "Agree & Pay"],
  [
    "Digital items are delivered instantly upon payment confirmation.",
    "Send an offer or accept the price. Pay securely through Stripe.",
  ],
  ["Pay Securely", "Service Delivered"],
  [
    "Checkout is handled securely through Stripe with buyer protection included.",
    "Seller completes the work. You mark complete and funds are released.",
  ],
  ['placeholder="Search title, category..."', 'placeholder="Search services, skills, location..."'],
  ["No digital listings yet", "No services listed yet"],
  ["Be the first to list a digital product.", "Be the first to offer a service."],
  ["r.type === \"digital\"", "r.type === \"service\""],
  ["r.type !== \"digital\"", "r.type !== \"service\""],
]);

const rentals = clone(digital, [
  ["DigitalPage", "RentalsPage"],
  ["digitalSearchText", "rentalSearchText"],
  ["digitalRecentlyViewed", "rentalRecentlyViewed"],
  ['where("type", "==", "digital")', 'where("type", "==", "rental")'],
  ["type=digital", "type=rental"],
  ["digital listing", "rental listing"],
  ["digital listings", "rental listings"],
  ["Failed to load digital", "Failed to load rentals"],
  ["Digital Store", "Rentals"],
  ["Digital Marketplace", "Rental Marketplace"],
  ["Digital Listings", "Rental Listings"],
  ["Digital products", "Rentals"],
  ["digital product", "rental"],
  ["📥 Digital", "🔑 Rental"],
  ["Curated Collection", "Rentals"],
  ['const CATEGORIES = [\n  "All",\n  "Templates & Assets",\n  "E-books & Guides",\n  "Art & Photography",\n  "Software & Audio",\n  "Gaming & 3D",\n];', 'const CATEGORIES = ["All"];'],
  [
    "Browse templates, software, design assets, e-books, and creative tools — delivered directly to you on purchase.",
    "Rent tools, equipment, cameras, and more by the day. Pick up locally and return when you're done.",
  ],
  ["Create Listing", "List a Rental"],
  ["Browse & Buy", "Browse Rentals"],
  [
    "Find a digital product you need and click Buy Now to purchase instantly.",
    "Find what you need and book rental dates through the listing.",
  ],
  ["Seller Delivers", "Message Owner"],
  [
    "The seller sends files, access details, or license keys through the chat.",
    "Ask questions and arrange pickup or delivery through chat.",
  ],
  ["Instant Download", "Secure Booking"],
  [
    "Digital items are delivered instantly upon payment confirmation.",
    "Pay securely through Stripe with buyer protection included.",
  ],
  ["Pay Securely", "Return & Complete"],
  [
    "Checkout is handled securely through Stripe with buyer protection included.",
    "Return the item in good condition. Deposits are released when the rental ends.",
  ],
  ['placeholder="Search title, category..."', 'placeholder="Search rentals, equipment, location..."'],
  ["No digital listings yet", "No rentals listed yet"],
  ["Be the first to list a digital product.", "Be the first to list a rental."],
  ["r.type === \"digital\"", "r.type === \"rental\""],
  ["r.type !== \"digital\"", "r.type !== \"rental\""],
  ["violet-500", "emerald-500"],
  ["violet-400", "emerald-400"],
  ["violet-600", "emerald-600"],
  ["violet-300", "emerald-300"],
  ["from-sky-400 to-violet-400", "from-emerald-400 to-teal-400"],
  ["from-sky-500 to-violet-500", "from-emerald-500 to-teal-500"],
  ["from-sky-500 to-violet-600", "from-emerald-500 to-teal-600"],
  ["shadow-violet-500", "shadow-emerald-500"],
  ["139, 92, 246", "16, 185, 129"],
  ["rgba(14,165,233", "rgba(16,185,129"],
  ['accent="violet"', 'accent="sky"'],
]);

writeFileSync(join(root, "app/services/page.tsx"), services, "utf8");
writeFileSync(join(root, "app/rentals/page.tsx"), rentals, "utf8");
console.log(`services: ${services.split(/\r?\n/).length} lines`);
console.log(`rentals: ${rentals.split(/\r?\n/).length} lines`);
