import { describe, expect, it } from "vitest";
import { decryptDraft, encryptDraft } from "./draftEncryption";
import type { DocumentDraft } from "./documentDraft";

const draft: DocumentDraft = {
  version: 1, updatedAt: 1, title: "Soukromý klientský dokument", header: "Hlavička", pages: [{
    id: "page-1", html: "<p>Citlivé informace o klientovi</p>", fontKey: "arial", fontFamily: "Arial", fontSize: 15, color: "#000000",
    images: [{ id: "photo-1", src: "data:image/png;base64,c2VjcmV0", alt: "Soukromá fotografie", x: 0, y: 0, width: 40, height: 40 }],
  }], activePageId: "page-1", quality: "medium", showContactQr: true, autoPaginate: true,
};
const createKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

describe("encrypted local drafts", () => {
  it("round-trips all document data while persisting only ciphertext and a unique nonce", async () => {
    const key = await createKey();
    const first = await encryptDraft(key, "author-a", draft);
    const second = await encryptDraft(key, "author-a", draft);
    expect(Object.keys(first).sort()).toEqual(["ciphertext", "iv", "ownerUid", "version"]);
    expect(first.iv).not.toEqual(second.iv);
    expect(new Uint8Array(first.ciphertext)).not.toEqual(new Uint8Array(second.ciphertext));
    expect(new TextDecoder().decode(first.ciphertext)).not.toContain("Citlivé");
    expect(await decryptDraft(key, "author-a", first)).toEqual(draft);
    expect(key.extractable).toBe(false);
  });
  it("rejects another author's key even after relabelling the stored record", async () => {
    const firstKey = await createKey(), secondKey = await createKey();
    const record = await encryptDraft(firstKey, "author-a", draft);
    await expect(decryptDraft(secondKey, "author-a", record)).rejects.toThrow();
    await expect(decryptDraft(firstKey, "author-b", record)).rejects.toThrow();
    await expect(decryptDraft(firstKey, "author-b", { ...record, ownerUid: "author-b" })).rejects.toThrow();
  });
  it("rejects modified ciphertext without returning any document content", async () => {
    const key = await createKey();
    const record = await encryptDraft(key, "author-a", draft);
    new Uint8Array(record.ciphertext)[5] ^= 1;
    await expect(decryptDraft(key, "author-a", record)).rejects.toThrow();
  });
});
