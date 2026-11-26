// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPrivateMemory } from "@/app/lib/privateMemory";
import { setContractSearchHandoff } from "@/app/lib/contractSearchHandoff";
import { CONTRACTS_SILENT_REFRESH_COOLDOWN_MS, CONTRACTS_UPDATED_KEY } from "./contractsPageStorage";
import ContractsPage from "./page";

const session = vi.hoisted(() => {
  const user = { uid: "synthetic-owner", email: "owner@example.test", getIdToken: vi.fn(async () => "synthetic-test-token") };
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
const listResponse = (overrides = {}) => new Response(JSON.stringify({
  ok: true, contracts: [], teamAdvisers: [], position: "poradce2", hasMore: false, ...overrides,
}), { headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  clearPrivateMemory();
  localStorage.clear();
  vi.clearAllMocks();
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  fetchMock.mockImplementation(async () => listResponse());
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
  it("loads only the personal list on entry and fetches the team after switching tabs", async () => {
    const teamAdvisers = [{ email: "team@example.test", name: "Týmový poradce" }];
    fetchMock.mockImplementation(async (_url, init: RequestInit) => {
      const scope = (init.body as URLSearchParams).get("scope");
      return listResponse({
        teamAdvisers,
        contracts: scope === "team" ? [{
          id: "team-contract", adviserEmail: "team@example.test", clientName: "Týmový klient",
          contractSignedDate: Date.parse("2026-09-01"), productKey: "cppAuto",
        }] : [],
      });
    });
    await mount();
    expect(fetchMock.mock.calls[0][1].body.get("scope")).toBe("my");
    expect(fetchMock.mock.calls[0][1].body.has("includeTeam")).toBe(false);
    const teamButton = [...container.querySelectorAll("button")].find(button => button.textContent === "Tým");
    expect(teamButton?.textContent).toBe("Tým");
    await act(async () => teamButton!.click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body.get("scope")).toBe("team");
    expect(container.textContent).toContain("Týmový klient");

    const myButton = [...container.querySelectorAll("button")].find(button => button.textContent === "Vlastní");
    await act(async () => myButton!.click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("Týmový klient");
    await act(async () => teamButton!.click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Týmový klient");
  });

  it("submits search terms in the body and ignores a superseded response", async () => {
    let resolveFirst!: (response: Response) => void;
    fetchMock.mockImplementation(async (_url, init: RequestInit) => {
      const query = (init.body as URLSearchParams).get("q");
      if (query === "novak") return new Promise<Response>(resolve => { resolveFirst = resolve; });
      return listResponse({ contracts: query === "cerny" ? [{
        id: "current", clientName: "Černý", productKey: "cppAuto",
        adviserEmail: session.user.email, contractSignedDate: Date.parse("2026-09-01"),
      }] : [] });
    });
    await mount();

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Hledat klienta, číslo smlouvy nebo SPZ"]')!;
    const type = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    };
    await type("Novák");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/contracts/list");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: new URLSearchParams({ scope: "my", q: "novak" }) });
    const firstSignal = fetchMock.mock.calls[1][1].signal as AbortSignal;
    await type("Černý");
    expect(firstSignal.aborted).toBe(true);
    expect(container.textContent).toContain("Černý");
    await act(async () => resolveFirst(listResponse({ contracts: [] })));
    expect(container.textContent).toContain("Černý");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows a matched vehicle beside the contract number after a private plate search", async () => {
    fetchMock.mockImplementation(async () => listResponse({ contracts: [{
      id: "auto", productKey: "cppAuto", adviserEmail: session.user.email, carPlate: "1AB2345",
      contractNumber: "TEST-42", clientName: "Testovací klient", contractSignedDate: Date.parse("2026-09-01"),
    }] }));
    setContractSearchHandoff(session.user.uid, "1ab-2345");
    await mount();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/contracts/list");
    expect(init.method).toBe("POST");
    expect(init.body.get("q")).toBe("1ab-2345");
    expect(container.textContent).toContain("č. TEST-42");
    expect(container.textContent).toContain("SPZ 1AB2345");
  });

  it("opens an exact search with its original formatting and sends only the filtered request", async () => {
    setContractSearchHandoff(session.user.uid, "=TEST-42/x");
    await mount();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/contracts/list");
    expect(fetchMock.mock.calls[0][1].body.get("q")).toBe("=TEST-42/x");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Hledat klienta, číslo smlouvy nebo SPZ"]')?.value).toBe("TEST-42/x");
    expect(container.querySelector('button[aria-label="Přesné číslo smlouvy"]')?.getAttribute("aria-pressed")).toBe("true");
  });

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
