import { jsPDF } from "jspdf";
import { expect, it } from "vitest";
import { parseNeonPdf } from "./parseNeonPdf";

it("extracts an amendment from the text layer of a synthetic PDF", async () => {
  const document = new jsPDF();
  const lines = ["CPP NEON", "Zadanka o zmenu", "Cislo pojistne smlouvy: 9400001234",
    "Modelovano s ucinnosti zmeny od: 1.12.2026", "Datum uzavreni: 24.11.2026",
    "Celkove mesicni pojistne: 1 299,50 Kc"];
  for (const [index, line] of lines.entries()) document.text(line, 15, 15 + index * 8);
  const pdf = new File([document.output("arraybuffer")], "synthetic-amendment.pdf", { type: "application/pdf" });
  await expect(parseNeonPdf(pdf, { endorsementOnly: true })).resolves.toMatchObject({
    isEndorsement: true, contractNumber: "9400001234", policyStartDate: "2026-12-01",
    contractSignedDate: "2026-11-24", amount: 1299.5,
  });
});
