/**
 * Script to generate demo listings for Sky Drop
 * Run with: npx ts-node --compiler-options {\"module\":\"commonjs\"} scripts/generate-demo-listings.ts
 */

import { getAdminDb, getAdminAuth } from "../app/lib/firebase-admin";

interface DemoListing {
  title: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  location: string;
  images: string[];
  type: string;
  saleType: string;
  paymentType: string;
  pickupAvailable: boolean;
  shippingAvailable: boolean;
  isDemo: boolean;
  demoNotice: string;
}

const DEMO_LISTINGS: DemoListing[] = [
  // Vehicles
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
    title: "Mazda CX-5 GSX 2020",
    description: "Stylish and practical SUV with low kilometers. Features include reversing camera, Apple CarPlay, Android Auto, and cruise control. Economical 2.5L engine.",
    price: "28500",
    category: "Cars",
    condition: "Used",
    location: "Wellington",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Mazda+CX-5"],
    type: "vehicle",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Honda Civic Type R 2019",
    description: "Performance hatchback in stunning Championship White. Full dealer service history. Features include Brembo brakes, limited-slip differential, and Honda Sensing safety suite.",
    price: "48000",
    category: "Cars",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Civic+Type+R"],
    type: "vehicle",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Ford Ranger Wildtrak 2021",
    description: "Top-spec Ford Ranger with all the bells and whistles. Features include 3.2L diesel, automatic transmission, leather interior, and premium sound. Perfect for work and play.",
    price: "55000",
    category: "Cars",
    condition: "Used",
    location: "Hamilton",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Ford+Ranger"],
    type: "vehicle",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },

  // Electronics
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
    title: "Sony WH-1000XM5 Headphones",
    description: "Premium noise-canceling headphones in excellent condition. Includes original case, cable, and all accessories. Battery life still excellent.",
    price: "350",
    category: "Electronics",
    condition: "Used",
    location: "Christchurch",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Sony+XM5"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Samsung 65-inch QLED 4K Smart TV",
    description: "Samsung Q65B QLED TV with HDR, Smart TV features, and excellent picture quality. Perfect for gaming and movies. Includes remote and power cable.",
    price: "900",
    category: "Electronics",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Samsung+QLED"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Nintendo Switch OLED with Mario Kart",
    description: "Nintendo Switch OLED model in white. Includes console, dock, Joy-Con controllers, and Mario Kart 8 Deluxe. Excellent condition with screen protector applied.",
    price: "450",
    category: "Gaming",
    condition: "Used",
    location: "Dunedin",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Switch+OLED"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },

  // Tools & DIY
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
    title: "DeWalt Table Saw with Stand",
    description: "Heavy-duty DeWalt table saw with rolling stand. Perfect for woodworking projects. Includes blade guard and push stick. Well maintained.",
    price: "450",
    category: "Tools",
    condition: "Used",
    location: "Christchurch",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=DeWalt+Table+Saw"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Complete Tool Set - 200+ Pieces",
    description: "Comprehensive tool set including sockets, wrenches, screwdrivers, pliers, and more. All organized in a portable tool chest. Perfect for home garage.",
    price: "350",
    category: "Tools",
    condition: "Used",
    location: "Hamilton",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Tool+Set"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Milwaukee Impact Driver Kit",
    description: "Milwaukee M18 Fuel impact driver with 2 batteries and charger. Brushless motor with 4-mode drive control. Excellent condition, rarely used.",
    price: "320",
    category: "Tools",
    condition: "Used",
    location: "Wellington",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Milwaukee+Impact"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Bosch Angle Grinder 125mm",
    description: "Professional Bosch angle grinder with guard and side handle. Powerful 1100W motor. Great for metalwork and cutting. Includes extra discs.",
    price: "120",
    category: "Tools",
    condition: "Used",
    location: "Tauranga",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Bosch+Grinder"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },

  // Furniture
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
    title: "Solid Oak Dining Table with 6 Chairs",
    description: "Beautiful solid oak dining table with 6 matching chairs. Sturdy construction, minor wear. Seats 6 comfortably. Perfect for family dinners.",
    price: "650",
    category: "Furniture",
    condition: "Used",
    location: "Christchurch",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Dining+Table"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "King Size Bed Frame with Mattress",
    description: "Modern king size bed frame with comfortable mattress. Slatted base, minimal wear. Mattress is medium firm. Complete setup.",
    price: "450",
    category: "Furniture",
    condition: "Used",
    location: "Wellington",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=King+Bed"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Office Desk with Chair",
    description: "Spacious office desk with integrated cable management. Includes ergonomic office chair with lumbar support. Perfect for home office.",
    price: "280",
    category: "Furniture",
    condition: "Used",
    location: "Hamilton",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Office+Desk"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Outdoor Patio Set with Umbrella",
    description: "6-piece outdoor dining set with table, chairs, and cantilever umbrella. Weather-resistant materials. Great for summer entertaining.",
    price: "550",
    category: "Home & Garden",
    condition: "Used",
    location: "Tauranga",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Patio+Set"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },

  // Sports & Fitness
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
    title: "Home Gym Set - Weights & Bench",
    description: "Complete home gym setup including adjustable bench, Olympic barbell, and 200kg of weight plates. Squat rack included. Excellent condition.",
    price: "700",
    category: "Sports",
    condition: "Used",
    location: "Christchurch",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Home+Gym"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Surfboard - 7'6 Mini Mal",
    description: "7'6 mini mal surfboard in good condition. Perfect for beginners to intermediate surfers. Includes leash and board bag. Great for NZ beaches.",
    price: "350",
    category: "Sports",
    condition: "Used",
    location: "Wellington",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Surfboard"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Golf Clubs - Complete Set",
    description: "Full set of golf clubs including driver, woods, irons, wedges, and putter. Stand bag included. Suitable for right-handed players. Good condition.",
    price: "400",
    category: "Sports",
    condition: "Used",
    location: "Hamilton",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Golf+Clubs"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Kayak - Sit-on-top Fishing Kayak",
    description: "Fishing kayak with rod holders, storage compartments, and paddle. Stable and easy to paddle. Perfect for fishing or recreation. Includes seat.",
    price: "550",
    category: "Sports",
    condition: "Used",
    location: "Dunedin",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Fishing+Kayak"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },

  // Clothing
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
    title: "Formal Suit - Tailored Fit",
    description: "Tailored formal suit in navy blue. Size 40R. Perfect for weddings, interviews, or formal events. Includes jacket and trousers. Dry cleaned.",
    price: "150",
    category: "Clothing",
    condition: "Used",
    location: "Wellington",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Formal+Suit"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Winter Jacket - North Face",
    description: "North Face winter jacket, size M. Waterproof and warm. Perfect for NZ winters. Excellent condition, worn only a few times.",
    price: "200",
    category: "Clothing",
    condition: "Used",
    location: "Christchurch",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=North+Face+Jacket"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Running Shoes - Nike Pegasus",
    description: "Nike Pegasus running shoes, size US 10. Excellent condition, minimal wear. Great for road running. Includes original box.",
    price: "120",
    category: "Clothing",
    condition: "Used",
    location: "Hamilton",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Nike+Pegasus"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Designer Handbag - Authentic",
    description: "Authentic designer handbag in excellent condition. Comes with dust bag and authenticity card. Perfect for everyday use or special occasions.",
    price: "350",
    category: "Clothing",
    condition: "Used",
    location: "Auckland",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Designer+Handbag"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },

  // Gaming
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
    title: "Xbox Series X with Game Pass",
    description: "Xbox Series X in excellent condition. Includes 1 controller and 3 months Game Pass Ultimate. 1TB storage. Great for gaming.",
    price: "550",
    category: "Gaming",
    condition: "Used",
    location: "Christchurch",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Xbox+Series+X"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Gaming PC - RTX 4070",
    description: "Custom gaming PC with RTX 4070, i7 processor, 32GB RAM, 1TB NVMe SSD. Perfect for 1440p gaming. Windows 11 installed.",
    price: "2200",
    category: "Gaming",
    condition: "Used",
    location: "Wellington",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Gaming+PC"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "VR Headset - Meta Quest 3",
    description: "Meta Quest 3 VR headset with 128GB storage. Includes controllers and charging cable. Excellent condition, barely used.",
    price: "600",
    category: "Gaming",
    condition: "Used",
    location: "Hamilton",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Quest+3"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Gaming Monitor 27-inch 144Hz",
    description: "27-inch gaming monitor with 144Hz refresh rate, 1ms response time. Perfect for competitive gaming. Includes DisplayPort and HDMI cables.",
    price: "280",
    category: "Electronics",
    condition: "Used",
    location: "Tauranga",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Gaming+Monitor"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "stripe",
    pickupAvailable: true,
    shippingAvailable: true,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },

  // Home & Garden
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
  },
  {
    title: "Pressure Washer - Karcher K5",
    description: "Karcher K5 pressure washer with various attachments. Perfect for cleaning decks, driveways, and vehicles. Excellent working condition.",
    price: "280",
    category: "Home & Garden",
    condition: "Used",
    location: "Christchurch",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Pressure+Washer"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Indoor Plant Collection",
    description: "Collection of 10 indoor plants including Monstera, Snake Plant, Pothos, and more. All healthy and well-established. Pots included.",
    price: "200",
    category: "Home & Garden",
    condition: "Used",
    location: "Wellington",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Plant+Collection"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "BBQ Gas Grill - 4 Burner",
    description: "4-burner gas BBQ grill with side burner and temperature gauge. Perfect for summer barbecues. Includes gas bottle. Good condition.",
    price: "450",
    category: "Home & Garden",
    condition: "Used",
    location: "Hamilton",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=BBQ+Grill"],
    type: "physical",
    saleType: "buy_now",
    paymentType: "contact",
    pickupAvailable: true,
    shippingAvailable: false,
    isDemo: true,
    demoNotice: "This is a demonstration listing used to showcase Sky Drop while the marketplace is growing."
  },
  {
    title: "Camping Tent - 6 Person",
    description: "Spacious 6-person camping tent with waterproof rainfly. Easy to set up. Perfect for family camping trips. Includes ground sheet.",
    price: "320",
    category: "Sports",
    condition: "Used",
    location: "Dunedin",
    images: ["https://placehold.co/600x450/0ea5e9/ffffff?text=Camping+Tent"],
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
  const auth = getAdminAuth();
  const db = getAdminDb();
  
  const demoEmail = "demo@skydrop.nz";
  const demoPassword = "DemoAccount2024!";
  
  try {
    // Check if demo account already exists
    try {
      const userRecord = await auth.getUserByEmail(demoEmail);
      console.log("Demo account already exists:", demoEmail);
      return { uid: userRecord.uid, email: demoEmail };
    } catch (error: any) {
      // Account doesn't exist, create it
      if (error.code === "auth/user-not-found") {
        const userRecord = await auth.createUser({
          email: demoEmail,
          password: demoPassword,
          emailVerified: true,
          displayName: "Sky Drop Demo",
        });
        
        // Create profile
        await db.collection("profiles").doc(userRecord.uid).set({
          email: demoEmail,
          username: "skydrop-demo",
          displayName: "Sky Drop Demo",
          createdAt: new Date(),
          salesCount: 0,
          reportsCount: 0,
          kycStatus: "approved",
          restricted: false,
        });
        
        console.log("Demo account created:", demoEmail);
        return { uid: userRecord.uid, email: demoEmail };
      }
      throw error;
    }
  } catch (error: any) {
    console.error("Error creating demo account:", error);
    throw error;
  }
}

