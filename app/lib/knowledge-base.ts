export type KnowledgeDoc = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  keywords: string[];
  priority: number;
  updatedAt: number;
};

export type KnowledgeCategory = {
  id: string;
  label: string;
  icon: string;
};

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  { id: "payments", label: "Payments", icon: "💰" },
  { id: "selling", label: "Selling", icon: "📦" },
  { id: "buying", label: "Buying", icon: "🛒" },
  { id: "services", label: "Services", icon: "🛠️" },
  { id: "rentals", label: "Rentals", icon: "🔑" },
  { id: "vehicles", label: "Vehicles", icon: "🚗" },
  { id: "safety", label: "Safety", icon: "🛡️" },
  { id: "account", label: "Account", icon: "👤" },
  { id: "general", label: "General", icon: "📖" },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

export function matchKnowledge(query: string, docs: KnowledgeDoc[]): KnowledgeDoc[] {
  const q = normalize(query);
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const scored: { doc: KnowledgeDoc; score: number }[] = [];

  for (const doc of docs) {
    let score = 0;
    const title = normalize(doc.title);
    const content = normalize(doc.content);
    const allTags = [...doc.tags, ...doc.keywords, doc.category].map(normalize);

    for (const word of words) {
      if (title.includes(word)) score += 10;
      if (allTags.some((t) => t.includes(word))) score += 5;
      if (content.includes(word)) score += 2;
    }

    if (score > 0) scored.push({ doc, score: score + (doc.priority || 0) });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.doc);
}

