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
    title: "V1 messaging-first buying",
    content: "Sky Drop V1 is messaging-first. Browse a listing, tap Message Seller, and arrange payment, pickup or delivery directly in chat. Message the seller and arrange the purchase directly — Sky Drop does not process marketplace checkout, hold funds, or provide escrow. Prefer verified sellers, meet in a public place for physical items, and verify the item before paying. Keep agreements in Messages for a clear record. Safety tips: /buyer-protection (Stay Safe).",
    category: "payments",
    tags: ["message seller", "arrange", "v1", "pickup", "meet", "messaging"],
    keywords: ["message seller", "how to buy", "arrange purchase", "pay outside", "pickup"],
    priority: 11,
    updatedAt: Date.now(),
  },
  {
    title: "Historical card checkout orders",
    content: "Past card-checkout orders may still appear in Purchases and Sales. Those flows are not how new marketplace deals work in V1. For new purchases, message the seller and arrange payment in chat. Optional paid upgrades (such as listing boosts) may still use a payment processor and show the fee before you pay.",
    category: "payments",
    tags: ["stripe", "checkout", "card", "historical", "past order"],
    keywords: ["card checkout", "card payment", "past order", "historical purchase"],
    priority: 4,
    updatedAt: Date.now(),
  },
  {
    title: "Arrange Purchase (bank transfer / cash)",
    content: "Message Seller lets buyers and sellers agree payment off-platform (bank transfer, cash, pickup). This is the primary V1 buying path. Agree terms in Messages. Prefer meeting in a public place and verifying the item before paying. There are no platform checkout fees and no escrow. Keep communication on Sky Drop so there is a record if something goes wrong.",
    category: "payments",
    tags: ["arrange", "bank transfer", "cash", "pickup", "off-platform", "bank deposit"],
    keywords: ["arrange purchase", "bank transfer", "pay by bank", "cash payment", "local pickup"],
    priority: 10,
    updatedAt: Date.now(),
  },
  {
    title: "Creating a listing",
    content: "All listings are created on /post/ai. You pick the type: Physical, Digital, Service, Rental, or Vehicle. Upload photos for physical and vehicle items (optional for digital and service). Digital items also need a file upload on the form. Set a price in NZD, choose condition (New, Used - Like New, Used - Good, Used - Fair), and choose listing duration (7, 14, or 30 days). Buyers message you to arrange the purchase. Non-KYC sellers start at a $200 price cap that unlocks with positive reviews. KYC-approved sellers start at $5,000.",
    category: "selling",
    tags: ["create listing", "sell", "post", "list item", "new listing", "listing type"],
    keywords: ["how to sell", "create a listing", "post an item", "list something", "sell on sky drop"],
    priority: 10,
    updatedAt: Date.now(),
  },
  {
    title: "Digital products",
    content: "Digital products are items like templates, ebooks, art, software, audio files, and gaming assets. They use listing type 'digital'. When creating a digital listing on /post/ai, select 'Digital' as the type. Digital categories include: Templates & Assets, E-books & Guides, Art & Photography, Software & Audio, Gaming & 3D. You must upload the digital file on the Sell form before publishing. Buyers message you to arrange purchase and delivery of the file. This page is for shopping — to sell a digital product, use Sell in the navbar.",
    category: "selling",
    tags: ["digital", "download", "file", "template", "ebook", "software", "audio"],
    keywords: ["digital product", "sell digital", "digital download", "upload file", "instant delivery"],
    priority: 8,
    updatedAt: Date.now(),
  },
  {
    title: "Services on Sky Drop",
    content: "Services use a messaging-first flow. Buyers browse /services and find a listing. When they click 'Request Quote' or 'Hire', a conversation opens between buyer and seller. They discuss scope, pricing, timeline, and payment in Messages. After the work is done, leave a review where supported.",
    category: "services",
    tags: ["service", "hire", "freelance", "quote", "request quote", "scope"],
    keywords: ["hire a freelancer", "service inquiry", "request a quote", "book a service"],
    priority: 8,
    updatedAt: Date.now(),
  },
  {
    title: "Rentals on Sky Drop",
    content: "Rental listings show daily, weekly, and monthly rates plus a refundable deposit. The buyer messages the seller to arrange booking dates, deposit, and payment. Deposit handling is agreed between buyer and seller. Browse at /rentals.",
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
    title: "Buying an item",
    content: "Message Seller is the primary way to buy — agree payment and pickup in chat. Message the seller and arrange the purchase directly. Reviews are available after a completed transaction where supported. Prefer verified sellers; meet in public; verify before paying.",
    category: "buying",
    tags: ["buy", "purchase", "order", "message seller", "arrange"],
    keywords: ["how to buy", "make a purchase", "buy an item", "order status", "message seller"],
    priority: 9,
    updatedAt: Date.now(),
  },
  {
    title: "Disputes and reports",
    content: "Sky Drop does not provide escrow or guaranteed refunds for chat-arranged deals. Report problems via Reports with your Sky Drop Messages history — we may investigate and take action against accounts that violate the rules. Prefer ID-verified sellers. Past card-checkout orders may still have historical dispute options in Purchases.",
    category: "buying",
    tags: ["dispute", "refund", "return", "issue", "problem", "complaint", "resolution", "report"],
    keywords: ["open a dispute", "request a refund", "item not received", "damaged item", "wrong item", "report"],
    priority: 9,
    updatedAt: Date.now(),
  },
  {
    title: "Safety and staying protected",
    content: "Always keep agreements inside Sky Drop Messages so there is a record. Prefer verified sellers. Meet in public during daylight and bring a friend for pickups. Verify the item before paying. Report suspicious listings or users from the listing page or seller profile. Block users from their profile page if they harass you. Full tips: /buyer-protection (Stay Safe).",
    category: "safety",
    tags: ["safety", "scam", "report", "block", "secure", "protect", "warning", "stay safe"],
    keywords: ["stay safe", "avoid scams", "report a user", "block a user", "safe trading"],
    priority: 9,
    updatedAt: Date.now(),
  },
  {
    title: "Account and profile settings",
    content: "Your profile is at /profile. You can edit your bio (max 300 chars), username (unique @handle), and region (NZ region picker). Your avatar defaults to your first initial — click it to upload a new photo. ID verification (KYC) is required to sell. Email verification is required to buy. You can optionally verify your phone number on Profile for a verified seller badge. Optionally save bank account name and number for arranging payment in Messages. Notification preferences can be managed from Profile settings.",
    category: "account",
    tags: ["account", "profile", "settings", "avatar", "username", "bio", "verification"],
    keywords: ["edit profile", "change username", "verify account", "notification settings", "bank details"],
    priority: 7,
    updatedAt: Date.now(),
  },
  {
    title: "Reviews and ratings",
    content: "Reviews use the completed-transaction model. After a deal is completed where supported, the buyer and seller may each leave one review. Unauthorized users, duplicate reviews, self-reviews, and unrelated parties are rejected. Reviews are 1-5 stars with optional text. They appear on seller profiles. Reviews cannot be edited after submission.",
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
    content: "All messaging is done through Sky Drop Messages, accessible from the inbox icon in the navbar. Conversations are linked to listings so both parties have context. You can send text messages and share contact information. Messages are used as evidence in reports. You can report users from the seller profile page and block users who harass you. Keep agreements on-platform for a clear record.",
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
    content: "Sky Drop is a New Zealand-owned community marketplace (skydrop.co.nz) for Kiwis to buy and sell locally and nationwide. Not an auction site — sellers list at a clear NZD price. How it works in V1: browse → Message Seller → agree payment/pickup in chat → leave a review after a completed transaction where supported. Mission: simple, safe, modern marketplace. Message the seller and arrange the purchase directly. Prefer ID-verified sellers. Full overview: /about. Questions: support@skydrop.co.nz.",
    category: "general",
    tags: ["about", "who", "created", "founder", "built", "sky drop", "company", "mission"],
    keywords: ["who created sky drop", "who made sky drop", "who built sky drop", "who owns sky drop", "about sky drop", "what is sky drop"],
    priority: 10,
    updatedAt: Date.now(),
  },
  {
    title: "Fees and costs",
    content: "Listing on Sky Drop is free. Optional paid boost costs $5 for ~7 days of top search placement. V1 marketplace transactions are arranged in Messages with no Sky Drop checkout fee. There are no monthly subscription fees or membership costs.",
    category: "general",
    tags: ["fee", "cost", "price", "boost", "listing fee", "commission"],
    keywords: ["how much does it cost", "fees", "listing fees", "boost cost", "processing fee"],
    priority: 7,
    updatedAt: Date.now(),
  },
  {
    title: "Digital Store page (/digital)",
    content: "The Digital Store is for download-ready products: templates, ebooks, software, design assets, and audio. Browse at /digital, search by keyword, and open a listing to see price and details. Message the seller to arrange purchase and file delivery. This page is for shopping — to sell a digital product, use Sell in the navbar.",
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
    content: "My Purchases (/purchases) lists past orders and deal history — message sellers and report issues if needed. Sales (/sales) lists activity from buyers on your listings. For new deals, Message Seller and arrange in chat. Both pages have search and status filters.",
    category: "account",
    tags: ["purchases", "sales", "orders", "buyer", "seller orders"],
    keywords: ["my purchases page", "sales page", "track order", "where are my orders"],
    priority: 8,
    updatedAt: Date.now(),
  },
];
