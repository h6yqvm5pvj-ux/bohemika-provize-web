import type { LifeCommissionReminder } from "@/app/lib/lifeCommissionReminder";

const FONT = "LiberationSans";
const navy = "#172b42";
const teal = "#07877b";
const muted = "#637487";

async function loadFont(file: string) {
  const response = await fetch(`/fonts/${file}`);
  if (!response.ok) throw new Error("Písmo pro PDF se nepodařilo načíst.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export async function createLifeCommissionReminderPdf(reminder: LifeCommissionReminder): Promise<Blob> {
  const regular = `${FONT}-Regular.ttf`;
  const bold = `${FONT}-Bold.ttf`;
  const [{ jsPDF }, regularData, boldData] = await Promise.all([
    import("jspdf"), loadFont(regular), loadFont(bold),
  ]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: "Přehled provizí B036 a B048", creator: "Bohemika" });
  pdf.addFileToVFS(regular, regularData);
  pdf.addFont(regular, FONT, "normal");
  pdf.addFileToVFS(bold, boldData);
  pdf.addFont(bold, FONT, "bold");

  const left = 16;
  const right = 194;
  const reportMonth = reminder.contracts[0]?.payoutDay.slice(0, 7) ?? "";
  const monthLabel = reportMonth ? new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${reportMonth}-01T00:00:00Z`)) : "";
  const payoutDateFormat = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeZone: "UTC" });
  const columnX = [left + 3, 80, 137, right - 3];
  let y = 0;

  const header = (firstPage: boolean) => {
    pdf.setFont(FONT, "bold").setFontSize(10).setTextColor(teal).text("BOHEMIKA", left, 17);
    pdf.setFontSize(19).setTextColor(navy).text("Přehled provizí B036 a B048", left, 28);
    pdf.setFont(FONT, "normal").setFontSize(10).setTextColor(muted).text(monthLabel, left, 35);
    y = 43;
    if (firstPage) {
      pdf.setFontSize(10).setTextColor(navy);
      const lines: string[] = pdf.splitTextToSize(reminder.body, right - left - 8);
      const height = lines.length * 4.5 + 7;
      pdf.setFillColor("#edf7f4").roundedRect(left, y, right - left, height, 2, 2, "F");
      pdf.text(lines, left + 4, y + 5.5, { lineHeightFactor: 1.27 });
      y += height + 5;
    }
    pdf.setFillColor(navy).rect(left, y, right - left, 8, "F");
    pdf.setFont(FONT, "bold").setFontSize(9).setTextColor("#ffffff");
    pdf.text("Produkt", columnX[0], y + 5.3);
    pdf.text("Číslo smlouvy", columnX[1], y + 5.3);
    pdf.text("Kód", columnX[2], y + 5.3);
    pdf.text("Očekávaná výplata", columnX[3], y + 5.3, { align: "right" });
    y += 8;
  };

  header(true);
  reminder.contracts.forEach((contract, index) => {
    pdf.setFont(FONT, "normal").setFontSize(9);
    const product: string[] = pdf.splitTextToSize(contract.productLabel, 57);
    const number: string[] = pdf.splitTextToSize(contract.contractNumber || "—", 51);
    const height = Math.max(product.length, number.length) * 4.2 + 5;
    if (y + height > 276) {
      pdf.addPage();
      header(false);
    }
    if (index % 2 === 0) pdf.setFillColor("#f4f7fa").rect(left, y, right - left, height, "F");
    pdf.setFont(FONT, "normal").setFontSize(9).setTextColor(navy);
    pdf.text(product, columnX[0], y + 5, { lineHeightFactor: 1.32 });
    pdf.text(number, columnX[1], y + 5, { lineHeightFactor: 1.32 });
    pdf.text(contract.code, columnX[2], y + 5);
    pdf.text(payoutDateFormat.format(new Date(`${contract.payoutDay}T00:00:00Z`)), columnX[3], y + 5, { align: "right" });
    y += height;
  });

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor("#dce4eb").line(left, 282, right, 282);
    pdf.setFont(FONT, "normal").setFontSize(9).setTextColor(muted);
    pdf.text("Bohemika · Přehled očekávaných provizí", left, 287);
    pdf.text(`${page} / ${pages}`, right, 287, { align: "right" });
  }
  return pdf.output("blob");
}
