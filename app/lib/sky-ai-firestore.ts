import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { stripSkyAiMachineTags } from "./sky-ai-listing-fill";

const COL = "skyAiConversations";

export async function assertConversationOwner(conversationId: string, uid: string) {
  const db = getAdminDb();
  const snap = await db.collection(COL).doc(conversationId).get();
  if (!snap.exists || snap.data()?.uid !== uid) {
    throw new Error("Conversation not found");
  }
  return snap;
}

export async function createSkyAiConversation(uid: string, email: string): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection(COL).doc();
  await ref.set({
    uid,
    email: email || "",
    title: "New chat",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    messageCount: 0,
    lastPreview: "",
  });
  return ref.id;
}

export async function listSkyAiConversations(uid: string, limit = 25) {
  const db = getAdminDb();
  const snap = await db
    .collection(COL)
    .where("uid", "==", uid)
    .orderBy("updatedAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    const updatedAt = d.updatedAt as Timestamp | undefined;
    return {
      id: doc.id,
      title: String(d.title || "Chat"),
      updatedAt: updatedAt?.toMillis?.() ?? null,
      messageCount: Number(d.messageCount || 0),
    };
  });
}

export async function loadSkyAiMessages(conversationId: string, uid: string, limit = 40) {
  await assertConversationOwner(conversationId, uid);
  const db = getAdminDb();
  const snap = await db
    .collection(COL)
    .doc(conversationId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limitToLast(limit)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      role: d.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(d.content || ""),
      navigateTo: d.navigateTo ? String(d.navigateTo) : undefined,
      createdAt: (d.createdAt as Timestamp | undefined)?.toMillis?.() ?? null,
    };
  });
}

function titleFromMessage(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Chat";
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

export async function appendSkyAiExchange(
  conversationId: string,
  uid: string,
  userContent: string,
  assistantContent: string,
  navigateTo?: string
) {
  const db = getAdminDb();
  const convRef = db.collection(COL).doc(conversationId);
  const convSnap = await assertConversationOwner(conversationId, uid);
  const isFirst = Number(convSnap.data()?.messageCount || 0) === 0;

  const batch = db.batch();
  const userRef = convRef.collection("messages").doc();
  const assistantRef = convRef.collection("messages").doc();

  batch.set(userRef, {
    role: "user",
    content: userContent.slice(0, 8000),
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(assistantRef, {
    role: "assistant",
    content: assistantContent.slice(0, 8000),
    navigateTo: navigateTo || null,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(convRef, {
    updatedAt: FieldValue.serverTimestamp(),
    messageCount: FieldValue.increment(2),
    lastPreview: stripSkyAiMachineTags(assistantContent).slice(0, 120),
    ...(isFirst ? { title: titleFromMessage(userContent) } : {}),
  });

  await batch.commit();
}

export async function deleteSkyAiConversation(conversationId: string, uid: string) {
  const db = getAdminDb();
  await assertConversationOwner(conversationId, uid);
  const messagesSnap = await db
    .collection(COL)
    .doc(conversationId)
    .collection("messages")
    .limit(500)
    .get();
  const batch = db.batch();
  messagesSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.collection(COL).doc(conversationId));
  await batch.commit();
}
