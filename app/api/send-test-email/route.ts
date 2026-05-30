import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { isAdminEmail } from "../../lib/admin-utils";
import { buildEmailHtml, notificationToEmail } from "../../lib/email";

const ALL_TYPES = [
  "purchase", "purchase_confirmation", "order_confirmed", "item_shipped",
  "delivered", "bid", "outbid", "bid_confirmation", "auction_won",
  "auction_lost", "offer", "offer_accepted", "offer_declined",
  "payment_released", "service_completed", "item_returned",
  "listing_rejected", "dispute_opened", "job_application", "verification",
] as const;

const CTAS: Record<string, { label: string; url: string; primary: boolean }[]> = {
  purchase: [
    { label: "Sales Dashboard", url: "https://skydrop.nz/sales", primary: true },
    { label: "View Listing", url: "https://skydrop.nz/listing/test123", primary: false },
  ],
  purchase_confirmation: [
    { label: "View Order", url: "https://skydrop.nz/purchases", primary: true },
    { label: "Open Messages", url: "https://skydrop.nz/messages", primary: false },
  ],
  bid: [
    { label: "View Listing", url: "https://skydrop.nz/listing/test123", primary: true },
    { label: "Manage Listings", url: "https://skydrop.nz/sales", primary: false },
  ],
  outbid: [
    { label: "View Listing", url: "https://skydrop.nz/listing/test123", primary: true },
    { label: "Place Higher Bid", url: "https://skydrop.nz/listing/test123", primary: false },
  ],
  bid_confirmation: [
    { label: "View Listing", url: "https://skydrop.nz/listing/test123", primary: true },
    { label: "My Bids", url: "https://skydrop.nz/bids", primary: false },
  ],
  auction_won: [
    { label: "Complete Purchase", url: "https://skydrop.nz/checkout/test123", primary: true },
    { label: "View Listing", url: "https://skydrop.nz/listing/test123", primary: false },
  ],
  auction_lost: [
    { label: "Browse Listings", url: "https://skydrop.nz", primary: true },
    { label: "View Listing", url: "https://skydrop.nz/listing/test123", primary: false },
  ],
  offer: [
    { label: "Review Offer", url: "https://skydrop.nz/sales", primary: true },
    { label: "View Listing", url: "https://skydrop.nz/listing/test123", primary: false },
  ],
  offer_accepted: [
    { label: "Complete Purchase", url: "https://skydrop.nz/checkout/test123", primary: true },
    { label: "View Listing", url: "https://skydrop.nz/listing/test123", primary: false },
  ],
  offer_declined: [
    { label: "Browse Listings", url: "https://skydrop.nz", primary: true },
    { label: "View Listing", url: "https://skydrop.nz/listing/test123", primary: false },
  ],
  verification: [
    { label: "Account Settings", url: "https://skydrop.nz/settings", primary: true },
  ],
  listing_rejected: [
    { label: "Create Listing", url: "https://skydrop.nz/post", primary: true },
    { label: "Guidelines", url: "https://skydrop.nz/guidelines", primary: false },
  ],
  dispute_opened: [
    { label: "View Dispute", url: "https://skydrop.nz/disputes", primary: true },
    { label: "Open Messages", url: "https://skydrop.nz/messages", primary: false },
  ],
  job_application: [
    { label: "Review Application", url: "https://skydrop.nz/services", primary: true },
    { label: "Open Messages", url: "https://skydrop.nz/messages", primary: false },
  ],
};

export async function GET(req: NextRequest) {
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

    const to = "rangitr16@gmail.com";
    const listingTitle = "Sony WH-1000XM5 — Like New";
    const total = 349;

    const url = new URL(req.url);
    const singleType = url.searchParams.get("type");

    const transport = {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    };

    if (!transport.host || !transport.auth.user) {
      return NextResponse.json({ error: "SMTP not configured" }, { status: 500 });
    }

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport(transport);

    const typesToSend = singleType ? [singleType] : ALL_TYPES;
    const results: { type: string; status: string }[] = [];

    for (const type of typesToSend) {
      try {
        const email = notificationToEmail(type, "", listingTitle, total);
        const isSellerNotif = ["purchase", "bid", "offer", "listing_rejected", "job_application"].includes(type);
        const isBuyerNotif = ["purchase_confirmation", "outbid", "bid_confirmation", "auction_won", "auction_lost", "offer_accepted", "offer_declined", "delivered", "item_shipped"].includes(type);
        const html = buildEmailHtml({
          to,
          subject: email.subject,
          title: email.title,
          message: email.message,
          listingImage: "https://picsum.photos/seed/list1/400/400",
          listingTitle,
          buyerName: isSellerNotif ? undefined : "nz_gamer99",
          sellerName: isBuyerNotif ? "kiwi_seller99" : undefined,
          orderId: "SK9F3D2A",
          date: new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" }),
          total: `$${total.toFixed(2)}`,
          statusBadge: email.statusBadge,
          summaryRows: email.summaryRows,
          whatHappensNext: email.whatHappensNext,
          ctas: CTAS[type] || [
            { label: "Sky Drop", url: "https://skydrop.nz", primary: true },
          ],
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM || "Sky Drop <noreply@skydrop.nz>",
          to,
          subject: email.subject,
          html,
        });

        results.push({ type, status: "sent" });
      } catch (e: any) {
        results.push({ type, status: `failed: ${e?.message || "unknown"}` });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status !== "sent").length;

    return NextResponse.json({ success: true, sent, failed, details: results });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
