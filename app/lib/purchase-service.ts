import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import {
  adminGetProfileByEmail,
  adminGetPublicName,
  resolveBuyerNameForStorage,
} from "./profile-display-admin";
import { publicHandleFromProfile } from "./public-display";
import type { Firestore } from "firebase-admin/firestore";
import { sanitizeCheckoutCollectionName } from "./payment-checkout";
import {
  assertListingAvailableForPurchase,
  buildListingUpdateAfterSale,
  isListingAvailableForPurchase,
  listingStockCount,
  listingTracksStock,
} from "./listing-stock";
import { incrementProfileSalesCount } from "./seller-sales-admin";

function listingPrimaryImage(listing: Record<string, unknown>): string {
  const images = Array.isArray(listing.images) ? listing.images : [];
  const firstImage = images[0];
  if (typeof firstImage === "string" && firstImage) return firstImage;
  if (typeof listing.imageUrl === "string" && listing.imageUrl) return listing.imageUrl;
  if (typeof listing.image === "string" && listing.image) return listing.image;
  return "";
}

export interface CreatePurchaseInput {
  listingId: string;
  listingTitle: string;
  listingPrice: string;
  listingImage: string;
  sellerEmail: string;
  buyerEmail: string;
  buyerName: string;
  buyerPhone?: string;
  deliveryMethod: string;
  shippingAddress?: string;
  shippingFee?: number;
  processingFee?: number;
  total: number;
  badgeTransfer?: string;
  type?: string;
  digitalFileURL?: string;
  digitalFileName?: string;
  status?: string;
  rentalStart?: string | null;
  rentalEnd?: string | null;
  rentalDays?: number | null;
  disputeDeadline?: string | null;
  stripePaymentIntentId: string;
  paidAt?: string;
  deliveredAt?: string | null;
  winningBid?: number | null;
  collectionName?: string;
  destinationCharge?: boolean;
}

export interface CreatePurchaseResult {
  purchaseId: string;
  orderId: string;
  conversationId: string;
  existing: boolean;
}

export function makePurchaseId(listingId: string, buyerEmail: string): string {
  return `${listingId}_${buyerEmail.replace(/[@.]/g, "_")}`;
}

