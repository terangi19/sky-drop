import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { rateLimit } from "../../lib/rate-limit";

async function logStripeKeyInfo() {
  if (process.env.NODE_ENV === "production") return;
  const key = process.env.STRIPE_SECRET_KEY || "";
  const prefix = key.slice(0, 7);
  console.warn("[Stripe Connect] Key prefix:", prefix, "| length:", key.length);
}

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

    logStripeKeyInfo();

    const balance = await s.balance.retrieve();
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Stripe Connect] Balance livemode:", balance.livemode);
      console.warn("[Stripe Connect] Balance available currencies:", balance.available.map((b: any) => b.currency));
    }

    const db = getServerDb(idToken);

    if (action === "create") {
      // Deduplicate: if profile already has a Stripe account, return existing
      const existingProfile = await db.collection("profiles").doc(decodedToken.uid).get();
      const existingAccountId = existingProfile.data()?.stripeAccountId;
      if (existingAccountId) {
        return NextResponse.json({ accountId: existingAccountId });
      }

      let account;
      try {
        account = await s.accounts.create({
          type: "express",
          email,
          capabilities: { transfers: { requested: true } },
        });
      } catch (createErr: any) {
        console.error("[Stripe Connect] Full accounts.create error:", JSON.stringify(createErr, Object.getOwnPropertyNames(createErr)));
        console.error("[Stripe Connect] Error type:", createErr.type);
        console.error("[Stripe Connect] Error code:", createErr.code);
        console.error("[Stripe Connect] Error statusCode:", createErr.statusCode);
        console.error("[Stripe Connect] Error param:", createErr.param);
        console.error("[Stripe Connect] Error stack:", createErr.stack);
        throw createErr;
      }

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
      const profileDoc = await profileRef.get();
      if (!profileDoc.exists || profileDoc.data()!.stripeAccountId !== accountId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      const profileData = profileDoc.data()!;
      const balance = profileData.earningsBalance || 0;
      const parsed = Number(amount);
      if (!amount || isNaN(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "Invalid withdrawal amount" }, { status: 400 });
      }
      const withdrawAmount = Math.round(parsed * 100);
      if (balance < withdrawAmount) {
        return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
      }

      const transfer = await s.transfers.create({
        amount: withdrawAmount,
        currency: "nzd",
        destination: accountId,
      });

      await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(profileRef);
        if (!fresh.exists || fresh.data()!.stripeAccountId !== accountId) {
          throw new Error("Unauthorized");
        }
        const freshBalance = fresh.data()!.earningsBalance || 0;
        if (freshBalance < withdrawAmount) {
          throw new Error("Insufficient balance");
        }
        transaction.update(profileRef, {
          earningsBalance: FieldValue.increment(-withdrawAmount),
        });
      });

      return NextResponse.json({ success: true, id: transfer.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("Stripe Connect error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

