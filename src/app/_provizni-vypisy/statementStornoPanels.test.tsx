// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StornoStatementActionModal } from "./statementActionModals";
import { StornoContractsSectionPanel, StornoSystemActionPanel } from "./statementStornoPanels";
import { matchedSystemContract } from "./statementSystemContracts";
import type { SystemMatchPresentation } from "./statementSystemMatchUi";
import type { MatchedSystemContract, ParsedStatement, StornoStatementActionTarget } from "./statementTypes";

const contract: MatchedSystemContract = {
  id: "synthetic-contract", adviserEmail: "adviser@example.test", contractNumber: "123456",
  clientName: "Testovací klient", status: "active", productKey: "cppAuto", policyStartDate: "2026-05-01",
  items: [{ code: "A101", title: "Okamžitá provize", amount: 100 }],
};
const statement = (statusCode = "A001"): ParsedStatement => ({
  fileName: "synthetic.html", header: { advisorNumber: null, statementNumber: "1", statementDate: "31.05.2026", period: "05/2026" },
  payoutTotal: -100, commissionRows: [], deductionRows: [], otherPayments: [],
  stornoRows: [{ id: "1", contractNumber: "123456", client: "Testovací klient", detailUrl: null,
    signedAt: "01.05.2026", role: "Z", product: "CPP_ACPIII", type: "A101", statusCode,
    base: 1000, percent: "10 %", career: "1", commission: -100, reserveFund: 0 }],
  contractStatusRules: [
    { code: "A001", label: "Aktivní smlouva", category: "active", importDecision: "" },
    { code: "S001", label: "Stornovaná smlouva", category: "storno", importDecision: "" },
  ],
  managerCommissions: [], lifeSplitContracts: [], otherProductContracts: [], unmatchedB36Payments: [], parseWarnings: [],
});
const presentation: SystemMatchPresentation = {
  matchedSystemContract, systemMatchHistoryLabel: () => "", dedupeEquivalentSystemContracts: contracts => contracts,
  systemMatchHasSingleFamilyHistory: () => false, sortSystemContractTimeline: contracts => contracts,
  statementProductMatchesSystemProduct: () => true, systemContractTimelinePositionMismatch: () => null,
  systemContractIsEndorsement: () => false, positionLabel: () => "", systemContractPosition: () => null,
};

describe("commission reversals and manual contract termination", () => {
  let container: HTMLDivElement;
  let root: Root;
  const button = (label: string) => Array.from(container.querySelectorAll("button")).find(element => element.textContent?.includes(label))!;
  const onRequest = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    onRequest.mockReset();
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  async function openReversal(statusCode = "A001", systemContract = contract) {
    await act(async () => root.render(<StornoContractsSectionPanel statement={statement(statusCode)}
      matchesByContractNumber={{ "my:123456": { status: "matched", contracts: [systemContract] } }}
      presentation={presentation} onRequestSystemStorno={onRequest} />));
    await act(async () => button("Storna provizí").click());
    await act(async () => button("Spárované").click());
    await act(async () => container.querySelector<HTMLButtonElement>("article button")!.click());
  }

  it.each(["A001", "UNKNOWN", ""])("keeps even a full reversal with status %s neutral and leaves termination to the adviser", async statusCode => {
    const before = structuredClone(contract);
    await openReversal(statusCode);
    expect(container.textContent).toContain("-100,00");
    expect(container.textContent).toContain("Smlouva: aktivní");
    expect(container.textContent).toContain("Storno provize");
    expect(container.textContent).not.toContain("Prověřit ukončení smlouvy");
    expect(container.textContent).not.toContain("k ověření ukončení smlouvy");
    expect(container.textContent).not.toContain("Pravděpodobně");
    expect(onRequest).not.toHaveBeenCalled();
    expect(contract).toEqual(before);
    expect(button("K prověření").textContent).toContain("0");
    await act(async () => button("Zadat ukončení smlouvy ručně").click());
    expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ contract, suggestedDate: null, inference: null }));
  });

  it("asks for verification only for an explicit terminated contract status and never updates it automatically", async () => {
    await openReversal("S001");
    expect(container.textContent).toContain("1 k ověření ukončení smlouvy");
    expect(container.textContent).toContain("Stav smlouvy ve výpisu uvádí ukončení");
    expect(button("K prověření").textContent).toContain("1");
    expect(onRequest).not.toHaveBeenCalled();
    await act(async () => button("Zadat ukončení smlouvy ručně").click());
    expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ suggestedDate: null }));
  });

  it("shows an already manually terminated contract without asking for another termination", async () => {
    await openReversal("S001", { ...contract, status: "storno", stornoDate: "2026-05-15" });
    expect(container.textContent).toContain("Smlouva ukončená");
    expect(button("Zadat ukončení smlouvy ručně")).toBeUndefined();
    expect(container.textContent).not.toContain("k ověření ukončení smlouvy");
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("treats manager and other payment reversals without a contract status as financial information", async () => {
    const target: StornoStatementActionTarget = { contract, contractNumber: "123456", client: "Testovací klient", product: "Auto", suggestedDate: null };
    await act(async () => root.render(<StornoSystemActionPanel target={target} onRequestStorno={onRequest} />));
    expect(container.textContent).toContain("opravou původní výplaty");
    expect(container.querySelector("svg.lucide-triangle-alert")).toBeNull();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("requires a manually supplied date before the user can confirm contract termination", async () => {
    const onConfirm = vi.fn();
    const target: StornoStatementActionTarget = { contract, contractNumber: "123456", client: "Testovací klient", product: "Auto", suggestedDate: new Date("2026-05-31") };
    const render = (dateInput: string) => root.render(<StornoStatementActionModal target={target} dateInput={dateInput}
      saving={false} error={null} onDateChange={vi.fn()} onClose={vi.fn()} onConfirm={onConfirm} />);
    await act(async () => render(""));
    expect(container.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe("");
    expect(button("Uložit ukončení smlouvy").disabled).toBe(true);
    await act(async () => button("Uložit ukončení smlouvy").click());
    expect(onConfirm).not.toHaveBeenCalled();
    await act(async () => render("2026-05-15"));
    expect(button("Uložit ukončení smlouvy").disabled).toBe(false);
    await act(async () => button("Uložit ukončení smlouvy").click());
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