function purchaseDocIdFromPaymentIntent(stripePaymentIntentId: string): string {
  return `pi_${stripePaymentIntentId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** One purchase doc per checkout when stock > 1 or Stripe PI is present. */
export function resolvePurchaseDocRef(
  db: Firestore,
  listing: Record<string, unknown>,
  listingId: string,
  buyerEmail: string,
  stripePaymentIntentId?: string
) {
  if (stripePaymentIntentId) {
    return db.collection("purchases").doc(purchaseDocIdFromPaymentIntent(stripePaymentIntentId));
  }
  // Stock-tracked listings get one purchase doc per checkout (not one per buyer per listing).
  if (listingTracksStock(listing)) {
    return db.collection("purchases").doc();
  }
  return db.collection("purchases").doc(makePurchaseId(listingId, buyerEmail));
}

function makeConversationId(listingId: string, buyerEmail: string): string {
  return `conv_${listingId}_${buyerEmail.replace(/[@.]/g, "_")}`;
}

function listingExpiresMs(listing: Record<string, unknown>): number | null {
  const expiresAt = listing.expiresAt as { toMillis?: () => number; _seconds?: number } | string | undefined;
  if (!expiresAt) return null;
  if (typeof expiresAt === "object" && typeof expiresAt.toMillis === "function") {
    return expiresAt.toMillis();
  }
  if (typeof expiresAt === "object" && typeof expiresAt._seconds === "number") {
    return expiresAt._seconds * 1000;
  }
  const t = new Date(expiresAt as string).getTime();
  return Number.isFinite(t) ? t : null;
}

function listingIsExpired(listing: Record<string, unknown>): boolean {
  const ms = listingExpiresMs(listing);
  return ms !== null && ms < Date.now();
}

/** Idempotent recovery when webhook created the purchase before the client. */
export async function findPurchaseByPaymentIntent(
  stripePaymentIntentId: string
): Promise<CreatePurchaseResult | null> {
  if (!stripePaymentIntentId) return null;
  const db = getAdminDb();
  const snap = await db
    .collection("purchases")
    .where("stripePaymentIntentId", "==", stripePaymentIntentId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  return {
    purchaseId: doc.id,
    orderId: String(data.orderId || ""),
    conversationId: String(data.conversationId || ""),
    existing: true,
  };
}

/** Always use the listing's seller — never trust client-supplied sellerEmail. */
export function resolveSellerEmailFromListing(
  listing: Record<string, unknown>,
  inputSellerEmail?: string
): string {
  const listingSeller = String(listing.sellerEmail || "").trim();
  if (!listingSeller) throw new Error("Listing has no seller");
  const clientSeller = typeof inputSellerEmail === "string" ? inputSellerEmail.trim() : "";
  if (clientSeller && clientSeller !== listingSeller) {
    console.warn("[purchase] Client sellerEmail ignored (mismatch with listing)", {
      clientSeller,
      listingSeller,
    });
  }
  return listingSeller;
}

export function sellerPayoutCents(purchase: { total?: number; processingFee?: number }): number {
  const total = Number(purchase.total) || 0;
  const fee = Number(purchase.processingFee);
  const processingFee = Number.isFinite(fee) && fee >= 0 ? fee : 1.0;
  return Math.round((total - processingFee) * 100);
}

async function resolveBuyerIdentity(buyerEmail: string, inputName?: string) {
  const profile = await adminGetProfileByEmail(buyerEmail);
  return {
    buyerName: resolveBuyerNameForStorage(inputName, profile, buyerEmail),
    buyerHandle: publicHandleFromProfile(profile),
  };
}

export async function createPurchaseWithAdmin(input: CreatePurchaseInput): Promise<CreatePurchaseResult> {
  const db = getAdminDb();
  const { buyerName } = await resolveBuyerIdentity(input.buyerEmail, input.buyerName);
  const convId = makeConversationId(input.listingId, input.buyerEmail);
  const colRef = sanitizeCheckoutCollectionName(input.collectionName || "listings");
  const now = input.paidAt ? new Date(input.paidAt) : new Date();

  let orderId = "";
  let conversationId = "";
  let isExisting = false;
  let purchaseId = "";
  let sellerEmail = "";

  await db.runTransaction(async (tx) => {
    const listingRef = db.collection(colRef).doc(input.listingId);
    const listingDoc = await tx.get(listingRef);

    if (!listingDoc.exists) {
      throw new Error("Listing not found");
    }

    const listing = listingDoc.data()! as Record<string, unknown>;
    const purchaseRef = resolvePurchaseDocRef(
      db,
      listing,
      input.listingId,
      input.buyerEmail,
      input.stripePaymentIntentId || undefined
    );
    purchaseId = purchaseRef.id;
    const convRef = db.collection("conversations").doc(convId);

    const existingPurchase = await tx.get(purchaseRef);
    const convSnap = await tx.get(convRef);

    sellerEmail = resolveSellerEmailFromListing(listing, input.sellerEmail);

    if (existingPurchase.exists) {
      const data = existingPurchase.data()!;
      orderId = data.orderId || "";
      conversationId = data.conversationId || "";
      isExisting = true;
      return;
    }

    if (listingIsExpired(listing)) {
      throw new Error("This listing has expired");
    }
    assertListingAvailableForPurchase(listing);
    if (listing.sellerEmail === input.buyerEmail) {
      throw new Error("You cannot purchase your own listing");
    }

    const listingUpdate = buildListingUpdateAfterSale(listing, {
      isRental: input.type === "rental",
      soldTo: input.buyerEmail,
    });
    if (Object.keys(listingUpdate).length > 0) {
      tx.update(listingRef, listingUpdate);
    }

    const type = input.type || "physical";
    const computedStatus = input.status === "delivered" ? "delivered"
      : input.status === "confirmed" ? "confirmed" // Allow TradeMe-style auto-confirmation
      : type === "rental" ? "rented"
      : type === "service" ? "in_progress"
      : "pending";

    const purchaseData: Record<string, any> = {
      listingId: input.listingId,
      listingTitle: input.listingTitle || listing.title || "",
      listingPrice: input.winningBid ? String(input.winningBid) : input.listingPrice || listing.price || "",
      listingImage: input.listingImage || listingPrimaryImage(listing),
      sellerEmail,
      buyerEmail: input.buyerEmail,
      buyerName,
      buyerPhone: input.buyerPhone || "",
      deliveryMethod: input.deliveryMethod || "pickup",
      shippingAddress: input.shippingAddress || "",
      shippingFee: input.shippingFee || 0,
      processingFee: input.processingFee ?? 1.00,
      total: input.total || Number(listing.price || 0) + (input.processingFee ?? 1.00),
      badgeTransfer: input.badgeTransfer || "",
      type,
      digitalFileURL: input.digitalFileURL || String(listing.digitalFileURL || ""),
      digitalFileName: input.digitalFileName || String(listing.digitalFileName || ""),
      status: computedStatus,
      destinationCharge: input.destinationCharge ?? true,
      paidAt: now,
      deliveredAt: input.deliveredAt
        ? new Date(input.deliveredAt)
        : computedStatus === "delivered"
          ? now
          : null,
      disputeDeadline: input.disputeDeadline ? new Date(input.disputeDeadline) : null,
      stripePaymentIntentId: input.stripePaymentIntentId,
      createdAt: now,
    };

    if (input.rentalStart) purchaseData.rentalStart = new Date(input.rentalStart);
    if (input.rentalEnd) purchaseData.rentalEnd = new Date(input.rentalEnd);
    if (input.rentalDays) purchaseData.rentalDays = input.rentalDays;

    tx.set(purchaseRef, purchaseData);

    const orderRef = db.collection("orders").doc();
    const orderData: Record<string, any> = {
      listingId: input.listingId,
      title: input.listingTitle || listing.title || "",
      price: input.listingPrice || listing.price || "",
      sellerEmail,
      buyerEmail: input.buyerEmail,
      status: "paid",
      purchaseId,
      createdAt: now,
    };
    tx.set(orderRef, orderData);
    orderId = orderRef.id;

    tx.update(purchaseRef, { orderId });

    if (convSnap.exists) {
      tx.update(convRef, {
        updatedAt: now,
        lastMessage: `Payment confirmed — $${(input.total || 0).toFixed(2)}`,
        orderStatus: "paid",
        orderId,
      });
      conversationId = convId;
    } else {
      const convData: Record<string, any> = {
        convKey: `listing_${input.listingId}`,
        participants: [input.buyerEmail, sellerEmail],
        buyerEmail: input.buyerEmail,
        sellerEmail,
        listingId: input.listingId,
        listingTitle: input.listingTitle || listing.title || "",
        listingPrice: input.listingPrice || listing.price || "",
        listingImage: input.listingImage || listingPrimaryImage(listing),
        orderStatus: "paid",
        orderId,
        createdAt: now,
        updatedAt: now,
        lastMessage: `Payment confirmed — $${(input.total || 0).toFixed(2)}`,
      };
      tx.set(convRef, convData);
      conversationId = convId;
      tx.update(purchaseRef, { conversationId });
    }

    const buyerMsgRef = db.collection("messages").doc();
    tx.set(buyerMsgRef, {
      type: "order",
      orderId,
      sender: "system",
      receiver: input.buyerEmail,
      participants: [input.buyerEmail, sellerEmail],
      listingId: input.listingId,
      listingTitle: input.listingTitle || listing.title || "",
      listingPrice: input.listingPrice || listing.price || "",
      orderStatus: "paid",
      text: `Payment confirmed for "${input.listingTitle || listing.title || ""}" — $${(input.total || 0).toFixed(2)}. Awaiting seller response.`,
      read: false,
      createdAt: now,
    });

    const sellerMsgRef = db.collection("messages").doc();
    tx.set(sellerMsgRef, {
      type: "order",
      orderId,
      sender: "system",
      receiver: sellerEmail,
      participants: [input.buyerEmail, sellerEmail],
      listingId: input.listingId,
      listingTitle: input.listingTitle || listing.title || "",
      listingPrice: input.listingPrice || listing.price || "",
      orderStatus: "paid",
      text: `Your listing "${input.listingTitle || listing.title || ""}" has been purchased for $${(input.total || 0).toFixed(2)}.`,
      read: false,
      createdAt: now,
    });
  });

  if (!isExisting) {
    try {
      await incrementProfileSalesCount(sellerEmail);
    } catch (e) {
      console.warn("[purchase] salesCount increment skipped:", e);
    }
  }

  return { purchaseId, orderId, conversationId, existing: isExisting };
}

export async function createPurchaseWithRest(
  input: CreatePurchaseInput,
  projectId: string,
  idToken: string
): Promise<CreatePurchaseResult> {
  const { buyerName } = await resolveBuyerIdentity(input.buyerEmail, input.buyerName);
  const purchaseId = makePurchaseId(input.listingId, input.buyerEmail);
  const convId = makeConversationId(input.listingId, input.buyerEmail);
  const colRef = sanitizeCheckoutCollectionName(input.collectionName || "listings");

  let orderId = "";
  let conversationId = "";
  let isExisting = false;

  await runRestTransaction(projectId, idToken, async ({ get, create, update }) => {
    const listing = await get(`${colRef}/${input.listingId}`);
    if (!listing) throw new Error("Listing not found");
    assertListingAvailableForPurchase(listing);
    if (listing.sellerEmail === input.buyerEmail) throw new Error("You cannot purchase your own listing");

    const sellerEmail = resolveSellerEmailFromListing(listing, input.sellerEmail);

    const existingPurchase = await get(`purchases/${purchaseId}`);
    if (existingPurchase) {
      orderId = existingPurchase.orderId || "";
      conversationId = existingPurchase.conversationId || "";
      isExisting = true;
      return;
    }

    const type = input.type || "physical";
    const now = new Date().toISOString();
    const computedStatus = input.status === "delivered" ? "delivered"
      : type === "rental" ? "rented"
      : type === "service" ? "in_progress"
      : "pending";

    const listingUpdate = buildListingUpdateAfterSale(listing, {
      isRental: type === "rental",
      soldTo: input.buyerEmail,
    });
    if (Object.keys(listingUpdate).length > 0) {
      update(`${colRef}/${input.listingId}`, listingUpdate, Object.keys(listingUpdate));
    }

    const purchaseData: Record<string, any> = {
      listingId: input.listingId,
      listingTitle: input.listingTitle || listing.title || "",
      listingPrice: input.winningBid ? String(input.winningBid) : input.listingPrice || listing.price || "",
      listingImage: input.listingImage || listingPrimaryImage(listing),
      sellerEmail,
      buyerEmail: input.buyerEmail,
      buyerName,
      buyerPhone: input.buyerPhone || "",
      deliveryMethod: input.deliveryMethod || "pickup",
      shippingAddress: input.shippingAddress || "",
      shippingFee: input.shippingFee || 0,
      processingFee: input.processingFee ?? 1.00,
      total: input.total || Number(listing.price || 0) + (input.processingFee ?? 1.00),
      badgeTransfer: input.badgeTransfer || "",
      type,
      digitalFileURL: input.digitalFileURL || "",
      digitalFileName: input.digitalFileName || "",
      status: computedStatus,
      stripePaymentIntentId: input.stripePaymentIntentId,
      createdAt: now,
      paidAt: now,
      deliveredAt: input.deliveredAt || (computedStatus === "delivered" ? now : null),
      disputeDeadline: input.disputeDeadline || null,
    };
    if (input.rentalStart) purchaseData.rentalStart = input.rentalStart;
    if (input.rentalEnd) purchaseData.rentalEnd = input.rentalEnd;
    if (input.rentalDays) purchaseData.rentalDays = input.rentalDays;

    create(`purchases/${purchaseId}`, purchaseData);

    const newOrderId = generateDocId();
    const orderData: Record<string, any> = {
      listingId: input.listingId,
      title: input.listingTitle || listing.title || "",
      price: input.listingPrice || listing.price || "",
      sellerEmail,
      buyerEmail: input.buyerEmail,
      status: "paid",
      purchaseId,
      createdAt: now,
    };
    create(`orders/${newOrderId}`, orderData);
    orderId = newOrderId;

    update(`purchases/${purchaseId}`, { orderId }, ["orderId"]);

    const convSnap = await get(`conversations/${convId}`);
    if (convSnap) {
      update(`conversations/${convId}`, {
        updatedAt: now,
        lastMessage: `Payment confirmed — $${(input.total || 0).toFixed(2)}`,
        orderStatus: "paid",
      }, ["updatedAt", "lastMessage", "orderStatus"]);
      conversationId = convId;
    } else {
      const convData: Record<string, any> = {
        convKey: `listing_${input.listingId}`,
        participants: [input.buyerEmail, sellerEmail],
        buyerEmail: input.buyerEmail,
        sellerEmail,
        listingId: input.listingId,
        listingTitle: input.listingTitle || listing.title || "",
        listingPrice: input.listingPrice || listing.price || "",
        listingImage: input.listingImage || listingPrimaryImage(listing),
        orderStatus: "paid",
        createdAt: now,
        updatedAt: now,
        lastMessage: `Payment confirmed — $${(input.total || 0).toFixed(2)}`,
      };
      create(`conversations/${convId}`, convData);
      conversationId = convId;
      update(`purchases/${purchaseId}`, { conversationId }, ["conversationId"]);
    }

    const buyerMsg: Record<string, any> = {
      type: "order",
      sender: "system",
      receiver: input.buyerEmail,
      participants: [input.buyerEmail, sellerEmail],
      listingId: input.listingId,
      listingTitle: input.listingTitle || listing.title || "",
      listingPrice: input.listingPrice || listing.price || "",
      orderStatus: "paid",
      text: `Payment confirmed for "${input.listingTitle || listing.title || ""}" — $${(input.total || 0).toFixed(2)}. Awaiting seller response.`,
      read: false,
      createdAt: now,
    };
    const sellerMsg: Record<string, any> = {
      type: "order",
      sender: "system",
      receiver: sellerEmail,
      participants: [input.buyerEmail, sellerEmail],
      listingId: input.listingId,
      listingTitle: input.listingTitle || listing.title || "",
      listingPrice: input.listingPrice || listing.price || "",
      orderStatus: "paid",
      text: `Your listing "${input.listingTitle || listing.title || ""}" has been purchased for $${(input.total || 0).toFixed(2)}.`,
      read: false,
      createdAt: now,
    };
    create(`messages/${makeMsgId()}`, buyerMsg);
    create(`messages/${makeMsgId()}`, sellerMsg);
  });

  return { purchaseId, orderId, conversationId, existing: isExisting };
}

export interface AcceptOfferInput {
  listingId: string;
  listingTitle: string;
  listingPrice: string;
  listingImage: string;
  sellerEmail: string;
  buyerEmail: string;
  amount: number;
  offerMessageId: string;
  collectionName?: string;
}

export interface AcceptOfferResult {
  purchaseId: string;
  conversationId: string;
  paymentDeadline: Date;
  existing: boolean;
}

export interface PayOfferInput {
  purchaseId: string;
  stripePaymentIntentId: string;
  total: number;
  buyerEmail?: string;
}

export interface PayOfferResult {
  purchaseId: string;
  orderId: string;
  conversationId: string;
  existing: boolean;
}

export async function acceptOfferWithAdmin(input: AcceptOfferInput): Promise<AcceptOfferResult> {
  const db = getAdminDb();
  const { buyerName } = await resolveBuyerIdentity(input.buyerEmail);
  const purchaseId = makePurchaseId(input.listingId, input.buyerEmail);
  const convId = makeConversationId(input.listingId, input.buyerEmail);
  const colRef = input.collectionName || "listings";
  const now = new Date();
  const paymentDeadline = new Date(now.getTime() + 48 * 3600000);

  let conversationId = "";
  let isExisting = false;

  await db.runTransaction(async (tx) => {
    const listingRef = db.collection(colRef).doc(input.listingId);
    const offerMsgRef = db.collection("messages").doc(input.offerMessageId);
    const purchaseRef = db.collection("purchases").doc(purchaseId);
    const convRef = db.collection("conversations").doc(convId);

    const listingDoc = await tx.get(listingRef);
    const offerMsg = await tx.get(offerMsgRef);
    const existingPurchase = await tx.get(purchaseRef);
    const convSnap = await tx.get(convRef);

    if (!listingDoc.exists) throw new Error("Listing not found");
    const listing = listingDoc.data()!;
  assertListingAvailableForPurchase(listing);
  if (listing.sellerEmail === input.buyerEmail) throw new Error("You cannot purchase your own listing");
    if (listing.sellerEmail !== input.sellerEmail) throw new Error("You are not the seller of this listing");
    if (listing.sellerEmail === input.buyerEmail) throw new Error("You cannot accept your own offer");

    if (!offerMsg.exists) throw new Error("Offer message not found");
    const offerData = offerMsg.data()!;
    if (offerData.type !== "offer") throw new Error("Message is not an offer");
    const currentStatus = offerData.offerStatus || offerData.offer?.status || "pending";
    if (currentStatus !== "pending") throw new Error(`Offer is already ${currentStatus}`);

    if (existingPurchase.exists) {
      conversationId = existingPurchase.data()!.conversationId || "";
      isExisting = true;
      return;
    }

    tx.update(offerMsgRef, {
      offerStatus: "accepted",
      offerType: "accept",
      updatedAt: now,
    });

    const purchaseData: Record<string, any> = {
      listingId: input.listingId,
      listingTitle: input.listingTitle || listing.title || "",
      listingPrice: input.listingPrice || listing.price || "",
      listingImage: input.listingImage || listingPrimaryImage(listing),
      sellerEmail: input.sellerEmail,
      buyerEmail: input.buyerEmail,
      buyerName,
      deliveryMethod: "pickup",
      processingFee: 1.00,
      total: input.amount + 1,
      type: listing.type || "physical",
      status: "offer_accepted",
      paymentDeadline,
      offerMessageId: input.offerMessageId,
      paidAt: null,
      createdAt: now,
    };
    tx.set(purchaseRef, purchaseData);

    if (convSnap.exists) {
      tx.update(convRef, {
        updatedAt: now,
        lastMessage: `Offer accepted — $${input.amount}`,
        orderStatus: "offer_accepted",
      });
      conversationId = convId;
    } else {
      tx.set(convRef, {
        convKey: `listing_${input.listingId}`,
        participants: [input.buyerEmail, input.sellerEmail],
        buyerEmail: input.buyerEmail,
        sellerEmail: input.sellerEmail,
        listingId: input.listingId,
        listingTitle: input.listingTitle || listing.title || "",
        listingPrice: input.listingPrice || listing.price || "",
        listingImage: input.listingImage || listingPrimaryImage(listing),
        orderStatus: "offer_accepted",
        createdAt: now,
        updatedAt: now,
        lastMessage: `Offer accepted — $${input.amount}`,
      });
      conversationId = convId;
      tx.update(purchaseRef, { conversationId });
    }

    const offerAcceptedMsgRef = db.collection("messages").doc();
    tx.set(offerAcceptedMsgRef, {
      type: "order",
      sender: "system",
      receiver: input.buyerEmail,
      participants: [input.buyerEmail, input.sellerEmail],
      listingId: input.listingId,
      listingTitle: input.listingTitle || listing.title || "",
      listingPrice: input.listingPrice || listing.price || "",
      orderStatus: "offer_accepted",
      text: `Offer of $${input.amount} accepted for "${input.listingTitle || listing.title || ""}". Payment due within 48 hours.`,
      read: false,
      createdAt: now,
    });
  });

  return { purchaseId, conversationId, paymentDeadline, existing: isExisting };
}

export async function payOfferWithAdmin(input: PayOfferInput): Promise<PayOfferResult> {
  const db = getAdminDb();

  let orderId = "";
  let conversationId = "";
  let listingId = "";
  let buyerEmail = "";
  let sellerEmail = "";
  let listingTitle = "";
  let listingPrice = "";
  let listingImage = "";
  let offerAmount = 0;
  let purchaseType = "";
  let isExisting = false;

  await db.runTransaction(async (tx) => {
    const purchaseRef = db.collection("purchases").doc(input.purchaseId);
    const purchaseDoc = await tx.get(purchaseRef);
    if (!purchaseDoc.exists) throw new Error("Purchase not found");
    const purchase = purchaseDoc.data()!;

    if (purchase.status === "pending" || purchase.status === "paid") {
      isExisting = true;
      orderId = purchase.orderId || "";
      conversationId = purchase.conversationId || "";
      return;
    }

    if (purchase.status !== "offer_accepted") {
      throw new Error(`Cannot pay for purchase with status "${purchase.status}"`);
    }

    const deadline = purchase.paymentDeadline?.toDate?.() || purchase.paymentDeadline;
    if (deadline && new Date(deadline).getTime() < Date.now()) {
      throw new Error("Payment deadline has passed. Please ask the seller to re-accept your offer.");
    }

    if (input.buyerEmail && purchase.buyerEmail !== input.buyerEmail) {
      throw new Error("You are not the buyer for this purchase");
    }

    const colRef = purchase.collectionName || "listings";
    const listingRef = db.collection(colRef).doc(purchase.listingId);
    const convId = makeConversationId(purchase.listingId, purchase.buyerEmail);
    const convRef = db.collection("conversations").doc(convId);

    const listingDoc = await tx.get(listingRef);
    const convSnap = await tx.get(convRef);
    if (!listingDoc.exists) throw new Error("Listing not found");
    const listing = listingDoc.data()!;

    if (!isListingAvailableForPurchase(listing)) {
      tx.update(purchaseRef, { status: "failed", failedReason: "Listing already sold to another buyer" });
      throw new Error("This listing has already been sold to another buyer");
    }

    const listingUpdate = buildListingUpdateAfterSale(listing, {
      isRental: purchase.type === "rental",
      soldTo: purchase.buyerEmail,
    });
    if (Object.keys(listingUpdate).length > 0) {
      tx.update(listingRef, listingUpdate);
    }

    const orderRef = db.collection("orders").doc();
    const orderData: Record<string, any> = {
      listingId: purchase.listingId,
      title: purchase.listingTitle || listing.title || "",
      price: purchase.listingPrice || listing.price || "",
      sellerEmail: purchase.sellerEmail,
      buyerEmail: purchase.buyerEmail,
      status: "paid",
      purchaseId: input.purchaseId,
      createdAt: new Date(),
    };
    tx.set(orderRef, orderData);
    orderId = orderRef.id;

    const now = new Date();
    const disputeDeadline = purchase.type === "digital"
      ? new Date(Date.now() + 48 * 3600000)
      : purchase.type === "service"
      ? new Date(Date.now() + 7 * 86400000)
      : null;

    tx.update(purchaseRef, {
      status: "pending",
      paidAt: now,
      stripePaymentIntentId: input.stripePaymentIntentId,
      orderId,
      total: input.total || purchase.total,
      disputeDeadline,
    });

    listingId = purchase.listingId;
    buyerEmail = purchase.buyerEmail;
    sellerEmail = purchase.sellerEmail;
    listingTitle = purchase.listingTitle;
    listingPrice = purchase.listingPrice;
    listingImage = purchase.listingImage;
    offerAmount = purchase.total || 0;
    purchaseType = purchase.type || "physical";

    if (convSnap.exists) {
      tx.update(convRef, {
        updatedAt: now,
        lastMessage: `Payment confirmed — $${(input.total || offerAmount).toFixed(2)}`,
        orderStatus: "paid",
        orderId,
      });
      conversationId = convId;
    } else {
      tx.set(convRef, {
        convKey: `listing_${purchase.listingId}`,
        participants: [buyerEmail, sellerEmail],
        buyerEmail,
        sellerEmail,
        listingId: purchase.listingId,
        listingTitle,
        listingPrice,
        listingImage,
        orderStatus: "paid",
        orderId,
        createdAt: now,
        updatedAt: now,
        lastMessage: `Payment confirmed — $${(input.total || offerAmount).toFixed(2)}`,
      });
      conversationId = convId;
      tx.update(purchaseRef, { conversationId });
    }

    const buyerMsgRef = db.collection("messages").doc();
    tx.set(buyerMsgRef, {
      type: "order",
      orderId,
      sender: "system",
      receiver: buyerEmail,
      participants: [buyerEmail, sellerEmail],
      listingId: purchase.listingId,
      listingTitle,
      listingPrice,
      orderStatus: "paid",
      text: `Payment confirmed for "${listingTitle}" — $${(input.total || offerAmount).toFixed(2)}. Awaiting seller response.`,
      read: false,
      createdAt: now,
    });

    const sellerMsgRef = db.collection("messages").doc();
    tx.set(sellerMsgRef, {
      type: "order",
      orderId,
      sender: "system",
      receiver: sellerEmail,
      participants: [buyerEmail, sellerEmail],
      listingId: purchase.listingId,
      listingTitle,
      listingPrice,
      orderStatus: "paid",
      text: `Your listing "${listingTitle}" has been purchased for $${(input.total || offerAmount).toFixed(2)}.`,
      read: false,
      createdAt: now,
    });
  });

  return { purchaseId: input.purchaseId, orderId, conversationId, existing: isExisting };
}

export async function acceptOfferWithRest(
  input: AcceptOfferInput,
  projectId: string,
  idToken: string
): Promise<AcceptOfferResult> {
  const { buyerName } = await resolveBuyerIdentity(input.buyerEmail);
  const purchaseId = makePurchaseId(input.listingId, input.buyerEmail);
  const convId = makeConversationId(input.listingId, input.buyerEmail);
  const colRef = input.collectionName || "listings";
  const now = new Date().toISOString();
  const paymentDeadline = new Date(Date.now() + 48 * 3600000);

  const listing = await firestoreGet(projectId, idToken, `${colRef}/${input.listingId}`);
  if (!listing) throw new Error("Listing not found");
  assertListingAvailableForPurchase(listing);
  if (listing.sellerEmail !== input.sellerEmail) throw new Error("You are not the seller of this listing");
  if (listing.sellerEmail === input.buyerEmail) throw new Error("You cannot accept your own offer");

  const offerMsg = await firestoreGet(projectId, idToken, `messages/${input.offerMessageId}`);
  if (!offerMsg) throw new Error("Offer message not found");
  if (offerMsg.type !== "offer") throw new Error("Message is not an offer");
  const currentStatus = offerMsg.offerStatus || offerMsg.offer?.status || "pending";
  if (currentStatus !== "pending") throw new Error(`Offer is already ${currentStatus}`);

  await firestoreUpdate(projectId, idToken, `messages/${input.offerMessageId}`, {
    offerStatus: "accepted",
    offerType: "accept",
    updatedAt: now,
  } as Record<string, unknown>);

  const existingPurchase = await firestoreGet(projectId, idToken, `purchases/${purchaseId}`);
  if (existingPurchase) {
    return {
      purchaseId,
      conversationId: existingPurchase.conversationId || convId,
      paymentDeadline,
      existing: true,
    };
  }

  const purchaseData: Record<string, unknown> = {
    listingId: input.listingId,
    listingTitle: input.listingTitle || listing.title || "",
    listingPrice: input.listingPrice || listing.price || "",
    listingImage: input.listingImage || listingPrimaryImage(listing),
    sellerEmail: input.sellerEmail,
    buyerEmail: input.buyerEmail,
    buyerName,
    deliveryMethod: "pickup",
    processingFee: 1.00,
    total: input.amount + 1,
    type: listing.type || "physical",
    status: "offer_accepted",
    paymentDeadline,
    offerMessageId: input.offerMessageId,
    paidAt: null,
    createdAt: now,
  };

  await firestoreCreate(projectId, idToken, `purchases/${purchaseId}`, purchaseData);

  const convSnap = await firestoreGet(projectId, idToken, `conversations/${convId}`);
  if (!convSnap) {
    await firestoreCreate(projectId, idToken, `conversations/${convId}`, {
      convKey: `listing_${input.listingId}`,
      participants: [input.buyerEmail, input.sellerEmail],
      buyerEmail: input.buyerEmail,
      sellerEmail: input.sellerEmail,
      listingId: input.listingId,
      listingTitle: input.listingTitle || listing.title || "",
      listingPrice: input.listingPrice || listing.price || "",
      listingImage: input.listingImage || listingPrimaryImage(listing),
      orderStatus: "offer_accepted",
      createdAt: now,
      updatedAt: now,
      lastMessage: `Offer accepted — $${input.amount}`,
    } as Record<string, unknown>);
    await firestoreUpdate(projectId, idToken, `purchases/${purchaseId}`, { conversationId: convId } as Record<string, unknown>);
  } else {
    await firestoreUpdate(projectId, idToken, `conversations/${convId}`, {
      updatedAt: now,
      lastMessage: `Offer accepted — $${input.amount}`,
      orderStatus: "offer_accepted",
    } as Record<string, unknown>);
  }

  await firestoreCreate(projectId, idToken, `messages/${makeMsgId()}`, {
    type: "order",
    sender: "system",
    receiver: input.buyerEmail,
    participants: [input.buyerEmail, input.sellerEmail],
    listingId: input.listingId,
    listingTitle: input.listingTitle || listing.title || "",
    listingPrice: input.listingPrice || listing.price || "",
    orderStatus: "offer_accepted",
    text: `Offer of $${input.amount} accepted for "${input.listingTitle || listing.title || ""}". Payment due within 48 hours.`,
    read: false,
    createdAt: now,
  } as Record<string, unknown>);

  return { purchaseId, conversationId: convId, paymentDeadline, existing: false };
}

export async function payOfferWithRest(
  input: PayOfferInput,
  idToken: string
): Promise<PayOfferResult> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";

  let orderId = "";
  let conversationId = "";
  let isExisting = false;

  await runRestTransaction(projectId, idToken, async ({ get, create, update }) => {
    const purchase = await get(`purchases/${input.purchaseId}`);
    if (!purchase) throw new Error("Purchase not found");

    if (purchase.status === "pending" || purchase.status === "paid") {
      orderId = purchase.orderId || "";
      conversationId = purchase.conversationId || "";
      isExisting = true;
      return;
    }

    if (purchase.status !== "offer_accepted") {
      throw new Error(`Cannot pay for purchase with status "${purchase.status}"`);
    }

    const deadline = purchase.paymentDeadline;
    if (deadline && new Date(deadline).getTime() < Date.now()) {
      throw new Error("Payment deadline has passed. Please ask the seller to re-accept your offer.");
    }

    if (input.buyerEmail && purchase.buyerEmail !== input.buyerEmail) {
      throw new Error("You are not the buyer for this purchase");
    }

    const colRef = purchase.collectionName || "listings";
    const listing = await get(`${colRef}/${purchase.listingId}`);
    if (!listing) throw new Error("Listing not found");

    if (!isListingAvailableForPurchase(listing)) {
      update(`purchases/${input.purchaseId}`, {
        status: "failed",
        failedReason: "Listing already sold to another buyer",
      } as Record<string, unknown>, ["status", "failedReason"]);
      throw new Error("This listing has already been sold to another buyer");
    }

    const now = new Date().toISOString();
    const listingUpdate = buildListingUpdateAfterSale(listing, {
      isRental: purchase.type === "rental",
      soldTo: purchase.buyerEmail,
    });
    if (Object.keys(listingUpdate).length > 0) {
      update(`${colRef}/${purchase.listingId}`, listingUpdate, Object.keys(listingUpdate));
    }

    const newOrderId = generateDocId();
    const orderData: Record<string, unknown> = {
      listingId: purchase.listingId,
      title: purchase.listingTitle || listing.title || "",
      price: purchase.listingPrice || listing.price || "",
      sellerEmail: purchase.sellerEmail,
      buyerEmail: purchase.buyerEmail,
      status: "paid",
      purchaseId: input.purchaseId,
      createdAt: now,
    };
    create(`orders/${newOrderId}`, orderData);
    orderId = newOrderId;

    const disputeDeadline = purchase.type === "digital"
      ? new Date(Date.now() + 48 * 3600000).toISOString()
      : purchase.type === "service"
      ? new Date(Date.now() + 7 * 86400000).toISOString()
      : null;

    update(`purchases/${input.purchaseId}`, {
      status: "pending",
      paidAt: now,
      stripePaymentIntentId: input.stripePaymentIntentId,
      orderId,
      total: input.total || purchase.total,
      disputeDeadline,
    } as Record<string, unknown>, ["status", "paidAt", "stripePaymentIntentId", "orderId", "total", "disputeDeadline"]);

    const convId = makeConversationId(purchase.listingId, purchase.buyerEmail);
    const convSnap = await get(`conversations/${convId}`);
    if (convSnap) {
      update(`conversations/${convId}`, {
        updatedAt: now,
        lastMessage: `Payment confirmed — $${(input.total || purchase.total || 0).toFixed(2)}`,
        orderStatus: "paid",
      } as Record<string, unknown>, ["updatedAt", "lastMessage", "orderStatus"]);
      conversationId = convId;
    } else {
      const convData: Record<string, unknown> = {
        convKey: `listing_${purchase.listingId}`,
        participants: [purchase.buyerEmail, purchase.sellerEmail],
        buyerEmail: purchase.buyerEmail,
        sellerEmail: purchase.sellerEmail,
        listingId: purchase.listingId,
        listingTitle: purchase.listingTitle || listing.title || "",
        listingPrice: purchase.listingPrice || listing.price || "",
        listingImage: purchase.listingImage || listingPrimaryImage(listing),
        orderStatus: "paid",
        orderId,
        createdAt: now,
        updatedAt: now,
        lastMessage: `Payment confirmed — $${(input.total || purchase.total || 0).toFixed(2)}`,
      };
      create(`conversations/${convId}`, convData);
      conversationId = convId;
      update(`purchases/${input.purchaseId}`, { conversationId } as Record<string, unknown>, ["conversationId"]);
    }

    const buyerMsg: Record<string, unknown> = {
      type: "order",
      orderId,
      sender: "system",
      receiver: purchase.buyerEmail,
      participants: [purchase.buyerEmail, purchase.sellerEmail],
      listingId: purchase.listingId,
      listingTitle: purchase.listingTitle || listing.title || "",
      listingPrice: purchase.listingPrice || listing.price || "",
      orderStatus: "paid",
      text: `Payment confirmed for "${purchase.listingTitle || listing.title || ""}" — $${(input.total || purchase.total || 0).toFixed(2)}. Awaiting seller response.`,
      read: false,
      createdAt: now,
    };
    const sellerMsg: Record<string, unknown> = {
      type: "order",
      orderId,
      sender: "system",
      receiver: purchase.sellerEmail,
      participants: [purchase.buyerEmail, purchase.sellerEmail],
      listingId: purchase.listingId,
      listingTitle: purchase.listingTitle || listing.title || "",
      listingPrice: purchase.listingPrice || listing.price || "",
      orderStatus: "paid",
      text: `Your listing "${purchase.listingTitle || listing.title || ""}" has been purchased for $${(input.total || purchase.total || 0).toFixed(2)}.`,
      read: false,
      createdAt: now,
    };
    create(`messages/${makeMsgId()}`, buyerMsg);
    create(`messages/${makeMsgId()}`, sellerMsg);
  });

  return { purchaseId: input.purchaseId, orderId, conversationId, existing: isExisting };
}

let _msgCounter = 0;
function makeMsgId(): string {
  _msgCounter++;
  return `msg_${Date.now()}_${_msgCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

function toFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number") return { doubleValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.timestampValue) return new Date(val.timestampValue);
  if (val.nullValue !== undefined) return null;
  if (val.arrayValue?.values) return val.arrayValue.values.map(fromFirestoreValue);
  if (val.mapValue?.fields) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields)) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return val;
}

