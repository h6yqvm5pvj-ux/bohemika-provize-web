// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPrivateMemory } from "@/app/lib/privateMemory";
import { CONTRACTS_SILENT_REFRESH_COOLDOWN_MS, CONTRACTS_UPDATED_KEY } from "./contractsPageStorage";
import ContractsPage from "./page";

const session = vi.hoisted(() => {
  const user = { email: "owner@example.test", getIdToken: vi.fn(async () => "synthetic-test-token") };
  return { user, auth: { currentUser: user } };
});

vi.mock("@/app/firebase", () => ({ auth: session.auth }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: typeof session.user) => void) => {
    callback(session.user);
    return () => {};
  },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/image", () => ({ default: () => <span /> }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({
  effectiveUserEmail: (email: unknown) => typeof email === "string" ? email.toLowerCase() : "",
  useEffectiveUserEmail: (email: unknown) => typeof email === "string" ? email.toLowerCase() : "",
}));

let root: Root;
let container: HTMLDivElement;
let now: number;
const fetchMock = vi.fn();

beforeEach(() => {
  clearPrivateMemory();
  localStorage.clear();
  vi.clearAllMocks();
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({
    ok: true, contracts: [], teamContracts: [], teamEmails: [], position: "poradce2",
    hasMore: false, teamHasMore: false,
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => root.render(<ContractsPage />));
  expect(fetchMock).toHaveBeenCalledTimes(1);
}

async function dispatch(target: Window | Document, event: Event) {
  await act(async () => { target.dispatchEvent(event); });
}

describe("contract list refresh requests", () => {
  it("reuses the initial response across passive focus, pageshow and visibility events", async () => {
    await mount();
    await dispatch(window, new Event("focus"));
    await dispatch(window, new Event("pageshow"));
    await dispatch(document, new Event("visibilitychange"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += CONTRACTS_SILENT_REFRESH_COOLDOWN_MS;
    await dispatch(window, new Event("focus"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await dispatch(window, new Event("pageshow"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes immediately after a contract mutation within the passive cooldown", async () => {
    await mount();
    await dispatch(window, new Event("contracts:updated"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await dispatch(window, new Event("focus"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes immediately after another tab changes contracts", async () => {
    await mount();
    await dispatch(window, new StorageEvent("storage", { key: CONTRACTS_UPDATED_KEY, newValue: String(now) }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on focus after the initial load fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "Dočasná chyba." }), { status: 503 }));
    await mount();
    expect(container.textContent).toContain("Dočasná chyba.");
    await dispatch(window, new Event("focus"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("Dočasná chyba.");
  });
});
