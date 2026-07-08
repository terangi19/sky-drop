import { AWHINA_NAME } from "./awhina-brand";



/** Shown on Quick Post (/post/ai) — listing-focused shortcuts */

export const SKY_AI_SELL_QUICK_PROMPTS: { label: string; query: string }[] = [

  { label: "🚗 Sell my car", query: "I want to sell my car — fill a complete vehicle listing from what I tell you" },

  { label: "📱 Sell an item", query: "I want to sell something — create the listing and suggest a fair NZ price" },

  { label: "🏠 List for rent", query: "I want to rent out a property or item — fill weekly rent, bond, and details" },

  { label: "🔧 List a service", query: "I offer a local service — fill the service listing with pricing" },

  { label: "💰 Price check", query: "What should I price this at in NZ? Quick sale, fair, and optimistic options" },

];



export const SKY_AI_QUICK_PROMPTS: { label: string; query: string }[] = [

  { label: "Sell something", query: "I want to sell an item — fill the listing and open the sell page for me" },

  { label: "Find listings", query: "Help me find listings on Sky Drop — what should I search or browse?" },

  { label: "Price my item", query: "Suggest quick sale, fair market, and optimistic NZD prices with reasoning" },

  { label: "Edit my listing", query: "How do I edit or update one of my listings?" },

  { label: "Why no views?", query: "My listing isn't getting views — what should I check?" },

  { label: "Safety tips", query: "Safety tips for buying and selling on Sky Drop" },

  { label: "Payments help", query: "What's the difference between Buy Now card checkout and contacting the seller?" },

  { label: "What can you do?", query: "What can you do?" },

];



export const SKY_AI_SELL_WELCOME =

  `Kia ora 👋 Describe what you're selling in one message — I'll fill the whole form.\n\n**Vehicles, rentals, services, digital, physical** — include price and location if you can. Or tap 📷 and send a photo.\n\nWhen you're happy, add photos and hit **Publish**.`;



export const SKY_AI_WELCOME =

  `Kia ora — I'm **${AWHINA_NAME}**. I help you **sell**, **price**, **find**, and **navigate** Sky Drop.\n\nTry: *"I want to sell my BMW"* · *"Find me a PS5 under $600"* · *"How much is my iPhone worth?"*`;



export const SKY_AI_PROFILE_WELCOME =

  `Kia ora, I'm ${AWHINA_NAME}. Tell me about yourself and I'll update your profile — bio, region, social links.\n\nTry: *"I'm a car dealer in Auckland"* or *"Add my Instagram @username"*.`;



export const SKY_AI_PROFILE_QUICK_PROMPTS: { label: string; query: string }[] = [

  { label: "Write my bio", query: "Write a bio for my profile" },

  { label: "Set region", query: "Set my region to Auckland" },

  { label: "Add Instagram", query: "Add my Instagram @username" },

  { label: "Add Facebook", query: "Add my Facebook page" },

  { label: "Add website", query: "Add my website URL" },

  { label: "I'm a car dealer", query: "I'm a car dealer in Auckland" },

  { label: "I sell BMW parts", query: "I sell BMW parts online" },

  { label: "Improve profile", query: "Make my profile look more professional" },

  { label: "Fill everything", query: "Fill out my entire profile based on what you know" },

];



/** User is asking what the assistant can do — not requesting navigation. */

export function isSkyAiGeneralQuestion(message: string): boolean {

  const n = message.toLowerCase().replace(/[^\w\s?]/g, " ").trim();

  return (

    /^(what can (you|u|sky ai|āwhina|awhina|sky drop ai) do|what do (you|u) do|what are you|who are you|help|help me|capabilities)\??$/.test(

      n

    ) ||

    /\b(what can (you|u) do|what do (you|u) do|how can (you|u) help|what are your capabilities)\b/.test(

      n

    ) ||

    /\b(what (is|do you know about) sky drop|how does sky drop work|tell me about sky drop)\b/.test(

      n

    )

  );

}



export function skyAiCapabilitiesReply(): string {

  return `Here's what I do on **Sky Drop** — always toward an outcome:



**Sell & list**

• Describe your item → I **fill the Sell form** (vehicle, rental, service, digital, physical)

• Improve title & description · suggest **NZD prices** (quick sale / fair / optimistic)



**Buy & find**

• Help you **search and browse** the right category — I can't invent live listings



**Your account**

• **Edit listings** → My Listings · **Orders** → Purchases / Sales · **Messages** for buyers & sellers



**Trust & payments**

• Stripe card checkout vs **contact seller** (bank transfer in Messages) · safety tips · disputes (Stripe, 7 days)



Say what you want to do — e.g. *"sell my Mazda"*, *"price my PS5"*, *"take me to messages"* — and I'll get you there.`;

}

