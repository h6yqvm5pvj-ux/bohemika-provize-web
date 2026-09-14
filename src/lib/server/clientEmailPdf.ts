import { createHash } from "node:crypto";
import { extractClientEmailFromPdfLines } from "@/app/lib/extractClientEmailFromPdf";
import { CONTRACT_PDF_MAX_BYTES, downloadContractPdfAttachment, type StoredContractPdfAttachment } from "./contractPdfStorage";

export async function readClientEmailPdfLines(attachment: StoredContractPdfAttachment) {
  const bytes = await downloadContractPdfAttachment(attachment);
  if (bytes.length > CONTRACT_PDF_MAX_BYTES || createHash("sha256").update(bytes).digest("hex") !== attachment.sha256) throw new Error("PDF integrity check failed");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 });
  try {
    const document = await task.promise;
    const lines: string[] = [];
    for (let number = 1; number <= Math.min(document.numPages, 8); number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const rows: { y: number; items: { x: number; text: string; width: number }[] }[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = item.transform[5], x = item.transform[4];
        let row = rows.find(value => Math.abs(value.y - y) < 2);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x, text: item.str.trim(), width: item.width });
      }
      lines.push(...rows.sort((a, b) => b.y - a.y).map(row => {
        let line = "", previousEnd = 0;
        for (const item of row.items.sort((a, b) => a.x - b.x)) {
          if (line && item.x - previousEnd > 1.5) line += " ";
          line += item.text;
          previousEnd = item.x + item.width;
        }
        return line;
      }));
      page.cleanup();
    }
    return lines;
  } finally {
    await task.destroy();
  }
}

export async function readClientEmailFromStoredPdf(attachment: StoredContractPdfAttachment, clientName: string) {
  return extractClientEmailFromPdfLines(await readClientEmailPdfLines(attachment), clientName);
}
