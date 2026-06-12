import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { writeAuditLog } from "../../../lib/admin-utils";
import { isAdminEmail } from "../../../lib/admin-check";
import { AdminRole, defaultRoleForEmail, isSuperAdminEmail } from "../../../lib/admin-roles";

type AdminEntry = { email: string; role: AdminRole; addedAt?: string; addedBy?: string };

function seedAdmins(): AdminEntry[] {
  const env = process.env.ADMIN_EMAILS || "rangitr16@gmail.com";
  return env.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).map((email) => ({
    email,
    role: defaultRoleForEmail(email),
    addedAt: new Date().toISOString(),
    addedBy: "system",
  }));
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const db = getAdminDb();
    const snap = await db.collection("config").doc("adminRoles").get();
    let admins: AdminEntry[] = snap.exists && Array.isArray(snap.data()?.admins) ? snap.data()!.admins : seedAdmins();

    if (!snap.exists) {
      await db.collection("config").doc("adminRoles").set({ admins });
    }

    return NextResponse.json({ admins });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Failed to load admins" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (!isSuperAdminEmail(admin.email)) {
      return NextResponse.json({ error: "Super admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as "add" | "remove" | "update";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role as AdminRole;

    if (!email || !action) {
      return NextResponse.json({ error: "email and action required" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("config").doc("adminRoles");
    const snap = await ref.get();
    let admins: AdminEntry[] = snap.exists && Array.isArray(snap.data()?.admins) ? [...snap.data()!.admins] : seedAdmins();

    if (action === "add") {
      if (!isAdminEmail(email) && role !== "support") {
        /* allow adding any email to admin list */
      }
      if (admins.some((a) => a.email === email)) {
        return NextResponse.json({ error: "Admin already exists" }, { status: 400 });
      }
      admins.push({ email, role: role || "moderator", addedAt: new Date().toISOString(), addedBy: admin.email });
    } else if (action === "remove") {
      if (isSuperAdminEmail(email) && admins.filter((a) => a.role === "super_admin").length <= 1) {
        return NextResponse.json({ error: "Cannot remove the last super admin" }, { status: 400 });
      }
      admins = admins.filter((a) => a.email !== email);
    } else if (action === "update") {
      admins = admins.map((a) => (a.email === email ? { ...a, role: role || a.role } : a));
    }

    await ref.set({ admins, updatedAt: new Date() });

    await writeAuditLog({
      action: `admin_${action}`,
      actorEmail: admin.email!,
      actorUid: admin.uid,
      metadata: { email, role },
    });

    return NextResponse.json({ success: true, admins });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/admins]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
