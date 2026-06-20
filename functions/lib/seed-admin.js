"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-time helper to add the first admin email.
 * Run locally with the Firebase Admin SDK service account:
 *   npx tsx functions/src/seed-admin.ts your-admin@example.com
 */
const admin = __importStar(require("firebase-admin"));
const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccount) {
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON");
    process.exit(1);
}
admin.initializeApp();
const db = admin.firestore();
const email = process.argv[2];
if (!email) {
    console.error("Usage: npx tsx functions/src/seed-admin.ts your-admin@example.com");
    process.exit(1);
}
async function main() {
    var _a;
    const ref = db.collection("config").doc("adminEmails");
    const snap = await ref.get();
    const existing = snap.exists ? (((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.emails) || []) : [];
    if (existing.includes(email)) {
        console.log("Email already admin:", email);
        return;
    }
    await ref.set({ emails: [...existing, email] }, { merge: true });
    console.log("Added admin email:", email);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=seed-admin.js.map