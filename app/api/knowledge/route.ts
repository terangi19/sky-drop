import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { isAdminEmail } from "../../lib/admin-check";
import { parseIpFromRequest } from "../../lib/geo-check";
import { KNOWLEDGE_CATEGORIES, matchKnowledge, type KnowledgeDoc, SEED_KNOWLEDGE } from "../../lib/knowledge-base";
import { rateLimit } from "../../lib/rate-limit";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import { getFirestore } from "firebase-admin/firestore";
import { getApps } from "firebase-admin/app";

const DB_COLLECTION = "knowledge";
const MAX_KNOWLEDGE_DOCS = 200;

function getDb() {
  const admin = getApps()[0];
  if (!admin) return null;
  return getFirestore(admin);
}

export async function GET(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`knowledge-read:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "";
    const category = searchParams.get("category") || "";
    const admin = searchParams.get("admin") === "true";

    if (admin) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      try {
        const decoded = await verifyIdToken(authHeader.slice(7));
        if (!isAdminEmail(decoded.email)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
    }

    const db = getDb();
    let docs: KnowledgeDoc[] = [];
    let fromSeed = false;

    if (db) {
      try {
        let q: any = db.collection(DB_COLLECTION).orderBy("priority", "desc").limit(MAX_KNOWLEDGE_DOCS);
        if (category && category !== "all") q = q.where("category", "==", category);
        const snap = await q.get();
        docs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as KnowledgeDoc);
      } catch (e) {
        /* fallback to seed */
      }
    }

    if (docs.length === 0) {
      docs = SEED_KNOWLEDGE.map((d, i) => ({ ...d, id: `seed-${i}` }));
      fromSeed = true;
    }

    if (query) {
      docs = matchKnowledge(query, docs);
    } else if (category && category !== "all") {
      docs = docs.filter((d) => d.category === category);
    }

    return NextResponse.json({ docs, categories: KNOWLEDGE_CATEGORIES, fromSeed });
  } catch (e: any) {
    console.error("[knowledge] Error:", e?.message || e);
    return NextResponse.json({ error: "Failed to load knowledge" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await verifyIdToken(authHeader.slice(7));
    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { title, content, category, tags, keywords, priority } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content required" }, { status: 400 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const doc: Omit<KnowledgeDoc, "id"> = {
      title,
      content,
      category: category || "general",
      tags: tags || [],
      keywords: keywords || [],
      priority: priority || 0,
      updatedAt: Date.now(),
    };

    const ref = await db.collection(DB_COLLECTION).add(doc);
    return NextResponse.json({ id: ref.id, ...doc });
  } catch (e: any) {
    console.error("[knowledge] POST error:", e?.message || e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await verifyIdToken(authHeader.slice(7));
    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const db = getDb();
    if (!db) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    await db.collection(DB_COLLECTION).doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[knowledge] DELETE error:", e?.message || e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
