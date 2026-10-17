/**
 * PROMPT-14 emulator suite: firestore.rules isAdmin() only trusts config/adminEmails for a VERIFIED
 * email. Anyone can create an unverified email/password account for an address nobody has registered.
 * Own projectId so it never shares emulator state with other suites.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-sky-drop-admin-verified";
const runRules = !!process.env.FIRESTORE_EMULATOR_HOST || !!process.env.CI;
let testEnv: RulesTestEnvironment;

const LISTED = { uid: "av-listed", email: "listed-admin@test.com" };
const SQUATTER = { uid: "av-squatter", email: "listed-admin@test.com" }; // same address, unverified account
const CLAIM_ADMIN = { uid: "av-claim", email: "claim-admin@test.com" };
const USER = { uid: "av-user", email: "user@test.com" };

function as(user: { uid: string; email: string }, tok: Record<string, unknown>) {
  return testEnv.authenticatedContext(user.uid, { email: user.email, ...tok }).firestore();
}

describe.skipIf(!runRules)("rules isAdmin(): verified email required for config/adminEmails", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync(join(process.cwd(), "firestore.rules"), "utf8") },
    });
  });
  afterAll(async () => {
    await testEnv?.cleanup();
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc("config/adminEmails").set({ emails: [LISTED.email] });
      await db.doc("config/secretThing").set({ x: 1 });
      await db.doc("adminAuditLog/seed").set({ action: "seeded" });
    });
  });

  it("listed + verified email is admin (config get/list/write, audit log)", async () => {
    const db = as(LISTED, { email_verified: true });
    await assertSucceeds(db.doc("config/secretThing").get());
    await assertSucceeds(db.collection("config").get());
    await assertSucceeds(db.doc("config/secretThing").set({ x: 2 }));
    await assertSucceeds(db.collection("adminAuditLog").doc("a1").set({ action: "ok" }));
  });

  it("same listed email but UNVERIFIED is not admin", async () => {
    const db = as(SQUATTER, { email_verified: false });
    await assertFails(db.doc("config/secretThing").get());
    await assertFails(db.collection("config").get());
    await assertFails(db.doc("config/adminEmails").set({ emails: [SQUATTER.email, USER.email] }));
    await assertFails(db.collection("adminAuditLog").doc("a2").set({ action: "nope" }));
    await assertFails(db.doc("adminAuditLog/seed").get());
  });

  it("listed email with email_verified missing from the token is not admin", async () => {
    const db = as(SQUATTER, {});
    await assertFails(db.doc("config/secretThing").get());
  });

  it("custom claim admin:true still works (unchanged)", async () => {
    const db = as(CLAIM_ADMIN, { admin: true, email_verified: false });
    await assertSucceeds(db.doc("config/secretThing").get());
  });

  it("verified non-listed user is not admin; public config docs still readable", async () => {
    const db = as(USER, { email_verified: true });
    await assertFails(db.doc("config/secretThing").get());
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("config/announcement").set({ message: "hi" });
    });
    await assertSucceeds(db.doc("config/announcement").get());
  });
});