async function firestoreGet(projectId: string, idToken: string, path: string): Promise<any> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.fields ? fromFirestoreValue({ mapValue: { fields: data.fields } }) : data;
}

async function firestoreCreate(projectId: string, idToken: string, path: string, data: Record<string, unknown>): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const fields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFirestoreValue(val);
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH error: ${res.status} ${await res.text()}`);
}

async function firestoreCreateWithId(projectId: string, idToken: string, collection: string, data: Record<string, unknown>): Promise<string> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`;
  const fields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFirestoreValue(val);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore POST error: ${res.status} ${await res.text()}`);
  const result = await res.json();
  return result.name?.split("/").pop() || "";
}

async function firestoreUpdate(projectId: string, idToken: string, path: string, data: Record<string, unknown>): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?updateMask.fieldPaths=${Object.keys(data).join("&updateMask.fieldPaths=")}`;
  const fields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFirestoreValue(val);
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH error: ${res.status} ${await res.text()}`);
}

async function firestoreDelete(projectId: string, idToken: string, path: string): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` } }).catch(() => {});
}

// ==================== Firestore REST Transaction Support ====================

function generateDocId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 20; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function docPath(projectId: string, path: string): string {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

async function beginRestTransaction(projectId: string, idToken: string): Promise<string> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:beginTransaction`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Begin transaction error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.transaction;
}

async function restTransactionGet(projectId: string, idToken: string, path: string, transaction: string): Promise<any> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?transaction=${encodeURIComponent(transaction)}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.fields ? fromFirestoreValue({ mapValue: { fields: data.fields } }) : data;
}

interface RestWrite {
  update?: {
    name: string;
    fields: Record<string, unknown>;
  };
  updateMask?: { fieldPaths: string[] };
}

async function commitRestTransaction(
  projectId: string,
  idToken: string,
  transaction: string,
  writes: RestWrite[]
): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ transaction, writes }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Commit transaction error: ${res.status} ${text}`);
  }
}

