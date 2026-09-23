// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as User | null, languageCode: "" },
  signInAfter: vi.fn(), api: vi.fn(), enrolled: false, enroll: vi.fn(), send: vi.fn(), session: vi.fn(), secret: vi.fn(), reauthenticate: vi.fn(), requestCode: vi.fn(), signOut: vi.fn(), clearSession: vi.fn(),
}));
vi.mock("@/app/lib/mfaEnrollment", () => ({ requestMfaEmailCode: mocks.requestCode, confirmMfaEmailCode: mocks.secret, completeMfaEnrollment: mocks.enroll }));
vi.mock("@/app/lib/authSession", () => ({ clearServerSession: mocks.clearSession }));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/authEmailRequest", () => ({ requestVerificationEmail: mocks.send }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.api }));
vi.mock("@/app/lib/userProfileCache", () => ({ invalidateUserProfileCache: vi.fn() }));
vi.mock("@/components/profile/useAresIcoLookup", () => ({ useAresIcoLookup: () => ({ status: "idle" }) }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,test" } }));
vi.mock("firebase/auth", () => ({
  signOut: mocks.signOut,
  EmailAuthProvider: { credential: () => ({}) },
  FactorId: { TOTP: "totp" },
  multiFactor: () => ({ enrolledFactors: mocks.enrolled ? [{ factorId: "totp" }] : [], enroll: mocks.enroll, getSession: mocks.session }),
  reauthenticateWithCredential: mocks.reauthenticate,
  TotpMultiFactorGenerator: { generateSecret: mocks.secret, assertionForEnrollment: () => ({}) },
}));
vi.mock("@/app/lib/mfaSetupSignIn", () => ({ signInAfterMfaSetup: mocks.signInAfter }));
import { useAccountSetupFlow } from "./useAccountSetupFlow";

describe("account setup progress, drafts and email verification", () => {
  let root: Root;
  let container: HTMLDivElement;
  let flow: ReturnType<typeof useAccountSetupFlow>;
  let user: { uid: string; email: string; emailVerified: boolean; reload: ReturnType<typeof vi.fn>; getIdToken: ReturnType<typeof vi.fn> };
  function Harness() {
    const currentFlow = useAccountSetupFlow({
      user: user as unknown as User, loadingProfile: false, accountType: "advisor",
      subscriptionAccessState: "active", formatIsoDayLabel: () => "", onInternalProfileReady: () => {},
    });
    useEffect(() => { flow = currentFlow; }, [currentFlow]);
    return null;
  }
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    user = { uid: "synthetic-account", email: "synthetic@example.test", emailVerified: false, reload: vi.fn().mockResolvedValue(undefined), getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    mocks.auth.currentUser = user as unknown as User;
    sessionStorage.clear();
    mocks.enrolled = false;
    mocks.api.mockResolvedValue({ ok: true });
    mocks.enroll.mockImplementation(async () => { mocks.enrolled = true; return "synthetic-sign-in-token"; });
    mocks.requestCode.mockResolvedValue("synthetic-challenge");
    mocks.session.mockResolvedValue("synthetic-session");
    mocks.secret.mockResolvedValue({ secretKey: "synthetic-secret", generateQrCodeUrl: () => "otpauth://synthetic" });
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
    await act(async () => flow.syncFromProfileData({ phoneNumber: "777123456", ico: "12345678", positionTimeline: [{ position: "poradce1", validFrom: "2026-01-01" }] }, { accountType: "advisor", hasInternalProfile: true }));
    await act(async () => flow.openSecuritySetup());
  });
  afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  const start = async () => {
    await act(async () => flow.onMfaPasswordChange("synthetic-password"));
    await act(async () => flow.onPrimaryAction());
  };
  const confirmEmailCode = async () => {
    expect(flow.mfaSecretKey).toBeNull();
    expect(flow.mfaAwaitingEmailCode).toBe(true);
    await act(async () => flow.onMfaCodeChange("654321"));
    await act(async () => flow.onPrimaryAction());
  };
  it("requests a code for an unverified email, then creates the QR only after confirmation", async () => {
    await start();
    expect(mocks.requestCode).toHaveBeenCalledWith(user); expect(mocks.secret).not.toHaveBeenCalled();
    expect(flow.mfaPassword).toBe(""); expect(flow.mfaSecretKey).toBeNull();
    await confirmEmailCode();
    expect(mocks.secret).toHaveBeenCalledExactlyOnceWith(user, "synthetic-challenge", "654321");
    expect(flow.mfaSecretKey).toBe("synthetic-secret");
    expect(mocks.signInAfter).not.toHaveBeenCalled();
  });
  it("keeps setup pending when code delivery fails", async () => {
    mocks.requestCode.mockRejectedValue(new Error("Potvrzovací e-mail se nepodařilo odeslat."));
    await start();
    expect(flow.error).toBeTruthy(); expect(flow.info).toBeNull();
    expect(mocks.secret).not.toHaveBeenCalled(); expect(mocks.signInAfter).not.toHaveBeenCalled();
  });
  it("does not grant access if account state changes before TOTP confirmation", async () => {
    await start(); await confirmEmailCode();
    mocks.enroll.mockRejectedValue(new Error("Potvrzení vypršelo."));
    await act(async () => flow.onMfaCodeChange("123456"));
    await act(async () => flow.onPrimaryAction());
    expect(mocks.signInAfter).not.toHaveBeenCalled(); expect(flow.error).toBeTruthy();
  });
  it("does not resend codes or skip confirmation when returning from the inbox", async () => {
    await start();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(flow.mfaAwaitingEmailCode).toBe(true);
    expect(mocks.requestCode).toHaveBeenCalledOnce(); expect(mocks.secret).not.toHaveBeenCalled();
    expect(mocks.reauthenticate).toHaveBeenCalledOnce(); expect(sessionStorage.length).toBe(0);
  });
  it("does not confirm an inbox code into another signed-in account", async () => {
    await start();
    mocks.auth.currentUser = { ...user, uid: "another-account" } as unknown as User;
    await act(async () => flow.onMfaCodeChange("123456"));
    await act(async () => flow.onPrimaryAction());
    expect(mocks.secret).not.toHaveBeenCalled(); expect(mocks.signInAfter).not.toHaveBeenCalled();
  });
  it("restores incomplete career edits after remount and ignores them after the server timeline changes", async () => {
    const profile = { fullName: "Synthetic Advisor", phoneNumber: "777123456", ico: "12345678", positionTimeline: [] };
    const sync = () => flow.syncFromProfileData(profile, { accountType: "advisor", hasInternalProfile: true });
    await act(async () => sync());
    const rowId = flow.timelineDraft[0].id;
    await act(async () => flow.onTimelineRowChange(rowId, { position: "poradce3", validFrom: "", ongoing: false }));
    expect(flow.careerDraftStatus).toBe("saved");
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
    await act(async () => sync());
    expect(flow.careerDraftStatus).toBe("restored");
    expect(flow.timelineDraft[0]).toMatchObject({ position: "poradce3", validFrom: "", ongoing: false });
    await act(async () => flow.syncFromProfileData({ ...profile, positionTimeline: [{ position: "poradce5", validFrom: "2026-01-01" }] }, { accountType: "advisor", hasInternalProfile: true }));
    expect(flow.timelineDraft[0].position).toBe("poradce5");
    expect(sessionStorage.length).toBe(0);
  });
  it("clears the draft on logout and cannot jump ahead of the current step", async () => {
    await act(async () => flow.onBack());
    const row = flow.timelineDraft[0];
    await act(async () => flow.onTimelineRowChange(row.id, { position: "poradce3" }));
    await act(async () => flow.onStepChange(2));
    expect(flow.currentStep).toBe("career");
    expect(sessionStorage.length).toBe(1);
    await act(async () => flow.resetForMissingUser());
    expect(sessionStorage.length).toBe(0);
  });
  it("requires an end date when the advisor unchecks the current-position option", async () => {
    await act(async () => flow.onBack());
    await act(async () => flow.onTimelineRowChange(flow.timelineDraft[0].id, { ongoing: false }));
    await act(async () => flow.onPrimaryAction());
    expect(flow.error).toContain("vyplň datum DO");
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("automatically signs in after new enrollment without saving a stale profile", async () => {
    const navigate = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    user.emailVerified = true;
    await start();
    expect(flow.mfaSecretKey).toBeNull();
    expect(flow.mfaEmailVerified).toBe(false);
    await confirmEmailCode();
    await act(async () => flow.onMfaCodeChange("123456"));
    await act(async () => flow.onPrimaryAction());
    expect(mocks.enroll).toHaveBeenCalledWith(user, expect.any(Object), "123456");
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.signInAfter).toHaveBeenCalledWith("synthetic-sign-in-token");
    expect(navigate).toHaveBeenCalledWith("/");
  });
  it("keeps an already secured account's completion visible until the user opens the app", async () => {
    user.emailVerified = true; mocks.enrolled = true;
    await start();
    expect(flow.completed).toBe(true);
    expect(flow.showWizard).toBe(true);
    expect(mocks.requestCode).not.toHaveBeenCalled();
    await act(async () => flow.onComplete());
    expect(flow.showWizard).toBe(false);
  });

  it("does not restore another user's career draft", async () => {
    await act(async () => flow.onBack());
    await act(async () => flow.onTimelineRowChange(flow.timelineDraft[0].id, { position: "poradce9" }));
    await act(async () => root.unmount());
    user = { ...user, uid: "different-account" };
    mocks.auth.currentUser = user as unknown as User;
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
    await act(async () => flow.syncFromProfileData({ phoneNumber: "777123456", ico: "12345678", positionTimeline: [{ position: "poradce1", validFrom: "2026-01-01" }] }, { accountType: "advisor", hasInternalProfile: true }));
    expect(flow.timelineDraft[0].position).toBe("poradce1");
    expect(flow.careerDraftStatus).toBe("none");
  });
  it("keeps edits usable when browser storage is unavailable", async () => {
    vi.stubGlobal("sessionStorage", { setItem: () => { throw new Error("Storage unavailable"); }, clear: () => {}, removeItem: () => {} });
    await act(async () => flow.onBack());
    await act(async () => flow.onTimelineRowChange(flow.timelineDraft[0].id, { position: "poradce4" }));
    expect(flow.timelineDraft[0].position).toBe("poradce4");
    expect(flow.careerDraftStatus).toBe("unavailable");
  });

});
