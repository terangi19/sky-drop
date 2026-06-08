type MessageUnreadFields = {
  sender?: string;
  receiver?: string;
  read?: boolean;
  participants?: string[];
  listingId?: string | null;
  type?: string;
  createdAt?: { toMillis?: () => number; seconds?: number };
};

function normalizeListingId(id?: string | null): string | null {
  return id || null;
}

/** Whether a message belongs to the active chat thread (user + other party + listing context). */
export function messageInActiveConversation(
  msg: MessageUnreadFields,
  userEmail: string,
  chatUser: string,
  chatListingId: string | null
): boolean {
  if (!userEmail || !chatUser) return false;
  if (!msg.participants?.includes(userEmail) || !msg.participants?.includes(chatUser)) return false;
  if (msg.type === "system" && msg.sender === "system" && msg.receiver && msg.receiver !== userEmail) {
    return false;
  }
  const msgListing = normalizeListingId(msg.listingId);
  const activeListing = normalizeListingId(chatListingId);
  if (activeListing) return msgListing === activeListing;
  return !msgListing;
}

/** Matches Navbar logic: incoming unread for the signed-in user. */
export function isUnreadMessageForUser(
  msg: MessageUnreadFields,
  userEmail: string | null | undefined
): boolean {
  if (!userEmail || msg.read) return false;
  if (msg.sender === userEmail) return false;
  const receiver = msg.receiver;
  if (receiver) return receiver === userEmail;
  return !!msg.sender && msg.sender !== userEmail;
}

export function conversationKey(otherEmail: string, listingId?: string | null): string {
  return `${otherEmail}||${listingId || ""}`;
}

export type UnreadConversationTarget = {
  participant: string;
  listingId: string | null;
  latestAt: number;
  unreadCount: number;
};

export function listUnreadConversations(
  messages: MessageUnreadFields[],
  userEmail: string,
  blockedUsers: string[] = []
): UnreadConversationTarget[] {
  const byKey = new Map<string, UnreadConversationTarget>();

  for (const msg of messages) {
    if (!isUnreadMessageForUser(msg, userEmail)) continue;
    const other = msg.participants?.find((p) => p !== userEmail);
    if (!other || blockedUsers.includes(other)) continue;
    const key = conversationKey(other, msg.listingId);
    const time = msg.createdAt?.toMillis?.() || (msg.createdAt?.seconds ?? 0) * 1000 || 0;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        participant: other,
        listingId: normalizeListingId(msg.listingId),
        latestAt: time,
        unreadCount: 1,
      });
      continue;
    }
    existing.unreadCount += 1;
    if (time > existing.latestAt) existing.latestAt = time;
  }

  return Array.from(byKey.values()).sort((a, b) => b.latestAt - a.latestAt);
}

export function findLatestUnreadConversation(
  messages: MessageUnreadFields[],
  userEmail: string,
  blockedUsers: string[] = []
): { participant: string; listingId: string | null } | null {
  const first = listUnreadConversations(messages, userEmail, blockedUsers)[0];
  return first ? { participant: first.participant, listingId: first.listingId } : null;
}
