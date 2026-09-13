import type { User } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), impersonation: vi.fn() }));
vi.mock("./authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
vi.mock("./adminImpersonation", () => ({ readAdminImpersonationState: mocks.impersonation }));

import { getUserProfileCached, invalidateUserProfileCache, peekUserProfileCached } from "./userProfileCache";

const user = { uid: "advisor-uid", email: "advisor@example.test" } as User;
const deferred = () => Promise.withResolvers<{ ok: boolean; profile: { fullName: string } }>();
const payload = (name: string) => ({ ok: true, profile: { fullName: name } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.impersonation.mockReturnValue(null);
  invalidateUserProfileCache(user.email);
  invalidateUserProfileCache("other@example.test");
});

describe("shared profile loading", () => {
  it("shares a simultaneous read and then reuses the existing fresh profile", async () => {
    const pending = deferred();
    mocks.fetch.mockReturnValue(pending.promise);
    const first = getUserProfileCached(user);
    const second = getUserProfileCached(user);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    pending.resolve(payload("Current"));
    expect(await first).toEqual(await second);
    expect(await getUserProfileCached(user)).toEqual(payload("Current"));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not repopulate an invalidated cache from a request started before a save", async () => {
    const pending = deferred();
    mocks.fetch.mockReturnValue(pending.promise);
    const first = getUserProfileCached(user);
    invalidateUserProfileCache(" ADVISOR@EXAMPLE.TEST ");
    pending.resolve(payload("Before save"));
    await first;
    expect(peekUserProfileCached(user)).toBeNull();
  });

  it("does not overwrite the result of a newer forced refresh", async () => {
    const old = deferred();
    const fresh = deferred();
    mocks.fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const first = getUserProfileCached(user);
    const refresh = getUserProfileCached(user, { force: true });
    fresh.resolve(payload("After save"));
    await refresh;
    old.resolve(payload("Before save"));
    await first;
    expect(peekUserProfileCached(user)).toEqual(payload("After save"));
  });

  it("keeps sharing the newer request when an obsolete request completes", async () => {
    const old = deferred();
    const fresh = deferred();
    mocks.fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const first = getUserProfileCached(user);
    invalidateUserProfileCache(user.email);
    const refresh = getUserProfileCached(user);
    old.resolve(payload("Old"));
    await first;
    const joined = getUserProfileCached(user);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    fresh.resolve(payload("New"));
    expect(await refresh).toEqual(await joined);
  });

  it("does not cache failures and can retry", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(payload("Recovered"));
    await expect(getUserProfileCached(user)).rejects.toThrow("offline");
    expect(peekUserProfileCached(user)).toBeNull();
    expect(await getUserProfileCached(user)).toEqual(payload("Recovered"));
  });

  it("keeps the represented profile separate and invalidates it after saving", async () => {
    mocks.fetch.mockResolvedValueOnce(payload("Advisor")).mockResolvedValueOnce(payload("Represented"));
    await getUserProfileCached(user);
    mocks.impersonation.mockReturnValue({ email: "other@example.test" });
    expect(peekUserProfileCached(user)).toBeNull();
    await getUserProfileCached(user);
    invalidateUserProfileCache("other@example.test");
    expect(peekUserProfileCached(user)).toBeNull();
    mocks.impersonation.mockReturnValue(null);
    expect(peekUserProfileCached(user)).toEqual(payload("Advisor"));
  });
});
