import type { User as FirebaseUser } from "firebase/auth";
import { auth } from "@/app/firebase-auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import type { DocumentPage, PdfQualityPreset } from "./documentModel";
import { decryptDraft, encryptDraft, type EncryptedDraft } from "./draftEncryption";

export type DocumentDraft = {
  version: 1;
  updatedAt: number;
  title: string;
  header: string;
  pages: DocumentPage[];
  activePageId: string;
  quality: PdfQualityPreset;
  showContactQr: boolean;
  autoPaginate: boolean;
};

const DATABASE = "bohemika-encrypted-document-drafts";
const STORE = "drafts";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Úložiště konceptů je právě nedostupné."));
  });
}

function validateDraft(value: unknown): DocumentDraft {
  const draft = value as DocumentDraft | null;
  if (!draft || draft.version !== 1 || !Number.isFinite(draft.updatedAt) || typeof draft.title !== "string" || typeof draft.header !== "string" ||
    typeof draft.activePageId !== "string" || !["low", "medium", "high"].includes(draft.quality) ||
    typeof draft.showContactQr !== "boolean" || typeof draft.autoPaginate !== "boolean" ||
    !Array.isArray(draft.pages) || !draft.pages.length ||
    !draft.pages.every(page => typeof page.id === "string" && typeof page.html === "string" &&
      typeof page.fontKey === "string" && typeof page.fontFamily === "string" && typeof page.color === "string" &&
      Number.isFinite(page.fontSize) && page.fontSize > 0 && Array.isArray(page.images) &&
      page.images.every(image => typeof image.id === "string" && typeof image.src === "string" && typeof image.alt === "string" &&
        [image.x, image.y, image.width, image.height].every(Number.isFinite)))) {
    throw new Error("Uložený koncept se nepodařilo přečíst.");
  }
  return draft;
}

export type DocumentDraftVault = {
  read: () => Promise<DocumentDraft | null>;
  write: (draft: DocumentDraft) => Promise<void>;
  dispose: () => void;
};

/** Preserve the verified author's old work; never silently delete another author's only copy. */
async function migrateLegacyDrafts(vault: DocumentDraftVault, ownerEmail: string, assertAuthor: () => void) {
  const legacyName = "bohemika-document-drafts";
  if (indexedDB.databases && !(await indexedDB.databases()).some(database => database.name === legacyName)) return;
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(legacyName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let remaining = 0;
  try {
    if (database.objectStoreNames.contains(STORE)) {
      const old = await new Promise<unknown>((resolve, reject) => {
        const request = database.transaction(STORE).objectStore(STORE).get(ownerEmail);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      assertAuthor();
      if (old) {
        // An already secured revision takes precedence over an obsolete plaintext copy.
        if (!(await vault.read())) await vault.write(validateDraft(old));
        assertAuthor();
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(STORE, "readwrite");
          transaction.objectStore(STORE).delete(ownerEmail);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      }
      remaining = await new Promise<number>((resolve, reject) => {
        const request = database.transaction(STORE).objectStore(STORE).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
  } finally { database.close(); }
  if (remaining) {
    throw new Error("V tomto prohlížeči zbývají staré nešifrované koncepty jiných nebo anonymních účtů. Před dalším použitím je musí převést jejich autoři, nebo je po odsouhlasení potřeba odstranit. Jejich obsah se neotevřel.");
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(legacyName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Zavři staré záložky editoru a zkus načíst koncept znovu."));
  });
}

/** The only persisted data is ciphertext. Keys stay in memory for the authenticated author. */
export async function openDocumentDraftVault(user: FirebaseUser): Promise<DocumentDraftVault> {
  const ownerUid = user.uid;
  let disposed = false;
  let key: CryptoKey | null = null;
  const assertAuthor = () => {
    if (disposed || !ownerUid || auth.currentUser?.uid !== ownerUid || readAdminImpersonationState()) {
      throw new Error("Koncept může otevřít pouze přihlášený autor mimo režim zastoupení.");
    }
  };
  assertAuthor();
  const response = await fetchAuthedJsonOrThrow<{ ok: true; ownerUid: string; ownerEmail: string; key: string }>(user, "/api/document-drafts/key", { method: "POST", cache: "no-store" });
  assertAuthor();
  if (response.ownerUid !== ownerUid || !response.ownerEmail || typeof response.key !== "string") throw new Error("Nepodařilo se ověřit autora konceptu.");
  const rawKey = Uint8Array.from(atob(response.key), char => char.charCodeAt(0));
  if (rawKey.length !== 32) throw new Error("Neplatný klíč konceptu.");
  try { key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]); }
  finally { rawKey.fill(0); }
  assertAuthor();
  const vault: DocumentDraftVault = {
    async read() {
      assertAuthor();
      const database = await openDatabase();
      try {
        const record = await new Promise<EncryptedDraft | undefined>((resolve, reject) => {
          const request = database.transaction(STORE, "readonly").objectStore(STORE).get(ownerUid);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        assertAuthor();
        if (!record) return null;
        const value = await decryptDraft(key!, ownerUid, record);
        assertAuthor();
        return validateDraft(value);
      } finally { database.close(); }
    },
    async write(draft) {
      assertAuthor();
      const record = await encryptDraft(key!, ownerUid, draft);
      assertAuthor();
      const database = await openDatabase();
      try {
        assertAuthor();
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(STORE, "readwrite");
          transaction.objectStore(STORE).put(record, ownerUid);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally { database.close(); }
    },
    dispose() { disposed = true; key = null; },
  };
  try { await migrateLegacyDrafts(vault, response.ownerEmail, assertAuthor); }
  catch (error) { vault.dispose(); throw error; }
  assertAuthor();
  return vault;
}
