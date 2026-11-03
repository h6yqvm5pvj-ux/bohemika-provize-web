// @vitest-environment happy-dom

import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null },
  listeners: new Set<(user: unknown) => void>(),
  router: { replace: vi.fn() },
  profile: {
    loadingProfile: true,
    profileLoadError: null as "unavailable" | null,
    profileLoadFailureVersion: 0,
    reloadProfile: vi.fn(),
  },
  setup: { resetAfterProfileLoadFailure: vi.fn(), syncFromProfileData: vi.fn() },
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/smlouvy", useRouter: () => mocks.router }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, listener: (user: unknown) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
  signOut: vi.fn(),
}));
vi.mock("@/app/lib/privateMemory", () => ({ setPrivateMemoryIdentity: vi.fn() }));
vi.mock("@/app/lib/authSession", () => ({ clearServerSession: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/app/lib/adminImpersonation", () => ({
  ADMIN_IMPERSONATION_EVENT: "test-impersonation",
  ADMIN_IMPERSONATION_STORAGE_KEY: "test-impersonation",
  clearAdminImpersonationState: vi.fn(),
  installAdminImpersonationFetchPatch: vi.fn(),
  readAdminImpersonationState: () => null,
}));
vi.mock("@/components/profile/useUserProfileAccess", () => ({ useUserProfileAccess: () => mocks.profile }));
vi.mock("@/components/account-setup/useAccountSetupFlow", () => ({ useAccountSetupFlow: () => mocks.setup }));
vi.mock("@/components/navigation/useIntranetUnreadCount", () => ({ useIntranetUnreadCount: () => 0 }));
vi.mock("@/components/navigation/AppNavigation", () => ({ AppNavigation: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/subscription/SubscriptionGate", () => ({ SubscriptionGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/search/GlobalSearchCommand", () => ({ GlobalSearchCommand: () => null }));
vi.mock("@/components/MobilePullToRefresh", () => ({ MobilePullToRefresh: () => null }));
vi.mock("@/components/Preloader", () => ({
  default: ({ loading, onComplete }: { loading: boolean; onComplete: () => void }) => (
    <div data-preloader data-loading={String(loading)}>
      <button onClick={onComplete}>Dokončit animaci</button>
    </div>
  ),
}));

import { AppLayout } from "./AppLayout";
import { consumeLoginTransition, requestLoginTransition } from "@/lib/loginTransition";

describe("application login preloader", () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = async (strict = false) => {
    const layout = <AppLayout active="contracts"><p>Obsah aplikace</p></AppLayout>;
    await act(async () => root.render(strict ? <StrictMode>{layout}</StrictMode> : layout));
  };
  const signedIn = async () => {
    await act(async () => {
      for (const listener of mocks.listeners) listener({ uid: "test-user", email: "test@example.test", getIdTokenResult: async () => ({ claims: {} }) });
    });
  };
  const loader = () => container.querySelector("[data-preloader]");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    consumeLoginTransition();
    mocks.listeners.clear();
    mocks.profile.loadingProfile = true;
    mocks.profile.profileLoadError = null;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    consumeLoginTransition();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not animate a regular visit or authentication restoration", async () => {
    await render();
    expect(loader()).toBeNull();
    await signedIn();
    mocks.profile.loadingProfile = false;
    await render();
    expect(loader()).toBeNull();
    expect(container.textContent).toContain("Obsah aplikace");
  });

  it("keeps the same overlay through auth and profile readiness, including Strict Mode", async () => {
    requestLoginTransition();
    await render(true);
    const initial = loader();
    expect(initial?.getAttribute("data-loading")).toBe("true");
    expect(consumeLoginTransition()).toBe(false);
    await signedIn();
    expect(loader()).toBe(initial);
    expect(loader()?.getAttribute("data-loading")).toBe("true");
    mocks.profile.loadingProfile = false;
    await render(true);
    expect(loader()).toBe(initial);
    expect(loader()?.getAttribute("data-loading")).toBe("false");
    await act(async () => loader()!.querySelector<HTMLButtonElement>("button")!.click());
    expect(loader()).toBeNull();
    mocks.profile.loadingProfile = true;
    await render(true);
    expect(loader()).toBeNull();
  });

  it("reveals an authentication timeout instead of blocking the recovery link", async () => {
    vi.useFakeTimers();
    requestLoginTransition();
    await render();
    await act(async () => vi.advanceTimersByTime(12_000));
    expect(loader()?.getAttribute("data-loading")).toBe("false");
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it("reveals profile failures with the existing recovery controls", async () => {
    requestLoginTransition();
    await render();
    await signedIn();
    mocks.profile.profileLoadError = "unavailable";
    await render();
    expect(loader()?.getAttribute("data-loading")).toBe("false");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Profil se nepodařilo načíst");
  });
});
