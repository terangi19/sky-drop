/**
 * End-to-end refund sync verification against live Stripe + Firestore.
 *
 * Usage:
 *   npx tsx scripts/verify-refund-sync.ts
 *   npx tsx scripts/verify-refund-sync.ts pi_xxx   # verify/sync one payment intent
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { getAdminDb, isAdminInitialized } from "../app/lib/firebase-admin";
import { getStripe } from "../app/lib/stripe-server";
import {
  applyStripeRefundToPurchase,
  findPurchaseForStripeRefund,
  isFullStripeRefund,
} from "../app/lib/stripe-refund-sync";

async function chargeRefundState(paymentIntentId: string) {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
  const charge =
    pi.latest_charge && typeof pi.latest_charge === "object"
      ? pi.latest_charge
      : null;
  if (!charge) return { fullyRefunded: false, refundAmount: 0 };
  const refundAmountCents = Number(charge.amount_refunded || 0);
  return {
    fullyRefunded: isFullStripeRefund(
      refundAmountCents,
      Number(charge.amount || 0),
      charge.refunded === true
    ),
    refundAmount: refundAmountCents / 100,
    chargeId: charge.id,
  };
}

async function verifyOne(paymentIntentId: string) {
  const db = getAdminDb();
  const before = await findPurchaseForStripeRefund(db, paymentIntentId);
  if (!before) {
    return { paymentIntentId, ok: false, reason: "purchase_not_found" };
  }

  const stripeState = await chargeRefundState(paymentIntentId);
  const needsSync =
    stripeState.fullyRefunded && before.data.status !== "refunded";

  if (needsSync) {
    await applyStripeRefundToPurchase(
      {
        paymentIntentId,
        refundAmount: stripeState.refundAmount,
        fullyRefunded: true,
        refundStatus: "succeeded",
      },
      db
    );
  }

  const after = await findPurchaseForStripeRefund(db, paymentIntentId);
  const ok =
    !stripeState.fullyRefunded ||
    after?.data.status === "refunded";

  return {
    paymentIntentId,
    purchaseId: after?.id,
    ok,
    stripeFullyRefunded: stripeState.fullyRefunded,
    beforeStatus: before.data.status,
    afterStatus: after?.data.status,
    synced: needsSync,
    destinationCharge: after?.data.destinationCharge,
    fundsReleased: after?.data.fundsReleased,
  };
}

async function main() {
  if (!isAdminInitialized()) {
    throw new Error("Firebase Admin not configured");
  }

  const targetPi = process.argv[2]?.trim();
  const paymentIntentIds: string[] = [];

  if (targetPi) {
    paymentIntentIds.push(targetPi);
  } else {
    const snap = await getAdminDb()
      .collection("purchases")
      .orderBy("createdAt", "desc")
      .limit(25)
      .get();
    for (const doc of snap.docs) {
      const pi = String(doc.data().stripePaymentIntentId || "");
      if (pi) paymentIntentIds.push(pi);
    }
  }

  if (paymentIntentIds.length === 0) {
    console.log("No Stripe purchases found to verify.");
    return;
  }

  const results = [];
  for (const pi of paymentIntentIds) {
    try {
      results.push(await verifyOne(pi));
    } catch (err) {
      results.push({
        paymentIntentId: pi,
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    process.exit(1);
  }
  console.log(`PASS: verified ${results.length} payment intent(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
