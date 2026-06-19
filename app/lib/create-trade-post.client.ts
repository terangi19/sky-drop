import { auth } from "./firebase";

export type CreateTradePostInput = {
  title: string;
  message?: string;
  description?: string;
  price?: string;
  type?: string;
  badgeForSale?: "epic" | "legendary";
  sellerUsername?: string;
  status?: string;
  images?: string[];
  world?: string | null;
  category?: string | null;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  pickupArea?: string;
  shippingFee?: number | null;
  freeShipping?: boolean;
  turnstileToken?: string;
};

export async function createTradePostRequest(
  input: CreateTradePostInput
): Promise<{ id: string }> {
  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error("Please sign in again");
  }

  const res = await fetch("/api/create-trade-post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Failed to create trade post");
  }

  return { id: String(data.id || "") };
}
