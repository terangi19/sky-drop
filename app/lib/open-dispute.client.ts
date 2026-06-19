import { auth } from "./firebase";

export type OpenDisputeInput = {
  purchaseId: string;
  reason: string;
  description: string;
  turnstileToken?: string;
};

export async function openDisputeRequest(input: OpenDisputeInput): Promise<{ disputeId: string }> {
  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error("Please sign in again");
  }

  const res = await fetch("/api/open-dispute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Failed to open dispute");
  }

  return { disputeId: String(data.disputeId || "") };
}
