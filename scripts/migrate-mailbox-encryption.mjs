import nextEnv from "@next/env";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

let phase = "initialization";
export async function main() {
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS ? JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS) : {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};
if (!getApps().length) initializeApp({ credential: cert(credentials) });
const adminDb = getFirestore();

const apply = process.argv.includes("--apply");
const [encryption, storageHelpers, conversations] = await Promise.all([
  import("../src/lib/server/mailboxEncryption.ts"),
  import("../src/lib/server/mailboxAttachmentStorage.ts"),
  import("../src/lib/server/mailboxConversation.ts"),
]);

if (!adminDb) {
  throw new Error("Chybí Firebase Admin konfigurace.");
}

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const objectValue = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;

const attachmentRows = (metadata) => {
  const rows = Array.isArray(metadata?.attachments) ? metadata.attachments : [];
  return rows.filter((row) => objectValue(row));
};

const cleanupRows = (value) => {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row) => objectValue(row))
    .filter(Boolean)
    .map((row) => ({
      bucketName: normalizeText(row.bucketName).replace(/^gs:\/\//i, ""),
      path: normalizeText(row.path),
      messageId: normalizeText(row.messageId),
    }))
    .filter((row) => row.bucketName && row.path && row.messageId);
};

const bucketCandidatesFor = (attachment) => {
  const configured = storageHelpers.resolveConfiguredMailboxStorageBuckets();
  const preferred = normalizeText(attachment.bucketName).replace(/^gs:\/\//i, "");
  return preferred
    ? [preferred, ...configured.filter((bucket) => bucket !== preferred)]
    : configured;
};

const downloadAttachment = async (attachment) => {
  const path = normalizeText(attachment.path);
  let lastError = null;
  for (const bucketName of bucketCandidatesFor(attachment)) {
    try {
      const file = getStorage().bucket(bucketName).file(path);
      const [metadata] = await file.getMetadata();
      const [bytes] = await getStorage().bucket(bucketName).file(path, { generation: metadata.generation }).download();
      return { bytes, bucketName, generation: metadata.generation };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`Přílohu ${path} se nepodařilo načíst.`);
};

const snapshot = await adminDb.collectionGroup("mailbox").get();
const groups = new Map();
const pendingCleanupDocs = [];
let skippedTips = 0;
let skippedWithoutMessageId = 0;

snapshot.docs.forEach((doc) => {
  const data = doc.data() ?? {};
  const pendingCleanup = cleanupRows(data.encryptionPlaintextCleanupPending);
  if (pendingCleanup.length > 0) pendingCleanupDocs.push({ doc, pendingCleanup });
  const metadata = objectValue(data.metadata) ?? {};
  if (data.type !== "direct_message") return;
  if (metadata.tipsterTip === true) {
    skippedTips += 1;
    return;
  }
  const messageId = normalizeText(metadata.messageId);
  if (!messageId) {
    skippedWithoutMessageId += 1;
    return;
  }
  const rows = groups.get(messageId) ?? [];
  rows.push({ doc, data, metadata });
  groups.set(messageId, rows);
});

const pendingGroups = [...groups.entries()].filter(([, rows]) =>
  rows.some(({ data, metadata }) =>
    data.encryptedContent == null ||
    !normalizeText(metadata.conversationId) ||
    normalizeText(metadata.messageText) ||
    attachmentRows(metadata).some((attachment) => attachment.encryption == null)
  )
);

console.info(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      mailboxDocuments: snapshot.size,
      directMessageGroups: groups.size,
      groupsToMigrate: pendingGroups.length,
      documentsToMigrate: pendingGroups.reduce((sum, [, rows]) => sum + rows.length, 0),
      plaintextCleanupDocumentsPending: pendingCleanupDocs.length,
      plaintextCleanupObjectsPending: pendingCleanupDocs.reduce(
        (sum, row) => sum + row.pendingCleanup.length,
        0
      ),
      skippedTips,
      skippedWithoutMessageId,
    },
    null,
    2
  )
);

if (!apply || (pendingGroups.length === 0 && pendingCleanupDocs.length === 0)) {
  if (!apply && (pendingGroups.length > 0 || pendingCleanupDocs.length > 0)) {
    console.info("Pro provedení spusť stejný příkaz s parametrem --apply.");
  }
  await adminDb.terminate();
  return;
}

