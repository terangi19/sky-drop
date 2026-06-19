import { auth } from "./firebase";
import { buildEmailHtml, notificationToEmail } from "./email";

interface NotificationInput {
  targetEmail: string;
  fromEmail: string;
  type: string;
  title: string;
  message: string;
  listingId?: string;
  listingTitle?: string;
  listingImage?: string;
  purchaseId?: string;
  total?: number;
  buyerName?: string;
  sellerName?: string;
  orderId?: string;
}

function formatDate(): string {
  const d = new Date();
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });
}

function truncateOrderId(id?: string): string {
  if (!id) return "";
  return id.length > 8 ? id.slice(-8).toUpperCase() : id.toUpperCase();
}

export async function createNotification(input: NotificationInput) {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      console.error("Failed to create notification: not signed in");
      return;
    }
    const res = await fetch("/api/create-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: input.type,
        targetEmail: input.targetEmail,
        fromEmail: input.fromEmail,
        title: input.title,
        message: input.message,
        listingId: input.listingId || null,
        listingTitle: input.listingTitle || null,
        listingImage: input.listingImage || null,
        purchaseId: input.purchaseId || null,
        total: input.total || null,
      }),
    });
    if (!res.ok) {
      console.error("Failed to create notification:", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("Failed to create notification:", e);
  }

  // Push notification
  try {
    const pushToken = await auth.currentUser?.getIdToken();
    const url = input.listingId ? `/post/listing/${input.listingId}` : "/messages";
    const res = await fetch("/api/send-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(pushToken ? { Authorization: `Bearer ${pushToken}` } : {}),
      },
      body: JSON.stringify({
        targetEmail: input.targetEmail,
        title: input.title,
        message: input.message,
        url,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.note === "push not configured") {
        console.info("[Notification] Push not configured — notification stored in Firestore only");
      }
    } else {
      console.info("[Notification] Push endpoint returned non-OK:", res.status);
    }
  } catch {
    console.info("[Notification] Push endpoint unreachable (expected if push not configured)");
  }

  // Email notification
  try {
    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";
    const listingUrl = input.listingId ? `${baseUrl}/post/listing/${input.listingId}` : "";
    const messagesUrl = `${baseUrl}/messages`;
    const purchasesUrl = `${baseUrl}/purchases`;
    const salesUrl = `${baseUrl}/sales`;

    const email = notificationToEmail(input.type, input.title, input.listingTitle, input.total);

    const isBuyerEmail = ["purchase_confirmation", "order_confirmed", "item_shipped", "delivered",
      "bid_confirmation", "auction_won", "auction_lost", "offer_accepted", "offer_declined",
      "service_completed", "item_returned",
    ].includes(input.type);

    const primaryCta = isBuyerEmail
      ? { label: "View Order", url: listingUrl || purchasesUrl, primary: true }
      : { label: "Open Sales", url: listingUrl || salesUrl, primary: true };

    const secondaryCta = listingUrl
      ? { label: "Open Messages", url: messagesUrl, primary: false }
      : undefined;

    const ctas = [primaryCta, secondaryCta].filter(Boolean) as { label: string; url: string; primary?: boolean }[];

    const html = buildEmailHtml({
      to: input.targetEmail,
      subject: email.subject,
      title: email.title,
      message: input.message || email.message,
      listingImage: input.listingImage,
      listingTitle: input.listingTitle,
      sellerName: input.sellerName,
      buyerName: input.buyerName,
      orderId: input.orderId ? truncateOrderId(input.orderId) : undefined,
      date: formatDate(),
      total: input.total ? `$${input.total.toFixed(2)}` : undefined,
      statusBadge: email.statusBadge,
      summaryRows: email.summaryRows,
      whatHappensNext: email.whatHappensNext,
      ctas,
      showTrustSection: true,
    });

    const token = await auth.currentUser?.getIdToken();
    if (token) {
      await fetch("/api/send-notification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: input.targetEmail, subject: email.subject, html }),
      });
    }
  } catch (e) {
    console.info("[Notification] Email send skipped or failed:", e);
  }
}
