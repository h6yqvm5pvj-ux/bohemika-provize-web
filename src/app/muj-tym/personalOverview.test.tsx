// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyContractStats } from "@/lib/server/teamOverviewStats";
import type { ContractStats } from "@/app/api/team-overview/teamOverview.types";
import TeamPage from "./page";

const session = vi.hoisted(() => {
  const user = { email: "advisor@example.test", getIdToken: vi.fn(async () => "synthetic-token") };
  return { user, auth: { currentUser: user as typeof user | null }, impersonation: null as { email: string; name: string; startedAtMs: number } | null };
});
vi.mock("@/app/firebase", () => ({ auth: session.auth }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: typeof session.auth.currentUser) => void) => {
  callback(session.auth.currentUser); return () => {};
} }));
vi.mock("@/app/lib/adminImpersonation", () => ({
  ADMIN_IMPERSONATION_EVENT: "test-impersonation-change", readAdminImpersonationState: () => session.impersonation,
}));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/image", () => ({ default: () => <span /> }));

const fetchMock = vi.fn();
let root: Root, container: HTMLDivElement;
let sequence = 0;

const stats = (active = false): ContractStats => {
  const result = emptyContractStats();
  result.total = active ? 3 : 8;
  result.month = 3;
  result.previousMonthToDate = 1;
  result.monthMetrics = { contracts: 3, annualPremium: 36000, monthlyPremium: 3000 };
  result.previousMonthToDateMetrics = { contracts: 1, annualPremium: 12000, monthlyPremium: 1000 };
  result.categories.life = active ? 2 : 5;
  result.categories.auto = active ? 1 : 3;
  result.categoryMetrics.life = { contracts: result.categories.life, annualPremium: active ? 24000 : 60000, monthlyPremium: active ? 2000 : 5000 };
  result.categoryMetrics.auto = { contracts: result.categories.auto, annualPremium: active ? 12000 : 30000, monthlyPremium: active ? 1000 : 2500 };
  result.institutionByCategory.life = { "ČPP": result.categoryMetrics.life };
  result.institutionByCategory.auto = { "Allianz": result.categoryMetrics.auto };
  result.institutionMetrics = { "ČPP": result.categoryMetrics.life, "Allianz": result.categoryMetrics.auto };
  return result;
};