// A protected encrypted snapshot is mandatory before the first write. It can be
// decrypted with the existing mailbox key; never save message plaintext to disk.
const backupArg = process.argv.find(arg => arg.startsWith("--backup-dir="));
phase = "encrypted-backup";
if (!backupArg) throw new Error("Apply requires --backup-dir=PRIVATE_DIRECTORY");
const backupDir = resolve(backupArg.slice("--backup-dir=".length));
await mkdir(backupDir, { recursive: true, mode: 0o700 });
const migrationId = randomUUID();
const backupContext = `migration-backup:${migrationId}`;
const backupDocuments = [...new Map([
  ...pendingGroups.flatMap(([, rows]) => rows.map(({ doc }) => [doc.ref.path, doc])),
  ...pendingCleanupDocs.map(({ doc }) => [doc.ref.path, doc]),
]).values()].map(doc => ({
  path: doc.ref.path,
  updateTime: { seconds: doc.updateTime.seconds, nanoseconds: doc.updateTime.nanoseconds },
  data: doc.data(),
}));
const backup = encryption.encryptMailboxJson({ documents: backupDocuments }, backupContext);
if (JSON.stringify(encryption.decryptMailboxJson(backup, backupContext)) !== JSON.stringify({ documents: backupDocuments })) {
  throw new Error("Encrypted backup verification failed");
}
await writeFile(resolve(backupDir, `${migrationId}.json`), JSON.stringify({ context: backupContext, payload: backup }), { mode: 0o600, flag: "wx" });

// Preflight every source before changing any group; fail without partial data
// migration if an attachment is missing or a stored path is outside the mailbox.
const sources = new Map();
phase = "attachment-preflight";
for (const [messageId, rows] of pendingGroups) {
  const canonical = new Map();
  for (const { metadata } of rows) for (const attachment of attachmentRows(metadata)) {
    const id = normalizeText(attachment.id);
    if (!id) throw new Error("Attachment has no identifier; migration stopped");
    if (!canonical.has(id) || attachment.encryption != null) canonical.set(id, attachment);
  }
  for (const attachment of canonical.values()) {
    if (attachment.encryption != null) continue;
    const path = normalizeText(attachment.path);
    if (!storageHelpers.isSafeMailboxStoragePath(path, messageId)) throw new Error("Unsafe attachment source; migration stopped");
    const key = `${messageId}:${normalizeText(attachment.id)}`;
    if (!sources.has(key)) sources.set(key, await downloadAttachment(attachment));
  }
}

let migratedGroups = 0;
phase = "migration";
let migratedDocuments = 0;
let migratedAttachments = 0;
const failures = [];
const cleanupFailures = [];
let recoveredCleanupObjects = 0;

