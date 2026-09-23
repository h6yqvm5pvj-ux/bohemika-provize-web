// src/lib/server/firebaseAdmin.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { withAccountSecurityPolicy } from "./accountSecurityPolicy";
import { isPersistentAccountBlock, withFirestoreTokenRevocation } from "./tokenRevocation";
import { getEmailSetupUser, getMfaEnrollmentUser } from "./emailSetupSecurity";

type AdminCert = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function loadCredentials(): AdminCert | null {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        };
      }
    } catch {
      // fall through to env var based credentials
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (projectId && clientEmail && privateKeyRaw) {
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
    return { projectId, clientEmail, privateKey };
  }

  return null;
}

const existingApp = getApps()[0];
const credentials = loadCredentials();

let app = existingApp ?? null;

if (!app && credentials) {
  app = initializeApp({
    credential: cert(credentials as AdminCert),
  });
}

export const adminDb: Firestore | null = app ? getFirestore(app) : null;
export const adminAuth: Auth | null = app && adminDb ? withAccountSecurityPolicy(
  withFirestoreTokenRevocation(getAuth(app), adminDb),
  async uid => isPersistentAccountBlock((await adminDb!.collection("accountBlocks").doc(uid).get()).data())
) : null;
export const adminMessaging: Messaging | null = app ? getMessaging(app) : null;

// This deliberately exposes only inbox-verification eligibility, not the raw
// Auth instance. All business APIs must continue using the protected adminAuth.
export async function getEmailVerificationUser(token: string) {
  if (!app || !adminDb) throw new Error("Firebase Admin není nakonfigurovaný.");
  return getEmailSetupUser(getAuth(app), adminDb, token);
}

export async function getMfaEnrollmentContext(token: string) {
  if (!app || !adminDb) throw new Error("Firebase Admin není nakonfigurovaný.");
  return getMfaEnrollmentUser(getAuth(app), adminDb, token);
}
