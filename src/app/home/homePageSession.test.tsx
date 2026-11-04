// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestUser = { uid: string; email: string; getIdToken: () => Promise<string> };
const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as TestUser | null },
  listeners: new Set<(user: TestUser | null) => void>(),
  profile: vi.fn(), homeData: vi.fn(), request: vi.fn(),
  refreshMailbox: null as (() => Promise<void>) | null,
}));
vi.mock("@/app/firebase", () => ({ auth: mocks.auth }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, listener: (user: TestUser | null) => void) => {
  mocks.listeners.add(listener);
  return () => mocks.listeners.delete(listener);
} }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile, invalidateUserProfileCache: vi.fn() }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.request }));
vi.mock("./useHomeData", () => ({ useHomeData: mocks.homeData, invalidateHomeCache: vi.fn() }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({
  effectiveUserEmail: (email: string | null | undefined) => email?.toLowerCase() ?? "",
  useEffectiveUserEmail: (email: string | null | undefined) => email?.toLowerCase() ?? "",
}));
vi.mock("@/app/lib/adminImpersonation", () => ({ readAdminImpersonationState: () => null, resolveUserProfilePatchRequest: vi.fn() }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div data-layout>{children}</div> }));
vi.mock("@/components/search/GlobalSearchCommand", () => ({ GlobalSearchCommand: () => null }));
vi.mock("../posta/useMailboxRefresh", () => ({ useMailboxRefresh: (_enabled: boolean, refresh: () => Promise<void>) => { mocks.refreshMailbox = refresh; } }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }));

import HomePage from "../page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const advisor = (uid: string): TestUser => ({ uid, email: `${uid}@example.test`, getIdToken: async () => "synthetic" });

describe("home page session transitions", () => {
  let root: Root;
  let container: HTMLDivElement;
  let profiles: Map<string, ReturnType<typeof deferred<Record<string, unknown>>>>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.clearAllMocks();
    mocks.auth.currentUser = null;
    mocks.listeners.clear();
    mocks.refreshMailbox = null;
    profiles = new Map();
    mocks.profile.mockImplementation((user: TestUser) => {
      if (!profiles.has(user.uid)) profiles.set(user.uid, deferred());
      return profiles.get(user.uid)!.promise;
    });
    mocks.request.mockResolvedValue({ unreadCount: 7 });
    mocks.homeData.mockReturnValue({
      userMeta: { monthlyGoal: 1000 }, setUserMeta: vi.fn(),
      myEntries: [], teamEntries: [], monthlyLeaderboard: [], hasTeam: false,
      myPremiums: { lifeMonthly: 0, otherAnnual: 0 }, teamPremiums: { lifeMonthly: 0, otherAnnual: 0 },
      myContractsCount: 0, myImmediateSum: 0, myImmediatePrevSum: 0,
      myTipContractsCount: 0, myTipImmediateSum: 0, myTipImmediatePrevSum: 0,
      teamContractsCount: 0, teamImmediateSum: 0, teamImmediatePrevSum: 0,
      summaryLoading: false, summaryRefreshing: false, historyLoading: false, tipSummaryLoading: false,
    });
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const mount = () => act(async () => root.render(<HomePage />));
  const emit = (user: TestUser | null) => act(async () => {
    mocks.auth.currentUser = user;
    mocks.listeners.forEach(listener => listener(user));
  });
  const resolveProfile = (user: TestUser, accountType = "advisor") => act(async () => {
    profiles.get(user.uid)!.resolve({ ok: true, hasTeam: false, profile: { email: user.email, accountType } });
  });
  const latestDataEmail = () => mocks.homeData.mock.calls.at(-1)![0].email;
  const mail = () => container.querySelector<HTMLAnchorElement>('a[href="/posta"]');

  it("keeps signed-out visitors outside the advisor home data scope", async () => {
    await mount();
    expect(container.textContent).toContain("Načítám přihlášení");
    await emit(null);
    expect(container.querySelector("h1")).toBeNull();
    expect(latestDataEmail()).toBeNull();
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("clears the signed-out profile and unread badge before another account opens home", async () => {
    const first = advisor("first");
    const second = advisor("second");
    await mount(); await emit(first); await resolveProfile(first);
    expect(latestDataEmail()).toBe(first.email);
    await act(async () => { await mocks.refreshMailbox?.(); });
    expect(mail()?.textContent).toContain("7");
    await emit(null);
    expect(latestDataEmail()).toBeNull();
    expect(mail()).toBeNull();
    await emit(second);
    expect(container.querySelector('[aria-label="Ověřuji typ účtu"]')).not.toBeNull();
    expect(latestDataEmail()).toBeNull();
    await resolveProfile(second);
    expect(latestDataEmail()).toBe(second.email);
    expect(mail()?.textContent).toBe("Pošta");
  });

  it("ignores a previous account's profile response after signing into another account", async () => {
    const first = advisor("first");
    const second = advisor("second");
    await mount(); await emit(first); await emit(null); await emit(second);
    await resolveProfile(first);
    expect(latestDataEmail()).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    await resolveProfile(second);
    expect(latestDataEmail()).toBe(second.email);
    expect(container.querySelector("h1")?.textContent).toBe("Produkce");
  });

  it("clears the previous profile before a direct account switch and retains it on same-user events", async () => {
    const first = advisor("first");
    const second = advisor("second");
    await mount(); await emit(first); await resolveProfile(first);
    const previousCalls = mocks.homeData.mock.calls.length;
    await emit(second);
    expect(mocks.homeData.mock.calls.slice(previousCalls).every(([options]) => options.email === null)).toBe(true);
    expect(container.querySelector("h1")).toBeNull();
    await resolveProfile(second);
    expect(latestDataEmail()).toBe(second.email);
    await emit(second);
    expect(latestDataEmail()).toBe(second.email);
    expect(container.querySelector("h1")?.textContent).toBe("Produkce");
  });

  it("recovers from the guest timeout when Firebase later restores a user", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = advisor("restored");
    await mount();
    await act(async () => vi.advanceTimersByTime(5000));
    expect(container.querySelector("h1")).toBeNull();
    expect(latestDataEmail()).toBeNull();
    await emit(user); await resolveProfile(user);
    expect(latestDataEmail()).toBe(user.email);
    expect(container.querySelector("h1")?.textContent).toBe("Produkce");
  });

  it("does not enable advisor production for a resolved tipster account", async () => {
    const user = advisor("tipster");
    await mount(); await emit(user); await resolveProfile(user, "tipster");
    expect(latestDataEmail()).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
  });

  it("keeps the gold tool in quick actions without restoring the homepage price widget", async () => {
    const user = advisor("advisor");
    window.localStorage.setItem(`home.widgets:${user.email}`, JSON.stringify({ goldWidget: true, quickActions: true }));
    await mount(); await emit(user); await resolveProfile(user);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Přizpůsobit domovskou stránku"]')!.click());
    expect(container.textContent).not.toContain("Cena zlata");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="+ Přidat"]')!.click());
    const gold = [...container.querySelectorAll("button")].find(button => button.textContent?.startsWith("Zlato"));
    expect(gold).toBeTruthy();
    await act(async () => gold!.click());
    expect(container.querySelector('a[href="/pomucky/zlato"]')).not.toBeNull();
    expect(mocks.request.mock.calls.some(([, path]) => String(path).startsWith("/api/gold"))).toBe(false);
  });
});
