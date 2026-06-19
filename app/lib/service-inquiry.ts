import { getAuth } from "firebase/auth";
import { getFreshIdToken } from "./api-auth";
import {
  buildServiceInquiryCopy,
  normalizeServicePricingType,
  type ServicePricingType,
} from "./service-pricing";

export async function startServiceInquiry(input: {
  listingId: string;
  listingTitle: string;
  listingPrice?: string;
  listingImage?: string;
  sellerEmail: string;
  buyerEmail: string;
  servicePricingType?: string | null;
}): Promise<string> {
  const {
    listingId,
    listingTitle,
    listingPrice,
    listingImage,
    sellerEmail,
    buyerEmail,
    servicePricingType,
  } = input;

  const pricingType = normalizeServicePricingType(servicePricingType, listingPrice);
  const convKey = `listing_${listingId}`;

  const token = await getFreshIdToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/api/send-message", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      type: "text",
      text: `Service inquiry: ${listingTitle}`,
      receiver: sellerEmail,
      listingId,
      listingTitle,
      listingImage: listingImage || "",
      _convKey: convKey,
      _pricingType: pricingType,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to start service inquiry");

  return data.conversationId || convKey;
}

export type { ServicePricingType };
