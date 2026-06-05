import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { VerifiedListingFacts } from "./sky-ai-listing-truth";

/** Phrases that make service listings sound AI-generated or like product templates */
export const SERVICE_BANNED_PHRASES: RegExp[] = [
  /\bpresented for sale\b/i,
  /\bfor sale\b/i,
  /\bcontact seller for (?:additional )?details?\b/i,
  /\bcontact the seller\b/i,
  /\bhigh[- ]quality service(?:s)? available\b/i,
  /\bprofessional service(?:s)? available\b/i,
  /\bquality service(?:s)? (?:offered|provided)\b/i,
  /\bthis service is\b/i,
  /\bitem presented for sale\b/i,
  /\bget in touch for more (?:info|information|details)\b/i,
];

export const SKY_AI_SERVICE_DESCRIPTION_RULES = `
## SERVICE DESCRIPTIONS (critical — sound like a real freelancer or business owner)

Service listings are **not products**. Never use product phrasing ("presented for sale", "for sale", "Contact seller for additional details").

**Every service description should explain:**
1. **What the service is** — clear, specific, tied to what the seller said
2. **Who it is for** — target clients (businesses, startups, homeowners, etc.) when inferable from chat/category
3. **What the buyer receives** — deliverables/outcomes (e.g. responsive website, edited photos, mowed lawn) — only standard outcomes for that service type, never invented extras
4. **Why contact the seller** — discuss requirements, get a quote, book a consultation

**Tone:** first person ("I offer…", "I can help…") or professional third person ("We provide…"). Warm, confident, human — like Fiverr/Upwork, not a template.

**Request Quote (\`request_quote\`):**
- State that **pricing depends on project scope**
- Encourage buyers to **message with project details** (goals, timeline, budget range if they have one)
- Mention **types of projects accepted** from title/category/user message (e.g. business sites, landing pages, e-commerce)

**Starting At / Fixed:** still invite contact to confirm scope; fixed price can mention what's included at the listed price only if user stated it.

**Length:** 2–4 sentences, ~40–120 words. No bullet lists unless user provided bullet deliverables.

**Never use:**
- "Service presented for sale"
- "Contact seller for additional details"
- "High quality service available"
- Generic filler with no substance

**Good example (web design, request quote):**
"Professional website design services for businesses, startups, and personal brands. Whether you need a simple business website, landing page, online store, or a custom solution, I can help bring your ideas to life. Pricing depends on your project scope — message me with your goals and requirements for a tailored quote."

**Bad example:**
"Website Design Service presented for sale. Contact seller for additional details."
`.trim();

type ServiceProfile = {
  label: string;
  audiences: string[];
  deliverables: string[];
  projectTypes: string[];
};

