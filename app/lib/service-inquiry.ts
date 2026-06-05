import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
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
  const existingConv = await getDocs(
    query(
      collection(db, "conversations"),
      where("convKey", "==", convKey),
      where("participants", "array-contains", buyerEmail)
    )
  );

  let convId: string;
  const { buyerMsg, sellerMsg, lastMessage } = buildServiceInquiryCopy(
    listingTitle,
    pricingType,
    listingPrice
  );

  if (!existingConv.empty) {
    convId = existingConv.docs[0]!.id;
    await updateDoc(doc(db, "conversations", convId), {
      updatedAt: serverTimestamp(),
      lastMessage,
      servicePricingType: pricingType,
    });
  } else {
    const convRef = await addDoc(collection(db, "conversations"), {
      convKey,
      participants: [buyerEmail, sellerEmail],
      buyerEmail,
      sellerEmail,
      listingId,
      listingTitle,
      listingPrice: listingPrice || "",
      listingImage: listingImage || "",
      listingType: "service",
      servicePricingType: pricingType,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage,
    });
    convId = convRef.id;

    await addDoc(collection(db, "messages"), {
      type: "system",
      text: buyerMsg,
      sender: "system",
      receiver: sellerEmail,
      participants: [buyerEmail, sellerEmail],
      conversationId: convId,
      listingId,
      listingTitle,
      read: false,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, "messages"), {
      type: "text",
      text: sellerMsg,
      sender: "system",
      receiver: sellerEmail,
      participants: [buyerEmail, sellerEmail],
      conversationId: convId,
      listingId,
      listingTitle,
      read: false,
      createdAt: serverTimestamp(),
    });
  }

  return convId;
}

export type { ServicePricingType };
