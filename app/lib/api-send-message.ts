"use client";

import { getFreshIdToken } from "./api-auth";

export interface SendMessageInput {
  type?: string;
  text: string;
  receiver: string;
  listingId?: string;
  listingTitle?: string;
  listingImage?: string;
  listingPrice?: string;
  conversationId?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  offerType?: string;
  offerAmount?: number;
  offerStatus?: string;
  createConversation?: boolean;
  convKey?: string;
  buyerEmail?: string;
  sellerEmail?: string;
}

export async function sendMessage(input: SendMessageInput): Promise<{ success: boolean; messageId?: string; conversationId?: string }> {
  const token = await getFreshIdToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  const res = await fetch("/api/send-message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to send message");
  }
  return data;
}
