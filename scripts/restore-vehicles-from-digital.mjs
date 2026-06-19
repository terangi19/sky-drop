import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const transcriptPath =
  "C:/Users/rangi/.cursor/projects/c-Users-rangi-Desktop-sky-drop-sky-drop/agent-transcripts/8f5c3513-fc23-415d-b454-4c68fd606ba2/8f5c3513-fc23-415d-b454-4c68fd606ba2.jsonl";

const MAX_LINE = 2639;
const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);

function normPath(p) {
  return p.replace(/\\/g, "/").replace(/^.*\/sky-drop\//, "");
}

function applyOps(relPath, initial) {
  let content = initial;
  let n = 0;
  for (let i = 0; i < Math.min(lines.length, MAX_LINE); i++) {
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    for (const part of obj.message?.content ?? []) {
      if (part.name !== "StrReplace") continue;
      if (normPath(part.input?.path ?? "") !== relPath) continue;
      const { old_string, new_string } = part.input ?? {};
      if (typeof old_string !== "string" || typeof new_string !== "string") continue;
      if (!content.includes(old_string)) continue;
      content = content.replace(old_string, new_string);
      n++;
    }
  }
  console.log(`${relPath}: ${n} StrReplace applied`);
  return content;
}

// Get digital Write at L1694
let digital = null;
for (let i = 0; i < MAX_LINE; i++) {
  let obj;
  try {
    obj = JSON.parse(lines[i]);
  } catch {
    continue;
  }
  for (const part of obj.message?.content ?? []) {
    if (part.name === "Write" && normPath(part.input?.path ?? "") === "app/digital/page.tsx") {
      digital = part.input.contents;
      console.log(`Digital Write L${i + 1}: ${digital.split(/\r?\n/).length} lines`);
    }
  }
}

if (!digital) {
  console.error("No digital Write found");
  process.exit(1);
}

digital = applyOps("app/digital/page.tsx", digital);

// Convert digital -> vehicles (yellow theme)
let vehicles = digital
  .replace(/DigitalPage/g, "VehiclesPage")
  .replace(/Digital Store/g, "Vehicles")
  .replace(/Digital Marketplace/g, "Vehicle Marketplace")
  .replace(/type=digital/g, "type=vehicle")
  .replace(/where\("type", "==", "digital"\)/g, 'where("type", "==", "vehicle")')
  .replace(/accent="violet"/g, 'accent="yellow"')
  .replace(/digitalRecentlyViewed/g, "vehicleRecentlyViewed")
  .replace(/digitalListings/g, "vehicleListings")
  .replace(/Digital Listings/g, "Vehicle Listings")
  .replace(/Digital products/g, "Vehicles")
  .replace(/digital product/g, "vehicle")
  .replace(/instant-download/g, "across New Zealand")
  .replace(/violet-500/g, "yellow-500")
  .replace(/violet-400/g, "yellow-400")
  .replace(/violet-600/g, "yellow-600")
  .replace(/violet-300/g, "yellow-300")
  .replace(/from-sky-400 to-violet-400/g, "from-yellow-400 to-amber-400")
  .replace(/from-sky-500 to-violet-500/g, "from-yellow-500 to-amber-500")
  .replace(/from-sky-500 to-violet-600/g, "from-yellow-500 to-amber-600")
  .replace(/shadow-sky-500/g, "shadow-yellow-500")
  .replace(/shadow-violet-500/g, "shadow-yellow-500")
  .replace(/border-sky-500/g, "border-yellow-500")
  .replace(/bg-sky-500/g, "bg-yellow-500")
  .replace(/text-sky-400/g, "text-yellow-400")
  .replace(/focus:border-sky-500/g, "focus:border-yellow-500")
  .replace(/focus:border-violet-500/g, "focus:border-yellow-500")
  .replace(/via-violet-500/g, "via-amber-500")
  .replace(/to-violet-500/g, "to-amber-500")
  .replace(/139, 92, 246/g, "234, 179, 8")
  .replace(/rgba\(14,165,233/g, "rgba(234,179,8")
  .replace(/📥 Digital/g, "🚗 Vehicle")
  .replace(/Templates & Assets|E-books & Guides|Art & Photography|Software & Audio|Gaming & 3D/g, "")
  .replace(/Curated Collection/g, "Vehicles")
  .replace(
    /Browse templates, software, design assets, e-books, and creative tools — delivered directly to you on purchase\./,
    "Browse cars, trucks, motorbikes, and more. Buy or bid on vehicles across New Zealand."
  )
  .replace(/Create Listing/g, "List a Vehicle")
  .replace(/Browse & Buy/g, "Browse Vehicles")
  .replace(/Find a digital product you need and click Buy Now to purchase instantly\./g, "Find cars, trucks, motorbikes and more across NZ.")
  .replace(/Seller Delivers/g, "Message Seller")
  .replace(/The seller sends files, access details, or license keys through the chat\./g, "Ask questions and arrange inspections through chat.")
  .replace(/Instant Download/g, "Complete Purchase")
  .replace(/Digital items are delivered instantly upon payment confirmation\./g, "Pay securely through Stripe with buyer protection.")
  .replace(/Buy or Bid/g, "Buy or Bid");

// Apply vehicles-specific StrReplace ops on top (yellow theme tweaks from L1599+)
vehicles = applyOps("app/vehicles/page.tsx", vehicles);

writeFileSync(join(root, "app/vehicles/page.tsx"), vehicles, "utf8");
console.log(`Wrote vehicles: ${vehicles.split(/\r?\n/).length} lines`);