export const SEED_KNOWLEDGE: Omit<KnowledgeDoc, "id">[] = [
  {
    title: "Card Checkout payments",
    content: "Stripe Checkout lets buyers pay instantly by card. The seller must connect a payout account in Profile → Payment settings. When a buyer clicks Buy Now, they go to secure card checkout. After payment, funds go directly to the seller's connected payout account — Sky Drop never holds the money. A $1 buyer protection fee is added at checkout. Standard Stripe processing fees apply. For Arrange Purchase listings, payment is agreed in Messages (bank transfer, cash, etc.) with no Stripe fees.",
    category: "payments",
    tags: ["stripe", "checkout", "card", "credit card", "pay", "payment", "buy now"],
    keywords: ["card checkout", "card payment", "buy now", "pay online", "payout account"],
    priority: 10,
    updatedAt: Date.now(),
  },
  {
    title: "Arrange Purchase (bank transfer / cash)",
    content: "Arrange Purchase lets buyers and sellers agree payment off-platform (bank transfer, cash, pickup). The buyer taps 'Purchase' on the listing, which marks it as sold and opens a chat in Messages. The seller can save their bank account name and number in Profile → Payment settings. When saved, the buyer sees bank details in Messages with copy buttons. There are no card fees, no payout account required, and no dispute protection for Arrange purchases. This is best for local pickup, large items, or when buyer and seller already trust each other.",
    category: "payments",
    tags: ["arrange", "bank transfer", "cash", "pickup", "off-platform", "bank deposit"],
    keywords: ["arrange purchase", "bank transfer", "pay by bank", "cash payment", "local pickup"],
    priority: 10,
    updatedAt: Date.now(),
  },
  {
    title: "Creating a listing",
    content: "All listings are created on /post/ai. You pick the type: Physical, Digital, Service, Rental, or Vehicle. Upload photos for physical and vehicle items (optional for digital and service). Digital items also need a file upload on the form. Set a price in NZD, choose condition (New, Used - Like New, Used - Good, Used - Fair), select payment type (Card Checkout or Arrange Purchase), and choose listing duration (7, 14, or 30 days). Non-KYC sellers start at a $200 price cap that unlocks with positive reviews. KYC-approved sellers start at $5,000.",
    category: "selling",
    tags: ["create listing", "sell", "post", "list item", "new listing", "listing type"],
    keywords: ["how to sell", "create a listing", "post an item", "list something", "sell on sky drop"],
    priority: 10,
    updatedAt: Date.now(),
  },
  {
    title: "Digital products",
    content: "Digital products are items like templates, ebooks, art, software, audio files, and gaming assets. They use listing type 'digital'. When creating a digital listing on /post/ai, select 'Digital' as the type. Digital categories include: Templates & Assets, E-books & Guides, Art & Photography, Software & Audio, Gaming & 3D. You must upload the digital file on the Sell form before publishing. Buyers get instant download after purchase via Card Checkout. Digital products use 'stripe' payment type by default.",
    category: "selling",
    tags: ["digital", "download", "file", "template", "ebook", "software", "audio"],
    keywords: ["digital product", "sell digital", "digital download", "upload file", "instant delivery"],
    priority: 8,
    updatedAt: Date.now(),
  },
  {
    title: "Services on Sky Drop",
    content: "Services use a messaging-first flow. Buyers browse /services and find a listing. When they click 'Request Quote' or 'Hire', a conversation opens between buyer and seller. They discuss scope, pricing, and timeline in Messages. For fixed-price services, the seller sends an offer and the buyer pays via Card Checkout. For request-quote services, the seller sends a formal quote and the buyer accepts and pays. After payment, the service status follows: Pending → In Progress → Completed → Confirmed. The buyer confirms completion to release payment. Reviews can be left after completion.",
    category: "services",
    tags: ["service", "hire", "freelance", "quote", "request quote", "scope"],
    keywords: ["hire a freelancer", "service inquiry", "request a quote", "book a service"],
    priority: 8,
    updatedAt: Date.now(),
  },
  {
    title: "Rentals on Sky Drop",
    content: "Rental listings show daily, weekly, and monthly rates plus a refundable deposit. The buyer clicks 'Rent Now' and can message the seller to arrange booking dates. Payment can be via Card Checkout or Arrange Purchase depending on what the seller enabled. The buyer pays the rental fee plus a deposit. The deposit is refunded after the item is returned in good condition. Rental status tracking: Booked → Active → Returned → Completed. The seller inspects the return and confirms before the deposit is released.",
    category: "rentals",
    tags: ["rental", "rent", "hire", "deposit", "return", "booking", "daily rate"],
    keywords: ["rent an item", "rental booking", "deposit refund", "rent equipment", "hire gear"],
    priority: 8,
    updatedAt: Date.now(),
  },
  {
    title: "Vehicle listings",
    content: "Vehicle listings use listing type 'vehicle' and category 'Cars'. The sell form includes extra fields: make, model, year, odometer (km), colour, body type (SUV, Sedan, Hatchback, Wagon, Coupe, Convertible, Ute, Van, Truck, Motorcycle, Other), fuel type (Petrol, Diesel, Electric, Hybrid, Plug-in Hybrid, Other), and transmission (Automatic, Manual, Other). When using Āwhina to fill a vehicle listing, always include all vehicle detail fields. Prices should be in NZD and reflect the NZ second-hand market. Odometer must be in kilometres, not miles.",
    category: "vehicles",
    tags: ["vehicle", "car", "bike", "boat", "motorcycle", "4x4", "ute", "van"],
    keywords: ["sell a car", "list a vehicle", "car listing", "vehicle details", "motorcycle listing"],
    priority: 8,
    updatedAt: Date.now(),
  },
  {
    title: "Buying an item (Card Checkout)",
    content: "When you click Buy Now on a Stripe Checkout listing, you go to a secure checkout page where you enter your card details. A $1 buyer protection fee is added. After payment, the order appears in Purchases with status 'Pending'. The seller confirms the order → 'Confirmed'. The seller marks as shipped → 'Shipped'. You receive the item, inspect it, and confirm delivery → 'Delivered'. You can then leave a review. If you don't confirm delivery within 7 days, it auto-confirms. You can open a dispute within 7 days of delivery for Stripe Checkout purchases. For Arrange Purchase, payment is agreed directly in Messages and no Stripe checkout is involved.",
    category: "buying",
    tags: ["buy", "purchase", "order", "checkout", "stripe", "card", "shipping"],
    keywords: ["how to buy", "make a purchase", "buy an item", "checkout process", "order status"],
    priority: 9,
    updatedAt: Date.now(),
  },
  {
    title: "Disputes",
    content: "Card Checkout: open a dispute from Purchases within 7 days of delivery. Admins review your Sky Drop Messages history (not SMS, WhatsApp, or email) and can issue refunds from the seller's connected payout account for valid claims. Arrange Purchase: report via Reports with chat evidence — Sky Drop can't process refunds through the platform, but we'll investigate and do our best to help you recover your money. To open a Card Checkout dispute: Purchases → Dispute → pick a reason (Item not received, Not as described, Damaged, Wrong item, Digital issue, Service issue, Other) and describe the issue.",
    category: "buying",
    tags: ["dispute", "refund", "return", "issue", "problem", "complaint", "resolution"],
    keywords: ["open a dispute", "request a refund", "item not received", "damaged item", "wrong item"],
    priority: 9,
    updatedAt: Date.now(),
  },
  {
    title: "Safety and staying protected",
    content: "Always keep communication and deals inside Sky Drop Messages. This provides evidence if there's a dispute. Never pay outside Sky Drop — if a seller asks for bank transfer, gift cards, or crypto outside the platform, report them immediately. For pickups, meet in public places during daylight and bring a friend. Report suspicious listings or users from the listing page or seller profile. Block users from their profile page if they harass you. Sky Drop automatically flags scam language, unrealistic prices, and duplicate listings for admin review.",
    category: "safety",
    tags: ["safety", "scam", "report", "block", "secure", "protect", "warning"],
    keywords: ["stay safe", "avoid scams", "report a user", "block a user", "safe trading"],
    priority: 9,
    updatedAt: Date.now(),
  },
  {
    title: "Account and profile settings",
    content: "Your profile is at /profile. You can edit your bio (max 300 chars), username (unique @handle), and region (NZ region picker). Your avatar defaults to your first initial — click it to upload a new photo. ID verification (KYC) is required to sell. Email verification is required to buy. You can optionally verify your phone number on Profile for a verified seller badge. Connect connected payout account in Profile → Payment settings to receive card payments. Save bank account name and number for Arrange Purchase payments. Notification preferences can be managed from Profile settings.",
    category: "account",
    tags: ["account", "profile", "settings", "avatar", "username", "bio", "verification"],
    keywords: ["edit profile", "change username", "verify account", "notification settings", "bank details"],
    priority: 7,
    updatedAt: Date.now(),
  },
  {
    title: "Reviews and ratings",
    content: "Only verified buyers who completed a Card Checkout purchase can leave a review. The review prompt appears after delivery is confirmed. Reviews are 1-5 stars with optional text. They appear on seller profiles and listing pages. The seller rating shows as an average with count (e.g. ★ 4.2 · 15 reviews). If there are no reviews yet, it shows 'No reviews'. Reviews cannot be edited after submission. Higher ratings improve seller trust signals.",
    category: "general",
    tags: ["review", "rating", "feedback", "star", "review seller"],
    keywords: ["leave a review", "seller rating", "rate a seller", "feedback", "reviews"],
    priority: 6,
    updatedAt: Date.now(),
  },
  {
    title: "Seller limits and verification",
    content: "Price caps increase with positive reviews. Non-KYC sellers start at $200 — $1,000 after 3 positive reviews, $5,000 after 10, unlimited after 25. KYC-approved sellers start at $5,000 — unlimited after 10 positive reviews. ID verification (KYC) is required to sell. Listing moderation automatically checks for scam language, suspicious prices, and duplicate listings.",
    category: "selling",
    tags: ["seller limit", "verification", "badge", "trust", "new seller"],
    keywords: ["seller limits", "verified seller", "listing limit", "become verified", "seller badge"],
    priority: 7,
    updatedAt: Date.now(),
  },
  {
    title: "Messages and communication",
    content: "All messaging is done through Sky Drop Messages, accessible from the inbox icon in the navbar. Conversations are linked to listings so both parties have context. You can send text messages and share contact information. Messages are used as evidence in disputes. You can report users from the seller profile page and block users who harass you. Always keep communication on-platform — off-platform messages (SMS, WhatsApp, email) cannot be used in dispute evidence.",
    category: "general",
    tags: ["messages", "chat", "communication", "inbox", "conversation"],
    keywords: ["send a message", "how to message", "chat with seller", "messaging", "inbox"],
    priority: 6,
    updatedAt: Date.now(),
  },
  {
    title: "Watchlist",
    content: "The watchlist lets you save listings to check later. Tap the heart icon on any listing to add it. Your watchlist is at /watchlist where you can search, sort by newest/oldest/price, and remove items. You can also clear the entire watchlist. Saved items show price drops if the seller reduces the price. The watchlist syncs across devices when you're logged in.",
    category: "general",
    tags: ["watchlist", "save", "favorite", "heart", "bookmark"],
    keywords: ["watchlist", "saved items", "favorites", "bookmark listing", "save for later"],
    priority: 5,
    updatedAt: Date.now(),
  },
  {
    title: "About Sky Drop — who we are",
    content: "Sky Drop is a New Zealand-owned community marketplace (skydrop.co.nz) for Kiwis to buy and sell locally and nationwide. Not an auction site — sellers list at a clear NZD price. How it works: browse → message seller → buy (Stripe Checkout or Arrange Purchase) → leave a review. Mission: simple, safe, modern marketplace; fees shown upfront at checkout. Stripe Checkout: card payment, $1 buyer protection fee, disputes within 7 days. Arrange Purchase: agree payment in Messages (bank/cash/pickup), no Stripe processing fees; ID-verified sellers — buyers can email support@skydrop.co.nz if item doesn't arrive. Also covers moderation, messaging safety, NZ-owned, built-in Messages, reviews, watchlist, and Āwhina. Full overview: /about. Questions: support@skydrop.co.nz.",
    category: "general",
    tags: ["about", "who", "created", "founder", "built", "sky drop", "company", "mission"],
    keywords: ["who created sky drop", "who made sky drop", "who built sky drop", "who owns sky drop", "about sky drop", "what is sky drop"],
    priority: 10,
    updatedAt: Date.now(),
  },
  {
    title: "Fees and costs",
    content: "Listing on Sky Drop is free. Optional paid boost costs $5 for ~7 days of top search placement. For Stripe Checkout purchases, standard Stripe processing fees apply and a $1 buyer protection fee is added. Arrange Purchase transactions have no Stripe processing fees — payment is agreed directly in Messages. There are no monthly subscription fees or membership costs.",
    category: "general",
    tags: ["fee", "cost", "price", "boost", "listing fee", "commission"],
    keywords: ["how much does it cost", "fees", "listing fees", "boost cost", "processing fee"],
    priority: 7,
    updatedAt: Date.now(),
  },
  {
    title: "Digital Store page (/digital)",
    content: "The Digital Store is for download-ready products: templates, ebooks, software, design assets, and audio. Browse at /digital, search by keyword, and open a listing to see price and details. After Card Checkout, the seller delivers the file through Messages. This page is for shopping — to sell a digital product, use Sell in the navbar.",
    category: "buying",
    tags: ["digital", "digital store", "download", "browse digital", "page help"],
    keywords: ["what is digital store", "digital page", "browse digital", "buy digital download"],
    priority: 8,
    updatedAt: Date.now(),
  },
  {
    title: "My Listings page (/list-list)",
    content: "My Listings is your seller dashboard at /list-list. Active shows live posts; Sold shows completed sales. You can search your posts, edit a listing, boost visibility, or delete. Counts at the top show total, active, and sold. Use Sell in the navbar when you want to create a new listing.",
    category: "account",
    tags: ["my listings", "list-list", "seller dashboard", "manage listings"],
    keywords: ["my listings page", "manage my listings", "seller hub", "list-list help"],
    priority: 8,
    updatedAt: Date.now(),
  },
  {
    title: "Purchases and Sales pages",
    content: "My Purchases (/purchases) lists everything you've bought — track status, message sellers, and open disputes if needed. Sales (/sales) lists orders from buyers on your listings — mark shipped or delivered and message from each order card. Both pages have search and status filters.",
    category: "account",
    tags: ["purchases", "sales", "orders", "buyer", "seller orders"],
    keywords: ["my purchases page", "sales page", "track order", "where are my orders"],
    priority: 8,
    updatedAt: Date.now(),
  },
];
