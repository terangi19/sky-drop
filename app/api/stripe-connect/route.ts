import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { rateLimit } from "../../lib/rate-limit";
import {
  clearStripeConnectFromProfile,
  getStripeKeyMode,
  isStripeModeMismatchError,
  resolveStripeConnectAccount,
  verifyStripeConnectAccount,
} from "../../lib/stripe-connect-account";

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const idToken = authHeader.slice(7);
  try {
    const decodedToken = await verifyIdToken(idToken);
    return { decodedToken, idToken };
  } catch {
    return { error: NextResponse.json({ error: "Invalid or expired token" }, { status: 401 }) };
  }
}

/** Validate stored Connect account against current Stripe keys; auto-clear wrong-environment IDs. */
export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`stripe-connect:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const auth = await authenticate(req);
    if ("error" in auth && auth.error) return auth.error;
    const { decodedToken, idToken } = auth;

    const db = getServerDb(idToken!);
    const profileDoc = await db.collection("profiles").doc(decodedToken!.uid).get();
    const accountId = profileDoc.data()?.stripeAccountId as string | undefined;

    const resolved = await resolveStripeConnectAccount(db, decodedToken!.uid, accountId);

    if (resolved.cleared && resolved.modeMismatch) {
      return NextResponse.json({
        connected: false,
        modeMismatch: true,
        cleared: true,
        message:
          "Your Stripe account was connected in live mode but this environment uses test keys (or vice versa). Connect again below.",
      });
    }

    if (!resolved.connected) {
      return NextResponse.json({ connected: false });
    }

    const s = getStripe();
    const account = await s.accounts.retrieve(resolved.accountId!);
    return NextResponse.json({
      connected: true,
      accountId: resolved.accountId,
      keyMode: getStripeKeyMode(),
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
    });
  } catch (e: unknown) {
    console.error("Stripe Connect status error:", e);
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`stripe-connect:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const auth = await authenticate(req);
    if ("error" in auth && auth.error) return auth.error;
    const { decodedToken, idToken } = auth;

    const body = await req.json();
    const { action, accountId, amount } = body;
    const email = decodedToken!.email;
    const s = getStripe();
    const db = getServerDb(idToken!);
    const uid = decodedToken!.uid;
    const profileUrl = `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/profile?tab=payments`;

    if (action === "create") {
      const existingProfile = await db.collection("profiles").doc(uid).get();
      const existingAccountId = existingProfile.data()?.stripeAccountId as string | undefined;

      if (existingAccountId) {
        const resolved = await resolveStripeConnectAccount(db, uid, existingAccountId, s);
        if (resolved.connected && resolved.accountId) {
          return NextResponse.json({ accountId: resolved.accountId });
        }
      }

      const account = await s.accounts.create({
        type: "express",
        email,
        capabilities: { transfers: { requested: true } },
      });

      await db.collection("profiles").doc(uid).set(
        {
          stripeAccountId: account.id,
          stripeConnectOnboarded: false,
          stripeAccountKeyMode: getStripeKeyMode(),
        },
        { merge: true }
      );

      return NextResponse.json({ accountId: account.id });
    }

    if (action === "onboard") {
      const profileDoc = await db.collection("profiles").doc(uid).get();
      const storedId = profileDoc.data()?.stripeAccountId as string | undefined;
      if (!profileDoc.exists || storedId !== accountId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const verify = await verifyStripeConnectAccount(s, accountId);
      if (verify !== "valid") {
        await clearStripeConnectFromProfile(db, uid);
        return NextResponse.json(
          {
            error:
              "This Stripe account was connected in a different environment. Connect again to continue.",
            needsReconnect: true,
            modeMismatch: verify === "mode_mismatch",
          },
          { status: 400 }
        );
      }

      try {
        const link = await s.accountLinks.create({
          account: accountId,
          refresh_url: profileUrl,
          return_url: profileUrl,
          type: "account_onboarding",
        });
        return NextResponse.json({ url: link.url });
      } catch (linkErr: unknown) {
        if (isStripeModeMismatchError(linkErr)) {
          await clearStripeConnectFromProfile(db, uid);
          return NextResponse.json(
            {
              error:
                "This Stripe account was connected in live mode but you're on test keys locally. Connect again.",
              needsReconnect: true,
              modeMismatch: true,
            },
            { status: 400 }
          );
        }
        throw linkErr;
      }
    }

    if (action === "disconnect") {
      await clearStripeConnectFromProfile(db, uid);
      return NextResponse.json({ success: true });
    }

    if (action === "withdraw") {
      const profileRef = db.collection("profiles").doc(uid);
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
  } catch (e: unknown) {
    console.error("Stripe Connect error:", e);
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
