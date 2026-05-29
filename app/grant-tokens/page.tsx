"use client";

import { useState } from "react";
import { getAuth } from "firebase/auth";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function GrantTokensPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [count, setCount] = useState(100);

  const grant = async () => {
    const user = getAuth().currentUser;
    if (!user) { setStatus("Not logged in"); return; }
    if (user.email !== "test@skydrop.nz") { setStatus("This page is only for test@skydrop.nz"); return; }
    setStatus("Granting...");
    const batchSize = 10;
    for (let i = 0; i < count; i += batchSize) {
      const promises = [];
      for (let j = 0; j < batchSize && i + j < count; j++) {
        promises.push(addDoc(collection(db, "dropTokens"), {
          ownerId: user.uid,
          ownerEmail: user.email,
          originDropId: "admin_grant",
          status: "available",
          createdAt: serverTimestamp(),
        }).catch((e) => { console.error("Token grant failed:", e); setStatus("Error granting token. Check console."); }));
      }
      try {
        await Promise.all(promises);
      } catch (e) {
        console.error("Batch grant failed:", e);
        setStatus("Error granting batch. Stopped.");
        return;
      }
      setStatus(`Granted ${Math.min(i + batchSize, count)} / ${count}...`);
    }
    setStatus(`Done! ${count} drop tokens granted to ${user.email}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <h1 className="mb-4 text-xl font-bold text-white">Grant Drop Tokens</h1>
        <p className="mb-4 text-sm text-zinc-400">Only works for test@skydrop.nz</p>
        <input type="number" value={count} onChange={e => setCount(Number(e.target.value))}
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-center text-white" />
        <button onClick={grant}
          className="rounded-lg bg-amber-500 px-6 py-2 font-bold text-black hover:bg-amber-400">
          Grant Drop Tokens
        </button>
        {status && <p className="mt-4 text-sm text-zinc-300">{status}</p>}
      </div>
    </div>
  );
}
