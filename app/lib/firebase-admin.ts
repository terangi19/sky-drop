import { initializeApp, getApps, cert, applicationDefault, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getFirebaseStorageBucket } from "./firebase-storage-config";

let app: App | null = null;

function parseServiceAccountJson(): Record<string, unknown> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* try double-encoded JSON (common Vercel copy-paste mistake) */
  }
  try {
    const parsed = JSON.parse(JSON.parse(raw)) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  throw new Error("FIREBASE_SERVICE_ACCOUNT is invalid JSON");
}

function adminAppOptions(credential: ReturnType<typeof cert> | ReturnType<typeof applicationDefault>) {
  return {
    credential,
    storageBucket: getFirebaseStorageBucket(),
  };
}

function getAdminApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) {
    app = initializeApp(adminAppOptions(cert(parseServiceAccountJson())));
    return app;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      app = initializeApp(adminAppOptions(applicationDefault()));
      return app;
    } catch {
      throw new Error(
        "Firebase Admin SDK could not use GOOGLE_APPLICATION_CREDENTIALS. " +
          "Set FIREBASE_SERVICE_ACCOUNT to your service account JSON instead."
      );
    }
  }
  throw new Error(
    "Firebase Admin SDK not initialized. Set FIREBASE_SERVICE_ACCOUNT on the server."
  );
}

let _auth: ReturnType<typeof getAuth> | null = null;
export function getAdminAuth() {
  if (!_auth) _auth = getAuth(getAdminApp());
  return _auth;
}

let _db: ReturnType<typeof getFirestore> | null = null;
export function getAdminDb() {
  if (!_db) _db = getFirestore(getAdminApp());
  return _db;
}

let _storage: ReturnType<typeof getStorage> | null = null;
export function getAdminStorage() {
  if (!_storage) _storage = getStorage(getAdminApp());
  return _storage;
}

export function isAdminInitialized(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT?.trim() || !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

// Verify a Firebase ID token — Admin SDK when service account is configured
export async function verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; email_verified?: boolean }> {
  const trimmed = idToken?.trim();
  if (!trimmed) {
    throw new Error("Missing authentication token");
  }

  if (isAdminInitialized()) {
    try {
      const decoded = await getAdminAuth().verifyIdToken(trimmed, true);
      return {
        uid: decoded.uid,
        email: decoded.email,
        email_verified: decoded.email_verified,
      };
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; errorInfo?: { code?: string } };
      const code = err.code || err.errorInfo?.code || "";
      console.error("[verifyIdToken] Admin verify failed:", code, err.message);
      if (code === "auth/id-token-expired") {
        throw new Error("Session expired. Please sign out and sign in again.");
      }
      if (code === "auth/argument-error" || code === "auth/invalid-id-token") {
        throw new Error("Invalid session. Please sign out and sign in again.");
      }
      throw new Error("Invalid or expired token");
    }
  }

  throw new Error(
    "Server auth is not configured. Set FIREBASE_SERVICE_ACCOUNT in Vercel environment variables."
  );
}

// ==================== Firestore REST API fallback ====================
// Used when Admin SDK is not initialized (no FIREBASE_SERVICE_ACCOUNT env var).
// Authenticates using the Firebase ID token passed from the client.

function getProjectId(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";
}

function docPath(path: string): string {
  return `projects/${getProjectId()}/databases/(default)/documents/${path}`;
}

function isSentinel(val: unknown): { type: "increment" | "delete" | "serverTimestamp"; value?: number } | null {
  if (val && typeof val === "object" && (val as any)._methodName === "increment") {
    return { type: "increment", value: Number((val as any)._value) };
  }
  if (val && typeof val === "object" && (val as any)._methodName === "delete") {
    return { type: "delete" };
  }
  if (val && typeof val === "object" && (val as any)._methodName === "serverTimestamp") {
    return { type: "serverTimestamp" };
  }
  return null;
}

function toFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === "boolean") return { booleanValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  // Skip sentinel values (FieldValue.increment, etc.)
  if (isSentinel(val)) return null as any;
  if (typeof val === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (!isSentinel(v)) fields[k] = toFirestoreValue(v);
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

function toFirestoreFields(data: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFirestoreValue(val);
  }
  return fields;
}

const REST_BASE = () => `https://firestore.googleapis.com/v1/projects/${getProjectId()}/databases/(default)/documents`;

async function restGet(idToken: string, path: string): Promise<any> {
  const res = await fetch(`${REST_BASE()}/${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.fields ? fromFirestoreValue({ mapValue: { fields: data.fields } }) : data;
}

async function restSet(idToken: string, path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${REST_BASE()}/${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH error: ${res.status} ${await res.text()}`);
}

async function restUpdate(idToken: string, path: string, data: Record<string, unknown>): Promise<void> {
  const fieldPaths = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const res = await fetch(`${REST_BASE()}/${path}?${fieldPaths}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH error: ${res.status} ${await res.text()}`);
}

async function restDelete(idToken: string, path: string): Promise<void> {
  await fetch(`${REST_BASE()}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  }).catch(() => {});
}

async function restAdd(idToken: string, collection: string, data: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${REST_BASE()}/${collection}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore POST error: ${res.status} ${await res.text()}`);
  const result = await res.json();
  return result.name?.split("/").pop() || "";
}

function opToFilter(op: string): string {
  const map: Record<string, string> = {
    "==": "EQUAL",
    "!=": "NOT_EQUAL",
    "<": "LESS_THAN",
    "<=": "LESS_THAN_OR_EQUAL",
    ">": "GREATER_THAN",
    ">=": "GREATER_THAN_OR_EQUAL",
    "in": "IN",
    "not-in": "NOT_IN",
    "array-contains": "ARRAY_CONTAINS",
    "array-contains-any": "ARRAY_CONTAINS_ANY",
  };
  return map[op] || "EQUAL";
}

async function restQuery(
  idToken: string,
  collection: string,
  filters: Array<{ field: string; op: string; value: any }>,
  sorts: Array<{ field: string; dir: string }>,
  limitCount?: number
): Promise<any[]> {
  const filterClauses = filters.map((f) => ({
    fieldFilter: {
      field: { fieldPath: f.field },
      op: opToFilter(f.op),
      value: toFirestoreValue(f.value),
    },
  }));

  const orderClauses = sorts.map((s) => ({
    field: { fieldPath: s.field },
    direction: s.dir === "desc" ? "DESCENDING" : "ASCENDING",
  }));

  const structuredQuery: any = {
    from: [{ collectionId: collection }],
  };

  if (filterClauses.length === 1) {
    structuredQuery.where = filterClauses[0];
  } else if (filterClauses.length > 1) {
    structuredQuery.where = { compositeFilter: { op: "AND", filters: filterClauses } };
  }

  if (orderClauses.length > 0) structuredQuery.orderBy = orderClauses;
  if (limitCount !== undefined) structuredQuery.limit = limitCount;

  const res = await fetch(`${REST_BASE()}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`Firestore query error: ${res.status} ${await res.text()}`);
  const results = await res.json();
  return results
    .filter((r: any) => r.document)
    .map((r: any) => ({
      id: r.document.name?.split("/").pop() || "",
      exists: true,
      data: () => (r.document.fields ? fromFirestoreValue({ mapValue: { fields: r.document.fields } }) : {}),
    }));
}

// ==================== Unified Firestore access ====================
// Returns the Admin SDK Firestore instance if available,
// otherwise a REST API-based Firestore wrapper.

export function getServerDb(idToken?: string) {
  if (isAdminInitialized()) return getAdminDb();
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not set in Production environment. " +
      "Go to Vercel → Project → Settings → Environment Variables and add it " +
      "with scope 'Production' (not just Preview/Development)."
    );
  }
  if (!idToken) {
    throw new Error(
      "Firestore not available: FIREBASE_SERVICE_ACCOUNT not set and no idToken provided. " +
      "Set the env var in production, or pass an idToken for REST fallback."
    );
  }
  return createRestDb(idToken);
}

function createRestDb(idToken: string) {
  const projectId = getProjectId();

  const collectionFn = (name: string) => ({
    doc: (id: string) => {
      const path = `${name}/${id}`;
      return {
        get: async () => {
          const data = await restGet(idToken, path);
          return { exists: data !== null, data: () => data, id };
        },
        set: async (data: any, opts?: any) => {
          if (opts?.merge) {
            const existing = await restGet(idToken, path);
            if (existing) {
              // Patch only fields being written (true merge) — spreading existing broke saves
              await restUpdate(idToken, path, data);
            } else {
              await restSet(idToken, path, data);
            }
          } else {
            await restSet(idToken, path, data);
          }
        },
        update: async (data: any) => { await restUpdate(idToken, path, data); },
        delete: async () => { await restDelete(idToken, path); },
        collection: (subName: string) => collectionFn(`${path}/${subName}`),
      };
    },
    add: async (data: any) => {
      const id = await restAdd(idToken, name, data);
      return { id };
    },
    where: (field: string, op: string, value: any) => {
      const filters: Array<{ field: string; op: string; value: any }> = [{ field, op, value }];
      const sorts: Array<{ field: string; dir: string }> = [];
      let lim: number | undefined;
      const q: any = {
        get: async () => {
          const docs = await restQuery(idToken, name, filters, sorts, lim);
          return { docs, empty: docs.length === 0 };
        },
        where: (f: string, o: string, v: any) => { filters.push({ field: f, op: o, value: v }); return q; },
        orderBy: (f: string, d?: string) => { sorts.push({ field: f, dir: d || "asc" }); return q; },
        limit: (n: number) => { lim = n; return q; },
      };
      return q;
    },
    orderBy: (field: string, dir?: string) => {
      const filters: Array<{ field: string; op: string; value: any }> = [];
      const sorts: Array<{ field: string; dir: string }> = [{ field, dir: dir || "asc" }];
      let lim: number | undefined;
      const q: any = {
        get: async () => {
          const docs = await restQuery(idToken, name, filters, sorts, lim);
          return { docs, empty: docs.length === 0 };
        },
        where: (f: string, o: string, v: any) => { filters.push({ field: f, op: o, value: v }); return q; },
        orderBy: (f: string, d?: string) => { sorts.push({ field: f, dir: d || "asc" }); return q; },
        limit: (n: number) => { lim = n; return q; },
      };
      return q;
    },
    limit: (n: number) => {
      const filters: Array<{ field: string; op: string; value: any }> = [];
      const sorts: Array<{ field: string; dir: string }> = [];
      let lim = n;
      const q: any = {
        get: async () => {
          const docs = await restQuery(idToken, name, filters, sorts, lim);
          return { docs, empty: docs.length === 0 };
        },
        where: (f: string, o: string, v: any) => { filters.push({ field: f, op: o, value: v }); return q; },
        orderBy: (f: string, d?: string) => { sorts.push({ field: f, dir: d || "asc" }); return q; },
        limit: (n: number) => { lim = n; return q; },
      };
      return q;
    },
  });

  const restRunTransaction = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    const beginUrl = `${REST_BASE()}:beginTransaction`;
    const beginRes = await fetch(beginUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!beginRes.ok) throw new Error(`Begin transaction error: ${beginRes.status} ${await beginRes.text()}`);
    const { transaction: txId } = await beginRes.json();

    const writes: any[] = [];
    let result: T;

    try {
      const tx = {
        get: async (ref: any) => {
          const path = ref._path || `${ref._collectionPath}/${ref._docId}`;
          const res = await fetch(`${REST_BASE()}/${path}?transaction=${encodeURIComponent(txId)}`, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (res.status === 404) return { exists: false, data: () => null, id: path.split("/").pop() };
          if (!res.ok) throw new Error(`Tx GET error: ${res.status} ${await res.text()}`);
          const data = await res.json();
          return {
            exists: true,
            data: () => (data.fields ? fromFirestoreValue({ mapValue: { fields: data.fields } }) : {}),
            id: data.name?.split("/").pop() || "",
          };
        },
        set: (ref: any, data: any) => {
          const path = ref._path || `${ref._collectionPath}/${ref._docId}`;
          writes.push({
            update: { name: docPath(path), fields: toFirestoreFields(data) },
          });
        },
        update: (ref: any, data: any) => {
          const path = ref._path || `${ref._collectionPath}/${ref._docId}`;
          const fields: Record<string, unknown> = {};
          const transforms: Array<{ fieldPath: string; increment?: Record<string, unknown>; setToServerValue?: string }> = [];
          for (const [k, v] of Object.entries(data)) {
            const sentinel = isSentinel(v);
            if (sentinel?.type === "increment") {
              transforms.push({ fieldPath: k, increment: { integerValue: String(sentinel.value) } });
              fields[k] = toFirestoreValue(0); // dummy value to satisfy updateMask
            } else if (sentinel?.type === "delete") {
              transforms.push({ fieldPath: k, setToServerValue: "DELETE" as any });
            } else if (sentinel?.type === "serverTimestamp") {
              transforms.push({ fieldPath: k, setToServerValue: "SERVER_TIMESTAMP" as any });
            } else {
              fields[k] = toFirestoreValue(v);
            }
          }
          const write: any = { update: { name: docPath(path), fields: toFirestoreFields(fields) } };
          if (Object.keys(fields).length > 0) {
            write.updateMask = { fieldPaths: Object.keys(fields) };
          }
          if (transforms.length > 0) {
            write.transform = { document: docPath(path), fieldTransforms: transforms };
          }
          writes.push(write);
        },
        delete: (ref: any) => {
          const path = ref._path || `${ref._collectionPath}/${ref._docId}`;
          writes.push({ delete: docPath(path) });
        },
      };

      result = await fn(tx);
    } catch (err) {
      // Rollback on error
      try {
        await fetch(`${REST_BASE()}:rollback`, {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: txId }),
        });
      } catch {}
      throw err;
    }

    const commitRes = await fetch(`${REST_BASE()}:commit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: txId, writes }),
    });
    if (!commitRes.ok) {
      const text = await commitRes.text();
      if (text.includes("ABORTED")) {
        throw new Error("ABORTED");
      }
      throw new Error(`Commit transaction error: ${commitRes.status} ${text}`);
    }
    return result!;
  };

  // Wrap doc refs to track collection/doc path for transactions
  const wrapDoc = (ref: any, collectionPath: string, docId: string) => {
    ref._collectionPath = collectionPath;
    ref._docId = docId;
    ref._path = `${collectionPath}/${docId}`;
    return ref;
  };

  const c = (name: string) => {
    const col = collectionFn(name);
    const origDoc = col.doc.bind(col);
    col.doc = (id: string) => wrapDoc(origDoc(id), name, id);
    return col;
  };

  return {
    collection: c,
    runTransaction: restRunTransaction,
    batch: () => {
      const writes: any[] = [];
      return {
        set: (ref: any, data: any) => {
          writes.push({ update: { name: docPath(ref._path || `${ref._collectionPath}/${ref._docId}`), fields: toFirestoreFields(data) } });
        },
        update: (ref: any, data: any) => {
          const path = ref._path || `${ref._collectionPath}/${ref._docId}`;
          writes.push({
            update: { name: docPath(path), fields: toFirestoreFields(data) },
            updateMask: { fieldPaths: Object.keys(data) },
          });
        },
        delete: (ref: any) => {
          const path = ref._path || `${ref._collectionPath}/${ref._docId}`;
          writes.push({ delete: docPath(path) });
        },
        commit: async () => {
          const res = await fetch(`${REST_BASE()}:commit`, {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ writes }),
          });
          if (!res.ok) throw new Error(`Batch commit error: ${res.status} ${await res.text()}`);
        },
      };
    },
  };
}

export { getAdminApp };
