import { doc, getDoc, getDocs, onSnapshot, type DocumentReference, type Query, type DocumentSnapshot, type QuerySnapshot, type FirestoreError } from "firebase/firestore";
import { db } from "./firebase";

export function isOnline(): boolean {
  try {
    if (typeof navigator === "undefined") return true;
    if (typeof navigator.onLine === "boolean") return navigator.onLine;
    return true;
  } catch {
    return true;
  }
}

export function parseFirestoreError(err: unknown): { message: string; code: string; recoverable: boolean } {
  const fe = err as FirestoreError;
  const code = fe?.code || "unknown";
  const msg = fe?.message || "An unknown error occurred";

  switch (code) {
    case "permission-denied":
      return { message: "You don't have permission to perform this action.", code, recoverable: false };
    case "unavailable":
    case "deadline-exceeded":
      return { message: "Service temporarily unavailable. Please try again.", code, recoverable: true };
    case "not-found":
      return { message: "The requested document was not found.", code, recoverable: false };
    case "resource-exhausted":
      return { message: "Too many requests. Please slow down.", code, recoverable: true };
    case "unauthenticated":
      return { message: "Please sign in to continue.", code, recoverable: false };
    case "failed-precondition":
      if (msg.includes("index")) return { message: "Still loading. Please wait a moment.", code, recoverable: true };
      return { message: "Operation failed. Please try again.", code, recoverable: true };
    default:
      if (msg.includes("offline")) return { message: "You appear to be offline. Check your connection.", code: "offline", recoverable: true };
      if (msg.includes("network")) return { message: "Network error. Check your connection.", code: "unavailable", recoverable: true };
      return { message: msg, code, recoverable: true };
  }
}

export async function safeGetDoc<T>(ref: DocumentReference<T>, retries = 2): Promise<DocumentSnapshot<T> | null> {
  if (!isOnline()) {
    console.warn("[Firestore] Client is offline — deferring getDoc");
    return null;
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await getDoc(ref);
    } catch (err) {
      const parsed = parseFirestoreError(err);
      console.error(`[Firestore] getDoc failed (attempt ${attempt + 1}/${retries + 1}):`, parsed.code, parsed.message);
      if (attempt < retries && parsed.recoverable) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error("[Firestore] getDoc exhausted retries:", parsed);
      return null;
    }
  }
  return null;
}

export async function safeGetDocs<T>(query: Query<T>, retries = 2): Promise<QuerySnapshot<T> | null> {
  if (!isOnline()) {
    console.warn("[Firestore] Client is offline — deferring getDocs");
    return null;
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await getDocs(query);
    } catch (err) {
      const parsed = parseFirestoreError(err);
      console.error(`[Firestore] getDocs failed (attempt ${attempt + 1}/${retries + 1}):`, parsed.code, parsed.message);
      if (attempt < retries && parsed.recoverable) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error("[Firestore] getDocs exhausted retries:", parsed);
      return null;
    }
  }
  return null;
}

export function safeOnSnapshot<T>(
  ref: DocumentReference<T>,
  onNext: (snap: DocumentSnapshot<T>) => void,
  onError?: (parsed: ReturnType<typeof parseFirestoreError>) => void
): () => void;
export function safeOnSnapshot<T>(
  ref: Query<T>,
  onNext: (snap: QuerySnapshot<T>) => void,
  onError?: (parsed: ReturnType<typeof parseFirestoreError>) => void
): () => void;
export function safeOnSnapshot<T>(
  ref: any,
  onNext: (snap: any) => void,
  onError?: (parsed: ReturnType<typeof parseFirestoreError>) => void
) {
  return onSnapshot(
    ref,
    (snap: any) => onNext(snap),
    (err: FirestoreError) => {
      const parsed = parseFirestoreError(err);
      console.error("[Firestore] onSnapshot error:", parsed.code, parsed.message);
      onError?.(parsed);
    }
  );
}
