// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), auth: { currentUser: null as User | null }, api: vi.fn() }));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.api }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile, peekUserProfileCached: () => null, invalidateUserProfileCache: vi.fn() }));
vi.mock("@/app/lib/adminImpersonation", () => ({ readAdminImpersonationState: () => null }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({ effectiveUserEmail: (email: string) => email, useEffectiveUserEmail: (email: string) => email }));
vi.mock("@/components/profile/useAresIcoLookup", () => ({ useAresIcoLookup: () => ({ status: "idle" }) }));
vi.mock("firebase/auth", () => ({ FactorId: { TOTP: "totp" }, multiFactor: () => ({ enrolledFactors: [{ factorId: "totp" }] }), EmailAuthProvider: {}, TotpMultiFactorGenerator: {} }));
import { useUserProfileAccess } from "./useUserProfileAccess";
import { useAccountSetupFlow } from "@/components/account-setup/useAccountSetupFlow";
const language = () => {}, formatDate = () => "";
const user = { uid: "synthetic", email: "synthetic@example.test", reload: async () => {} } as unknown as User;

describe("a failed profile read cannot open new-account onboarding", () => {
  let root: Root, container: HTMLDivElement;
  let profile: ReturnType<typeof useUserProfileAccess>, flow: ReturnType<typeof useAccountSetupFlow>;
  function Harness() {
    const access = useUserProfileAccess({ user, onLanguageResolved: language });
    const setup = useAccountSetupFlow({ user, loadingProfile: access.loadingProfile, accountType: access.accountType,
      subscriptionAccessState: access.subscriptionAccessState, formatIsoDayLabel: formatDate, onInternalProfileReady: access.markInternalProfileReady });
    const { syncFromProfileData, resetAfterProfileLoadFailure } = setup;
    useEffect(() => {
      if (access.accountSetupProfileSync) syncFromProfileData(access.accountSetupProfileSync.data, access.accountSetupProfileSync);
    }, [access.accountSetupProfileSync, syncFromProfileData]);
    useEffect(() => {
      if (access.profileLoadFailureVersion) resetAfterProfileLoadFailure();
    }, [access.profileLoadFailureVersion, resetAfterProfileLoadFailure]);
    useEffect(() => { profile = access; flow = setup; }, [access, setup]);
    return <div>{access.profileLoadError ? "profile-error" : setup.showWizard ? "onboarding" : "profile-ready"}</div>;
  }
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.auth.currentUser = user; mocks.api.mockResolvedValue({ ok: true });
    container = document.createElement("div"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it.each([
    [401, "auth/mfa-reauth-required", "reauth"],
    [403, "auth/account-blocked", "blocked"],
    [503, undefined, "unavailable"],
  ])("does not treat a %s response as a missing profile", async (status, code, expected) => {
    mocks.profile.mockRejectedValue(Object.assign(new Error("read failed"), { status, code }));
    await act(async () => root.render(<Harness />));
    expect(profile.profileLoadError).toBe(expected);
    expect(profile.accountSetupProfileSync).toBeNull();
    expect(flow.showWizard).toBe(false);
    expect(container.textContent).toBe("profile-error");
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("starts onboarding only after an authenticated response confirms a missing profile", async () => {
    mocks.profile.mockResolvedValue({ hasProfile: false, profile: {} });
    await act(async () => root.render(<Harness />));
    expect(profile.profileLoadError).toBeNull(); expect(flow.showWizard).toBe(true);
  });
  it("preserves loaded account fields after a failed refresh and recovers on a successful retry", async () => {
    const payload = { hasProfile: true, profile: { fullName: "Existing Advisor", phoneNumber: "777123456", ico: "12345678",
      positionTimeline: [{ position: "poradce1", validFrom: "2026-01-01" }] } };
    mocks.profile.mockResolvedValue(payload);
    await act(async () => root.render(<Harness />));
    expect(flow.fullName).toBe("Existing Advisor");
    mocks.profile.mockRejectedValueOnce(Object.assign(new Error("expired"), { status: 401 }));
    await act(async () => profile.reloadProfile());
    expect(flow.fullName).toBe("Existing Advisor"); expect(flow.showWizard).toBe(false);
    expect(profile.profileLoadError).toBe("reauth");
    await act(async () => profile.reloadProfile());
    expect(profile.profileLoadError).toBeNull(); expect(flow.fullName).toBe("Existing Advisor");
  });
});
