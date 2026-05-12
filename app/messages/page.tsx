"use client";

import { useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import { auth, db } from "../lib/firebase";

export default function MessagesPage() {
  const [user, setUser] =
    useState<User | null>(null);

  const [messages, setMessages] =
    useState<any[]>([]);

  const [message, setMessage] =
    useState("");

  const [chatUser, setChatUser] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [blockedUsers, setBlockedUsers] =
    useState<string[]>([]);

  const [usernames, setUsernames] =
    useState<
      Record<string, string>
    >({});

  useEffect(() => {
    const savedBlocked =
      JSON.parse(
        localStorage.getItem(
          "blockedUsers"
        ) || "[]"
      );

    setBlockedUsers(
      savedBlocked
    );
  }, []);

  useEffect(() => {
    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);
        }
      );

    return () => unsubscribeAuth();
  }, []);

  async function fetchUsername(
    email: string
  ) {
    if (
      usernames[email]
    )
      return;

    try {
      const profileQuery =
        query(
          collection(
            db,
            "profiles"
          ),
          where(
            "email",
            "==",
            email
          )
        );

      const snapshot =
        await getDocs(
          profileQuery
        );

      if (
        !snapshot.empty
      ) {
        const username =
          snapshot.docs[0].data()
            .username;

        setUsernames(
          (
            prev
          ) => ({
            ...prev,
            [email]:
              username,
          })
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    if (!user?.email) return;

    const messagesQuery = query(
      collection(db, "messages"),
      where(
        "participants",
        "array-contains",
        user.email
      ),
      orderBy("createdAt", "desc")
    );

    const unsubscribe =
      onSnapshot(
        messagesQuery,
        async (
          snapshot
        ) => {
          const items =
            snapshot.docs
              .map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }))
              .filter(
                (
                  msg: any
                ) => {
                  const otherUser =
                    msg.participants?.find(
                      (
                        participant: string
                      ) =>
                        participant !==
                        user.email
                    );

                  return !blockedUsers.includes(
                    otherUser
                  );
                }
              );

          setMessages(items);

          // FETCH USERNAMES
          for (const msg of items) {
            await fetchUsername(
              msg.sender
            );

            await fetchUsername(
              msg.receiver
            );
          }

          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, [
    user,
    blockedUsers,
  ]);

  async function sendMessage() {
    if (!message.trim())
      return;

    if (!user?.email) {
      alert(
        "You must be logged in."
      );

      return;
    }

    if (
      !chatUser.trim()
    ) {
      alert(
        "Select a conversation."
      );

      return;
    }

    if (
      blockedUsers.includes(
        chatUser
      )
    ) {
      alert(
        "This user is blocked."
      );

      return;
    }

    try {
      await addDoc(
        collection(
          db,
          "messages"
        ),
        {
          text: message,
          sender:
            user.email,
          receiver:
            chatUser,
          participants: [
            user.email,
            chatUser,
          ],
          createdAt:
            serverTimestamp(),
        }
      );

      setMessage("");
    } catch (error) {
      console.error(error);

      alert(
        "Failed to send message."
      );
    }
  }

  const conversationMap =
    new Map();

  messages.forEach(
    (msg: any) => {
      const otherUser =
        msg.participants?.find(
          (
            participant: string
          ) =>
            participant !==
            user?.email
        );

      if (
        otherUser &&
        !conversationMap.has(
          otherUser
        )
      ) {
        conversationMap.set(
          otherUser,
          msg
        );
      }
    }
  );

  const conversations =
    Array.from(
      conversationMap.entries()
    );

  const filteredMessages =
    messages
      .filter((msg: any) =>
        msg.participants?.includes(
          chatUser
        )
      )
      .reverse();

  function formatTime(
    timestamp: any
  ) {
    if (
      !timestamp?.seconds
    )
      return "";

    const date =
      new Date(
        timestamp.seconds *
          1000
      );

    return date.toLocaleTimeString(
      [],
      {
        hour: "numeric",
        minute: "2-digit",
      }
    );
  }

  function getDisplayName(
    email: string
  ) {
    return (
      usernames[email] ||
      email
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />

      <Navbar />

      <ThemeToggle />

      <section className="relative z-10 mx-auto flex max-w-7xl px-6 py-12">
        <div className="flex h-[750px] w-full overflow-hidden rounded-[40px] border border-[var(--card-border)] bg-[var(--card)] shadow-2xl backdrop-blur-xl">
          {/* SIDEBAR */}
          <div className="flex w-[340px] flex-col border-r border-[var(--card-border)]">
            <div className="border-b border-[var(--card-border)] p-6">
              <h1 className="text-3xl font-black text-sky-400">
                Inbox
              </h1>

              <p className="mt-2 text-sm text-[var(--muted)]">
                Marketplace conversations.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-zinc-500">
                  Loading...
                </div>
              ) : conversations.length ===
                0 ? (
                <div className="p-6 text-sm text-zinc-500">
                  No conversations yet.
                </div>
              ) : (
                conversations.map(
                  ([
                    participant,
                    msg,
                  ]: any) => (
                    <button
                      key={
                        participant
                      }
                      onClick={() =>
                        setChatUser(
                          participant
                        )
                      }
                      className={`flex w-full flex-col border-b border-[var(--card-border)] px-6 py-5 text-left transition hover:bg-sky-500/10 ${
                        chatUser ===
                        participant
                          ? "bg-sky-500/10"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-black">
                          {getDisplayName(
                            participant
                          )}
                        </span>

                        <span className="text-xs text-zinc-500">
                          {formatTime(
                            msg.createdAt
                          )}
                        </span>
                      </div>

                      <p className="mt-2 line-clamp-1 text-sm text-zinc-500">
                        {
                          msg.text
                        }
                      </p>
                    </button>
                  )
                )
              )}
            </div>
          </div>

          {/* CHAT AREA */}
          <div className="flex flex-1 flex-col">
            <div className="border-b border-[var(--card-border)] p-6">
              <h2 className="text-2xl font-black">
                {chatUser
                  ? getDisplayName(
                      chatUser
                    )
                  : "Select Conversation"}
              </h2>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {filteredMessages.length ===
              0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="mb-4 text-6xl">
                    💬
                  </div>

                  <h2 className="text-3xl font-black">
                    No messages
                  </h2>
                </div>
              ) : (
                filteredMessages.map(
                  (msg: any) => {
                    const isOwnMessage =
                      user?.email ===
                      msg.sender;

                    return (
                      <div
                        key={
                          msg.id
                        }
                        className={`flex ${
                          isOwnMessage
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[75%] rounded-3xl px-5 py-4 shadow-lg ${
                            isOwnMessage
                              ? "bg-sky-500 text-white"
                              : "bg-[var(--soft-card)] text-[var(--foreground)]"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <p className="text-xs font-bold opacity-70">
                              {getDisplayName(
                                msg.sender
                              )}
                            </p>

                            <span className="text-xs opacity-70">
                              {formatTime(
                                msg.createdAt
                              )}
                            </span>
                          </div>

                          <p className="break-words text-lg">
                            {
                              msg.text
                            }
                          </p>
                        </div>
                      </div>
                    );
                  }
                )
              )}
            </div>

            {/* INPUT */}
            <div className="border-t border-[var(--card-border)] p-5">
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) =>
                    setMessage(
                      e.target.value
                    )
                  }
                  className="flex-1 rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-4 text-[var(--foreground)] outline-none transition focus:border-sky-400"
                />

                <button
                  onClick={
                    sendMessage
                  }
                  className="rounded-2xl bg-sky-500 px-8 py-4 font-black text-white transition hover:bg-sky-400"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}