interface TxHelpers {
  get: (path: string) => Promise<any>;
  create: (path: string, data: Record<string, unknown>) => void;
  update: (path: string, data: Record<string, unknown>, fieldPaths?: string[]) => void;
}

async function runRestTransaction<T>(
  projectId: string,
  idToken: string,
  fn: (helpers: TxHelpers) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const txId = await beginRestTransaction(projectId, idToken);
    const writes: RestWrite[] = [];
    let result: T;

    try {
      const helpers: TxHelpers = {
        get: (path: string) => restTransactionGet(projectId, idToken, path, txId),
        create: (path: string, data: Record<string, unknown>) => {
          writes.push({
            update: {
              name: docPath(projectId, path),
              fields: toFirestoreFields(data),
            },
          });
        },
        update: (path: string, data: Record<string, unknown>, fieldPaths?: string[]) => {
          const write: RestWrite = {
            update: {
              name: docPath(projectId, path),
              fields: toFirestoreFields(data),
            },
          };
          if (fieldPaths && fieldPaths.length > 0) {
            write.updateMask = { fieldPaths };
          }
          writes.push(write);
        },
      };

      result = await fn(helpers);
    } catch (err) {
      // Rollback on error
      const rollbackUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:rollback`;
      try {
        await fetch(rollbackUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: txId }),
        });
      } catch {}
      throw err;
    }

    try {
      await commitRestTransaction(projectId, idToken, txId, writes);
      return result!;
    } catch (err: any) {
      lastError = err as Error;
      const msg = String(err?.message || "");
      if (msg.includes("ABORTED") || msg.includes("aborted") || msg.includes("UNAVAILABLE")) {
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("Transaction failed after max retries");
}

function toFirestoreFields(data: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFirestoreValue(val);
  }
  return fields;
}

export {
  buildArrangePurchaseBuyerMessage,
  buildArrangePurchaseSellerMessage,
  buildArrangePaymentDetailsMessage,
} from "./arrange-payment-details";

/** Purchase document fields for Arrange Purchase (contact) sales. */
export function buildArrangePurchaseData(
  listing: Record<string, unknown>,
  listingId: string,
  buyerEmail: string,
  conversationId: string,
  collectionName: string,
  buyerPublicName = "Buyer"
): Record<string, unknown> {
  const sellerEmail = String(listing.sellerEmail || "");
  const price = String(listing.price || "0");
  const image =
    (Array.isArray(listing.images) ? listing.images[0] : "") ||
    String(listing.imageUrl || listing.image || "");
  const now = new Date();

  return {
    listingId,
    listingTitle: String(listing.title || "Item"),
    listingPrice: price,
    listingImage: image,
    sellerEmail,
    buyerEmail,
    buyerName: buyerPublicName,
    buyerPhone: "",
    deliveryMethod: "pickup",
    shippingAddress: "",
    shippingFee: 0,
    processingFee: 0,
    total: Number(price) || 0,
    type: String(listing.type || "physical"),
    status: "arrange_requested",
    paymentType: "contact",
    collectionName,
    conversationId,
    destinationCharge: false,
    paidAt: null,
    createdAt: now,
  };
}

/** Backfill purchase row for sold Arrange Purchase listings (pre-fix sales). */
export async function repairMissingArrangePurchasesForSeller(
  sellerEmail: string
): Promise<number> {
  const db = getAdminDb();
  const snap = await db
    .collection("listings")
    .where("sellerEmail", "==", sellerEmail)
    .where("status", "==", "sold")
    .limit(100)
    .get();

  let repaired = 0;
  for (const listingDoc of snap.docs) {
    const listing = listingDoc.data() as Record<string, unknown>;
    if (String(listing.paymentType || "") !== "contact") continue;
    const buyerEmail = String(listing.soldTo || "");
    if (!buyerEmail) continue;

    const purchaseId = makePurchaseId(listingDoc.id, buyerEmail);
    const purchaseRef = db.collection("purchases").doc(purchaseId);
    const existing = await purchaseRef.get();
    if (existing.exists) continue;

    const convId = makeConversationId(listingDoc.id, buyerEmail);
    const buyerPublicName = await adminGetPublicName(buyerEmail);
    await purchaseRef.set(
      buildArrangePurchaseData(
        listing,
        listingDoc.id,
        buyerEmail,
        convId,
        "listings",
        buyerPublicName
      )
    );
    repaired += 1;
  }
  return repaired;
}
