// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalculatorBulkPdfImportPanel } from "./CalculatorBulkPdfImportPanel";
import type { AutoBulkImportRow } from "./calculatorBulkPdfImport";

const row = (status: AutoBulkImportRow["status"], patch: Partial<AutoBulkImportRow> = {}): AutoBulkImportRow => ({
  id: status, status, fileName: `${status}.pdf`, productLabel: "Auto",
  contractNumber: "1234567890", clientName: "Jana Testovací", message: `Výsledek ${status}`,
  ...patch,
});
const reviewDraft: NonNullable<AutoBulkImportRow["reviewDraft"]> = {
  file: new File(["synthetic"], "review.pdf", { type: "application/pdf" }),
  product: "cppAuto", parsed: {}, warnings: [], isReplacement: false, replacementNumber: "",
};

describe("bulk PDF import feedback", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onReview = vi.fn();
  const render = async (props: Partial<ComponentProps<typeof CalculatorBulkPdfImportPanel>> = {}) => {
    await act(async () => root.render(
      <CalculatorBulkPdfImportPanel visible status={null} rows={[]} busy={false} onReview={onReview} {...props} />
    ));
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("hides feedback when unavailable or empty", async () => {
    await render({ visible: false, status: "Hotovo", rows: [row("success")] });
    expect(container.childElementCount).toBe(0);
    await render();
    expect(container.childElementCount).toBe(0);
  });

  it("announces a status before the first result without showing empty counters", async () => {
    await render({ status: "Načítám PDF…" });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Načítám PDF…");
    expect(container.textContent).not.toContain("Uloženo");
  });

  it("counts saved warnings separately from rows awaiting review and keeps all result rows", async () => {
    const rows = ["success", "warning", "review", "skipped", "error", "processing", "queued"]
      .map((status) => row(status as AutoBulkImportRow["status"]));
    await render({ rows });
    expect(container.textContent).toContain("Uloženo 2");
    expect(container.textContent).toContain("Ke kontrole 1");
    expect(container.textContent).toContain("Přeskočeno 1");
    expect(container.textContent).toContain("Chyby 1");
    expect(container.textContent).toContain("Běží 1");
    for (const result of rows) {
      expect(container.textContent).toContain(result.fileName);
      expect(container.textContent).toContain(result.message);
    }
    expect(container.textContent).toContain("Jana Testovací");
    expect(container.textContent).toContain("1234567890");
    expect(container.querySelector('[aria-label="Hromadné zpracování PDF"]')).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("updates counters and stops showing running work when the same row finishes", async () => {
    await render({ rows: [row("processing", { id: "first" })] });
    expect(container.textContent).toContain("Běží 1");
    await render({ rows: [row("success", { id: "first" })] });
    expect(container.textContent).toContain("Uloženo 1");
    expect(container.textContent).not.toContain("Běží");
  });

  it("opens only a reviewable draft and passes its row identifier", async () => {
    await render({ rows: [
      row("review", { id: "draft-row", reviewDraft }),
      row("review", { id: "without-draft" }),
      row("success", { reviewDraft }),
      row("warning", { reviewDraft }),
    ] });
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent?.trim()).toBe("Zkontrolovat");
    await act(async () => buttons[0].click());
    expect(onReview).toHaveBeenCalledExactlyOnceWith("draft-row");
  });

  it("blocks review during an operation and enables it again once idle", async () => {
    const rows = [row("review", { reviewDraft })];
    await render({ rows, busy: true });
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(onReview).not.toHaveBeenCalled();
    await render({ rows, busy: false });
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(onReview).toHaveBeenCalledExactlyOnceWith("review");
  });

  it("renders imported text as text rather than HTML", async () => {
    const hostileText = '<img src=x onerror="alert(1)">';
    await render({ status: hostileText, rows: [row("error", {
      fileName: hostileText, clientName: hostileText, productLabel: hostileText,
      contractNumber: hostileText, message: hostileText,
    })] });
    expect(container.querySelectorAll("img, script")).toHaveLength(0);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(hostileText);
    expect(container.textContent?.split(hostileText)).toHaveLength(7);
  });
});
