import {
  getDoc as fsGetDoc,
  getDocs as fsGetDocs,
  onSnapshot as fsOnSnapshot,
  type DocumentReference,
  type DocumentData,
  type Query,
  type QuerySnapshot,
  type DocumentSnapshot,
  type Unsubscribe,
  type SnapshotListenOptions,
  type FirestoreError,
} from "firebase/firestore";
import { bumpDevRequestStat } from "./dev-request-instrumentation";

export function getDocInstrumented<T extends DocumentData>(
  reference: DocumentReference<T>
): Promise<DocumentSnapshot<T>> {
  bumpDevRequestStat("getDoc");
  return fsGetDoc(reference);
}

export function getDocsInstrumented<T extends DocumentData>(
  query: Query<T>
): Promise<QuerySnapshot<T>> {
  bumpDevRequestStat("getDocs");
  return fsGetDocs(query);
}

type SnapshotObserver<T> = {
  next?: (snapshot: T) => void;
  error?: (error: FirestoreError) => void;
  complete?: () => void;
};

export function onSnapshotInstrumented<T extends DocumentData>(
  reference: DocumentReference<T> | Query<T>,
  ...rest: unknown[]
): Unsubscribe {
  bumpDevRequestStat("onSnapshot");
  // Preserve all Firestore overload shapes without re-typing every variant
  return (fsOnSnapshot as (...args: unknown[]) => Unsubscribe)(reference, ...rest);
}

// Re-export unused types to keep TS happy for consumers that only need the wrappers
export type {
  DocumentSnapshot,
  QuerySnapshot,
  SnapshotListenOptions,
  SnapshotObserver,
};
