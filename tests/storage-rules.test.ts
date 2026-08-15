/**
 * Storage Security Rules Launch-Gate Tests
 *
 * Run against the Firebase Storage emulator:
 *   firebase emulators:exec --only firestore,storage "npm run test:rules"
 */
import { readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "sky-drop-de459";
const IMAGE_METADATA = { contentType: "image/jpeg" };
const PDF_METADATA = { contentType: "application/pdf" };
let testEnv: RulesTestEnvironment;

function storageFor(uid: string, email: string, emailVerified = true) {
  return testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: emailVerified,
    })
    .storage();
}

beforeAll(async () => {
  const rules = readFileSync(join(process.cwd(), "storage.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("Storage Security Rules", () => {
  const userA = { uid: "storage-user-a", email: "storage-a@example.test" };
  const userB = { uid: "storage-user-b", email: "storage-b@example.test" };

  it("allows user A's valid avatar upload and public avatar read", async () => {
    const owner = storageFor(userA.uid, userA.email);
    await assertSucceeds(
      owner.ref(`avatars/${userA.uid}/avatar.jpg`).putString("avatar", "raw", IMAGE_METADATA)
    );

    const anonymous = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(
      anonymous.ref(`avatars/${userA.uid}/avatar.jpg`).getMetadata()
    );
  });

  it("denies anonymous and cross-account public asset uploads", async () => {
    const anonymous = testEnv.unauthenticatedContext().storage();
    await assertFails(
      anonymous.ref(`avatars/${userA.uid}/anonymous.jpg`).putString("nope", "raw", IMAGE_METADATA)
    );

    const attacker = storageFor(userB.uid, userB.email);
    await assertFails(
      attacker.ref(`avatars/${userA.uid}/takeover.jpg`).putString("nope", "raw", IMAGE_METADATA)
    );
    await assertFails(
      attacker.ref(`listings/${userA.uid}/stolen.jpg`).putString("nope", "raw", IMAGE_METADATA)
    );
  });

  it("enforces public image MIME validation for avatars and listing assets", async () => {
    const owner = storageFor(userA.uid, userA.email);
    await assertFails(
      owner
        .ref(`avatars/${userA.uid}/payload.svg`)
        .putString("<svg/>", "raw", { contentType: "image/svg+xml" })
    );
    await assertFails(
      owner
        .ref(`listings/${userA.uid}/payload.pdf`)
        .putString("%PDF", "raw", PDF_METADATA)
    );
  });

  it("allows verified owners and denies attackers on private KYC assets", async () => {
    const owner = storageFor(userA.uid, userA.email);
    const kycPath = `kyc/${userA.uid}/id.jpg`;
    await assertSucceeds(owner.ref(kycPath).putString("id", "raw", IMAGE_METADATA));

    const attacker = storageFor(userB.uid, userB.email);
    await assertFails(attacker.ref(kycPath).getMetadata());
    await assertFails(
      attacker.ref(`kyc/${userA.uid}/replacement.jpg`).putString("id", "raw", IMAGE_METADATA)
    );
    await assertSucceeds(owner.ref(kycPath).getMetadata());
  });

  it("denies unverified KYC uploads and invalid KYC document types", async () => {
    const unverifiedOwner = storageFor(userA.uid, userA.email, false);
    await assertFails(
      unverifiedOwner
        .ref(`kyc/${userA.uid}/unverified.jpg`)
        .putString("id", "raw", IMAGE_METADATA)
    );

    const verifiedOwner = storageFor(userA.uid, userA.email);
    await assertFails(
      verifiedOwner
        .ref(`kyc/${userA.uid}/script.txt`)
        .putString("not a document", "raw", { contentType: "text/plain" })
    );
  });

  it("keeps proof-of-address private and UID-bound", async () => {
    const owner = storageFor(userA.uid, userA.email);
    const path = `proof_of_address/${userA.uid}/proof.pdf`;
    await assertSucceeds(owner.ref(path).putString("%PDF", "raw", PDF_METADATA));

    const attacker = storageFor(userB.uid, userB.email);
    await assertFails(attacker.ref(path).getMetadata());
    await assertFails(
      attacker.ref(`proof_of_address/${userA.uid}/forged.pdf`).putString("%PDF", "raw", PDF_METADATA)
    );
  });

  it("denies all unrecognized private and public storage prefixes", async () => {
    const owner = storageFor(userA.uid, userA.email);
    await assertFails(
      owner.ref(`private/${userA.uid}/secret.jpg`).putString("secret", "raw", IMAGE_METADATA)
    );
    await assertFails(
      owner.ref(`public/${userA.uid}/not-allowlisted.jpg`).putString("nope", "raw", IMAGE_METADATA)
    );
  });
});