for (const { doc, pendingCleanup } of pendingCleanupDocs) {
  const remaining = [];
  for (const pending of pendingCleanup) {
    try {
      if (!storageHelpers.isSafeMailboxStoragePath(pending.path, pending.messageId)) {
        throw new Error("Uložená cesta k odstranění není bezpečná.");
      }
      const oldFile = getStorage().bucket(pending.bucketName).file(pending.path);
      const [oldMetadata] = await oldFile.getMetadata();
      await oldFile.delete({ ifGenerationMatch: oldMetadata.generation, ignoreNotFound: true });
      const [stillExists] = await oldFile.exists();
      if (stillExists) throw new Error("Původní nešifrovaný objekt stále existuje.");
      recoveredCleanupObjects += 1;
    } catch (error) {
      remaining.push(pending);
      cleanupFailures.push({
        messageId: pending.messageId,
        bucketName: pending.bucketName,
        path: pending.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  try {
    await doc.ref.update({
      encryptionPlaintextCleanupPending:
        remaining.length > 0 ? remaining : FieldValue.delete(),
      encryptionPlaintextCleanupCheckedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    failures.push({
      messageId: doc.id,
      error: `Nepodařilo se uložit stav opakovaného úklidu: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}

for (const [messageId, rows] of pendingGroups) {
  const uploadedObjects = [];
  let committed = false;
  try {
    const source = rows.find(({ data }) => data.encryptedContent == null) ?? rows[0];
    const sourceText =
      normalizeText(source?.metadata.messageText) || normalizeText(source?.data.body);
    const sourceSubject = normalizeText(source?.data.title) || "Zpráva";
    const existingEncryptedContent = rows
      .map(({ data }) => data.encryptedContent)
      .find((value) => value != null);
    const encryptedContent =
      existingEncryptedContent ??
      encryption.encryptMailboxJson(
        { subject: sourceSubject, messageText: sourceText },
        `message:${messageId}`
      );
    encryption.decryptMailboxJson(encryptedContent, `message:${messageId}`);
    const senderEmail = normalizeText(source?.metadata.senderEmail).toLowerCase();
    const recipientEmail = normalizeText(source?.metadata.recipientEmail).toLowerCase();
    const conversationId = conversations.mailboxConversationId(
      senderEmail,
      recipientEmail
    );

    const attachmentsById = new Map();
    rows.forEach(({ metadata }) => {
      attachmentRows(metadata).forEach((attachment) => {
        const id = normalizeText(attachment.id);
        if (!id) return;
        const current = attachmentsById.get(id);
        if (!current || (attachment.encryption != null && current.encryption == null)) {
          attachmentsById.set(id, attachment);
        }
      });
    });

    for (const [attachmentId, attachment] of attachmentsById) {
      if (attachment.encryption != null) continue;
      const oldPath = normalizeText(attachment.path);
      if (!storageHelpers.isSafeMailboxStoragePath(oldPath, messageId)) {
        throw new Error(`Příloha ${attachmentId} má neočekávanou cestu.`);
      }
      const downloaded = sources.get(`${messageId}:${attachmentId}`);
      if (!downloaded) throw new Error("Missing preflight attachment");
      const encrypted = encryption.encryptMailboxBytes(
        downloaded.bytes,
        `attachment:${messageId}:${attachmentId}`
      );
      const newPath = `mailbox/${messageId}/migration-${migrationId}-${attachmentId}.enc`;
      const newFile = getStorage().bucket(downloaded.bucketName).file(newPath);
      await newFile.save(encrypted.bytes, {
        preconditionOpts: { ifGenerationMatch: 0 },
        resumable: false,
        contentType: "application/octet-stream",
        metadata: {
          cacheControl: "private, no-store, max-age=0",
          metadata: {
            encrypted: "true",
            encryptionKeyId: encrypted.encryption.keyId,
          },
        },
      });
      uploadedObjects.push({
        bucketName: downloaded.bucketName,
        newPath,
        oldPath,
        oldGeneration: downloaded.generation,
      });
      const [storedBytes] = await newFile.download();
      if (!encryption.decryptMailboxBytes(storedBytes, encrypted.encryption, `attachment:${messageId}:${attachmentId}`).equals(downloaded.bytes)) {
        throw new Error("Encrypted attachment round-trip failed");
      }
      attachmentsById.set(attachmentId, {
        ...attachment,
        path: newPath,
        bucketName: downloaded.bucketName,
        encryption: encrypted.encryption,
      });
      migratedAttachments += 1;
    }

    const batch = adminDb.batch();
    rows.forEach(({ doc, metadata }) => {
      const attachments = attachmentRows(metadata).map((attachment) => {
        const id = normalizeText(attachment.id);
        return attachmentsById.get(id) ?? attachment;
      });
      batch.update(doc.ref, {
        title: "Šifrovaná zpráva",
        body: "Nová šifrovaná zpráva.",
        encryptedContent,
        "metadata.encryptedContentVersion": 1,
        "metadata.conversationId": conversationId,
        "metadata.messageText": FieldValue.delete(),
        ...(attachments.length > 0 ? { "metadata.attachments": attachments } : {}),
        encryptionMigratedAt: FieldValue.serverTimestamp(),
      }, { lastUpdateTime: doc.updateTime });
    });
    await batch.commit();
    committed = true;

    const cleanupResults = await Promise.allSettled(
      uploadedObjects.map(async ({ bucketName, oldPath, oldGeneration }) => {
        const oldFile = getStorage().bucket(bucketName).file(oldPath);
        await oldFile.delete({ ifGenerationMatch: oldGeneration, ignoreNotFound: true });
        const [stillExists] = await oldFile.exists();
        if (stillExists) {
          throw new Error("Původní nešifrovaný objekt po smazání stále existuje.");
        }
      })
    );
    cleanupResults.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      const object = uploadedObjects[index];
      cleanupFailures.push({
        messageId,
        bucketName: object?.bucketName ?? "",
        path: object?.oldPath ?? "",
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });
    const failedCleanupObjects = cleanupResults.flatMap((result, index) => {
      if (result.status === "fulfilled") return [];
      const object = uploadedObjects[index];
      return object
        ? [{ messageId, bucketName: object.bucketName, path: object.oldPath }]
        : [];
    });
    if (failedCleanupObjects.length > 0) {
      const cleanupMarkerBatch = adminDb.batch();
      rows.forEach(({ doc }) => {
        cleanupMarkerBatch.set(
          doc.ref,
          {
            encryptionPlaintextCleanupPending: failedCleanupObjects,
            encryptionPlaintextCleanupCheckedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      await cleanupMarkerBatch.commit();
    }
    migratedGroups += 1;
    migratedDocuments += rows.length;
  } catch (error) {
    if (!committed) {
      await Promise.allSettled(
        uploadedObjects.map(({ bucketName, newPath }) =>
          getStorage().bucket(bucketName).file(newPath).delete({ ignoreNotFound: true })
        )
      );
    }
    failures.push({
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

console.info(
  JSON.stringify(
    {
      migratedGroups,
      migratedDocuments,
      migratedAttachments,
      recoveredCleanupObjects,
      failedGroups: failures.length,
      plaintextCleanupFailures: cleanupFailures.length,
      encryptedBackupVerified: true,
    },
    null,
    2
  )
);
if (failures.length || cleanupFailures.length) process.exitCode = 1;
await adminDb.terminate();
}
if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main().catch(error => {
  const code = String(error?.code || "validation");
  console.error(JSON.stringify({ stopped: true, phase, code: /^[a-z0-9_/-]{1,50}$/i.test(code) ? code : "unknown", privateDetailsSuppressed: true }));
  process.exitCode = 1;
});
