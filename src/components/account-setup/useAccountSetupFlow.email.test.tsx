// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as User | null, languageCode: "" },
  api: vi.fn(), enrolled: false, enroll: vi.fn(), send: vi.fn(), session: vi.fn(), secret: vi.fn(), reauthenticate: vi.fn(),
}));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/authEmailRequest", () => ({ requestVerificationEmail: mocks.send }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.api }));
vi.mock("@/app/lib/userProfileCache", () => ({ invalidateUserProfileCache: vi.fn() }));
vi.mock("@/components/profile/useAresIcoLookup", () => ({ useAresIcoLookup: () => ({ status: "idle" }) }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,test" } }));
vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: () => ({}) },
  FactorId: { TOTP: "totp" },
  multiFactor: () => ({ enrolledFactors: mocks.enrolled ? [{ factorId: "totp" }] : [], enroll: mocks.enroll, getSession: mocks.session }),
  reauthenticateWithCredential: mocks.reauthenticate,
  TotpMultiFactorGenerator: { generateSecret: mocks.secret, assertionForEnrollment: () => ({}) },
}));
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
    mocks.enroll.mockImplementation(async () => { mocks.enrolled = true; });
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
  it("stops after sending, then continues only once Firebase confirms verification", async () => {
    await start();
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(flow.info).toContain("Otevři odkaz ve schránce");
    expect(flow.mfaPassword).toBe("");
    expect(flow.mfaSecretKey).toBeNull();

    user.emailVerified = true;
    await start();
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.secret).toHaveBeenCalledExactlyOnceWith("synthetic-session");
    expect(flow.mfaSecretKey).toBe("synthetic-secret");
  });
  it("keeps 2FA disabled and displays an email failure", async () => {
    mocks.send.mockRejectedValue({ code: "auth/too-many-requests" });
    await start();
    expect(flow.error).toContain("Příliš mnoho žádostí");
    expect(flow.info).toBeNull();
    expect(mocks.secret).not.toHaveBeenCalled();
  });
  it("resumes on return from the inbox without storing or requesting the password again", async () => {
    await start();
    expect(flow.mfaAwaitingEmail).toBe(true);
    user.emailVerified = true;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(flow.mfaSecretKey).toBe("synthetic-secret");
    expect(flow.mfaAwaitingEmail).toBe(false);
    expect(flow.mfaEmailVerified).toBe(true);
    expect(mocks.reauthenticate).toHaveBeenCalledOnce();
    expect(sessionStorage.length).toBe(0);
  });
  it("keeps waiting without generating a secret or resending mail if the inbox link was not confirmed", async () => {
    await start();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(flow.mfaAwaitingEmail).toBe(true);
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it("does not resume verification into a different signed-in account", async () => {
    await start();
    user.emailVerified = true;
    mocks.auth.currentUser = { ...user, uid: "another-account" } as unknown as User;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
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
  it("keeps successful completion visible until the user opens the app", async () => {
    user.emailVerified = true;
    await start();
    await act(async () => flow.onMfaCodeChange("123456"));
    await act(async () => flow.onPrimaryAction());
    expect(flow.completed).toBe(true);
    expect(flow.showWizard).toBe(true);
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTime(5000));
    expect(flow.showWizard).toBe(true);
    await act(async () => flow.onComplete());
    expect(flow.showWizard).toBe(false);
  });
  it("allows retrying the final save after 2FA is enrolled", async () => {
    user.emailVerified = true;
    await start();
    mocks.api.mockRejectedValueOnce(new Error("Dočasný výpadek"));
    await act(async () => flow.onMfaCodeChange("123456"));
    await act(async () => flow.onPrimaryAction());
    expect(flow.mfaEnabled).toBe(true);
    expect(flow.completed).toBe(false);
    expect(flow.showWizard).toBe(true);
    expect(flow.error).toBe("Dočasný výpadek");
    await act(async () => flow.onPrimaryAction());
    expect(flow.completed).toBe(true);
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
