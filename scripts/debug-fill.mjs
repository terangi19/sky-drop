const SKY_AI_LISTING_FILL_TAG = /\[\[LISTING_FILL\]\]\s*([\s\S]*?)\s*\[\/LISTING_FILL\]\]/gi;

function pickField(o, keys) {
  for (const key of keys) {
    const v = o[key];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function pickNumField(o, keys) {
  for (const key of keys) {
    const v = o[key];
    if (typeof v === "number" && !Number.isNaN(v)) return String(v);
    if (typeof v === "string") {
      const cleaned = v.replace(/[$,\s]/g, "").trim();
      if (/^\d+(\.\d+)?$/.test(cleaned)) return cleaned;
    }
  }
  return "";
}

function normalizeSkyAiListingFill(input) {
  if (!input || typeof input !== "object") return null;
  const o = input;
  const raw = {
    title: pickField(o, ["title"]),
    description: pickField(o, ["description"]),
    category: pickField(o, ["category"]),
    condition: pickField(o, ["condition"]),
    price: pickNumField(o, ["price"]),
    listingType: pickField(o, ["listingType", "type"]),
    location: pickField(o, ["location"]),
    vehicleMake: pickField(o, ["vehicleMake", "make"]),
    vehicleModel: pickField(o, ["vehicleModel", "model"]),
    vehicleYear: pickNumField(o, ["vehicleYear", "year"]),
    vehicleOdometer: pickNumField(o, ["vehicleOdometer", "odometer", "kms", "km"]),
  };

  if (!raw.title && !raw.description && !raw.price && !raw.vehicleMake && !raw.vehicleModel) return null;

  const out = {};
  if (raw.title) out.title = raw.title;
  if (raw.description) out.description = raw.description;
  if (raw.location) out.location = raw.location;
  if (raw.vehicleMake) out.vehicleMake = raw.vehicleMake;
  if (raw.vehicleModel) out.vehicleModel = raw.vehicleModel;
  if (raw.vehicleYear) out.vehicleYear = raw.vehicleYear;
  if (raw.vehicleOdometer) out.vehicleOdometer = raw.vehicleOdometer;
  if (raw.price) out.price = raw.price;
  if (raw.listingType) out.listingType = raw.listingType;
  if (raw.category) out.category = raw.category;
  if (raw.condition) out.condition = raw.condition;

  console.log("normalized out:", JSON.stringify(out));
  return out;
}

function extractListingFill(reply) {
  const re = new RegExp(SKY_AI_LISTING_FILL_TAG.source, "i");
  const match = re.exec(reply);
  if (!match?.[1]) {
    console.log("No regex match");
    console.log("Reply snippet:", reply.substring(0, 300));
    return null;
  }
  const trimmed = match[1].trim();
  console.log("Match[1] full length:", trimmed.length);
  console.log("Match[1] last 100:", JSON.stringify(trimmed.slice(-100)));
  const lastBrace = trimmed.lastIndexOf("}");
  console.log("Last } at position:", lastBrace);
  console.log("Content after last }: ", JSON.stringify(trimmed.slice(lastBrace + 1)));
  const cleanJson = trimmed.slice(0, lastBrace + 1);
  try {
    return normalizeSkyAiListingFill(JSON.parse(cleanJson));
  } catch (e) {
    console.log("JSON parse error:", e.message);
    return null;
  }
}

const raw = `I'll set up your listing. Here you go:

[[LISTING_FILL]]
{
  "title": "2020 Toyota Corolla - Silver, 80000km",
  "description": "Selling my 2020 Toyota Corolla in silver.",
  "category": "Cars",
  "condition": "Used - Good",
  "listingType": "vehicle",
  "vehicleMake": "Toyota",
  "vehicleModel": "Corolla",
  "vehicleYear": "2020",
  "vehicleOdometer": "80000",
  "vehicleColour": "Silver",
  "price": 25000,
  "location": "Auckland"
}
[[/LISTING_FILL]]
Your next step is to review.`;

const result = extractListingFill(raw);
console.log("\n=== RESULT ===");
console.log(JSON.stringify(result, null, 2));