const CATEGORY_PROFILES: Record<string, Partial<ServiceProfile>> = {
  "Design & Development": {
    audiences: ["businesses", "startups", "personal brands"],
    deliverables: [
      "a polished, mobile-friendly website",
      "clean design and smooth user experience",
    ],
    projectTypes: [
      "business websites",
      "landing pages",
      "online stores",
      "custom web solutions",
    ],
  },
  "Design & Creative": {
    audiences: ["brands", "startups", "small businesses"],
    deliverables: ["logo files", "brand assets", "revisions to get the look right"],
    projectTypes: ["logo design", "brand identity", "social media graphics", "print design"],
  },
  "Writing & Translation": {
    audiences: ["businesses", "creators", "professionals"],
    deliverables: ["clear, polished copy tailored to your audience"],
    projectTypes: ["blog posts", "website copy", "product descriptions", "translations"],
  },
  "Video & Animation": {
    audiences: ["brands", "creators", "businesses"],
    deliverables: ["edited video ready to publish or use in campaigns"],
    projectTypes: ["promo videos", "social clips", "explainers", "motion graphics"],
  },
  "Music & Audio": {
    audiences: ["creators", "podcasters", "musicians"],
    deliverables: ["mixed and mastered audio files"],
    projectTypes: ["podcast editing", "voice-over", "music production", "sound design"],
  },
  "Marketing & SEO": {
    audiences: ["local businesses", "e-commerce brands", "startups"],
    deliverables: ["actionable marketing improvements and measurable results"],
    projectTypes: ["SEO audits", "Google Ads setup", "social media management", "email campaigns"],
  },
  "Consulting & Coaching": {
    audiences: ["professionals", "founders", "teams"],
    deliverables: ["practical advice and a clear plan forward"],
    projectTypes: ["strategy sessions", "coaching calls", "business consulting", "workshops"],
  },
  Photography: {
    audiences: ["families", "businesses", "event organisers"],
    deliverables: ["edited, high-quality photos delivered digitally"],
    projectTypes: ["portraits", "events", "product photography", "real estate shoots"],
  },
  Tutoring: {
    audiences: ["students", "parents", "adult learners"],
    deliverables: ["focused lessons tailored to your level and goals"],
    projectTypes: ["exam prep", "homework help", "skill-building sessions"],
  },
  Other: {
    audiences: ["clients who need reliable help"],
    deliverables: ["work completed to agreed standards"],
    projectTypes: ["projects discussed in messages"],
  },
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function joinNatural(items: string[], max = 4): string {
  const slice = items.filter(Boolean).slice(0, max);
  if (slice.length === 0) return "";
  if (slice.length === 1) return slice[0]!;
  if (slice.length === 2) return `${slice[0]} and ${slice[1]}`;
  return `${slice.slice(0, -1).join(", ")}, and ${slice[slice.length - 1]}`;
}

function detectAudiences(blob: string, fallback: string[]): string[] {
  const found: string[] = [];
  const patterns: [RegExp, string][] = [
    [/\b(business(es)?|company|companies|corporate)\b/i, "businesses"],
    [/\b(startup|start-?ups?)\b/i, "startups"],
    [/\b(personal brand|creators?|influencers?)\b/i, "personal brands"],
    [/\b(homeowner|home owners?|residential)\b/i, "homeowners"],
    [/\b(local|nz|new zealand)\b/i, "local clients"],
    [/\b(famil(y|ies)|wedding)\b/i, "families"],
    [/\b(e-?commerce|online store|shop)\b/i, "online stores"],
    [/\b(student|school|university)\b/i, "students"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(blob)) found.push(label);
  }
  return found.length > 0 ? [...new Set(found)] : fallback;
}

function detectServiceLabel(title: string, category: string, blob: string): string {
  const t = norm(title);
  const b = norm(blob);

  const keywordMap: [RegExp, string][] = [
    [/\b(website|web design|web dev|wordpress|shopify|next\.?js|react)\b/i, "website design and development"],
    [/\b(logo|brand identity|branding)\b/i, "logo and brand identity design"],
    [/\b(seo|search engine)\b/i, "SEO services"],
    [/\b(photo(graphy)?|photographer)\b/i, "photography services"],
    [/\b(video edit|videograph|film)\b/i, "video production and editing"],
    [/\b(lawn|mowing|garden|landscap)\b/i, "lawn care and gardening"],
    [/\b(clean(ing)?|housekeep)\b/i, "cleaning services"],
    [/\b(tutor|tutoring|lessons?)\b/i, "tutoring and lessons"],
    [/\b(consult|coaching|coach)\b/i, "consulting and coaching"],
    [/\b(copywrit|content writ|writing)\b/i, "writing services"],
    [/\b(graphic design|illustrat)\b/i, "graphic design"],
    [/\b(social media|instagram|tiktok)\b/i, "social media management"],
    [/\b(app dev|mobile app|ios|android)\b/i, "app development"],
  ];

  for (const [re, label] of keywordMap) {
    if (re.test(t) || re.test(b)) return label;
  }

  if (title.trim()) {
    const cleaned = title
      .replace(/\b(service|services|professional|expert)\b/gi, "")
      .trim();
    if (cleaned.length > 3) return `${cleaned.toLowerCase()} services`;
  }

  const cat = category.replace(/&/g, "and").toLowerCase();
  if (cat.includes("design") && cat.includes("development")) return "design and development services";
  if (cat.includes("photography")) return "photography services";
  return `${category.toLowerCase()} services`;
}

function detectProjectTypes(
  title: string,
  category: string,
  blob: string,
  fallback: string[]
): string[] {
  const found: string[] = [];
  const patterns: [RegExp, string][] = [
    [/\b(business website|company site)\b/i, "business websites"],
    [/\b(landing page)\b/i, "landing pages"],
    [/\b(online store|e-?commerce|shopify|woocommerce)\b/i, "online stores"],
    [/\b(custom|bespoke)\b/i, "custom solutions"],
    [/\b(logo)\b/i, "logo design"],
    [/\b(brand)\b/i, "brand identity packages"],
    [/\b(portrait)\b/i, "portraits"],
    [/\b(event|wedding)\b/i, "events"],
    [/\b(product photo)\b/i, "product photography"],
    [/\b(residential|lawn|garden)\b/i, "residential lawn care"],
    [/\b(commercial)\b/i, "commercial projects"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(blob) || re.test(title)) found.push(label);
  }
  return found.length > 0 ? [...new Set(found)] : fallback;
}

function pricingType(fill: SkyAiListingFill): string {
  const raw = fill.servicePricingType?.toLowerCase() || "";
  if (raw === "request_quote") return "request_quote";
  if (raw === "starting_at" || raw === "starting_from") return "starting_at";
  if (raw === "fixed") return "fixed";
  if (!fill.price?.trim()) return "request_quote";
  return "fixed";
}

function deliveryNote(method?: string): string | null {
  if (method === "online") return "Work is delivered remotely — ideal if you want a smooth online collaboration.";
  if (method === "in_person") return "Available for in-person service in your area — message to confirm availability.";
  if (method === "both") return "Available online or in person — flexible to suit your project.";
  return null;
}

function durationNote(duration?: string): string | null {
  if (!duration?.trim()) return null;
  return `Typical turnaround: ${duration.trim()}.`;
}

export function isGenericServiceDescription(description: string): boolean {
  const d = description.trim();
  if (!d) return true;
  if (SERVICE_BANNED_PHRASES.some((p) => p.test(d))) return true;
  if (d.length < 50) return true;
  return false;
}

export function sanitizeServiceDescription(description: string): string {
  let out = description.trim();
  for (const pattern of SERVICE_BANNED_PHRASES) {
    out = out.replace(pattern, "").trim();
  }
  out = out.replace(/\s{2,}/g, " ").replace(/\.\s*\./g, ".").trim();
  return out;
}

function resolveCategoryProfile(category: string): Partial<ServiceProfile> {
  if (CATEGORY_PROFILES[category]) return CATEGORY_PROFILES[category]!;
  const lower = category.toLowerCase();
  if (/photograph/i.test(lower)) return CATEGORY_PROFILES.Photography!;
  if (/tutor/i.test(lower)) return CATEGORY_PROFILES.Tutoring!;
  if (/consult|coach/i.test(lower)) return CATEGORY_PROFILES["Consulting & Coaching"]!;
  if (/design.*creat|creat.*design|logo/i.test(lower)) return CATEGORY_PROFILES["Design & Creative"]!;
  if (/design|dev|web/i.test(lower)) return CATEGORY_PROFILES["Design & Development"]!;
  return CATEGORY_PROFILES.Other!;
}

export function buildServiceDescription(
  fill: SkyAiListingFill,
  facts: VerifiedListingFacts
): string {
  const category = fill.category || "Other";
  const profile = resolveCategoryProfile(category);
  const blob = facts.blob;
  const title = fill.title || "";
  const serviceLabel = detectServiceLabel(title, category, blob);
  const audiences = detectAudiences(blob, profile.audiences || ["clients"]);
  const projectTypes = detectProjectTypes(
    title,
    category,
    blob,
    profile.projectTypes || ["projects discussed in messages"]
  );
  const deliverables = profile.deliverables || ["work completed to your requirements"];
  const pt = pricingType(fill);

  const audiencePhrase = joinNatural(audiences, 3);
  const projectPhrase = joinNatural(projectTypes, 4);
  const deliverablePhrase = deliverables[0] || "results tailored to your needs";

  const parts: string[] = [];
  const labelForOpener = serviceLabel.endsWith("services")
    ? serviceLabel
    : `${serviceLabel} services`;

  parts.push(`Professional ${labelForOpener} for ${audiencePhrase}.`);

  if (projectTypes.length > 1 || pt === "request_quote") {
    parts.push(
      `Whether you need ${projectPhrase}, I can help bring your project to life with ${deliverablePhrase}.`
    );
  } else {
    parts.push(
      `You'll receive ${deliverablePhrase} — with clear communication throughout the process.`
    );
  }

  const delivery = deliveryNote(fill.serviceDeliveryMethod);
  if (delivery) parts.push(delivery);

  const duration = durationNote(fill.serviceDuration);
  if (duration) parts.push(duration);

  if (pt === "request_quote") {
    parts.push(
      "Pricing depends on your project scope and requirements. Message me with your goals, timeline, and any reference examples so I can provide a tailored quote."
    );
  } else if (pt === "starting_at") {
    parts.push(
      "The listed price is a starting point — contact me to discuss your specific requirements and get an accurate quote."
    );
  } else {
    parts.push(
      "Contact me to confirm your requirements and get started — happy to answer questions before you commit."
    );
  }

  return parts.join(" ");
}
