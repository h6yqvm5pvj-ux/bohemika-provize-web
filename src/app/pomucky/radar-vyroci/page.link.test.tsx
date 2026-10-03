// @vitest-environment happy-dom

import { webcrypto } from "node:crypto";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnniversaryContract } from "@/app/lib/anniversaryPortfolio";
import { anniversaryRadarTarget } from "@/app/lib/anniversaryRadarLink";

const mocks = vi.hoisted(() => ({
  user: { email: "advisor@example.test", getIdToken: vi.fn() },
  authCallback: null as ((user: User | null) => void) | null,
  searchParams: new URLSearchParams(),
  load: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: User | null) => void) => {
    mocks.authCallback = callback;
    callback(mocks.user as unknown as User);
    return () => { mocks.authCallback = null; };
  },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.searchParams }));
vi.mock("./loadRadarData", () => ({ loadRadarData: mocks.load }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));

import RadarPage from "./page";

const dateAt = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const contract = (ownerEmail: string, days: number, id = "same-id"): AnniversaryContract => ({
  id, adviserEmail: ownerEmail, productKey: "neon", clientName: ownerEmail.startsWith("team") ? "Týmová klientka" : "Vlastní klientka",
  policyStartDate: `${Number(dateAt(days).slice(0, 4)) - 2}${dateAt(days).slice(4)}`,
});

describe("client links into anniversary radar", () => {
  let container: HTMLDivElement;
  let root: Root;
  const own = contract("advisor@example.test", 10);
  const team = contract("team@example.test", 45);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    localStorage.clear();
    sessionStorage.clear();
    mocks.searchParams = new URLSearchParams();
    mocks.load.mockResolvedValue({ contracts: [own, team], position: "manazer4", reviews: [
      { ownerEmail: team.adviserEmail, entryId: team.id, occurrenceKey: dateAt(45), processingStatus: "completed", historyCount: 1 },
    ] });
    mocks.fetch.mockResolvedValue({ ok: true, history: [{
      id: "history-1", sequence: 1, kind: "note", note: "Předchozí jednání s klientkou", occurrenceKey: dateAt(45),
      createdAtMs: null, actorEmail: mocks.user.email,
    }], hasMore: false, nextCursor: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const render = () => act(async () => root.render(<RadarPage />));
  const linkedCard = () => container.querySelector<HTMLElement>('article[data-linked="true"]');
  const waitForLink = async () => {
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      expect(linkedCard()).not.toBeNull();
    });
  };
  const target = async (item: AnniversaryContract) => {
    mocks.searchParams = new URLSearchParams({ contract: await anniversaryRadarTarget(item.adviserEmail!, item.id) });
  };

  it.each(["completed", "in_progress"])("opens the exact %s team case beyond 30 days and loads its existing history", async processingStatus => {
    mocks.load.mockResolvedValue({ contracts: [own, team], position: "manazer4", reviews: [
      { ownerEmail: team.adviserEmail, entryId: team.id, occurrenceKey: dateAt(45), processingStatus, historyCount: 1 },
    ] });
    await target(team);
    await render();
    await waitForLink();
    expect(linkedCard()?.textContent).toContain("Týmová klientka");
    expect(linkedCard()?.textContent).toContain(processingStatus === "completed" ? "Dokončeno" : "Rozpracováno");
    expect(linkedCard()?.querySelector('[aria-label="Historie jednání: Týmová klientka"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(linkedCard()?.textContent).toContain("Předchozí jednání s klientkou");
    expect(document.activeElement).toBe(linkedCard());
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Období výročí"] [aria-pressed="true"]')?.textContent).toBe("90 dní");
    expect(container.querySelector('[aria-label="Stav zpracování"] [aria-pressed="true"]')?.textContent).toContain("Všechny");
    expect(mocks.fetch).toHaveBeenCalledWith(mocks.user, expect.stringContaining("ownerEmail=team%40example.test"), expect.any(Object));
  });

  it("resolves a second navigation on the same page and clears conflicting filters", async () => {
    await target(team);
    await render();
    await waitForLink();
    const autoFilter = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Druh pojištění"] button')).find(button => button.textContent === "Auto")!;
    await act(async () => autoFilter.click());
    expect(linkedCard()).toBeNull();
    await target(own);
    await render();
    await waitForLink();
    expect(linkedCard()?.textContent).toContain("Vlastní klientka");
    expect(container.querySelector('[aria-label="Druh pojištění"] [aria-pressed="true"]')?.textContent).toBe("Všechny produkty");
    expect(document.activeElement).toBe(linkedCard());
    expect(container.textContent).not.toContain("Týmová klientka");
  });

  it.each(["invalid", "unavailable", "expired"])("shows a safe notice for an %s link without requesting target history", async kind => {
    const outsideWindow = contract("advisor@example.test", 120, "outside-window");
    mocks.load.mockResolvedValue({ contracts: [own, outsideWindow], position: null, reviews: [] });
    mocks.searchParams = new URLSearchParams({ contract: kind === "invalid" ? "../../private" :
      await anniversaryRadarTarget(kind === "unavailable" ? "stranger@example.test" : outsideWindow.adviserEmail!, outsideWindow.id) });
    await render();
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      expect(container.textContent).toContain(kind === "invalid" ? "Odkaz na výročí není platný" : "Vybrané výročí není dostupné");
    });
    expect(linkedCard()).toBeNull();
    expect(container.textContent).not.toContain("stranger@example.test");
    expect(container.textContent).not.toContain("../../private");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps normal visits on the original 30-day own/new queue without opening history", async () => {
    await render();
    expect(container.textContent).toContain("Vlastní klientka");
    expect(container.textContent).not.toContain("Týmová klientka");
    expect(container.querySelector('[aria-label="Období výročí"] [aria-pressed="true"]')?.textContent).toBe("30 dní");
    expect(linkedCard()).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("drops the previous case on account changes and does not reuse its authorization", async () => {
    await target(team);
    await render();
    await waitForLink();
    const nextPortfolio = Promise.withResolvers<unknown>();
    mocks.load.mockReturnValue(nextPortfolio.promise);
    await act(async () => mocks.authCallback?.({ email: "other@example.test" } as User));
    expect(linkedCard()).toBeNull();
    expect(container.textContent).not.toContain("Týmová klientka");
    await act(async () => nextPortfolio.resolve({ contracts: [], position: null, reviews: [] }));
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      expect(container.textContent).toContain("Vybrané výročí není dostupné");
    });
    expect(linkedCard()).toBeNull();
    await act(async () => mocks.authCallback?.(null));
    expect(container.textContent).toContain("Pro zobrazení výročí se přihlas");
  });
});
