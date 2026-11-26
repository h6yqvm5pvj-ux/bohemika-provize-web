import { readPdfText, type PdfReadOptions, type PdfTextPage } from "./pdfDocumentText";
import { resolveCppAutoContractIdentity } from "./cppAutoContractIdentity";
import { resolveCppAutoPolicyholder } from "./cppAutoPolicyholder";
import { resolveCppAutoDates } from "./cppAutoDates";
import { extractCppAutoBasicVehicleDetails, extractCppAutoLayoutLines } from "./parseCppAutoPdf";

export type CppAutoVozikZdarmaPdfResult = {
  contractNumber: string | null;
  clientName: string | null;
  policyStartDate: string | null;
  contractSignedDate: string | null;
  carMake: string | null;
  carVin: string | null;
  carOrv: string | null;
  carPlate: string | null;
  carLiabilityLimit: number | null;
  pdfImportWarnings?: string[];
};

const fold = (value: string): string => value.normalize("NFD")
  .replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

function section(pages: string[][], start: RegExp, end: RegExp): string[][] {
  const sections: string[][] = [];
  for (const lines of pages) {
    let active: string[] | null = null;
    for (const line of lines) {
      const normalized = fold(line);
      if (start.test(normalized)) {
        if (active) sections.push(active);
        active = [];
      } else if (active && end.test(normalized)) {
        sections.push(active);
        active = null;
      } else if (active) {
        active.push(line);
      }
    }
    if (active) sections.push(active);
  }
  return sections;
}

function unlabelledHeaderNumbers(page: PdfTextPage): string[] {
  const lines = extractCppAutoLayoutLines(page.items);
  const title = lines.find(line => /\bvozik zdarma\b/.test(fold(line.text)));
  if (!title) return [];
  const titleY = Math.max(...title.items.map(item => item.y));
  // In this form the box label is drawn, absent from the text layer. Restrict
  // fallback to the central box just above the product title on the first page;
  // the barcode, page counter and main-policy reference are separate fields.
  return page.items.flatMap(item => {
    const value = item.str.trim();
    const x = item.transform[4];
    const y = item.transform[5];
    const number = value.replace(/\s/g, "");
    return /^\d[\d ]*\d$/.test(value) && /^\d{10}$/.test(number) &&
      x >= page.width * 0.3 && x <= page.width * 0.7 && y > titleY + 5 && y <= titleY + 65
      ? [number] : [];
  });
}

/** Only portfolio fields are returned: no premium, payment details or personal identifiers. */
export async function parseCppAutoVozikZdarmaPdf(
  file: File,
  options: PdfReadOptions = {},
): Promise<CppAutoVozikZdarmaPdfResult> {
  const document = await readPdfText(file, options);
  const pages = document.pages.map(page => page.items.map(item => item.str.trim()).filter(Boolean));
  const layout = document.pages.map(page => extractCppAutoLayoutLines(page.items));
  const text = fold(pages.flat().join(" "));
  const result: CppAutoVozikZdarmaPdfResult = {
    contractNumber: null, clientName: null, policyStartDate: null, contractSignedDate: null,
    carMake: null, carVin: null, carOrv: null, carPlate: null, carLiabilityLimit: null,
  };
  if (!text.includes("ceska podnikatelska pojistovna") || !/\bvozik zdarma\b/.test(text)) {
    return { ...result, pdfImportWarnings: ["PDF neodpovídá produktu ČPP Auto / Vozík ZDARMA."] };
  }

  const warnings: string[] = [];
  const identity = resolveCppAutoContractIdentity(layout);
  const candidates = new Set([
    ...(identity.contractNumber ? [identity.contractNumber] : []),
    ...(document.pages[0] ? unlabelledHeaderNumbers(document.pages[0]) : []),
  ]);
  if (candidates.size === 1 && !identity.warnings.includes("cpp_auto_contract_number_ambiguous")) {
    result.contractNumber = [...candidates][0];
  } else {
    warnings.push("Číslo smlouvy Vozík ZDARMA není úplné nebo jednoznačně čitelné; zkontroluj horní box v PDF.");
  }

  result.clientName = resolveCppAutoPolicyholder(layout).clientName;
  if (!result.clientName) warnings.push("Jméno pojistníka není úplné nebo jednoznačně čitelné; zkontroluj sekci POJISTNÍK.");

  const insurancePeriod = section(pages, /^doba pojisteni$/, /^(?:udaje o vozidle|vozidlo|tovarni znacka|pojisteni odpovednosti)\b/);
  const startDates = resolveCppAutoDates(insurancePeriod, { allowSignedDateFallback: false });
  const signedDates = resolveCppAutoDates(pages, { allowSignedDateFallback: false });
  result.policyStartDate = startDates.policyStartDate;
  result.contractSignedDate = signedDates.contractSignedDate;
  warnings.push(...startDates.warnings, ...signedDates.warnings.filter(warning => !warning.includes("Počátek pojištění")));

  const vehiclePages = pages.map(lines => extractCppAutoBasicVehicleDetails(lines));
  for (const key of ["carMake", "carVin", "carPlate", "carOrv"] as const) {
    const values = new Set(vehiclePages.map(page => page[key]).filter((value): value is string => Boolean(value)));
    if (values.size === 1) result[key] = [...values][0];
    if (values.size > 1) warnings.push("PDF obsahuje rozdílné údaje o vozidle; zkontroluj detail vozidla.");
  }

  const liabilityPages = section(pages, /^pojisteni odpovednosti za ujmu/, /^(?:pojistne|havarijni pojisteni|doplnkova pojisteni|dalsi pojisteni|zvlastni ujednani|prohlaseni)\b/);
  const limits = new Set(liabilityPages.map(lines => {
    const pair = fold(lines.join(" ")).match(/(\d[\d ]*)\s*(?:mil\.?|mio)?\s*\/\s*(\d[\d ]*)\s*(?:mil\.?|mio)?/);
    if (pair && Number(pair[1].replace(/\s/g, "")) !== Number(pair[2].replace(/\s/g, ""))) {
      warnings.push("Limity škod na zdraví a majetku se liší; zkontroluj je ručně.");
      return null;
    }
    return extractCppAutoBasicVehicleDetails(lines).carLiabilityLimit;
  })
    .filter((value): value is number => value != null));
  if (limits.size === 1) result.carLiabilityLimit = [...limits][0];
  if (limits.size > 1) warnings.push("Limit odpovědnosti není jednoznačný; zkontroluj sekci pojištění odpovědnosti.");

  if (warnings.length) result.pdfImportWarnings = [...new Set(warnings)];
  return result;
}
