import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { LifeCommissionReminderContract } from "@/app/lib/lifeCommissionReminder";
import { createLifeCommissionReminderPdf } from "./lifeCommissionReminderPdf";

afterEach(() => vi.unstubAllGlobals());

it("exports every contract across pages with Czech text and commission codes", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => new Response(await readFile(`public${path}`))));
  const contracts = Array.from({ length: 65 }, (_, index): LifeCommissionReminderContract => ({
    entryId: `entry-${index}`, contractNumber: `FIKTIVNI-${String(index).padStart(3, "0")}`,
    productLabel: "Životní pojištění ČPP", code: index % 2 ? "B036" : "B048", payoutDay: "2026-12-25",
  }));
  const blob = await createLifeCommissionReminderPdf({ id: "test", title: "Životní provize",
    body: "Zkontroluj následný servis a autorizuj kartu klienta.", contracts });
  expect(blob.type).toBe("application/pdf");
  const pdf = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  try {
    expect(pdf.numPages).toBeGreaterThan(1);
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, index) => pdf.getPage(index + 1).then(page => page.getTextContent())));
    const text = pages.flatMap(page => page.items.flatMap(item => "str" in item ? [item.str] : [])).join(" ");
    expect(text).toContain("Zkontroluj následný servis a autorizuj kartu klienta.");
    expect(text).toContain("Životní pojištění ČPP");
    expect(text).toContain("B036");
    expect(text).toContain("B048");
    for (const contract of contracts) expect(text).toContain(contract.contractNumber);
  } finally {
    await pdf.destroy();
  }
});
