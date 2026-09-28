import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentDraft } from "./documentDraft";

const state = vi.hoisted(() => ({
  user: { uid: "author-a" } as { uid: string } | null, impersonation: null as { email: string } | null, fetch: vi.fn(),
}));
vi.mock("@/app/firebase-auth", () => ({ auth: { get currentUser() { return state.user; } } }));
vi.mock("@/app/lib/adminImpersonation", () => ({ readAdminImpersonationState: () => state.impersonation }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: state.fetch }));
import { openDocumentDraftVault } from "./documentDraft";
const user = { uid: "author-a" } as User;
beforeEach(() => {
  vi.stubGlobal("indexedDB", { databases: async () => [] });
  vi.clearAllMocks(); state.user = { uid: "author-a" }; state.impersonation = null;
  state.fetch.mockResolvedValue({ ok: true, ownerUid: "author-a", ownerEmail: "a@example.test", key: Buffer.alloc(32, 1).toString("base64") });
});
afterEach(() => vi.unstubAllGlobals());
describe("draft vault session isolation", () => {
  it("rejects signed-out users, other authors and impersonation before requesting a key", async () => {
    state.user = null;
    await expect(openDocumentDraftVault(user)).rejects.toThrow("autor");
    state.user = { uid: "author-b" };
    await expect(openDocumentDraftVault(user)).rejects.toThrow("autor");
    state.user = { uid: "author-a" }; state.impersonation = { email: "b@example.cz" };
    await expect(openDocumentDraftVault(user)).rejects.toThrow("autor");
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("discards a key response that arrives after the account changes", async () => {
    state.fetch.mockImplementationOnce(async () => {
      state.user = { uid: "author-b" };
      return { ok: true, ownerUid: "author-a", ownerEmail: "a@example.test", key: Buffer.alloc(32, 1).toString("base64") };
    });
    await expect(openDocumentDraftVault(user)).rejects.toThrow("autor");
  });
  it("rejects mismatched ownership returned by the server", async () => {
    state.fetch.mockResolvedValue({ ok: true, ownerUid: "author-b", key: Buffer.alloc(32, 1).toString("base64") });
    await expect(openDocumentDraftVault(user)).rejects.toThrow("ověřit autora");
  });
  it("invalidates previously opened access on logout and disposal", async () => {
    const vault = await openDocumentDraftVault(user);
    state.user = null;
    await expect(vault.read()).rejects.toThrow("autor");
    await expect(vault.write({} as DocumentDraft)).rejects.toThrow("autor");
    state.user = { uid: "author-a" };
    vault.dispose();
    await expect(vault.read()).rejects.toThrow("autor");
  });
});
