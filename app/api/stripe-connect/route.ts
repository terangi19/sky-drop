import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
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
    const db = isAdminInitialized() ? getAdminDb() : getServerDb(idToken);

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
      const parsed = Number(amount);
      if (!amount || isNaN(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "Invalid withdrawal amount" }, { status: 400 });
      }
      const withdrawAmount = Math.round(parsed * 100);

      const adminDb = isAdminInitialized() ? getAdminDb() : getServerDb(idToken);
      const profileRef = adminDb.collection("profiles").doc(decodedToken.uid);

      // Reserve balance in a transaction BEFORE calling Stripe
      let verifiedAccountId = "";
      await adminDb.runTransaction(async (transaction) => {
        const fresh = await transaction.get(profileRef);
        if (!fresh.exists || fresh.data()!.stripeAccountId !== accountId) {
          throw new Error("Unauthorized");
        }
        verifiedAccountId = fresh.data()!.stripeAccountId;
        const freshBalance = fresh.data()!.earningsBalance || 0;
        if (freshBalance < withdrawAmount) {
          throw new Error("Insufficient balance");
        }
        transaction.update(profileRef, {
          earningsBalance: FieldValue.increment(-withdrawAmount),
        });
      });

      // Balance is now reserved — create the Stripe transfer
      let transfer;
      try {
        transfer = await s.transfers.create({
          amount: withdrawAmount,
          currency: "nzd",
          destination: verifiedAccountId,
        }, { idempotencyKey: `withdraw-${decodedToken.uid}-${Date.now()}` });
      } catch (stripeErr) {
        // Stripe transfer failed — refund the reserved balance
        try {
          await profileRef.update({
            earningsBalance: FieldValue.increment(withdrawAmount),
          });
        } catch (rollbackErr) {
          console.error("[Stripe Connect] CRITICAL: Failed to rollback balance after Stripe error", rollbackErr);
        }
        throw stripeErr;
      }

      return NextResponse.json({ success: true, id: transfer.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("Stripe Connect error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

