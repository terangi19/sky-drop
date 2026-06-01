import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`stripe-connect:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

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

    const body = await req.json();
    const { action, accountId, email, amount } = body;
    const s = getStripe();

    const db = getServerDb(idToken);

    if (action === "create") {
      // Deduplicate: if profile already has a Stripe account, return existing
      const existingProfile = await db.collection("profiles").doc(decodedToken.uid).get();
      const existingAccountId = existingProfile.data()?.stripeAccountId;
      if (existingAccountId) {
        return NextResponse.json({ accountId: existingAccountId });
      }

      const account = await s.accounts.create({
        type: "express",
        email,
        capabilities: { transfers: { requested: true } },
      });

      await db.collection("profiles").doc(decodedToken.uid).set({
        stripeAccountId: account.id,
        stripeConnectOnboarded: false,
      }, { merge: true });

      return NextResponse.json({ accountId: account.id });
    }

    if (action === "onboard") {
      const profileDoc = await db.collection("profiles").doc(decodedToken.uid).get();
        if (!profileDoc.exists || profileDoc.data()!.stripeAccountId !== accountId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const link = await s.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/profile`,
        return_url: `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/profile`,
        type: "account_onboarding",
      });
      return NextResponse.json({ url: link.url });
    }

    if (action === "withdraw") {
      const profileRef = db.collection("profiles").doc(decodedToken.uid);
      let withdrawAmount: number;

      await db.runTransaction(async (transaction) => {
        const profileDoc = await transaction.get(profileRef);
      if (!profileDoc.exists || profileDoc.data()!.stripeAccountId !== accountId) {
          throw new Error("Unauthorized");
        }
        const profileData = profileDoc.data()!;
        const balance = profileData.earningsBalance || 0;
        const parsed = Number(amount);
        if (!amount || isNaN(parsed) || parsed <= 0) {
          throw new Error("Invalid withdrawal amount");
        }
        withdrawAmount = Math.round(parsed * 100);
        if (balance < withdrawAmount) {
          throw new Error("Insufficient balance");
        }
        transaction.update(profileRef, {
          earningsBalance: FieldValue.increment(-withdrawAmount),
        });
      });

      const transfer = await s.transfers.create({
        amount: withdrawAmount,
        currency: "nzd",
        destination: accountId,
      });
      return NextResponse.json({ success: true, id: transfer.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("Stripe Connect error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