const payload = (position = "poradce8", withSubordinate = false) => {
  const email = session.impersonation?.email ?? session.user.email;
  return {
    ok: true, position, canManagePositions: false,
    members: [{ email, name: "Testovací poradce", accountType: "advisor", position },
      ...(withSubordinate ? [{ email: "subordinate@example.test", name: "Testovací podřízený", accountType: "advisor", position: "poradce2" }] : [])],
    contractCounts: { [email]: stats(), "unrelated@example.test": { ...stats(), total: 999999 } },
    activeContractCounts: { [email]: stats(true) }, lastActive: {}, tipCounts: {},
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  session.user.email = `advisor-${++sequence}@example.test`;
  session.auth.currentUser = session.user;
  session.impersonation = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  fetchMock.mockImplementation(async () => Response.json(payload()));
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = () => act(async () => root.render(<TeamPage />));
const metric = (label: string) => [...container.querySelectorAll("article")]
  .find(article => article.querySelector("h3")?.textContent === label)!.querySelector("h3")!.nextElementSibling!.textContent;
const click = (label: string) => act(async () => [...container.querySelectorAll("button")]
  .find(button => button.textContent?.startsWith(label))!.click());

describe("personal team page without subordinates", () => {
  it("shows personal totals and insurer breakdown without team tools or unrelated owner statistics", async () => {
    await mount();
    expect(container.querySelector("h1")?.textContent).toBe("Moje výsledky.");
    expect(metric("Celkem smluv")).toBe("8");
    expect(metric("Smlouvy tento měsíc")).toBe("3");
    expect(metric("Roční pojistné celkem")?.replace(/\s/g, "")).toBe("90.000Kč");
    expect([...container.querySelectorAll("tbody th")].map(cell => cell.textContent)).toEqual(["ČPP", "Allianz"]);
    expect(container.querySelector('a[href="/smlouvy"]')).not.toBeNull();
    for (const text of ["Aktivní poradci", "Tým v kostce", "Členové týmu", "Zpráva týmu", "999999", "Ukončit spolupráci", "Kariéra"]) {
      expect(container.textContent).not.toContain(text);
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/team-overview");
  });

  it("switches product groups and active contracts using only the already authorized aggregates", async () => {
    await mount();
    await click("Auta");
    expect([...container.querySelectorAll("tbody th")].map(cell => cell.textContent)).toEqual(["Allianz"]);
    expect(container.querySelector("tfoot td")?.textContent).toBe("3");
    await click("Aktivní smlouvy");
    expect(metric("Aktivní smlouvy celkem")).toBe("3");
    expect(container.querySelector("tfoot td")?.textContent).toBe("1");
    await click("Životní pojištění");
    expect(container.querySelector("tbody th")?.textContent).toBe("ČPP");
    expect(container.querySelector("thead")?.textContent).toContain("Měsíční pojistné");
    await click("Cestovko");
    expect(container.textContent).toContain("V této skupině zatím nejsou smlouvy");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("also shows the personal overview to a manager with no subordinates", async () => {
    fetchMock.mockImplementation(async () => Response.json(payload("manazer4")));
    await mount();
    expect(container.querySelector("h1")?.textContent).toBe("Moje výsledky.");
    expect(metric("Celkem smluv")).toBe("8");
    expect(container.querySelector('[aria-label="Členové týmu"]')).toBeNull();
  });

  it("preserves the manager dashboard when a subordinate exists", async () => {
    fetchMock.mockImplementation(async () => Response.json(payload("manazer4", true)));
    await mount();
    expect(container.querySelector("h1")?.textContent).toBe("Můj tým.");
    expect(container.textContent).toContain("Tým v kostce");
    expect(container.querySelector('[aria-label="Členové týmu"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Přehled mých smluv"]')).toBeNull();
    await click("Testovací poradce");
    expect(container.textContent).toContain("Celkem smluv");
    await click("Auta");
    expect(container.querySelector(".team-production-name")?.textContent).toBe("Allianz");
    expect(container.querySelector(".team-production-contracts")?.textContent).toBe("3x smluv");
  });

  it("shows an honest zero state for an advisor without any contracts", async () => {
    fetchMock.mockImplementation(async () => Response.json({ ...payload(), contractCounts: { [session.user.email]: emptyContractStats() } }));
    await mount();
    expect(metric("Celkem smluv")).toBe("0");
    expect(container.textContent).toContain("Zatím tu nejsou žádné smlouvy");
  });

  it("distinguishes unavailable statistics from an advisor with zero contracts", async () => {
    fetchMock.mockImplementation(async () => Response.json({ ...payload(), contractCounts: {}, activeContractCounts: {} }));
    await mount();
    expect(metric("Celkem smluv")).toBe("—");
    expect(container.textContent).toContain("Přehled smluv se nepodařilo načíst");
    expect(container.textContent).not.toContain("Zatím tu nejsou žádné smlouvy");
    expect(container.querySelector("table")).toBeNull();
  });

  it("uses the impersonated advisor's own aggregates instead of the administrator's", async () => {
    session.impersonation = { email: `represented-${sequence}@example.test`, name: "Testovací poradce", startedAtMs: 1 };
    fetchMock.mockImplementation(async () => Response.json({ ...payload(), contractCounts: {
      [session.impersonation!.email]: stats(), [session.user.email]: { ...stats(), total: 777777 },
    } }));
    await mount();
    expect(metric("Celkem smluv")).toBe("8");
    expect(container.textContent).not.toContain("777777");
  });

  it("does not request or display contracts without a signed-in user", async () => {
    session.auth.currentUser = null;
    await mount();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Přehled mých smluv"]')).toBeNull();
  });
});