async function generateDemoListings() {
  const db = getAdminDb();
  const demoAccount = await createDemoAccount();
  
  console.log(`Generating ${DEMO_LISTINGS.length} demo listings...`);
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days from now
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const listing of DEMO_LISTINGS) {
    try {
      const listingData = {
        ...listing,
        sellerEmail: demoAccount.email,
        sellerUsername: "skydrop-demo",
        sellerId: demoAccount.uid,
        status: "live",
        views: Math.floor(Math.random() * 100) + 10, // Random view count for realism
        bidCount: 0,
        createdAt: now,
        expiresAt,
        imageUrl: listing.images[0] || "",
        visibilityRank: "normal",
      };
      
      await db.collection("listings").add(listingData);
      successCount++;
      console.log(`✓ Created: ${listing.title}`);
    } catch (error: any) {
      errorCount++;
      console.error(`✗ Failed to create: ${listing.title}`, error.message);
    }
  }
  
  console.log(`\nDemo listing generation complete:`);
  console.log(`- Success: ${successCount}`);
  console.log(`- Failed: ${errorCount}`);
  console.log(`- Demo account: ${demoAccount.email}`);
}

// Run the script
generateDemoListings()
  .then(() => {
    console.log("\n✓ Demo listings generated successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Error generating demo listings:", error);
    process.exit(1);
  });
