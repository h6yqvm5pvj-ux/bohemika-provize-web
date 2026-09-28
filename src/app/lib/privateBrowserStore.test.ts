// @vitest-environment happy-dom
import { webcrypto } from "node:crypto";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: { currentUser: null as { uid: string } | null }, fetch: vi.fn(), impersonation: vi.fn() }));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("./authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
vi.mock("./adminImpersonation", () => ({ readAdminImpersonationState: mocks.impersonation }));
import { openPrivateBrowserStore } from "./privateBrowserStore";
import { clearPrivateMemory } from "./privateMemory";
const user = (uid: string) => ({ uid, email: `${uid}@example.test` }) as User;
const legacy = (uid: string) => `bohemika:projection:v1:${uid}:${uid}@example.test`;
const encrypted = (uid: string) => `bohemika:private:v1:${uid}:projection`;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); clearPrivateMemory();
  vi.stubGlobal("crypto", webcrypto);
  mocks.auth.currentUser = user("a"); mocks.impersonation.mockReturnValue(null);
  mocks.fetch.mockImplementation(async (owner: User) => ({ ownerUid: owner.uid, ownerEmail: owner.email, key: Buffer.alloc(32, owner.uid === "a" ? 1 : 2).toString("base64") }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("private persistent planning drafts", () => {
  it("persists ciphertext, restores the owner's plan, and isolates other accounts", async () => {
    const vault = await openPrivateBrowserStore(user("a"));
    const plan = { privateClient: "synthetic-sensitive-plan", production: 123456 };
    await vault.write(plan);
    expect(localStorage.getItem(encrypted("a"))).not.toContain("synthetic-sensitive-plan");
    vault.dispose();
    expect(await (await openPrivateBrowserStore(user("a"))).read()).toEqual(plan);
    mocks.auth.currentUser = user("b");
    const other = await openPrivateBrowserStore(user("b"));
    expect(await other.read()).toBeNull();
    localStorage.setItem(encrypted("b"), localStorage.getItem(encrypted("a"))!);
    await expect(other.read()).rejects.toThrow();
  });
  it("migrates only the server-verified author's old plan, preserving it on failed writes", async () => {
    const plan = { private: "legacy-plan" };
    localStorage.setItem(legacy("a"), JSON.stringify(plan));
    localStorage.setItem(legacy("b"), '{"private":"another-author-only-copy"}');
    const vault = await openPrivateBrowserStore(user("a"));
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
    await expect(vault.read()).rejects.toThrow();
    expect(localStorage.getItem(legacy("a"))).toBe(JSON.stringify(plan));
    write.mockRestore();
    await expect(vault.read()).rejects.toThrow("starší nešifrované plány");
    expect(localStorage.getItem(legacy("a"))).toBeNull();
    expect(localStorage.getItem(legacy("b"))).toBe('{"private":"another-author-only-copy"}');
    mocks.auth.currentUser = user("b");
    expect(await (await openPrivateBrowserStore(user("b"))).read()).toEqual({ private: "another-author-only-copy" });
    mocks.auth.currentUser = user("a");
    expect(await vault.read()).toEqual(plan);
    expect(JSON.stringify(localStorage.getItem(encrypted("a")))).not.toContain("legacy-plan");
  });
  it("refuses access after logout, account changes, impersonation or disposal", async () => {
    for (const invalidate of [
      () => { mocks.auth.currentUser = null; },
      () => { mocks.auth.currentUser = user("b"); },
      () => mocks.impersonation.mockReturnValue({ email: "b@example.test" }),
      () => clearPrivateMemory(),
    ]) {
      mocks.auth.currentUser = user("a"); mocks.impersonation.mockReturnValue(null);
      const vault = await openPrivateBrowserStore(user("a"));
      invalidate();
      await expect(vault.write({ secret: "blocked" })).rejects.toThrow();
      await expect(vault.read()).rejects.toThrow();
      vault.dispose();
    }
  });
  it("does not overwrite an unreadable encrypted plan with an older plaintext draft", async () => {
    const vault = await openPrivateBrowserStore(user("a"));
    localStorage.setItem(encrypted("a"), '{"version":1,"iv":"invalid","ciphertext":"AAAA"}');
    localStorage.setItem(legacy("a"), '{"old":"copy"}');
    await expect(vault.read()).rejects.toThrow();
    expect(localStorage.getItem(legacy("a"))).toBe('{"old":"copy"}');
  });
});
