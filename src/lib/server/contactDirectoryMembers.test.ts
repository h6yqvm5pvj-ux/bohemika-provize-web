import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ collection: vi.fn(), select: vi.fn(), get: vi.fn(), available: true }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  get adminDb() { return mocks.available ? { collection: mocks.collection } : null; },
}));

import { loadContactDirectoryMembers } from "./contactDirectoryMembers";

const profile = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.available = true;
  mocks.collection.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ get: mocks.get });
  mocks.get.mockResolvedValue({ docs: [] });
});

describe("contact group member directory", () => {
  it("uses canonical profile identities and returns only the member picker fields", async () => {
    mocks.get.mockResolvedValue({ docs: [profile("author@example.test", {
      userId: "author-uid", fullName: "  Testovací Poradce  ", email: "forged@example.test",
      accountType: "advisor", role: "admin", phoneNumber: "synthetic-private-phone", fcmToken: "synthetic-private-token",
    })] });
    await expect(loadContactDirectoryMembers()).resolves.toEqual([
      { uid: "author-uid", email: "author@example.test", name: "Testovací Poradce" },
    ]);
    expect(mocks.collection).toHaveBeenCalledExactlyOnceWith("users");
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith("userId", "fullName", "name", "accountType", "userRole");
  });

  it("omits tipsters and invalid identities instead of using a mutable email fallback", async () => {
    mocks.get.mockResolvedValue({ docs: [
      profile("tipster@example.test", { userId: "tipster-uid", accountType: "tipster" }),
      profile("legacy-tipster@example.test", { userId: "legacy-tipster-uid", userRole: "TIPSTER" }),
      profile("legacy-uid-doc", { userId: "legacy-uid", email: "forged@example.test" }),
      profile("bad/email@example.test", { userId: "bad-email-uid" }),
      ...[undefined, null, "", " ", " uid ", "uid/other", "uid\\other", "uid\nother", "u".repeat(129), 17].map((userId, index) =>
        profile(`invalid${index}@example.test`, { userId })),
    ] });
    await expect(loadContactDirectoryMembers()).resolves.toEqual([]);
  });

  it("falls back to a name or canonical email without returning profile records", async () => {
    mocks.get.mockResolvedValue({ docs: [
      profile("fallback@example.test", { userId: "uid-fallback", name: " Náhradní jméno " }),
      profile("email-only@example.test", { userId: "uid-email", fullName: { privateEncryption: 1 } }),
    ] });
    expect(await loadContactDirectoryMembers()).toEqual(expect.arrayContaining([
      { uid: "uid-fallback", name: "Náhradní jméno", email: "fallback@example.test" },
      { uid: "uid-email", name: "email-only@example.test", email: "email-only@example.test" },
    ]));
  });

  it("deduplicates UIDs deterministically and reads current eligibility on every call", async () => {
    mocks.get.mockResolvedValueOnce({ docs: [
      profile("z@example.test", { userId: "same-uid", fullName: "Duplicate" }),
      profile("a@example.test", { userId: "same-uid", fullName: "Canonical choice" }),
    ] }).mockResolvedValueOnce({ docs: [
      profile("a@example.test", { userId: "same-uid", accountType: "tipster" }),
    ] });
    await expect(loadContactDirectoryMembers()).resolves.toEqual([
      { uid: "same-uid", name: "Canonical choice", email: "a@example.test" },
    ]);
    await expect(loadContactDirectoryMembers()).resolves.toEqual([]);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("does not return a stale directory when storage is unavailable", async () => {
    mocks.available = false;
    await expect(loadContactDirectoryMembers()).rejects.toThrow("Contact member directory is unavailable");
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
