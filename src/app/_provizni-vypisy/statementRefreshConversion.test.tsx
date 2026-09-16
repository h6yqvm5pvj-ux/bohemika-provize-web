// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatementRefreshConversionPanel } from "./statementLifeCardPanels";
import { buildNeonRefreshConversionRequest } from "./statementRefreshConversion";
import { statementDiscrepancyKey } from "./statementDiscrepancies";
import { parseStatementHtml } from "./statementParsing";
import { neonRefreshRiskAnnualPremiumBase } from "@/app/lib/commissionPayoutRules";
import type { ManualNeonRefreshConversionTarget } from "./statementTypes";

describe("REFRESH preview request", () => {
  const files = ["first.html", "second.html"].map(fileName => ({
    html: `<div>${fileName}</div>`, statement: parseStatementHtml("", fileName),
  }));
  const target: ManualNeonRefreshConversionTarget = {
    statementKey: statementDiscrepancyKey(files[1].statement), contractNumber: "1234567890",
    contract: { id: "entry-1", adviserEmail: "Adviser@example.test" },
  };

  it("selects the correct original HTML in a batch before any statement has an ID", () => {
    expect(buildNeonRefreshConversionRequest(target, files)).toEqual({
      action: "convert-neon-refresh-from-statement", ownerEmail: "adviser@example.test",
      entryId: "entry-1", contractNumber: target.contractNumber, html: files[1].html, header: files[1].statement.header,
    });
  });
  it("uses the saved ID without requiring uploaded files", () => {
    expect(buildNeonRefreshConversionRequest({ ...target, statementId: "statement-0001" }, [])).toMatchObject({ statementId: "statement-0001" });
    expect(buildNeonRefreshConversionRequest({ ...target, statementId: "statement-0001" }, files)).not.toHaveProperty("html");
  });
  it("does not silently take another statement if the source is missing", () => {
    expect(() => buildNeonRefreshConversionRequest({ ...target, statementKey: "missing" }, files)).toThrow("Načti jej prosím znovu");
  });
});

describe("risk base shown before conversion", () => {
  it.each(["A101", "AP101", "AZ101", "APZ101", "B0301"])("selects %s rather than the investment base", code => {
    expect(neonRefreshRiskAnnualPremiumBase([
      { commissionCode: "A201", baseAmount: 60000 }, { commissionCode: code, baseAmount: 6757 },
    ])).toBe(6757);
  });
  it("requires a positive unambiguous risk base", () => {
    expect(neonRefreshRiskAnnualPremiumBase([{ commissionCode: "A201", baseAmount: 60000 }])).toBeNull();
    expect(neonRefreshRiskAnnualPremiumBase([{ commissionCode: "A101", baseAmount: -1 }])).toBeNull();
    expect(neonRefreshRiskAnnualPremiumBase([
      { commissionCode: "A101", baseAmount: 6757 }, { commissionCode: "B0301", baseAmount: 12000 },
    ])).toBeNull();
  });
  it("shows the same base regardless of parser row order when rounding differs", () => {
    const rows = [{ commissionCode: "B0301", baseAmount: 6750 }, { commissionCode: "A101", baseAmount: 6757 }];
    expect(neonRefreshRiskAnnualPremiumBase(rows)).toBe(6757);
    expect(neonRefreshRiskAnnualPremiumBase([...rows].reverse())).toBe(6757);
  });
});

describe("REFRESH button before statement processing", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onConvert = vi.fn();
  beforeEach(() => {
    onConvert.mockReset(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

  it("allows immediate conversion without an ID, prevents clicks while saving, then shows success", async () => {
    const common = { showConversion: true, statementId: null, riskAnnualBase: 6757, canConvert: true, onConvert };
    await act(async () => root.render(<StatementRefreshConversionPanel {...common} state={{ status: "idle", message: null }} />));
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain("Označit REFRESH a přepočítat");
    expect(container.textContent).toContain("Investiční složka se do základny nezahrnuje");
    await act(async () => button.click()); expect(onConvert).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<StatementRefreshConversionPanel {...common} state={{ status: "saving", message: null }} />));
    await act(async () => container.querySelector("button")!.click()); expect(onConvert).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<StatementRefreshConversionPanel {...common} showConversion={false} state={{ status: "success", message: "Přepočítáno." }} />));
    expect(container.querySelector("button")).toBeNull(); expect(container.querySelector('[role="status"]')?.textContent).toContain("Přepočítáno.");
  });

  it("disables the conversion and explains why when only investment rows remain", async () => {
    await act(async () => root.render(<StatementRefreshConversionPanel showConversion statementId={null} riskAnnualBase={null}
      canConvert={false} onConvert={onConvert} state={{ status: "idle", message: null }} />));
    expect(container.textContent).toContain("neobsahuje jednoznačnou rizikovou základnu");
    await act(async () => container.querySelector("button")!.click()); expect(onConvert).not.toHaveBeenCalled();
  });
});
