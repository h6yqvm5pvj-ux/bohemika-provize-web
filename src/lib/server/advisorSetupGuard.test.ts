import { beforeEach, expect, it, vi } from "vitest";
import { checkAdvisorSetup } from "./advisorSetupGuard";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), privateProfile: vi.fn(), getUser: vi.fn() }));
vi.mock("./firebaseAdmin", () => ({
  adminAuth: { getUser: mocks.getUser },
  adminDb: { collection: (name: string) => ({
    doc: () => ({ get: name === "users" ? mocks.profile : mocks.privateProfile }),
  }) },
}));

const email = "advisor@example.test";
const identity = { email, uid: "advisor-uid" };
const profile = { positionTimeline: [{ position: "poradce1", validFrom: "2026-01-01" }] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.privateProfile.mockResolvedValue({ data: () => ({ phoneNumber: "123456789" }) });
  mocks.getUser.mockResolvedValue({ multiFactor: { enrolledFactors: [{ factorId: "totp" }] } });
});

it("checks MFA for the verified UID while the advisor profile is still loading", async () => {
  const read = Promise.withResolvers<unknown>();
  mocks.profile.mockReturnValue(read.promise);
  const result = checkAdvisorSetup(identity);
  expect(mocks.profile).toHaveBeenCalledOnce();
  expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(identity.uid);
  read.resolve({ id: email, exists: true, data: () => profile });
  expect(await result).toMatchObject({ profileDocId: email, hasTotpMfa: true, missing: [] });
});

it("keeps MFA mandatory when Auth is unavailable even with a complete supplied profile", async () => {
  mocks.getUser.mockRejectedValue(new Error("unavailable"));
  const result = await checkAdvisorSetup({
    ...identity, profile: { docId: email, data: { ...profile, phoneNumber: "123456789" } },
  });
  expect(result.missing).toEqual(["totpMfa"]);
  expect(mocks.profile).not.toHaveBeenCalled();
});
