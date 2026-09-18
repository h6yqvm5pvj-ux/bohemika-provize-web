// @vitest-environment happy-dom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HallOfFamePeriodsResponse, HallPeriod, HallPeriodResult, HallRankings } from "./hallOfFame.types";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), authChanged: vi.fn(), effectiveEmail: "advisor@example.test" }));
vi.mock("@/app/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: mocks.authChanged }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({ useEffectiveUserEmail: () => mocks.effectiveEmail }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ProfileAvatar", () => ({ ProfileAvatar: () => <span /> }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
import HallOfFamePage from "./page";

function response(currentUserId = "anna"): HallOfFamePeriodsResponse {
  const periods = Object.fromEntries((["month", "3months", "6months", "year"] as HallPeriod[]).map((key, index) => {
    const row = { id: "anna", rank: 1, name: "Anna", profileAvatar: "", contracts: index + 1, annualPremium: (index + 1) * 12000, leaderRatioPct: 100 };
    const rankings: HallRankings = { life: [row], auto: [], property: [], business: [{ ...row, name: "Boris", id: "boris" }], gold: [] };
    return [key, { rankings, period: { key, startDate: ["2026-09-01", "2026-07-01", "2026-04-01", "2025-10-01"][index], endDate: "2026-09-14" } }];
  })) as Record<HallPeriod, HallPeriodResult>;
  return { ok: true, periods, currentUserId, updatedAtMs: Date.now() };
}

describe("hall page categories and loading", () => {
  let root: Root;
  let container: HTMLDivElement;
  let authListener: (user: { uid: string; email: string } | null) => void;
  const user = { uid: "advisor", email: "advisor@example.test" };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.effectiveEmail = user.email;
    mocks.fetch.mockResolvedValue(response());
    mocks.authChanged.mockImplementation((_auth, listener) => { authListener = listener; listener(user); return () => {}; });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function mount() { await act(async () => root.render(<HallOfFamePage />)); }
  async function click(label: string) {
    const button = [...container.querySelectorAll("button")].find((element) => element.textContent === label);
    expect(button).toBeDefined();
    await act(async () => button!.click());
  }

  it("switches all periods and the business category immediately using a single request", async () => {
    await mount();
    expect(container.querySelector("tbody")?.textContent).toContain("Anna");
    await click("Podnikatelé");
    expect(container.querySelector("tbody")?.textContent).toContain("Boris");
    expect(container.querySelector("tbody")?.textContent).not.toContain("Anna");
    for (const [label, premium] of [["Poslední 3 měsíce", "24.000 Kč"], ["Posledních 6 měsíců", "36.000 Kč"], ["Poslední rok", "48.000 Kč"], ["Aktuální měsíc", "12.000 Kč"]]) {
      await click(label);
      expect(container.querySelector("tbody")?.textContent).toContain(premium);
      expect(container.textContent).not.toContain("Chystáme stupně vítězů");
    }
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(user, "/api/team-overview?action=hallOfFame&includePeriods=true");
    await click("Majetek a odpovědnost");
    expect(container.textContent).toContain("První příčka zatím čeká");
    expect(container.querySelector("tbody")).toBeNull();
  });

  it("uses the period selected while the initial request is still pending", async () => {
    let finish!: (value: HallOfFamePeriodsResponse) => void;
    mocks.fetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await mount();
    expect(container.textContent).toContain("Chystáme stupně vítězů");
    await click("Poslední rok");
    await click("Podnikatelé");
    await act(async () => finish(response()));
    expect(container.querySelector("tbody")?.textContent).toContain("48.000 Kč");
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("allows retrying after a failed request", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("Temporary failure"));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Síň slávy se nepodařilo načíst");
    await click("Zkusit znovu");
    expect(container.querySelector("tbody")?.textContent).toContain("Anna");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("clears the previous account's rankings and reauthorizes when impersonation changes", async () => {
    await mount();
    mocks.effectiveEmail = "tipster@example.test";
    mocks.fetch.mockRejectedValueOnce(new Error("Forbidden"));
    await mount();
    expect(container.querySelector("tbody")).toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("discards a pending response after sign-out", async () => {
    let finish!: (value: HallOfFamePeriodsResponse) => void;
    mocks.fetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await mount();
    await act(async () => authListener(null));
    await act(async () => finish(response()));
    expect(container.textContent).toContain("Pro zobrazení výsledků se přihlas");
    expect(container.querySelector("tbody")).toBeNull();
  });
});
