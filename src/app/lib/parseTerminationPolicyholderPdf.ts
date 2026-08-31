export type TerminationPolicyholderPdfData = {
  policyholderName: string;
  personalId: string;
  address: string;
  phone: string;
  email: string;
};

const emptyResult = (): TerminationPolicyholderPdfData => ({
  policyholderName: "",
  personalId: "",
  address: "",
  phone: "",
  email: "",
});

const cleanLine = (value: string): string =>
  value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const normalize = (value: string): string =>
  cleanLine(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ");

const looksLikeLabel = (value: string): boolean =>
  /^(pojistnik|pojisteny|jmeno|prijmeni|titul pred|titul za|nazev|obchodni firma|rodne cislo|rc|ico|identifikacni cislo|trvaly pobyt|bydliste|sidlo|adresa|telefon|mobil|e-?mail)\b/.test(
    normalize(value),
  );

const valueNearLabel = (
  lines: readonly string[],
  labels: readonly RegExp[],
  accept: (value: string) => boolean,
  maxLookahead = 4,
): string => {
  const normalizedLines = lines.map(normalize);
  for (let index = 0; index < normalizedLines.length; index += 1) {
    const normalizedLine = normalizedLines[index] ?? "";
    const label = labels.find((candidate) => candidate.test(normalizedLine));
    if (!label) continue;

    const match = normalizedLine.match(label);
    if (match?.index != null) {
      const inlineValue = cleanLine(
        (lines[index] ?? "").slice(match.index + match[0].length).replace(/^\s*[:\-–|]\s*/, ""),
      );
      if (inlineValue && !looksLikeLabel(inlineValue) && accept(inlineValue)) {
        return inlineValue;
      }
    }

    for (let offset = 1; offset <= maxLookahead; offset += 1) {
      const candidate = cleanLine(lines[index + offset] ?? "");
      if (!candidate) continue;
      if (looksLikeLabel(candidate)) break;
      if (accept(candidate)) return candidate;
    }
  }
  return "";
};

const normalizePersonalId = (value: string): string => {
  const birthNumber = value.match(/\b(\d{6})\s*\/?\s*(\d{3,4})\b/);
  if (birthNumber) return `${birthNumber[1]}/${birthNumber[2]}`;
  const companyId = value.match(/\b\d{8}\b/);
  return companyId?.[0] ?? "";
};

const normalizePhone = (value: string): string => {
  const match = value.match(/(?:\+?420\s*)?(\d{3})\s*(\d{3})\s*(\d{3})/);
  if (!match) return "";
  const prefix = /\+?420/.test(match[0]) ? "+420 " : "";
  return `${prefix}${match[1]} ${match[2]} ${match[3]}`;
};

const normalizeEmail = (value: string): string =>
  value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";

const normalizeName = (value: string): string => {
  const cleaned = cleanLine(value)
    .replace(/^(?:fyzick[aá]\s+osoba|pr[aá]vnick[aá]\s+osoba|podnikatel)\s*[:\-–]?\s*/i, "")
    .replace(/\s+(?:rodn[eé]\s+[cč][ií]slo|r[cč]|i[cč]o|datum\s+narozen[ií]).*$/i, "")
    .trim();
  if (
    cleaned.length < 3 ||
    cleaned.length > 120 ||
    !/[A-Za-zÀ-ž]/.test(cleaned) ||
    /^(titul\s+(?:před|za)|jméno|příjmení|název)\s*:?$/i.test(cleaned)
  ) {
    return "";
  }
  return cleaned;
};

const looksLikeAddress = (value: string): boolean => {
  const normalized = normalize(value);
  return (
    value.length >= 5 &&
    value.length <= 180 &&
    /[A-Za-zÀ-ž]/.test(value) &&
    /\d/.test(value) &&
    !/@/.test(value) &&
    !/^(telefon|mobil|rodne cislo|ico|datum)/.test(normalized)
  );
};

export function extractTerminationPolicyholderFromLines(
  sourceLines: readonly string[],
): TerminationPolicyholderPdfData {
  const lines = sourceLines.map(cleanLine).filter(Boolean);
  if (lines.length === 0) return emptyResult();

  const policyholderIndex = lines.findIndex((line) => /\bpojistnik\b/.test(normalize(line)));
  const policyholderLines =
    policyholderIndex >= 0
      ? lines.slice(Math.max(0, policyholderIndex), policyholderIndex + 55)
      : lines;

  let policyholderName = valueNearLabel(
    policyholderLines,
    [
      /jmeno\s+a\s+prijmeni/,
      /obchodni\s+firma/,
      /nazev\s+(?:firmy|pravnicke\s+osoby|pojistnika)/,
      /^pojistnik(?:\s*\/\s*pojisteny)?$/,
    ],
    (value) => Boolean(normalizeName(value)),
  );
  policyholderName = normalizeName(policyholderName);

  if (!policyholderName) {
    const firstName = valueNearLabel(
      policyholderLines,
      [/^jmeno$/],
      (value) => Boolean(normalizeName(value)),
      2,
    );
    const lastName = valueNearLabel(
      policyholderLines,
      [/^prijmeni$/],
      (value) => Boolean(normalizeName(value)),
      2,
    );
    policyholderName = normalizeName(`${firstName} ${lastName}`);
  }

  const personalIdRaw = valueNearLabel(
    policyholderLines,
    [
      /rodne\s+cislo\s*\/\s*i\s*c\s*o/,
      /r\s*c\s*\/\s*i\s*c\s*o/,
      /rodne\s+cislo/,
      /^r\s*c$/,
      /identifikacni\s+cislo/,
      /^i\s*c\s*o$/,
    ],
    (value) => Boolean(normalizePersonalId(value)),
  );
  const personalId = normalizePersonalId(personalIdRaw);

  const address = valueNearLabel(
    policyholderLines,
    [
      /trvaly\s+pobyt/,
      /adresa\s+(?:pojistnika|bydliste|sidla)/,
      /^bydliste$/,
      /^sidlo$/,
      /^adresa$/,
    ],
    looksLikeAddress,
    5,
  );

  const emailByLabel = valueNearLabel(
    policyholderLines,
    [/e\s*-?\s*mail/, /elektronicka\s+adresa/],
    (value) => Boolean(normalizeEmail(value)),
    4,
  );
  const email =
    normalizeEmail(emailByLabel) ||
    policyholderLines.map(normalizeEmail).find(Boolean) ||
    "";

  const phoneByLabel = valueNearLabel(
    policyholderLines,
    [/telefon/, /mobil/, /tel\.?\s*(?:cislo)?/],
    (value) => Boolean(normalizePhone(value)),
    4,
  );
  const phone =
    normalizePhone(phoneByLabel) ||
    policyholderLines.map(normalizePhone).find(Boolean) ||
    "";

  return {
    policyholderName,
    personalId,
    address,
    phone,
    email,
  };
}

export async function parseTerminationPolicyholderPdf(
  file: File,
): Promise<TerminationPolicyholderPdfData> {
  const buffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
  }

  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const lines: string[] = [];
  const pageCount = Math.min(document.numPages, 6);
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    content.items.forEach((item: unknown) => {
      const text =
        item && typeof item === "object" && "str" in item
          ? (item as { str?: unknown }).str
          : null;
      if (typeof text === "string" && text.trim()) lines.push(text);
    });
  }

  return extractTerminationPolicyholderFromLines(lines);
}
