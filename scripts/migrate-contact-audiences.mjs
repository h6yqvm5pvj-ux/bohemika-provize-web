import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { cert, initializeApp, deleteApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

// Add only the legacy audience field. Existing restrictions and every other
// contact field are preserved, including edits made before this transaction.
export function planContactAudienceMigration(data) {
  if (!data || !Array.isArray(data.contacts) || data.contacts.length > 200) throw new Error("Invalid directory");
  const revision = data.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid directory revision");
  let changed = 0;
  const contacts = data.contacts.map(contact => {
    if (!contact || typeof contact !== "object" || Array.isArray(contact) || typeof contact.id !== "string") {
      throw new Error("Invalid contact");
    }
    if (Object.hasOwn(contact, "audience")) {
      const audience = contact.audience;
      if (!audience || typeof audience !== "object" || Array.isArray(audience) ||
          !["everyone", "specialists", "group"].includes(audience.type) ||
          (audience.type === "group" && (typeof audience.groupId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(audience.groupId))) ||
          (audience.type !== "group" && audience.groupId !== undefined)) throw new Error("Invalid contact audience");
      return contact;
    }
    changed += 1;
    return { ...contact, audience: { type: "everyone" } };
  });
  return { contacts, changed, revision: changed ? revision + 1 : revision };
}

async function main() {
  if (process.argv.slice(2).some(argument => argument !== "--apply")) throw new Error("Invalid arguments");
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const apply = process.argv.includes("--apply");
  let credentials;
  if (process.env.FIREBASE_ADMIN_CREDENTIALS) {
    const raw = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
    credentials = { projectId: raw.project_id, clientEmail: raw.client_email, privateKey: raw.private_key };
  } else {
    credentials = {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    };
  }
  if (!credentials.projectId || !credentials.clientEmail || !credentials.privateKey) throw new Error("Missing credentials");
  const app = initializeApp({ credential: cert(credentials) }, "contact-audience-migration");
  try {
    const db = getFirestore(app);
    const ref = db.doc("appConfig/contactDirectory");
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { storedDirectory: false, totalContacts: 0, assignedToEveryone: 0 };
      const plan = planContactAudienceMigration(snapshot.data());
      if (apply && plan.changed) transaction.set(ref, {
        contacts: plan.contacts,
        revision: plan.revision,
        audienceSchemaVersion: 1,
        audienceMigratedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { storedDirectory: true, totalContacts: plan.contacts.length, assignedToEveryone: plan.changed };
    });
    // Counts only: never print records, identities, credentials or provider errors.
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }));
  } finally { await deleteApp(app); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("CONTACT_AUDIENCE_MIGRATION_FAILED"); process.exitCode = 1; });
}
