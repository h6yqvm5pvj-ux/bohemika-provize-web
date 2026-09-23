// Targeted, resumable changes. Backups stay outside Git; stdout is aggregate only.
import nextEnv from "@next/env";
import { cert, initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withFirestoreTokenRevocation } from "./auth-security.mjs";

const mode = process.argv[2] || "plan";
const directory = resolve(process.argv[3] || ".tmp/security-remediation-2026-09-17");
const safeWrite = (name, data, exclusive = false) => writeFile(resolve(directory, name), JSON.stringify(data, null, 2), { mode: 0o600, flag: exclusive ? "wx" : "w" });

async function main() {
  if (!["plan", "tokens", "accounts", "verify"].includes(mode)) throw new Error("Unsupported mode");
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS ? JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS) : {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
  const project = credentials.project_id || credentials.projectId;
  const bucket = (process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).replace(/^gs:\/\//, "");
  const credential = cert(credentials);
  const access = await credential.getAccessToken();
  const app = initializeApp({ credential, projectId: project }, "security-remediation");
  const db = getFirestore(app), auth = withFirestoreTokenRevocation(getAuth(app), db);
  const api = async (url, method = "GET", body) => {
    const response = await fetch(url, {
      method, headers: { Authorization: `Bearer ${access.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Remote operation failed (${response.status})`);
    return response.json();
  };
  const listAccounts = async () => {
    const query = new URLSearchParams({ maxResults: "1000", fields: "nextPageToken,users(localId,disabled,emailVerified,mfaInfo(totpInfo))" });
    const result = await api(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?${query}`);
    if (result.nextPageToken) throw new Error("Account scope exceeded");
    return result.users || [];
  };
  const hasTotp = account => (account.mfaInfo || []).some(factor => factor.totpInfo != null);
  const objectUrl = name => `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`;
  const listObjects = async () => {
    const query = new URLSearchParams({ prefix: "mailbox/", maxResults: "1000", fields: "nextPageToken,items(name,generation,metageneration,md5Hash,size,metadata)" });
    const result = await api(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?${query}`);
    if (result.nextPageToken) throw new Error("Object scope exceeded");
    return result.items || [];
  };
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (mode === "plan") {
      const accounts = await listAccounts(), objects = await listObjects();
      const tokenObjects = objects.filter(object => object.metadata?.firebaseStorageDownloadTokens);
      const refs = await db.collectionGroup("mailbox").select("type", "metadata.messageId", "metadata.attachments", "encryptedContent.version").get();
      const referenced = new Set(), attachmentCounts = { total: 0, encrypted: 0, plaintext: 0 };
      let directMessages = 0, encryptedMessages = 0;
      for (const doc of refs.docs) {
        const data = doc.data();
        if (data.type === "direct_message") { directMessages++; if (data.encryptedContent?.version) encryptedMessages++; }
        for (const row of data.metadata?.attachments || []) {
          if (typeof row.path === "string") referenced.add(row.path);
          attachmentCounts.total++; attachmentCounts[row.encryption ? "encrypted" : "plaintext"]++;
        }
      }
      const targets = accounts.filter(account => !account.disabled && !hasTotp(account)).map(account => ({ uid: account.localId, disabled: false }));
      await safeWrite("plan.json", { project, bucket, createdAt: new Date().toISOString(), targets, tokenObjects }, true);
      const summary = { mode, accounts: accounts.length, accountsRequiringSetup: targets.length, eligibleAccounts: accounts.filter(account => !account.disabled && hasTotp(account) && account.emailVerified).length,
        mailboxObjects: objects.length, tokensToRevoke: tokenObjects.length, tokenObjectsStillReferenced: tokenObjects.filter(object => referenced.has(object.name)).length,
        directMessages, encryptedMessages, attachmentCounts };
      await safeWrite("plan-summary.json", summary); console.log(JSON.stringify(summary)); return;
    }
    const plan = JSON.parse(await readFile(resolve(directory, "plan.json"), "utf8"));
    if (plan.project !== project || plan.bucket !== bucket) throw new Error("Target changed since plan");
    if (mode === "tokens") {
      let revoked = 0, preserved = 0;
      const oldLinkStatuses = {};
      for (const object of plan.tokenObjects) {
        if (!object.name.startsWith("mailbox/")) throw new Error("Unsafe object prefix");
        const current = await api(objectUrl(object.name));
        if (current.generation !== object.generation || current.md5Hash !== object.md5Hash || current.size !== object.size) throw new Error("Object content changed since plan");
        if (current.metadata?.firebaseStorageDownloadTokens) {
          if (current.metageneration !== object.metageneration) throw new Error("Object metadata changed since plan");
          await api(`${objectUrl(object.name)}?ifGenerationMatch=${object.generation}&ifMetagenerationMatch=${object.metageneration}`, "PATCH", { metadata: { firebaseStorageDownloadTokens: null } });
          revoked++;
        }
        const after = await api(objectUrl(object.name));
        if (after.metadata?.firebaseStorageDownloadTokens || after.generation !== object.generation || after.md5Hash !== object.md5Hash || after.size !== object.size) throw new Error("Post-change object verification failed");
        preserved++;
        for (const token of object.metadata.firebaseStorageDownloadTokens.split(",").filter(Boolean)) {
          const response = await fetch(`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object.name)}?alt=media&token=${encodeURIComponent(token)}`, {
            method: "HEAD", redirect: "error", signal: AbortSignal.timeout(20_000),
          });
          oldLinkStatuses[response.status] = (oldLinkStatuses[response.status] || 0) + 1;
          if (![401, 403].includes(response.status)) throw new Error("Old download link was not denied");
        }
      }
      const result = { mode, checkedAt: new Date().toISOString(), revoked, preserved, oldLinkStatuses, contentDownloaded: false, objectsDeleted: 0 };
      await safeWrite("tokens-result.json", result); console.log(JSON.stringify(result));
    } else if (mode === "accounts") {
      let setupRequired = 0, skipped = 0;
      for (const target of plan.targets) {
        const user = await auth.getUser(target.uid);
        if (user.disabled || user.multiFactor?.enrolledFactors.some(factor => factor.factorId === "totp")) { skipped++; continue; }
        const ref = db.collection("accountBlocks").doc(target.uid);
        const prepared = await db.runTransaction(async tx => {
          const data = (await tx.get(ref)).data();
          if (data && Object.keys(data).some(key => key !== "revocation") && data.reason !== "missing-totp") return false;
          tx.set(ref, { ...data, reason: "missing-totp", source: "mfa-setup", mfaEmailConfirmationRequired: true });
          return true;
        });
        if (!prepared) { skipped++; continue; }
        await auth.revokeRefreshTokens(target.uid);
        setupRequired++;
      }
      const result = { mode, checkedAt: new Date().toISOString(), setupRequired, skipped, accountsDisabled: 0, accountsDeleted: 0 };
      await safeWrite("accounts-result.json", result); console.log(JSON.stringify(result));
    } else {
      const accounts = await listAccounts(), objects = await listObjects();
      const result = { mode, checkedAt: new Date().toISOString(), accounts: accounts.length, disabled: accounts.filter(account => account.disabled).length,
        activeWithoutTotp: accounts.filter(account => !account.disabled && !hasTotp(account)).length,
        mailboxObjects: objects.length, mailboxDownloadTokens: objects.filter(object => object.metadata?.firebaseStorageDownloadTokens).length };
      await safeWrite("verification.json", result); console.log(JSON.stringify(result));
    }
  } finally { await db.terminate(); await deleteApp(app); }
}
main().catch(() => { console.error(`Security remediation ${mode} failed; details suppressed to protect account and file metadata. Check the protected plan and aggregate receipts.`); process.exitCode = 1; });
