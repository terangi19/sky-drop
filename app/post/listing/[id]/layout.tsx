import type { Metadata } from "next";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";

const NON_PUBLIC = new Set([
  "draft",
  "deleted",
  "hidden",
  "flagged",
  "pending_review",
  "removed",
  "archived",
]);

function firstImage(data: Record<string, unknown>): string | undefined {
  const images = data.images;
  if (Array.isArray(images) && typeof images[0] === "string" && images[0]) return images[0];
  if (typeof data.imageUrl === "string" && data.imageUrl) return data.imageUrl;
  if (typeof data.image === "string" && data.image) return data.image;
  return undefined;
}

function isPublicListing(data: Record<string, unknown>): boolean {
  const status = String(data.status || "active").toLowerCase();
  if (NON_PUBLIC.has(status)) return false;
  if (data.hidden === true || data.isDraft === true) return false;
  return true;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const canonical = `${BASE_URL}/post/listing/${id}`;
  const fallback: Metadata = {
    title: "Listing on Sky Drop",
    description:
      "Browse this listing on Sky Drop — message the seller and arrange purchase, pickup or delivery directly.",
    alternates: { canonical },
    openGraph: {
      title: "Listing on Sky Drop",
      description: "Message the seller on Sky Drop to arrange your purchase.",
      url: canonical,
      siteName: "Sky Drop",
      type: "website",
      images: [{ url: `${BASE_URL}/og-image.svg`, width: 1200, height: 630, alt: "Sky Drop" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Listing on Sky Drop",
      description: "Message the seller on Sky Drop to arrange your purchase.",
      images: [`${BASE_URL}/og-image.svg`],
    },
  };

  if (!isAdminInitialized()) {
    return fallback;
  }

  try {
    const snap = await getAdminDb().collection("listings").doc(id).get();
    if (!snap.exists) {
      return { ...fallback, title: "Listing not found", robots: { index: false, follow: false } };
    }
    const data = snap.data() as Record<string, unknown>;
    if (!isPublicListing(data)) {
      return { ...fallback, title: "Listing unavailable", robots: { index: false, follow: false } };
    }

    const title = String(data.title || "Listing").trim() || "Listing";
    const location = typeof data.location === "string" && data.location.trim() ? data.location.trim() : "";
    const priceRaw = data.price;
    const price =
      priceRaw != null && String(priceRaw).trim() !== ""
        ? `$${String(priceRaw).replace(/^\$/, "")}`
        : "";
    const descSource =
      (typeof data.description === "string" && data.description.trim()) ||
      [title, price, location, "Message the seller on Sky Drop to arrange purchase."]
        .filter(Boolean)
        .join(" · ");
    const description = descSource.slice(0, 160);
    const image = firstImage(data) || `${BASE_URL}/og-image.svg`;
    const pageTitle = [title, price, location ? location : "NZ"].filter(Boolean).join(" — ");

    return {
      title: pageTitle,
      description,
      alternates: { canonical },
      openGraph: {
        title: pageTitle,
        description,
        url: canonical,
        siteName: "Sky Drop",
        type: "website",
        locale: "en_NZ",
        images: [{ url: image, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: "summary_large_image",
        title: pageTitle,
        description,
        images: [image],
      },
      other: {
        ...(price ? { "product:price:amount": String(priceRaw).replace(/^\$/, ""), "product:price:currency": "NZD" } : {}),
      },
    };
  } catch (e) {
    console.error("[listing metadata]", e);
    return fallback;
  }
}

export default function ListingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
