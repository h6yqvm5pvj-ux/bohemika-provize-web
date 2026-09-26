#!/usr/bin/env node
// Read only by default. Copies only existing session metadata, never claims
// historical failures or geographic locations that weren't recorded.
import nextEnv from "@next/env";
import { Firestore, FieldPath } from "firebase-admin/firestore";
import { OAuth2Client } from "google-auth-library";
import { createHash } from "node:crypto";
import { operatorCredential, operatorProjectId } from "./lib/google-operator-credentials.mjs";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const apply = process.argv.includes("--apply"), activate = process.argv.includes("--activate-web");
let db;
const now = Date.now(), since = now - 90 * 86400000;
const text = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
async function main() {
  const access = await operatorCredential().getAccessToken();
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: access.access_token, expiry_date: Date.now() + access.expires_in * 1000 });
  db = new Firestore({ projectId: operatorProjectId(), authClient });
  let last, scanned = 0, eligible = 0, copied = 0, existing = 0;
  while (true) {
    let query = db.collectionGroup("appSessions").select("email", "country", "city", "ipLabel", "userAgent", "createdAtMs", "lastSeenAtMs", "loginActivityRecorded")
      .orderBy(FieldPath.documentId()).limit(400);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    for (const doc of page.docs) {
      scanned++; const data = doc.data();
      if (data.loginActivityRecorded || !Number.isSafeInteger(data.createdAtMs) || data.createdAtMs < since || data.createdAtMs > now) continue;
      eligible++;
      if (!apply) continue;
      const id = `legacy-${createHash("sha256").update(doc.ref.path).digest("hex")}`;
      const ref = db.collection("_authActivity").doc(id);
      const email = text(data.email || doc.ref.parent.parent.id, 254).toLowerCase();
      try {
        await ref.create({ occurredAtMs: data.createdAtMs, locationObservedAtMs: Number.isSafeInteger(data.lastSeenAtMs) ? data.lastSeenAtMs : data.createdAtMs,
          email: /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email) ? email : null, identityVerified: true, outcome: "success", stage: "session", source: "session_history",
          country: /^[A-Z]{2}$/.test(data.country || "") && data.country !== "XX" ? data.country : "", city: text(data.city, 80), ipLabel: text(data.ipLabel, 80),
          device: "Starší záznam", reason: "imported_session", environment: "historical", expiresAt: new Date(data.createdAtMs + 90 * 86400000) }); copied++;
      } catch (error) { if (error.code === 6 || error.code === "already-exists") existing++; else throw error; }
    }
    if (page.size < 400) break; last = page.docs.at(-1);
  }
  if (apply && activate) {
    const ref = db.doc("_securityMonitoring/loginActivity");
    await db.runTransaction(async tx => { const current = await tx.get(ref); if (!current.data()?.startedAtMs) tx.set(ref, { startedAtMs: Date.now() }, { merge: true }); });
  }
  console.log(JSON.stringify({ apply, scanned, eligible, copied, existing, webActivated: apply && activate }));
}
main().catch(() => { console.error("Session history migration failed; existing data was not overwritten."); process.exitCode = 1; }).finally(() => db?.terminate());
