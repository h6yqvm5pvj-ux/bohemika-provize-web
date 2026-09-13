// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as User | null, languageCode: "" },
  send: vi.fn(), session: vi.fn(), secret: vi.fn(), reauthenticate: vi.fn(),
}));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/authEmailRequest", () => ({ requestVerificationEmail: mocks.send }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: vi.fn() }));
vi.mock("@/app/lib/userProfileCache", () => ({ invalidateUserProfileCache: vi.fn() }));
vi.mock("@/components/profile/useAresIcoLookup", () => ({ useAresIcoLookup: () => ({ status: "idle" }) }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,test" } }));
vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: () => ({}) },
  FactorId: { TOTP: "totp" },
  multiFactor: () => ({ enrolledFactors: [], getSession: mocks.session }),
  reauthenticateWithCredential: mocks.reauthenticate,
  TotpMultiFactorGenerator: { generateSecret: mocks.secret },
}));
import { useAccountSetupFlow } from "./useAccountSetupFlow";

describe("onboarding waits for the inbox before generating a 2FA secret", () => {
  let root: Root;
  let container: HTMLDivElement;
  let flow: ReturnType<typeof useAccountSetupFlow>;
  let user: { email: string; emailVerified: boolean; reload: ReturnType<typeof vi.fn>; getIdToken: ReturnType<typeof vi.fn> };
  function Harness() {
    const currentFlow = useAccountSetupFlow({
      user: user as unknown as User, loadingProfile: true, accountType: "advisor",
      subscriptionAccessState: "active", formatIsoDayLabel: () => "", onInternalProfileReady: () => {},
    });
    useEffect(() => { flow = currentFlow; }, [currentFlow]);
    return null;
  }
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    user = { email: "synthetic@example.test", emailVerified: false, reload: vi.fn().mockResolvedValue(undefined), getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    mocks.auth.currentUser = user as unknown as User;
    mocks.session.mockResolvedValue("synthetic-session");
    mocks.secret.mockResolvedValue({ secretKey: "synthetic-secret", generateQrCodeUrl: () => "otpauth://synthetic" });
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
    await act(async () => flow.syncFromProfileData({ phoneNumber: "777123456", ico: "12345678", positionTimeline: [{ position: "poradce1", validFrom: "2026-01-01" }] }, { accountType: "advisor", hasInternalProfile: true }));
    await act(async () => flow.openSecuritySetup());
  });
  afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
});
