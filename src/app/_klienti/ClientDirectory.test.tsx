// @vitest-environment happy-dom

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientAdviser, ClientContractItem } from "./clientCardHelpers";
import type { loadClientContracts } from "./loadClientContracts";

const mocks = vi.hoisted(() => ({
  user: { uid: "directory-advisor", email: "owner@example.test" } as User,
  query: "",
  contracts: [] as ClientContractItem[],
  advisers: [] as ClientAdviser[],
  load: vi.fn<typeof loadClientContracts>(),
  fetch: vi.fn(),
}));

vi.mock("./ClientSession", () => ({ ClientSession: ({ children }: { children: (user: User) => ReactNode }) => children(mocks.user) }));
vi.mock("./loadClientContracts", () => ({ loadClientContracts: mocks.load }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("next/link", () => ({
  default: ({ href, children, className, title, "aria-label": label }: ComponentProps<"a">) => <a href={href} className={className} title={title} aria-label={label}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));

import ClientsPage from "./page";

const contract = (id: string, clientName: string, extra: Partial<ClientContractItem> = {}): ClientContractItem => ({
  id, clientName, adviserEmail: mocks.user.email, productKey: "cppAuto", ...extra,
});
let container: HTMLDivElement;
let root: Root;

const render = async () => {
  await act(async () => root.render(<ClientsPage />));
};
const names = () => [...container.querySelectorAll("a h2")].map(element => element.textContent);
const button = (label: string) => {
  const target = [...container.querySelectorAll<HTMLButtonElement>("button")].find(element => {
    const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join("").trim();
    return element.getAttribute("aria-label") === label || element.textContent?.trim() === label || text === label;
  });
  expect(target, label).toBeTruthy();
  return target!;
};
const click = async (label: string) => { await act(async () => button(label).click()); };
const productSelect = () => [...container.querySelectorAll("label")].find(element => element.textContent?.startsWith("Druh produktu"))!.querySelector("select")!;
const searchInput = () => container.querySelector<HTMLInputElement>("#clients-search")!;
const enter = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  window.history.replaceState(null, "", "/klienti");
  mocks.query = "";
  mocks.contracts = [];
  mocks.advisers = [];
  mocks.fetch.mockResolvedValue({ ok: true, cards: [] });
  mocks.load.mockImplementation(async (_user, signal, _onProgress, onTeamAdvisers) => {
    signal.throwIfAborted();
    onTeamAdvisers?.(mocks.advisers);
    return mocks.contracts;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("client directory filters and client cards", () => {
  it("combines the product selection with name search and contract status", async () => {
    mocks.contracts = [
      contract("active-auto", "Jan Novák"),
      contract("archived-auto", "Jana Nováková", { status: "storno" }),
      contract("active-life", "Petr Novák", { productKey: "neon" }),
      contract("different-name", "Anna Bílá"),
    ];
    await render();
    await enter(productSelect(), "auto");
    expect(names()).toEqual(["Anna Bílá", "Jan Novák", "Jana Nováková"]);
    await enter(searchInput(), "novak");
    expect(names()).toEqual(["Jan Novák", "Jana Nováková"]);
    await click("Pouze archiv");
    expect(names()).toEqual(["Jana Nováková"]);
    expect(container.querySelector('[aria-label="Produkty klienta včetně archivu"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Nalezeno 1 z 4 klientů");
  });

  it("clears the product, search and status filters together from the empty state", async () => {
    mocks.contracts = [contract("auto", "Anna Bílá"), contract("life", "Petr Novák", { productKey: "neon", status: "storno" })];
    await render();
    await enter(productSelect(), "life");
    await enter(searchInput(), "nenalezeno");
    await click("Pouze archiv");
    expect(names()).toEqual([]);
    await click("Vymazat hledání a filtry");
    expect(productSelect().value).toBe("all");
    expect(searchInput().value).toBe("");
    expect(button("Všichni").getAttribute("aria-pressed")).toBe("true");
    expect(names()).toEqual(["Anna Bílá", "Petr Novák"]);
  });

  it("returns to the first page when a product is selected even if a second filtered page exists", async () => {
    mocks.contracts = Array.from({ length: 50 }, (_, index) => contract(`contract-${index}`, `Klient ${String(index + 1).padStart(2, "0")}`, {
      productKey: index < 25 ? "cppAuto" : "neon",
    }));
    await render();
    await click("Další strana");
    expect(names()[0]).toBe("Klient 25");
    expect(container.textContent).toContain("Strana 2 z 3");
    await enter(productSelect(), "auto");
    expect(container.textContent).toContain("Strana 1 z 2");
    expect(names()).toHaveLength(24);
    expect(names()[0]).toBe("Klient 01");
    expect(names()).not.toContain("Klient 25");
    expect(button("Předchozí strana").disabled).toBe(true);
  });

  it("keeps client cards within the selected team scope without product tags or anniversary links", async () => {
    const selectedAdviser = "first-adviser@example.test";
    mocks.query = new URLSearchParams({ scope: "team", advisers: selectedAdviser }).toString();
    mocks.advisers = [{ email: selectedAdviser, name: "První poradce" }, { email: "second-adviser@example.test", name: "Druhý poradce" }];
    mocks.contracts = [
      contract("team-anniversary-policy", "Týmový klient", { adviserEmail: selectedAdviser, policyStartDate: "2020-10-23T00:00:00" }),
      contract("own-same-client", "Týmový klient", { productKey: "neon" }),
      contract("other-team-policy", "Další týmový klient", { adviserEmail: "second-adviser@example.test", productKey: "neon" }),
      contract("own-policy", "Vlastní klient"),
      contract("outside-policy", "Cizí klient", { adviserEmail: "outsider@example.test" }),
    ];
    await render();
    expect(names()).toEqual(["Týmový klient"]);
    expect(container.querySelector('[aria-label="Produkty klienta včetně archivu"]')).toBeNull();
    const clientLink = container.querySelector<HTMLAnchorElement>('a[href^="/klienti/"]')!;
    expect(new URL(clientLink.href).searchParams.get("advisers")).toBe(selectedAdviser);
    expect(container.querySelector('a[href^="/pomucky/radar-vyroci"]')).toBeNull();
    expect(clientLink.textContent).not.toContain("Výročí");
    expect(container.querySelector("a a")).toBeNull();

    await enter(productSelect(), "life");
    expect(names()).toEqual([]);
    await click("Vymazat hledání a filtry");
    expect(button("Týmoví klienti").getAttribute("aria-pressed")).toBe("true");
    expect(mocks.load.mock.lastCall?.[4]?.selection).toEqual({ scope: "team", advisers: [] });
    expect(names()).toEqual(["Další týmový klient", "Týmový klient"]);
    await enter(productSelect(), "life");
    expect(names()).toEqual(["Další týmový klient"]);
  });
});
